/**
 * Dedicated Low-Power Wake-Word Detector for "Hey Tesseract".
 * Operates on real-time 16kHz PCM stream without continuously running Whisper.
 * Includes confidence threshold, temporal envelope matching, and debounce cooldown.
 */
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
    private slidingBuffer;
    private bufferIndex;
    private sampleRate;
    private ambientFloor;
    private onWakeCallback;
    constructor(config?: WakeWordConfig);
    setEnabled(enabled: boolean): void;
    /**
     * Reset ring buffer, cooldown, and temporal state to prevent sticky triggers or dead states.
     */
    reset(): void;
    getLinearBuffer(): Float32Array;
    onWakeDetected(callback: (score: number, speechBuffer: Float32Array) => void): void;
    /**
     * Feed incoming 16kHz PCM chunk for acoustic/phonetic envelope analysis.
     */
    processChunk(chunk: Float32Array): void;
    private evaluateBuffer;
}
//# sourceMappingURL=wake-word.d.ts.map