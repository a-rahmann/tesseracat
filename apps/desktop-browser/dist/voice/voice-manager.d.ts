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
export type VoiceStateName = 'WAKE_LISTENING' | 'WAKE_DETECTED' | 'COMMAND_LISTENING' | 'TRANSCRIBING' | 'THINKING' | 'EXECUTING' | 'SPEAKING' | 'RESETTING';
export type VoiceStatus = 'idle' | 'listening-for-wake' | 'wake-detected' | 'recording' | 'transcribing' | 'tts' | 'error';
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
export declare class VoiceManager {
    private static instance;
    private currentState;
    private currentRms;
    private capture;
    private wakeDetector;
    private vad;
    private nativeSampleRate;
    private isAudioPipelineReady;
    private isWakeWordActive;
    private isMuted;
    private commandAudioChunks;
    private totalCommandSamples;
    private maxCommandDurationTimer;
    private wakeGraceUntil;
    private hasDetectedUserSpeech;
    private stateListeners;
    private commandListeners;
    private transcriptionListeners;
    private interruptionListeners;
    private constructor();
    static getInstance(): VoiceManager;
    getState(): VoiceState;
    subscribe(listener: VoiceStateListener): () => void;
    onCommand(listener: CommandListener): () => void;
    onTranscription(listener: TranscriptionListener): () => void;
    onInterruption(listener: InterruptionListener): () => void;
    private transitionTo;
    private setRms;
    /**
     * Initialize permanent audio pipeline. Never torn down.
     */
    ensureAudioPipeline(): Promise<boolean>;
    ensureAudioCapture(): Promise<boolean>;
    startWakeListening(): Promise<void>;
    stopWakeListening(): void;
    isWakeWordEnabled(): boolean;
    /**
     * Core real-time audio processing loop.
     */
    private processIncomingAudio;
    private handleWakeDetected;
    startPushToTalk(): void;
    stopRecordingAndTranscribe(): void;
    finishCommandRecording(): Promise<void>;
    setExecuting(): void;
    setSpeaking(): void;
    setSpeakingTTS(active: boolean): void;
    resetVoiceSession(): void;
    resetToWakeListening(): void;
    triggerInterruption(): void;
    private setupGlobalShortcuts;
}
//# sourceMappingURL=voice-manager.d.ts.map