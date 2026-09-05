export type VoiceState = 'idle' | 'listening-for-wake' | 'wake-detected' | 'recording' | 'transcribing' | 'processing' | 'error';
export interface VoiceSessionOptions {
    onStateChange?: (state: VoiceState, detail?: string) => void;
    onRmsUpdate?: (rms: number) => void;
    onTranscriptionResult?: (text: string) => void;
    whisperTranscribe?: (pcm16k: Float32Array) => Promise<{
        success: boolean;
        text?: string;
        error?: string;
    }>;
}
export declare class VoiceSession {
    private state;
    private capture;
    private wakeDetector;
    private capturedChunks;
    private nativeSampleRate;
    private silenceTimer;
    private initialSilenceTimer;
    private maxDurationTimer;
    private hasSpoken;
    private baselineRms;
    private isCaptureActive;
    private isWakeWordActive;
    private options;
    constructor(options?: VoiceSessionOptions);
    getState(): VoiceState;
    setState(newState: VoiceState, detail?: string): void;
    setTranscriptionHandler(fn: (text: string) => void): void;
    setWhisperCaller(fn: (pcm16k: Float32Array) => Promise<{
        success: boolean;
        text?: string;
        error?: string;
    }>): void;
    enableWakeWord(enabled: boolean): void;
    isWakeWordRunning(): boolean;
    /**
     * Ensure low-level AudioCapture worklet is running without restarting.
     */
    private ensureCaptureRunning;
    /**
     * Start recording command speech (either via Wake Word or Push-to-Talk).
     */
    startPushToTalk(): Promise<void>;
    /**
     * Stop recording and send resampled PCM to Whisper.
     */
    stopRecordingAndTranscribe(): Promise<void>;
    private handleWakeDetected;
    private startWakeListening;
    private stopCaptureAndReset;
    private clearTimers;
}
//# sourceMappingURL=voice-session.d.ts.map