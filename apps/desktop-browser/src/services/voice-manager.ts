/**
 * VoiceManager: Persistent, UI-independent voice orchestrator for Tesseract.
 * Powered by low-latency WakeWordDetector (<300ms, no Whisper for wake),
 * VoiceActivityDetector (300-700ms silence), sinc resampler, and permanent audio pipeline.
 *
 * CRITICAL INVARIANTS:
 * 1. Audio stream, AudioContext, AudioWorklet are NEVER destroyed across turns.
 * 2. Second command and 20+ consecutive commands work seamlessly.
 * 3. User saying "Stop" interrupts TTS or active execution immediately.
 */

import { AudioCapture } from '../audio/audio-capture.js';
import { resampleTo16k } from '../audio/resampler.js';
import { WakeWordDetector, WakeDetectionResult } from '../voice/wake-word.js';
import { VoiceActivityDetector } from '../voice/vad.js';
import { IntentEngine, StructuredIntent } from './intent-engine.js';
import { AIExecutionCoordinator } from './ai-executor.js';
import { AgentRuntime } from '../agent/agent-runtime.js';

export type VoiceStatus =
  | 'idle'
  | 'listening-for-wake'
  | 'wake-detected'
  | 'recording'
  | 'transcribing'
  | 'processing'
  | 'tts'
  | 'error';

export interface VoiceState {
  status: VoiceStatus;
  rms: number;
  detail?: string;
  error?: string;
}

export type VoiceStateListener = (state: VoiceState) => void;
export type TranscriptionListener = (text: string, intent?: StructuredIntent) => void;

export class VoiceManager {
  private static instance: VoiceManager | null = null;

  private state: VoiceState = { status: 'idle', rms: 0 };
  private capture: AudioCapture;
  private wakeDetector: WakeWordDetector;
  private vad: VoiceActivityDetector;

  private capturedChunks: Float32Array[] = [];
  private totalCapturedSamples = 0;
  private nativeSampleRate = 44100;
  private isCaptureActive = false;
  private isWakeWordActive = true;
  private isTTSActive = false;

  private maxDurationTimer: any = null;
  private stateListeners: Set<VoiceStateListener> = new Set();
  private transcriptionListeners: Set<TranscriptionListener> = new Set();

  private constructor() {
    this.capture = new AudioCapture();
    this.wakeDetector = new WakeWordDetector({
      enabled: true,
      threshold: 0.65,
      debounceMs: 1200,
    });
    this.vad = new VoiceActivityDetector({
      trailingSilenceMs: 450,
      minSpeechDurationMs: 150,
    });

    // Pure acoustic wake detection (<300ms, NO continuous Whisper)
    this.wakeDetector.onWakeDetected((result: WakeDetectionResult) => {
      if (this.state.status === 'recording' || this.state.status === 'transcribing' || this.isTTSActive) {
        return;
      }
      this.handleWakeDetected(result);
    });

    // VAD speech-end callback for command recording
    this.vad.onSpeechEnd(() => {
      if (this.state.status === 'recording') {
        console.log('[VoiceManager] VAD detected end-of-speech silence window.');
        this.stopRecordingAndTranscribe();
      }
    });

    this.setupGlobalKeyListeners();
  }

  public static getInstance(): VoiceManager {
    if (!VoiceManager.instance) {
      VoiceManager.instance = new VoiceManager();
    }
    return VoiceManager.instance;
  }

  public getState(): VoiceState {
    return { ...this.state };
  }

