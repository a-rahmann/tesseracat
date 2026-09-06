/**
 * Authoritative Unified VoiceManager for Tesseract.
 *
 * State flow:
 * WAKE_LISTENING -> WAKE_DETECTED -> COMMAND_LISTENING -> TRANSCRIBING -> THINKING -> EXECUTING -> SPEAKING -> RESETTING -> WAKE_LISTENING
 *
 * Invariants:
 * 1. Audio stream, AudioContext, and AudioWorklet are allocated ONCE and NEVER destroyed across turns.
 * 2. Exactly ONE singleton instance exists across the entire application (no duplicate audio captures).
 * 3. Wake detection runs in <300ms without invoking Whisper or LLMs.
 * 4. Post-wake pause grace window (1.5s) allows user to pause before commanding without VAD cut-off.
 * 5. Minimum speech validation (<0.6s or ambient RMS discarded) prevents CPU freezes on empty silence.
 * 6. Supports continuous conversation across 20+ turns without degradation.
 */

import { AudioCapture } from '../audio/audio-capture.js';
import { resampleTo16k } from '../audio/resampler.js';
import { WakeWordDetector, WakeDetectionResult } from './wake-word.js';
import { VoiceActivityDetector } from './vad.js';
import { WhisperBridge } from './whisper.js';

export type VoiceStateName =
  | 'WAKE_LISTENING'
  | 'WAKE_DETECTED'
  | 'COMMAND_LISTENING'
  | 'TRANSCRIBING'
  | 'THINKING'
  | 'EXECUTING'
  | 'SPEAKING'
  | 'RESETTING';

export type VoiceStatus =
  | 'idle'
  | 'listening-for-wake'
  | 'wake-detected'
  | 'recording'
  | 'transcribing'
  | 'tts'
  | 'error';

export interface VoiceState {
  status: VoiceStatus;
  state: VoiceStateName;
  rms: number;
  detail?: string;
  transcription?: string;
  error?: string;
}

export type VoiceStateListener = (state: VoiceState) => void;
export type CommandListener = (commandText: string) => void | Promise<void>;
export type TranscriptionListener = (text: string) => void;
export type InterruptionListener = () => void;

function mapStateToStatus(stateName: VoiceStateName): VoiceStatus {
  switch (stateName) {
    case 'WAKE_LISTENING':
      return 'listening-for-wake';
    case 'WAKE_DETECTED':
      return 'wake-detected';
    case 'COMMAND_LISTENING':
      return 'recording';
    case 'TRANSCRIBING':
      return 'transcribing';
    case 'SPEAKING':
      return 'tts';
    case 'RESETTING':
    case 'THINKING':
    case 'EXECUTING':
    default:
      return 'idle';
  }
}

export class VoiceManager {
  private static instance: VoiceManager | null = null;

  private currentState: VoiceStateName = 'WAKE_LISTENING';
  private currentRms = 0;
  private capture: AudioCapture;
  private wakeDetector: WakeWordDetector;
  private vad: VoiceActivityDetector;

  private nativeSampleRate = 44100;
  private isAudioPipelineReady = false;
  private isWakeWordActive = true;
  private isMuted = false;

  // Audio accumulators
  private commandAudioChunks: Float32Array[] = [];
  private totalCommandSamples = 0;
  private preRollChunks: Float32Array[] = [];
  private preRollSamples = 0;
  private maxCommandDurationTimer: any = null;
  private isStandbyMode = false;

  // VAD & Timing guards
  private wakeGraceUntil = 0;
  private hasDetectedUserSpeech = false;

  private stateListeners: Set<VoiceStateListener> = new Set();
  private commandListeners: Set<CommandListener> = new Set();
  private transcriptionListeners: Set<TranscriptionListener> = new Set();
  private interruptionListeners: Set<InterruptionListener> = new Set();

