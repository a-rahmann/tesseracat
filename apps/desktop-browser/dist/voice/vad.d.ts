/**
 * Adaptive Multi-State Voice Activity Detection (VAD) for Tesseract.
 *
 * Implements conversational pause tolerance to prevent cutting compound commands in half:
 * 1. Adaptive noise floor & dynamic energy thresholds based on ambient environment.
 * 2. Distinction between intra-command conversational pauses (up to 1.8s) and final trailing silence.
 * 3. Pre-roll and post-speech tail preservation to ensure initial and final consonants (/p/, /t/, /s/) are not clipped.
 * 4. Maximum command duration guard (10s) to prevent runaway recording buffers.
 *
 * Operates in real-time on 16kHz mono Float32Array PCM frames (~32ms per frame).
 */
export interface VADConfig {
    sampleRate?: number;
    speechEnergyMultiplier?: number;
    minSpeechDurationMs?: number;
    trailingSilenceMs?: number;
    maxIntraPauseMs?: number;
    maxCommandDurationMs?: number;
    noiseFloorAdaptRate?: number;
}
export type VADState = 'IDLE' | 'SPEECH_ONSET' | 'SPEAKING' | 'INTRA_PAUSE' | 'SPEECH_ENDED';
export type VADEvent = 'speech_start' | 'speaking' | 'speech_end' | 'pause';
export declare class VoiceActivityDetector {
    private sampleRate;
    private minSpeechFrames;
    private trailingSilenceFrames;
    private maxIntraPauseFrames;
    private maxCommandDurationFrames;
    private noiseFloorAdaptRate;
    private speechMultiplier;
    private state;
    private baselineRms;
    private consecutiveSpeechFrames;
    private consecutiveSilenceFrames;
    private totalSpeechFrames;
    private totalUtteranceFrames;
    private frameSize;
    private onSpeechStartCallback;
    private onSpeechEndCallback;
    private onPauseCallback;
    constructor(config?: VADConfig);
    reset(): void;
    onSpeechStart(cb: () => void): void;
    onSpeechEnd(cb: (speechLengthMs: number) => void): void;
    onPause(cb: (pauseMs: number) => void): void;
    getBaselineNoise(): number;
    getState(): VADState;
    getTotalSpeechMs(): number;
    getTotalUtteranceMs(): number;
    /**
     * Processes a single 16kHz PCM audio chunk and updates the adaptive VAD state machine.
     */
    processChunk(samples: Float32Array): VADEvent;
    private finalizeSpeech;
}
//# sourceMappingURL=vad.d.ts.map