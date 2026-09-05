/**
 * Dedicated Low-Power Voice Activity & Wake-Word Detector for "Hey Tesseract".
 * Operates on real-time 16kHz PCM audio stream.
 *
 * Uses continuous Voice Activity Detection (VAD) to identify speech utterances
 * (onset, vocal envelope, trailing silence) and maintains a 250ms pre-roll buffer
 * so the initial consonant ("H" in "Hey") is preserved.
 *
 * When an utterance (0.45s - 3.5s) completes, the speech segment is emitted for
 * Whisper phonetic verification. Pure silence and background noise (fans, clicks)
 * never trigger Whisper.
 */
export interface WakeWordConfig {
    threshold?: number;
    debounceMs?: number;
    enabled?: boolean;
}
export declare class WakeWordDetector {
    private debounceMs;
    private isEnabled;
    private lastTriggerTime;
    private baselineRms;
    private sampleRate;
    private preRollSize;
    private preRollBuffer;
    private preRollIndex;
    private isSpeaking;
    private consecutiveSpeechFrames;
    private silenceFrames;
    private speechChunks;
    private totalSpeechSamples;
    private onWakeCallback;
    constructor(config?: WakeWordConfig);
    setEnabled(enabled: boolean): void;
    /**
     * Reset ring buffer, speech accumulators, and temporal state.
     */
    reset(): void;
    onWakeDetected(callback: (score: number, speechBuffer: Float32Array) => void): void;
    /**
     * Feed incoming 16kHz PCM chunk for real-time VAD utterance segmentation.
     */
    processChunk(chunk: Float32Array): void;
}
//# sourceMappingURL=wake-word.d.ts.map