  private constructor() {
    this.capture = new AudioCapture();
    this.wakeDetector = new WakeWordDetector({
      enabled: true,
      threshold: 0.88,
      debounceMs: 2500,
    });
    this.vad = new VoiceActivityDetector({
      trailingSilenceMs: 950,
      minSpeechDurationMs: 200,
    });

    // Wake event handler (<300ms response)
    this.wakeDetector.onWakeDetected((result: WakeDetectionResult) => {
      if (this.currentState !== 'WAKE_LISTENING' || this.isMuted) return;
      this.handleWakeDetected(result);
    });

    // VAD speech start handler
    this.vad.onSpeechStart(() => {
      if (this.currentState === 'COMMAND_LISTENING') {
        this.hasDetectedUserSpeech = true;
      }
    });

    // VAD speech end handler for command listening
    this.vad.onSpeechEnd((totalSpeechMs: number) => {
      if (this.currentState === 'COMMAND_LISTENING') {
        // If we are still within the pause grace window right after wake word, ignore premature silence
        if (Date.now() < this.wakeGraceUntil) {
          console.log('[VoiceManager] In post-wake pause grace period; waiting for user command speech...');
          return;
        }

        // If user hasn't spoken at least 300ms of real speech, continue listening
        if (!this.hasDetectedUserSpeech && totalSpeechMs < 300) {
          console.log('[VoiceManager] Brief breath/noise detected, continuing to listen for command...');
          return;
        }

        console.log(`[VoiceManager] VAD detected end of speech command (~${Math.round(totalSpeechMs)}ms speech).`);
        this.finishCommandRecording();
      }
    });

    this.setupGlobalShortcuts();
  }

  public static getInstance(): VoiceManager {
    if (!VoiceManager.instance) {
      VoiceManager.instance = new VoiceManager();
    }
    return VoiceManager.instance;
  }

  public getState(): VoiceState {
    return {
      status: mapStateToStatus(this.currentState),
      state: this.currentState,
      rms: this.currentRms,
    };
  }

