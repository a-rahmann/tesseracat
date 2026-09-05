"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VoiceActivityDetector = void 0;
class VoiceActivityDetector {
    sampleRate;
    trailingSilenceFrames;
    minSpeechFrames;
    noiseFloorAdaptRate;
    speechMultiplier;
    baselineRms = 0.003;
    isSpeaking = false;
    consecutiveSpeechFrames = 0;
    consecutiveSilenceFrames = 0;
    frameSize = 512; // ~32ms per frame at 16kHz
    onSpeechStartCallback = null;
    onSpeechEndCallback = null;
    totalSpeechFrames = 0;
    constructor(config = {}) {
        this.sampleRate = config.sampleRate ?? 16000;
        const trailingMs = Math.max(400, Math.min(2000, config.trailingSilenceMs ?? 950));
        const minSpeechMs = config.minSpeechDurationMs ?? 180;
        const msPerFrame = (this.frameSize / this.sampleRate) * 1000;
        this.trailingSilenceFrames = Math.round(trailingMs / msPerFrame);
        this.minSpeechFrames = Math.max(3, Math.round(minSpeechMs / msPerFrame));
        this.noiseFloorAdaptRate = config.noiseFloorAdaptRate ?? 0.008;
        this.speechMultiplier = config.speechEnergyMultiplier ?? 1.7;
    }
    reset() {
        this.isSpeaking = false;
        this.consecutiveSpeechFrames = 0;
        this.consecutiveSilenceFrames = 0;
        this.totalSpeechFrames = 0;
    }
    onSpeechStart(cb) {
        this.onSpeechStartCallback = cb;
    }
    onSpeechEnd(cb) {
        this.onSpeechEndCallback = cb;
    }
    getBaselineNoise() {
        return this.baselineRms;
    }
    getTotalSpeechMs() {
        return (this.totalSpeechFrames * this.frameSize / this.sampleRate) * 1000;
    }
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
        const speechThreshold = Math.max(0.004, this.baselineRms * this.speechMultiplier);
        if (!this.isSpeaking) {
            // Adapt baseline smoothly during silence
            this.baselineRms = this.baselineRms * (1 - this.noiseFloorAdaptRate) + rms * this.noiseFloorAdaptRate;
            if (rms > speechThreshold) {
                this.consecutiveSpeechFrames++;
                if (this.consecutiveSpeechFrames >= this.minSpeechFrames) {
                    this.isSpeaking = true;
                    this.totalSpeechFrames += this.consecutiveSpeechFrames;
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
        else {
            // Currently speaking
            if (rms >= speechThreshold) {
                this.totalSpeechFrames++;
                this.consecutiveSilenceFrames = Math.max(0, this.consecutiveSilenceFrames - 2);
            }
            else {
                this.consecutiveSilenceFrames++;
                if (this.consecutiveSilenceFrames >= this.trailingSilenceFrames) {
                    const totalMs = (this.totalSpeechFrames * this.frameSize / this.sampleRate) * 1000;
                    this.isSpeaking = false;
                    this.consecutiveSpeechFrames = 0;
                    this.consecutiveSilenceFrames = 0;
                    this.totalSpeechFrames = 0;
                    if (this.onSpeechEndCallback)
                        this.onSpeechEndCallback(totalMs);
                    return 'speech_end';
                }
            }
            return 'speaking';
        }
    }
}
exports.VoiceActivityDetector = VoiceActivityDetector;
//# sourceMappingURL=vad.js.map