/**
 * Voice Activity Detection (VAD) with configurable silence windows (300-700ms).
 * Operates in real-time on 16kHz mono Float32Array PCM frames.
 */
export interface VADConfig {
    sampleRate?: number;
    speechEnergyMultiplier?: number;
    minSpeechDurationMs?: number;
    trailingSilenceMs?: number;
    noiseFloorAdaptRate?: number;
}
export type VADEvent = 'speech_start' | 'speaking' | 'speech_end';
export declare class VoiceActivityDetector {
    private sampleRate;
    private trailingSilenceFrames;
    private minSpeechFrames;
    private noiseFloorAdaptRate;
    private speechMultiplier;
    private baselineRms;
    private isSpeaking;
    private consecutiveSpeechFrames;
    private consecutiveSilenceFrames;
    private frameSize;
    private onSpeechStartCallback;
    private onSpeechEndCallback;
    constructor(config?: VADConfig);
    reset(): void;
    onSpeechStart(cb: () => void): void;
    onSpeechEnd(cb: (speechLengthMs: number) => void): void;
    getBaselineNoise(): number;
    processChunk(samples: Float32Array): VADEvent;
}
//# sourceMappingURL=vad.d.ts.map