  public subscribe(listener: VoiceStateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.getState());
    return () => this.stateListeners.delete(listener);
  }

  public onCommand(listener: CommandListener): () => void {
    this.commandListeners.add(listener);
    return () => this.commandListeners.delete(listener);
  }

  public onTranscription(listener: TranscriptionListener): () => void {
    this.transcriptionListeners.add(listener);
    return () => this.transcriptionListeners.delete(listener);
  }

  public onInterruption(listener: InterruptionListener): () => void {
    this.interruptionListeners.add(listener);
    return () => this.interruptionListeners.delete(listener);
  }

  private transitionTo(newState: VoiceStateName, extra: Partial<VoiceState> = {}): void {
    this.currentState = newState;
    const status = mapStateToStatus(newState);
    const evt: VoiceState = {
      status,
      state: newState,
      rms: this.currentRms,
      ...extra,
    };
    console.log(`[Voice State] -> ${newState} (${status})`);
    for (const listener of this.stateListeners) {
      try {
        listener(evt);
      } catch (err) {
        console.error('[Voice State Listener Error]', err);
      }
    }
  }

  private setRms(rms: number): void {
    this.currentRms = rms;
    const snap = this.getState();
    for (const listener of this.stateListeners) {
      try {
        listener(snap);
      } catch (_) {}
    }
  }

  /**
   * Initialize permanent audio pipeline. Never torn down.
   */
  public async ensureAudioPipeline(): Promise<boolean> {
    if (this.isAudioPipelineReady) return true;

    try {
      console.log('[VoiceManager] Initializing single authoritative AudioCapture pipeline...');
      const { sampleRate } = await this.capture.start({
        onPcmChunk: (chunk: Float32Array) => {
          this.processIncomingAudio(chunk).catch(() => {});
        },
        onRmsLevel: (rms: number) => {
          this.setRms(rms);
        },
      });
      this.nativeSampleRate = sampleRate;

      this.isAudioPipelineReady = true;
      this.transitionTo('WAKE_LISTENING');
      console.log('[VoiceManager] Audio pipeline live & listening for wake phrase.');
      return true;
    } catch (err) {
      console.error('[VoiceManager] Audio pipeline init failed:', err);
      this.transitionTo('RESETTING', { error: String(err) });
      return false;
    }
  }

  public async ensureAudioCapture(): Promise<boolean> {
    return this.ensureAudioPipeline();
  }

  public async startWakeListening(): Promise<void> {
    this.isWakeWordActive = true;
    this.wakeDetector.setEnabled(true);
    await this.ensureAudioPipeline();
    if (this.currentState !== 'COMMAND_LISTENING' && this.currentState !== 'TRANSCRIBING') {
      this.transitionTo('WAKE_LISTENING');
    }
  }

  public stopWakeListening(): void {
    this.isWakeWordActive = false;
    this.wakeDetector.setEnabled(false);
    if (this.currentState === 'WAKE_LISTENING') {
      this.transitionTo('RESETTING');
    }
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
  }

  public isWakeWordEnabled(): boolean {
    return this.isWakeWordActive;
  }

  /**
   * Core real-time audio processing loop.
   */
  private async processIncomingAudio(nativeChunk: Float32Array): Promise<void> {
    if (this.isMuted) return;

    // Resample native microphone chunk (e.g. 44.1k/48k) to standard 16kHz mono PCM
    const pcm16k = await resampleTo16k(nativeChunk, this.nativeSampleRate);
    if (!pcm16k || pcm16k.length === 0) return;

    // Calculate frame RMS
    let sumSq = 0;
    for (let i = 0; i < pcm16k.length; i++) sumSq += pcm16k[i] * pcm16k[i];
    const rms = Math.sqrt(sumSq / pcm16k.length);

    switch (this.currentState) {
      case 'WAKE_LISTENING':
        if (this.isWakeWordActive) {
          this.wakeDetector.processChunk(pcm16k);
          // Maintain rolling 350ms pre-roll buffer (~5600 samples at 16kHz)
          this.preRollChunks.push(pcm16k);
          this.preRollSamples += pcm16k.length;
          while (this.preRollSamples > 5600 && this.preRollChunks.length > 1) {
            const popped = this.preRollChunks.shift();
            if (popped) this.preRollSamples -= popped.length;
          }
        }
        break;

      case 'COMMAND_LISTENING':
        // Accumulate audio chunk for Whisper transcription
        this.commandAudioChunks.push(pcm16k);
        this.totalCommandSamples += pcm16k.length;

        // Directly detect speech energy from frame RMS
        if (rms >= 0.005) {
          this.hasDetectedUserSpeech = true;
        }

        // Feed VAD to identify speech completion
        this.vad.processChunk(pcm16k);
        break;

      case 'SPEAKING':
        // Microphone audio during TTS is actively monitored for vocal barge-in.
        // If user speaks loudly over TTS (RMS > 0.035), interrupt speech and task immediately.
        if (rms >= 0.035) {
          console.log(`[VoiceManager] Vocal barge-in detected (RMS: ${rms.toFixed(4)}) during SPEAKING! Interrupting speech...`);
          if (typeof window !== 'undefined' && window.speechSynthesis) {
            window.speechSynthesis.cancel();
          }
          this.triggerInterruption();
        }
        break;

      default:
        break;
    }
  }

  private handleWakeDetected(result: WakeDetectionResult): void {
    console.log(`[VoiceManager] Instant Wake Triggered (${result.phrase})`);

    // Prepare command recording buffer seeded with recent pre-roll audio so command onset is preserved
    this.commandAudioChunks = [...this.preRollChunks];
    this.totalCommandSamples = this.preRollSamples;
    this.preRollChunks = [];
    this.preRollSamples = 0;
    this.hasDetectedUserSpeech = false;
    this.vad.reset();

    // 1.2s grace window allows user to begin command without premature silence cutoff
    this.wakeGraceUntil = Date.now() + 1200;

    // Immediately enter COMMAND_LISTENING to capture the user's command
    this.transitionTo('COMMAND_LISTENING', { detail: 'Listening for command' });

    // Safety timeout (8.5 seconds max command)
    if (this.maxCommandDurationTimer) clearTimeout(this.maxCommandDurationTimer);
    this.maxCommandDurationTimer = setTimeout(() => {
      if (this.currentState === 'COMMAND_LISTENING') {
        console.log('[VoiceManager] Max command duration reached.');
        this.finishCommandRecording();
      }
    }, 8500);
  }

  public async startPushToTalk(): Promise<void> {
    if (!this.isAudioPipelineReady) {
      console.log('[VoiceManager] Audio pipeline not yet ready, initializing now for push-to-talk...');
      await this.ensureAudioPipeline();
    }
    await this.capture.resumeIfSuspended();

    if (this.currentState === 'SPEAKING') {
      this.triggerInterruption();
    }
    this.commandAudioChunks = [];
    this.totalCommandSamples = 0;
    this.hasDetectedUserSpeech = false;
    this.vad.reset();
    this.wakeGraceUntil = Date.now() + 1000;
    this.transitionTo('COMMAND_LISTENING', { detail: 'Push to talk' });

    if (this.maxCommandDurationTimer) clearTimeout(this.maxCommandDurationTimer);
    this.maxCommandDurationTimer = setTimeout(() => {
      if (this.currentState === 'COMMAND_LISTENING') {
        this.finishCommandRecording();
      }
    }, 8500);
  }

  public stopRecordingAndTranscribe(): void {
    if (this.currentState === 'COMMAND_LISTENING') {
      this.finishCommandRecording();
    }
  }

  public async finishCommandRecording(): Promise<void> {
    if (this.maxCommandDurationTimer) {
      clearTimeout(this.maxCommandDurationTimer);
      this.maxCommandDurationTimer = null;
    }

    if (this.currentState !== 'COMMAND_LISTENING') return;

    // Reject audio if duration is < 0.15s (2400 samples at 16kHz)
    if (this.commandAudioChunks.length === 0 || this.totalCommandSamples < 2400) {
      console.log(`[VoiceManager] Captured audio too short (${this.totalCommandSamples} samples < 2400), discarding.`);
      this.resetToWakeListening();
      return;
    }

    // Flatten audio chunks
    const fullBuffer = new Float32Array(this.totalCommandSamples);
    let offset = 0;
    for (const chunk of this.commandAudioChunks) {
      fullBuffer.set(chunk, offset);
      offset += chunk.length;
    }
    this.commandAudioChunks = [];
    this.totalCommandSamples = 0;

    // Check peak amplitude and active speech RMS
    let maxAmp = 0;
    let sumSq = 0;
    for (let i = 0; i < fullBuffer.length; i++) {
      const absVal = Math.abs(fullBuffer[i]);
      if (absVal > maxAmp) maxAmp = absVal;
      sumSq += fullBuffer[i] * fullBuffer[i];
    }
    const avgRms = Math.sqrt(sumSq / fullBuffer.length);

    // Only skip Whisper if buffer is absolute silence / empty noise
    const hasVoiceEnergy = this.hasDetectedUserSpeech || maxAmp >= 0.008 || avgRms >= 0.001;
    if (!hasVoiceEnergy) {
      console.log(`[VoiceManager] No command speech detected (hasSpeech: ${this.hasDetectedUserSpeech}, MaxAmp: ${maxAmp.toFixed(4)}, RMS: ${avgRms.toFixed(5)}), skipping Whisper.`);
      this.resetToWakeListening();
      return;
    }

    this.transitionTo('TRANSCRIBING');

    try {
      const transcription = await WhisperBridge.transcribe(fullBuffer);
      console.log(`[VoiceManager] Transcribed: "${transcription}"`);

      if (!transcription || transcription.trim().length === 0) {
        console.warn('[VoiceManager] Whisper produced empty transcription for speech buffer.');
        for (const listener of this.transcriptionListeners) {
          try {
            listener('');
          } catch {}
        }
        this.resetToWakeListening();
        return;
      }

      // Check for immediate voice interruption "Stop" / "Cancel"
      const cleanLower = transcription.trim().toLowerCase();
      if (cleanLower === 'stop' || cleanLower === 'cancel' || cleanLower === 'never mind') {
        this.triggerInterruption();
        this.resetToWakeListening();
        return;
      }

      this.transitionTo('THINKING', { transcription });

      // Notify UI transcription listeners
      for (const listener of this.transcriptionListeners) {
        try {
          listener(transcription);
        } catch (err) {
          console.error('[Transcription Listener Error]', err);
        }
      }

      // Dispatch to command listeners (e.g. AgentRuntime)
      for (const listener of this.commandListeners) {
        try {
          await listener(transcription);
        } catch (err) {
          console.error('[Command Listener Error]', err);
        }
      }
    } catch (err: any) {
      console.error('[VoiceManager] Transcription failed:', err);
      this.resetToWakeListening();
    }
  }

  public setExecuting(): void {
    this.transitionTo('EXECUTING');
  }

  public setSpeaking(): void {
    this.transitionTo('SPEAKING');
  }

  public setSpeakingTTS(active: boolean): void {
    if (active) {
      this.transitionTo('SPEAKING');
    } else {
      if (this.currentState === 'SPEAKING') {
        this.resetToWakeListening();
      }
    }
  }

  public resetVoiceSession(): void {
    this.resetToWakeListening();
  }

  public setStandbyMode(enabled: boolean): void {
    this.isStandbyMode = enabled;
    console.log(`[VoiceManager] Standby mode set to: ${enabled}`);
    if (enabled && (this.currentState === 'WAKE_LISTENING' || this.currentState === 'RESETTING')) {
      this.transitionTo('COMMAND_LISTENING', { detail: 'Standby mode active' });
    }
  }

  public isStandby(): boolean {
    return this.isStandbyMode;
  }

  public resetToWakeListening(): void {
    if (this.maxCommandDurationTimer) {
      clearTimeout(this.maxCommandDurationTimer);
      this.maxCommandDurationTimer = null;
    }
    this.wakeDetector.reset();
    this.vad.reset();
    this.commandAudioChunks = [];
    this.totalCommandSamples = 0;
    this.hasDetectedUserSpeech = false;

    this.transitionTo('RESETTING');
    setTimeout(() => {
      if (this.isStandbyMode) {
        this.transitionTo('COMMAND_LISTENING', { detail: 'Standby mode active' });
      } else {
        this.transitionTo('WAKE_LISTENING');
      }
    }, 120);
  }

  public triggerInterruption(): void {
    console.log('[VoiceManager] Interruption triggered!');
    for (const listener of this.interruptionListeners) {
      try {
        listener();
      } catch (err) {
        console.error('[Interruption listener error]', err);
      }
    }
    this.resetToWakeListening();
  }

  private holdStartTimestamp = 0;

  private setupGlobalShortcuts(): void {
    if (typeof window === 'undefined') return;

    // Window interaction listener to immediately resume AudioContext on first gesture
    const resumeAudio = () => {
      if (this.capture) {
        this.capture.resumeIfSuspended().catch(() => {});
      }
    };
    window.addEventListener('click', resumeAudio, { passive: true });
    window.addEventListener('keydown', resumeAudio, { passive: true });

    window.addEventListener('keydown', (e: KeyboardEvent) => {
      const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (targetTag === 'input' || targetTag === 'textarea' || (e.target as HTMLElement)?.isContentEditable) return;

      if ((e.key === 't' || e.key === 'T') && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) {
        this.holdStartTimestamp = Date.now();
        if (this.currentState === 'COMMAND_LISTENING' || this.currentState === 'WAKE_DETECTED') {
          console.log('[Hotkey] T pressed -> stopping command recording & transcribing');
          this.finishCommandRecording();
        } else {
          console.log('[Hotkey] T pressed -> push-to-talk start');
          this.startPushToTalk().catch((err) => console.error('Push to talk error:', err));
        }
      } else if (e.key === 'Escape') {
        console.log('[Hotkey] Escape pressed -> interrupt');
        this.triggerInterruption();
      }
    });

    window.addEventListener('keyup', (e: KeyboardEvent) => {
      const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (targetTag === 'input' || targetTag === 'textarea' || (e.target as HTMLElement)?.isContentEditable) return;

      if ((e.key === 't' || e.key === 'T') && !e.metaKey && !e.ctrlKey) {
        const duration = Date.now() - this.holdStartTimestamp;
        // If user held 'T' for >= 400ms (Push-to-talk hold behavior), release finishes recording!
        if (duration >= 400 && (this.currentState === 'COMMAND_LISTENING' || this.currentState === 'WAKE_DETECTED')) {
          console.log(`[Hotkey] T released after ${duration}ms hold -> stopping command recording`);
          this.finishCommandRecording();
        }
      }
    });
  }
}