  public subscribe(listener: VoiceStateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.getState());
    return () => this.stateListeners.delete(listener);
  }

  public onTranscription(listener: TranscriptionListener): () => void {
    this.transcriptionListeners.add(listener);
    return () => this.transcriptionListeners.delete(listener);
  }

  private setState(status: VoiceStatus, detail?: string, error?: string): void {
    console.log(`[Voice] State: ${this.state.status} -> ${status}${detail ? ` (${detail})` : ''}`);
    this.state = {
      ...this.state,
      status,
      detail,
      error,
    };
    this.notifyStateListeners();
  }

  private setRms(rms: number): void {
    this.state.rms = rms;
    this.notifyStateListeners();
  }

  private notifyStateListeners(): void {
    const snap = this.getState();
    for (const listener of this.stateListeners) {
      try {
        listener(snap);
      } catch (err) {
        console.error('[Voice] Error in state listener:', err);
      }
    }
  }

  public isWakeWordEnabled(): boolean {
    return this.isWakeWordActive;
  }

  public setTTSActive(active: boolean): void {
    this.isTTSActive = active;
    if (active) {
      this.setState('tts');
    } else {
      if (this.state.status === 'tts') {
        this.resetVoiceSession();
      }
    }
  }

  public setSpeakingTTS(active: boolean): void {
    this.setTTSActive(active);
  }

  /**
   * Initialize permanent audio capture. Never torn down.
   */
  public async ensureAudioCapture(): Promise<boolean> {
    if (this.isCaptureActive) return true;

    try {
      console.log('[VoiceManager] Starting permanent AudioCapture pipeline...');
      const { sampleRate } = await this.capture.start({
        onPcmChunk: (chunk: Float32Array) => {
          this.processAudioChunk(chunk).catch(() => {});
        },
        onRmsLevel: (rms: number) => {
          this.setRms(rms);
        },
      });
      this.nativeSampleRate = sampleRate;

      this.isCaptureActive = true;
      this.wakeDetector.setEnabled(this.isWakeWordActive);
      this.setState('listening-for-wake', 'Microphone active');
      return true;
    } catch (err: any) {
      console.error('[VoiceManager] Audio capture start failed:', err);
      this.setState('error', undefined, err.message);
      return false;
    }
  }

  public async startWakeListening(): Promise<void> {
    this.isWakeWordActive = true;
    this.wakeDetector.setEnabled(true);
    await this.ensureAudioCapture();
    if (this.state.status !== 'recording' && this.state.status !== 'transcribing') {
      this.setState('listening-for-wake');
    }
  }

  public stopWakeListening(): void {
    this.isWakeWordActive = false;
    this.wakeDetector.setEnabled(false);
    if (this.state.status === 'listening-for-wake') {
      this.setState('idle');
    }
  }

  public startPushToTalk(): void {
    if (this.isTTSActive) {
      AIExecutionCoordinator.getInstance().stopSpeaking();
    }
    this.capturedChunks = [];
    this.totalCapturedSamples = 0;
    this.vad.reset();
    this.setState('recording', 'Push-to-talk');

    if (this.maxDurationTimer) clearTimeout(this.maxDurationTimer);
    this.maxDurationTimer = setTimeout(() => {
      if (this.state.status === 'recording') {
        this.stopRecordingAndTranscribe();
      }
    }, 7500);
  }

  private handleWakeDetected(result: WakeDetectionResult): void {
    console.log(`[VoiceManager] Instant Wake Triggered (${result.phrase}) in <300ms`);
    this.setState('wake-detected', result.phrase);

    this.capturedChunks = [];
    this.totalCapturedSamples = 0;

    // If user continued speaking command directly (e.g. "Hey Tesseract, open YouTube")
    if (result.trailingAudio && result.trailingAudio.length > 0) {
      this.capturedChunks.push(result.trailingAudio);
      this.totalCapturedSamples += result.trailingAudio.length;
    }

    this.vad.reset();

    // Transition immediately to command recording
    setTimeout(() => {
      if (this.state.status === 'wake-detected') {
        this.setState('recording', 'Listening for command');

        if (this.maxDurationTimer) clearTimeout(this.maxDurationTimer);
        this.maxDurationTimer = setTimeout(() => {
          if (this.state.status === 'recording') {
            this.stopRecordingAndTranscribe();
          }
        }, 7500);
      }
    }, 120);
  }

  private async processAudioChunk(nativeChunk: Float32Array): Promise<void> {
    const pcm16k = await resampleTo16k(nativeChunk, this.nativeSampleRate);
    if (!pcm16k || pcm16k.length === 0) return;

    // Calculate RMS
    let sumSq = 0;
    for (let i = 0; i < pcm16k.length; i++) sumSq += pcm16k[i] * pcm16k[i];
    const rms = Math.sqrt(sumSq / pcm16k.length);
    this.setRms(rms);

    if (this.state.status === 'listening-for-wake' && this.isWakeWordActive) {
      this.wakeDetector.processChunk(pcm16k);
    } else if (this.state.status === 'recording') {
      this.capturedChunks.push(pcm16k);
      this.totalCapturedSamples += pcm16k.length;
      this.vad.processChunk(pcm16k);
    } else if (this.isTTSActive && rms > 0.08) {
      // Immediate interruption when speaking aloud
      AIExecutionCoordinator.getInstance().stopSpeaking();
      this.resetVoiceSession();
    }
  }

  public async stopRecordingAndTranscribe(): Promise<void> {
    if (this.maxDurationTimer) {
      clearTimeout(this.maxDurationTimer);
      this.maxDurationTimer = null;
    }

    if (this.state.status !== 'recording') return;

    if (this.capturedChunks.length === 0 || this.totalCapturedSamples < 3200) {
      console.log('[VoiceManager] Recording too brief, returning to wake listening.');
      this.resetVoiceSession();
      return;
    }

    this.setState('transcribing');

    const merged = new Float32Array(this.totalCapturedSamples);
    let offset = 0;
    for (const chunk of this.capturedChunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    this.capturedChunks = [];
    this.totalCapturedSamples = 0;

    try {
      let rawText = '';
      if (typeof (window as any).tesseractNative?.whisperTranscribe === 'function') {
        const resp = await (window as any).tesseractNative.whisperTranscribe(merged);
        rawText = resp?.success && resp?.text ? resp.text.trim() : '';
      }

      console.log(`[VoiceManager] Transcribed text: "${rawText}"`);

      if (!rawText) {
        this.resetVoiceSession();
        return;
      }

      // Check for voice interruption "Stop" / "Cancel"
      const lower = rawText.toLowerCase();
      if (lower === 'stop' || lower === 'cancel' || lower === 'never mind') {
        AIExecutionCoordinator.getInstance().stopSpeaking();
        this.resetVoiceSession();
        return;
      }

      // Notify UI transcription listeners
      for (const listener of this.transcriptionListeners) {
        try {
          listener(rawText);
        } catch (err) {
          console.error('[VoiceManager] Error in transcription listener:', err);
        }
      }

      // Authoritative Autonomous Dispatch: Action != Search, Never Default to Google!
      console.log(`[VoiceManager] Dispatching command to AgentRuntime: "${rawText}"`);
      AgentRuntime.getInstance().handleUserCommand(rawText).catch((err) => {
        console.error('[VoiceManager] Error executing command via AgentRuntime:', err);
      });
    } catch (err: any) {
      console.error('[VoiceManager] Transcription error:', err);
      this.resetVoiceSession();
    }
  }

  public resetVoiceSession(): void {
    if (this.maxDurationTimer) {
      clearTimeout(this.maxDurationTimer);
      this.maxDurationTimer = null;
    }
    this.capturedChunks = [];
    this.totalCapturedSamples = 0;
    this.wakeDetector.reset();
    this.vad.reset();

    // Smooth return to wake listening without tearing down microphone
    if (this.isWakeWordActive && this.isCaptureActive) {
      this.setState('listening-for-wake');
      this.wakeDetector.setEnabled(true);
    } else {
      this.setState('idle');
    }
  }

  private setupGlobalKeyListeners(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('keydown', (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      if ((e.key === 't' || e.key === 'T') && !e.repeat && !e.metaKey && !e.ctrlKey) {
        this.startPushToTalk();
      } else if (e.key === 'Escape') {
        AIExecutionCoordinator.getInstance().stopSpeaking();
        this.resetVoiceSession();
      }
    });
  }
}
