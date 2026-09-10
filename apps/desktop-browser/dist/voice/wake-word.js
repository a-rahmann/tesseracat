"use strict";
/**
 * Dedicated Low-Latency Wake Word Detector for "Hey Tesseract" / "Hi Tesseract".
 * Operates on real-time 16kHz mono PCM stream in <300ms without invoking Whisper or LLMs.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.WakeWordDetector = void 0;
class WakeWordDetector {
    threshold;
    debounceMs;
    isEnabled;
    lastTriggerTime = 0;
    sampleRate = 16000;
    preRollSamples = 4000; // 250ms pre-roll at 16kHz
    preRollBuffer;
    preRollIndex = 0;
    // Real-time acoustic analysis
    baselineRms = 0.008;
    isTrackingUtterance = false;
    utteranceChunks = [];
    totalUtteranceSamples = 0;
    silenceFramesCount = 0;
    // Cadence & phonetic stage tracking
    // Stage 0: Silence/Idle
    // Stage 1: Vowel onset ("Hey" / "Hi")
    // Stage 2: High-freq fricative burst ("Tess" - /t/ + /s/)
    // Stage 3: Mid vowel ("er")
    // Stage 4: Plosive stop release ("act" - /k/ + /t/)
    phoneticStages = [false, false, false, false];
    stageTimings = [0, 0, 0, 0];
    peakUtteranceRms = 0;
    voicedFramesCount = 0;
    sibilantFramesCount = 0;
    onWakeCallback = null;
    constructor(config = {}) {
        this.threshold = config.threshold ?? 0.65;
        this.debounceMs = config.debounceMs ?? 2000;
        this.isEnabled = config.enabled ?? true;
        this.preRollBuffer = new Float32Array(this.preRollSamples);
        if (config.onWake)
            this.onWakeCallback = config.onWake;
    }
    setEnabled(enabled) {
        this.isEnabled = enabled;
        if (!enabled)
            this.reset();
    }
    isWakeEnabled() {
        return this.isEnabled;
    }
    reset() {
        this.preRollBuffer.fill(0);
        this.preRollIndex = 0;
        this.isTrackingUtterance = false;
        this.utteranceChunks = [];
        this.totalUtteranceSamples = 0;
        this.silenceFramesCount = 0;
        this.phoneticStages = [false, false, false, false];
        this.stageTimings = [0, 0, 0, 0];
        this.peakUtteranceRms = 0;
        this.voicedFramesCount = 0;
        this.sibilantFramesCount = 0;
    }
    onWakeDetected(cb) {
        this.onWakeCallback = cb;
    }
    /**
     * Process 16kHz PCM audio chunk (typically 512 or 1024 samples, 32-64ms).
     */
    processChunk(chunk) {
        if (!this.isEnabled || !chunk || chunk.length === 0)
            return;
        // 1. Calculate acoustic metrics: RMS energy and Zero-Crossing Rate (ZCR)
        let sumSq = 0;
        let zcrCount = 0;
        for (let i = 0; i < chunk.length; i++) {
            const s = chunk[i];
            sumSq += s * s;
            if (i > 0 && ((chunk[i] >= 0 && chunk[i - 1] < 0) || (chunk[i] < 0 && chunk[i - 1] >= 0))) {
                zcrCount++;
            }
        }
        const rms = Math.sqrt(sumSq / chunk.length);
        const zcr = zcrCount / chunk.length;
        // 2. High frequency spectral energy estimate (fricative detector)
        let highFreqEnergy = 0;
        for (let i = 1; i < chunk.length; i++) {
            const diff = chunk[i] - chunk[i - 1];
            highFreqEnergy += diff * diff;
        }
        const highFreqRatio = highFreqEnergy / (sumSq + 1e-6);
        // Dynamic speech threshold: require intentional vocal level (at least 0.022 RMS)
        const speechThreshold = Math.max(0.022, this.baselineRms * 2.5);
        if (!this.isTrackingUtterance) {
            // Smooth background noise floor during ambient silence
            if (rms < speechThreshold) {
                this.baselineRms = this.baselineRms * 0.992 + rms * 0.008;
            }
            // Fill circular pre-roll buffer
            for (let i = 0; i < chunk.length; i++) {
                this.preRollBuffer[this.preRollIndex] = chunk[i];
                this.preRollIndex = (this.preRollIndex + 1) % this.preRollSamples;
            }
            // Detect speech onset for intentional wake word (requires robust initial vocal energy)
            if (rms >= speechThreshold && zcr < 0.22) {
                this.isTrackingUtterance = true;
                this.silenceFramesCount = 0;
                this.utteranceChunks = [];
                this.totalUtteranceSamples = 0;
                this.phoneticStages = [false, false, false, false];
                this.stageTimings = [0, 0, 0, 0];
                this.peakUtteranceRms = rms;
                this.voicedFramesCount = 1;
                this.sibilantFramesCount = 0;
                // Linearize pre-roll buffer to preserve phrase start
                const preRollLinear = new Float32Array(this.preRollSamples);
                for (let i = 0; i < this.preRollSamples; i++) {
                    preRollLinear[i] = this.preRollBuffer[(this.preRollIndex + i) % this.preRollSamples];
                }
                this.utteranceChunks.push(preRollLinear);
                this.totalUtteranceSamples += this.preRollSamples;
                this.utteranceChunks.push(new Float32Array(chunk));
                this.totalUtteranceSamples += chunk.length;
            }
        }
        else {
            // Currently tracking an utterance
            this.utteranceChunks.push(new Float32Array(chunk));
            this.totalUtteranceSamples += chunk.length;
            if (rms > this.peakUtteranceRms)
                this.peakUtteranceRms = rms;
            const elapsedMs = (this.totalUtteranceSamples / this.sampleRate) * 1000;
            // Track the 4 phonetic stages of "Hey" + "Tess" + "er" + "act"
            // Stage 0: Voiced vowel onset "Hey" / "Hi" (requires at least 3 consecutive voiced frames)
            if (!this.phoneticStages[0] && elapsedMs < 600) {
                if (rms >= speechThreshold * 1.15 && zcr < 0.22) {
                    this.voicedFramesCount++;
                    if (this.voicedFramesCount >= 3) {
                        this.phoneticStages[0] = true;
                        this.stageTimings[0] = elapsedMs;
                    }
                }
            }
            // Stage 1: "Tess" (/t/ onset + /s/ dental sibilant: requires at least 3 consecutive high-freq frames)
            if (this.phoneticStages[0] && !this.phoneticStages[1] && elapsedMs > 160 && elapsedMs < 1100) {
                if (zcr >= 0.28 && highFreqRatio >= 0.28) {
                    this.sibilantFramesCount++;
                    if (this.sibilantFramesCount >= 3) {
                        this.phoneticStages[1] = true;
                        this.stageTimings[1] = elapsedMs;
                    }
                }
            }
            // Stage 2: "er" (Vocalic dip: lower ZCR < 0.26, voiced energy)
            if (this.phoneticStages[1] && !this.phoneticStages[2] && elapsedMs > 350 && elapsedMs < 1600) {
                if (zcr < 0.26 && rms >= speechThreshold * 0.75) {
                    this.phoneticStages[2] = true;
                    this.stageTimings[2] = elapsedMs;
                }
            }
            // Stage 3: "act" (/k/ + /t/ plosive release: transient burst)
            if (this.phoneticStages[2] && !this.phoneticStages[3] && elapsedMs > 550 && elapsedMs < 2200) {
                if (highFreqRatio > 0.23 || zcr > 0.25) {
                    this.phoneticStages[3] = true;
                    this.stageTimings[3] = elapsedMs;
                }
            }
            // Check for trailing pause
            if (rms < speechThreshold) {
                this.silenceFramesCount++;
            }
            else {
                this.silenceFramesCount = Math.max(0, this.silenceFramesCount - 1);
            }
            // Intentional "Hey Tesseract" takes at least 950ms to 2500ms to pronounce in natural speech
            const isCandidateDuration = elapsedMs >= 950 && elapsedMs <= 2500;
            const isSequential = this.stageTimings[0] <= this.stageTimings[1] &&
                this.stageTimings[1] <= this.stageTimings[2] &&
                this.stageTimings[2] <= this.stageTimings[3];
            const allPhoneticsPassed = this.phoneticStages[0] &&
                this.phoneticStages[1] &&
                this.phoneticStages[2] &&
                this.phoneticStages[3] &&
                isSequential;
            const now = Date.now();
            const isDebounced = now - this.lastTriggerTime > this.debounceMs;
            // Must have genuine trailing pause of at least 5 frames (~160ms) or one-shot command continuation
            const hasTrailingPause = this.silenceFramesCount >= 5;
            const isOneShotContinuation = allPhoneticsPassed && elapsedMs >= 1350 && this.silenceFramesCount < 3;
            const hasRealVoiceEnergy = this.peakUtteranceRms >= 0.038;
            if (isDebounced && isCandidateDuration && allPhoneticsPassed && (hasTrailingPause || isOneShotContinuation) && hasRealVoiceEnergy) {
                const fullAudio = this.flattenChunks();
                this.lastTriggerTime = now;
                console.log(`[Wake Word] Acoustic Wake Candidate Detected: "Hey Tesseract" (Duration: ${Math.round(elapsedMs)}ms, Peak RMS: ${this.peakUtteranceRms.toFixed(4)})`);
                if (this.onWakeCallback) {
                    this.onWakeCallback({
                        score: 0.95,
                        phrase: 'Hey Tesseract',
                        wakeAudio: fullAudio,
                    });
                }
                this.reset();
                return;
            }
            // Utterance timeout protection (discard if speech continues beyond 2.8s without wake cadence or trailing pause)
            if (elapsedMs > 2800 || (elapsedMs > 1200 && this.silenceFramesCount > 18)) {
                this.reset();
            }
        }
    }
    flattenChunks() {
        const totalLength = this.utteranceChunks.reduce((acc, c) => acc + c.length, 0);
        const result = new Float32Array(totalLength);
        let offset = 0;
        for (const chunk of this.utteranceChunks) {
            result.set(chunk, offset);
            offset += chunk.length;
        }
        return result;
    }
}
exports.WakeWordDetector = WakeWordDetector;
//# sourceMappingURL=wake-word.js.map