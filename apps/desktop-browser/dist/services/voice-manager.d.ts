/**
 * VoiceManager: Persistent, UI-independent voice orchestrator for Tesseract.
 * Owns the single persistent microphone stream, AudioContext, AudioWorklet,
 * WakeWordDetector, sinc resampler, Whisper IPC bridge, IntentEngine, and VoiceState machine.
 *
 * CRITICAL INVARIANT:
 * Opening, closing, or re-rendering UI elements (sidebar, drawer, modal, toast)
 * CANNOT and MUST NOT touch, reset, or destroy the VoiceManager or microphone stream.
 */
import { StructuredIntent } from './intent-engine.js';
export type VoiceStatus = 'idle' | 'listening-for-wake' | 'wake-detected' | 'recording' | 'transcribing' | 'processing' | 'tts' | 'error';
export interface VoiceState {
    status: VoiceStatus;
    rms: number;
    detail?: string;
    error?: string;
}
export type VoiceStateListener = (state: VoiceState) => void;
export type TranscriptionListener = (text: string, intent?: StructuredIntent) => void;
export declare class VoiceManager {
    private static instance;
    private state;
    private capture;
    private wakeDetector;
    private capturedChunks;
    private nativeSampleRate;
    private isCaptureActive;
    private isWakeWordActive;
    private isTTSActive;
    private silenceTimer;
    private initialSilenceTimer;
    private maxDurationTimer;
    private hasSpoken;
    private baselineRms;
    private recordingTrigger;
    private isVerifyingWake;
    private stateListeners;
    private transcriptionListeners;
    private constructor();
    static getInstance(): VoiceManager;
    getState(): VoiceState;
    subscribe(listener: VoiceStateListener): () => void;
    onTranscription(listener: TranscriptionListener): () => void;
    private setState;
    private setRms;
    private notifyState;
    /**
     * Start or ensure the persistent AudioCapture worklet is streaming.
     */
    ensureAudioCapture(): Promise<void>;
    enableWakeWord(enabled: boolean): void;
    isWakeWordEnabled(): boolean;
    startWakeListening(): Promise<void>;
    startPushToTalk(): Promise<void>;
    stopRecordingAndTranscribe(): Promise<void>;
    private handleWakeDetected;
    /**
     * Cleanly reset voice session after every command or abort.
     * Clears temporary recording buffers and resets the wake detector while preserving
     * the persistent microphone stream and AudioWorklet.
     */
    resetVoiceSession(): void;
    /**
     * Notify VoiceManager when TTS speaks aloud to prevent self-triggering.
     */
    setSpeakingTTS(isSpeaking: boolean): void;
    /**
     * Setup global push-to-talk listener on window (independent of UI focus/panels).
     */
    private setupGlobalKeyListeners;
    private clearTimers;
}
//# sourceMappingURL=voice-manager.d.ts.map