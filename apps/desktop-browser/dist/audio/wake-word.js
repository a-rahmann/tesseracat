"use strict";
/**
 * Dedicated Low-Power Wake-Word Detector for "Hey Tesseract".
 * Operates on real-time 16kHz PCM stream without continuously running Whisper.
 * Includes confidence threshold, temporal envelope matching, and debounce cooldown.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.WakeWordDetector = void 0;
class WakeWordDetector {
    threshold;
    debounceMs;
    isEnabled;
    lastTriggerTime = 0;
    slidingBuffer;
    bufferIndex = 0;
    sampleRate = 16000;
    ambientFloor = 0.005;
    onWakeCallback = null;
    constructor(config = {}) {
        this.threshold = config.threshold ?? 0.42;
        this.debounceMs = config.debounceMs ?? 2000;
        this.isEnabled = config.enabled ?? false;
        // 1.5 second ring buffer at 16kHz (24,000 samples)
        this.slidingBuffer = new Float32Array(this.sampleRate * 1.5);
        console.log(`[Wake] Detector initialized (Enabled: ${this.isEnabled}, Threshold: ${this.threshold}, Debounce: ${this.debounceMs}ms)`);
    }
    setEnabled(enabled) {
        this.isEnabled = enabled;
        console.log(`[Wake] Detector enabled state: ${this.isEnabled}`);
        if (!enabled) {
            this.reset();
        }
    }
    /**
     * Reset ring buffer, cooldown, and temporal state to prevent sticky triggers or dead states.
     */
    reset() {
        this.slidingBuffer.fill(0);
        this.bufferIndex = 0;
        this.lastTriggerTime = 0;
        console.log('[Wake] Ring buffer & temporal states reset');
    }
    getLinearBuffer() {
        const len = this.slidingBuffer.length;
        const out = new Float32Array(len);
        for (let i = 0; i < len; i++) {
            out[i] = this.slidingBuffer[(this.bufferIndex + i) % len];
        }
        return out;
    }
    onWakeDetected(callback) {
        this.onWakeCallback = callback;
    }
    /**
     * Feed incoming 16kHz PCM chunk for acoustic/phonetic envelope analysis.
     */
    processChunk(chunk) {
        if (!this.isEnabled)
            return;
        for (let i = 0; i < chunk.length; i++) {
            this.slidingBuffer[this.bufferIndex] = chunk[i];
            this.bufferIndex = (this.bufferIndex + 1) % this.slidingBuffer.length;
        }
        // Evaluate every ~160ms (2560 samples)
        if (this.bufferIndex % 2560 < chunk.length) {
            this.evaluateBuffer();
        }
    }
    evaluateBuffer() {
        const now = Date.now();
        if (now - this.lastTriggerTime < this.debounceMs) {
            return; // Cooldown active
        }
        const len = this.slidingBuffer.length;
        // Divide 1.5s buffer into 6 equal slices of 250ms (4000 samples each at 16kHz)
        const numSlices = 6;
        const sliceSize = Math.floor(len / numSlices);
        const sliceEnergies = new Float32Array(numSlices);
        for (let s = 0; s < numSlices; s++) {
            let sum = 0;
            const offset = s * sliceSize;
            for (let i = 0; i < sliceSize; i++) {
                const idx = (this.bufferIndex + offset + i) % len;
                const val = this.slidingBuffer[idx];
                sum += val * val;
            }
            sliceEnergies[s] = Math.sqrt(sum / sliceSize);
        }
        let overallSum = 0;
        for (let s = 0; s < numSlices; s++)
            overallSum += sliceEnergies[s];
        const overallRms = overallSum / numSlices;
        // Track ambient background noise floor
        this.ambientFloor = this.ambientFloor * 0.96 + overallRms * 0.04;
        // Room ambient noise floor check
        if (overallRms < 0.005) {
            return;
        }
        // Sliding candidate search across consecutive 4-slice groups (0-3, 1-4, 2-5)
        // This allows "Hey Tesseract" to be detected whether spoken fast, slowly, or ending mid-buffer
        let bestPatternScore = 0;
        for (let k = 0; k <= numSlices - 4; k++) {
            const e0 = sliceEnergies[k]; // "Hey"
            const e1 = sliceEnergies[k + 1]; // "Tess"
            const e2 = sliceEnergies[k + 2]; // "er"
            const e3 = sliceEnergies[k + 3]; // "act"
            const maxE = Math.max(e0, e1, e2, e3);
            const minE = Math.min(e0, e1, e2, e3);
            const dynamicModulation = (maxE - minE) / (maxE + 0.0001);
            // Voice burst must stand out above ambient background sound
            const minBurstPeak = Math.max(0.008, this.ambientFloor * 1.55);
            if (maxE < minBurstPeak || dynamicModulation < 0.20) {
                continue;
            }
            let score = 0;
            // Pattern A: Full "Hey Tesseract" (e0: "Hey", e1: "Tess", e2: "er", e3: "act")
            if (e0 > 0.006 && e1 > 0.006 && e3 > 0.005) {
                const cadence = (e0 + e1 + e3) / (3 * (e2 + 0.0015));
                if (cadence > 1.08) {
                    const syllableSymmetry = Math.min(e0, e1) / (Math.max(e0, e1) + 0.001);
                    score = Math.min(1.0, syllableSymmetry * 0.40 + (cadence - 1.0) * 0.35 + dynamicModulation * 0.25);
                }
            }
            // Pattern B: Fast or direct "Tesseract" (onset at e1: "Tess", dip at e2: "er", rise at e3: "act")
            if (score < this.threshold && e1 > 0.007 && e3 > 0.006) {
                const cadenceB = (e1 + e3) / (2 * (e2 + 0.0015));
                if (cadenceB > 1.10) {
                    const syllableSymmetryB = Math.min(e1, e3) / (Math.max(e1, e3) + 0.001);
                    const scoreB = Math.min(1.0, syllableSymmetryB * 0.40 + (cadenceB - 1.0) * 0.35 + dynamicModulation * 0.25);
                    if (scoreB > score)
                        score = scoreB;
                }
            }
            if (score > bestPatternScore) {
                bestPatternScore = score;
            }
        }
        if (bestPatternScore > 0.15) {
            console.log(`[Wake] Acoustic score: ${bestPatternScore.toFixed(2)} (RMS: ${overallRms.toFixed(4)})`);
        }
        if (bestPatternScore >= this.threshold) {
            this.lastTriggerTime = now;
            console.log(`[Wake] ⚡ Candidate detected (Score: ${bestPatternScore.toFixed(2)}). Verifying phonetically...`);
            if (this.onWakeCallback) {
                this.onWakeCallback(bestPatternScore, this.getLinearBuffer());
            }
        }
    }
}
exports.WakeWordDetector = WakeWordDetector;
//# sourceMappingURL=wake-word.js.map