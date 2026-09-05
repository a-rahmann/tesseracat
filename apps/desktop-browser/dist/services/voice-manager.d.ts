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
    private vad;
    private capturedChunks;
    private totalCapturedSamples;
    private nativeSampleRate;
    private isCaptureActive;
    private isWakeWordActive;
    private isTTSActive;
    private maxDurationTimer;
    private stateListeners;
    private transcriptionListeners;
    private constructor();
    static getInstance(): VoiceManager;
    getState(): VoiceState;
    subscribe(listener: VoiceStateListener): () => void;
    onTranscription(listener: TranscriptionListener): () => void;
    private setState;
    private setRms;
    private notifyStateListeners;
    isWakeWordEnabled(): boolean;
    setTTSActive(active: boolean): void;
    setSpeakingTTS(active: boolean): void;
    /**
     * Initialize permanent audio capture. Never torn down.
     */
    ensureAudioCapture(): Promise<boolean>;
    startWakeListening(): Promise<void>;
    stopWakeListening(): void;
    startPushToTalk(): void;
    private handleWakeDetected;
    private processAudioChunk;
    stopRecordingAndTranscribe(): Promise<void>;
    resetVoiceSession(): void;
    private setupGlobalKeyListeners;
}
//# sourceMappingURL=voice-manager.d.ts.map