/**
 * Dedicated Low-Latency Wake Word Detector for "Hey Tesseract" / "Hi Tesseract".
 * Operates on real-time 16kHz mono PCM stream in <300ms without invoking Whisper or LLMs.
 */
export interface WakeDetectionResult {
    score: number;
    phrase: string;
    wakeAudio: Float32Array;
    trailingAudio?: Float32Array;
}
export interface WakeWordConfig {
    threshold?: number;
    debounceMs?: number;
    enabled?: boolean;
}
export declare class WakeWordDetector {
    private threshold;
    private debounceMs;
    private isEnabled;
    private lastTriggerTime;
    private sampleRate;
    private preRollSamples;
    private preRollBuffer;
    private preRollIndex;
    private baselineRms;
    private isTrackingUtterance;
    private utteranceChunks;
    private totalUtteranceSamples;
    private silenceFramesCount;
    private phoneticStages;
    private stageTimings;
    private onWakeCallback;
    constructor(config?: WakeWordConfig);
    setEnabled(enabled: boolean): void;
    isWakeEnabled(): boolean;
    reset(): void;
    onWakeDetected(cb: (result: WakeDetectionResult) => void): void;
    /**
     * Process 16kHz PCM audio chunk (typically 512 or 1024 samples, 32-64ms).
     */
    processChunk(chunk: Float32Array): void;
    private flattenChunks;
}
//# sourceMappingURL=wake-word.d.ts.map