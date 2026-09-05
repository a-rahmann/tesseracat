/**
 * Unified VoiceManager: Persistent 8-state voice orchestrator.
 * WAKE_LISTENING -> WAKE_DETECTED -> COMMAND_LISTENING -> TRANSCRIBING -> THINKING -> EXECUTING -> SPEAKING -> RESETTING -> WAKE_LISTENING
 *
 * Invariants:
 * 1. Audio stream, AudioContext, AudioWorklet are allocated ONCE and NEVER destroyed across turns.
 * 2. Wake detection runs in <300ms without invoking Whisper or LLMs.
 * 3. Command recording uses VAD (300-700ms silence detection).
 * 4. User saying "Stop" interrupts TTS or active execution immediately.
 * 5. Supports 20+ consecutive commands without degradation.
 */
export type VoiceStateName = 'WAKE_LISTENING' | 'WAKE_DETECTED' | 'COMMAND_LISTENING' | 'TRANSCRIBING' | 'THINKING' | 'EXECUTING' | 'SPEAKING' | 'RESETTING';
export interface VoiceStatusEvent {
    state: VoiceStateName;
    rms: number;
    transcription?: string;
    detail?: string;
    error?: string;
}
export type VoiceStateListener = (event: VoiceStatusEvent) => void;
export type CommandListener = (commandText: string) => void | Promise<void>;
export type InterruptionListener = () => void;
export declare class VoiceManager {
    private static instance;
    private currentState;
    private capture;
    private wakeDetector;
    private vad;
    private nativeSampleRate;
    private isAudioPipelineReady;
    private isWakeWordEnabled;
    private isMuted;
    private commandAudioChunks;
    private totalCommandSamples;
    private maxCommandDurationTimer;
    private stateListeners;
    private commandListeners;
    private interruptionListeners;
    private constructor();
    static getInstance(): VoiceManager;
    getState(): VoiceStateName;
    subscribe(listener: VoiceStateListener): () => void;
    onCommand(listener: CommandListener): () => void;
    onInterruption(listener: InterruptionListener): () => void;
    private listenersAdd;
    private listenersDelete;
    private transitionTo;
    /**
     * Initialize permanent audio pipeline. Never torn down.
     */
    ensureAudioPipeline(): Promise<boolean>;
    /**
     * Core real-time audio processing loop.
     */
    private processIncomingAudio;
    private handleWakeDetected;
    startPushToTalk(): void;
    private finishCommandRecording;
    setExecuting(): void;
    setSpeaking(): void;
    resetToWakeListening(): void;
    triggerInterruption(): void;
    private checkInterruptionAudio;
    private setupGlobalShortcuts;
}
//# sourceMappingURL=voice-manager.d.ts.map