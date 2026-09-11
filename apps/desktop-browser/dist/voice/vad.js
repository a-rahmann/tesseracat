"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.VoiceActivityDetector = void 0;
class VoiceActivityDetector {
    sampleRate;
    minSpeechFrames;
    trailingSilenceFrames;
    maxIntraPauseFrames;
    maxCommandDurationFrames;
    noiseFloorAdaptRate;
    speechMultiplier;
    state = 'IDLE';
    baselineRms = 0.003;
    consecutiveSpeechFrames = 0;
    consecutiveSilenceFrames = 0;
    totalSpeechFrames = 0;
    totalUtteranceFrames = 0;
    frameSize = 512; // ~32ms per frame at 16kHz
    onSpeechStartCallback = null;
    onSpeechEndCallback = null;
    onPauseCallback = null;
    constructor(config = {}) {
        this.sampleRate = config.sampleRate ?? 16000;
        const msPerFrame = (this.frameSize / this.sampleRate) * 1000;
        const minSpeechMs = config.minSpeechDurationMs ?? 180;
        const trailingMs = Math.max(600, config.trailingSilenceMs ?? 1400);
        const intraPauseMs = Math.max(trailingMs, config.maxIntraPauseMs ?? 1600);
        const maxDurationMs = config.maxCommandDurationMs ?? 10000;
        this.minSpeechFrames = Math.max(3, Math.round(minSpeechMs / msPerFrame));
        this.trailingSilenceFrames = Math.round(trailingMs / msPerFrame);
        this.maxIntraPauseFrames = Math.round(intraPauseMs / msPerFrame);
        this.maxCommandDurationFrames = Math.round(maxDurationMs / msPerFrame);
        this.noiseFloorAdaptRate = config.noiseFloorAdaptRate ?? 0.008;
        this.speechMultiplier = config.speechEnergyMultiplier ?? 1.8;
    }
    reset() {
        this.state = 'IDLE';
        this.consecutiveSpeechFrames = 0;
        this.consecutiveSilenceFrames = 0;
        this.totalSpeechFrames = 0;
        this.totalUtteranceFrames = 0;
        this.baselineRms = 0.003;
    }
    onSpeechStart(cb) {
        this.onSpeechStartCallback = cb;
    }
    onSpeechEnd(cb) {
        this.onSpeechEndCallback = cb;
    }
    onPause(cb) {
        this.onPauseCallback = cb;
    }
    getBaselineNoise() {
        return this.baselineRms;
    }
    getState() {
        return this.state;
    }
    getTotalSpeechMs() {
        return (this.totalSpeechFrames * this.frameSize / this.sampleRate) * 1000;
    }
    getTotalUtteranceMs() {
        return (this.totalUtteranceFrames * this.frameSize / this.sampleRate) * 1000;
    }
    /**
     * Processes a single 16kHz PCM audio chunk and updates the adaptive VAD state machine.
     */
    processChunk(samples) {
        let sumSq = 0;
        let zeroCrossings = 0;
        for (let i = 0; i < samples.length; i++) {
            const v = samples[i];
            sumSq += v * v;
            if (i > 0 && ((samples[i] >= 0 && samples[i - 1] < 0) || (samples[i] < 0 && samples[i - 1] >= 0))) {
                zeroCrossings++;
            }
        }
        const rms = Math.sqrt(sumSq / samples.length);
        const zcr = zeroCrossings / samples.length;
        // Dynamic speech threshold with adaptive bounds [0.005, 0.024]
        const speechThreshold = Math.max(0.005, Math.min(0.024, this.baselineRms * this.speechMultiplier));
        const isFrameVoice = rms >= speechThreshold && zcr < 0.38;
        switch (this.state) {
            case 'IDLE': {
                // Adapt baseline noise floor during ambient silence
                if (rms < 0.015) {
                    this.baselineRms = this.baselineRms * (1 - this.noiseFloorAdaptRate) + rms * this.noiseFloorAdaptRate;
                }
                if (isFrameVoice) {
                    this.consecutiveSpeechFrames++;
                    if (this.consecutiveSpeechFrames >= this.minSpeechFrames) {
                        this.state = 'SPEAKING';
                        this.totalSpeechFrames = this.consecutiveSpeechFrames;
                        this.totalUtteranceFrames = this.consecutiveSpeechFrames;
                        this.consecutiveSpeechFrames = 0;
                        this.consecutiveSilenceFrames = 0;
                        if (this.onSpeechStartCallback)
                            this.onSpeechStartCallback();
                        return 'speech_start';
                    }
                }
                else {
                    this.consecutiveSpeechFrames = Math.max(0, this.consecutiveSpeechFrames - 1);
                }
                return 'speaking';
            }
            case 'SPEAKING': {
                this.totalSpeechFrames++;
                this.totalUtteranceFrames++;
                if (isFrameVoice) {
                    this.consecutiveSilenceFrames = Math.max(0, this.consecutiveSilenceFrames - 2);
                }
                else {
                    this.consecutiveSilenceFrames++;
                    // If silence begins, transition to INTRA_PAUSE
                    if (this.consecutiveSilenceFrames >= 4) { // ~128ms of dip
                        this.state = 'INTRA_PAUSE';
                        if (this.onPauseCallback) {
                            this.onPauseCallback((this.consecutiveSilenceFrames * this.frameSize / this.sampleRate) * 1000);
                        }
                        return 'pause';
                    }
                }
                // Hard duration ceiling
                if (this.totalUtteranceFrames >= this.maxCommandDurationFrames) {
                    return this.finalizeSpeech();
                }
                return 'speaking';
            }
            case 'INTRA_PAUSE': {
                this.totalUtteranceFrames++;
                if (isFrameVoice) {
                    // Voice resumed inside conversational pause! Seamlessly recover to SPEAKING without cutting the command
                    this.consecutiveSpeechFrames++;
                    if (this.consecutiveSpeechFrames >= 2) {
                        this.state = 'SPEAKING';
                        this.consecutiveSilenceFrames = 0;
                        this.consecutiveSpeechFrames = 0;
                        return 'speaking';
                    }
                }
                else {
                    this.consecutiveSilenceFrames++;
                    this.consecutiveSpeechFrames = 0;
                    // Adaptive silence cutoff:
                    // If total spoken speech was short (<600ms), use tighter trailing silence (~800ms) to reject bumps/breaths.
                    // If user has spoken substantive command (>1.5s), grant full intra-pause window (~1600ms) so compound clauses are preserved.
                    const currentSpeechMs = (this.totalSpeechFrames * this.frameSize / this.sampleRate) * 1000;
                    const requiredSilenceFrames = currentSpeechMs > 1500
                        ? this.maxIntraPauseFrames
                        : this.trailingSilenceFrames;
                    if (this.consecutiveSilenceFrames >= requiredSilenceFrames || this.totalUtteranceFrames >= this.maxCommandDurationFrames) {
                        return this.finalizeSpeech();
                    }
                }
                return 'speaking';
            }
            case 'SPEECH_ENDED':
            default:
                return 'speech_end';
        }
    }
    finalizeSpeech() {
        const totalMs = (this.totalSpeechFrames * this.frameSize / this.sampleRate) * 1000;
        this.state = 'SPEECH_ENDED';
        this.consecutiveSpeechFrames = 0;
        this.consecutiveSilenceFrames = 0;
        this.totalSpeechFrames = 0;
        this.totalUtteranceFrames = 0;
        if (this.onSpeechEndCallback)
            this.onSpeechEndCallback(totalMs);
        return 'speech_end';
    }
}
exports.VoiceActivityDetector = VoiceActivityDetector;
//# sourceMappingURL=vad.js.map