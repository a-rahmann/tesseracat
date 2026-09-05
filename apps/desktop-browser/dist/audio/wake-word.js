"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.WakeWordDetector = void 0;
class WakeWordDetector {
    debounceMs;
    isEnabled;
    lastTriggerTime = 0;
    // Adaptive background noise floor tracking
    baselineRms = 0.008;
    // 250ms pre-roll circular buffer at 16kHz (4000 samples) to catch word onsets
    sampleRate = 16000;
    preRollSize = 4000;
    preRollBuffer;
    preRollIndex = 0;
    // Utterance tracking
    isSpeaking = false;
    consecutiveSpeechFrames = 0;
    silenceFrames = 0;
    speechChunks = [];
    totalSpeechSamples = 0;
    onWakeCallback = null;
    constructor(config = {}) {
        this.debounceMs = config.debounceMs ?? 1500;
        this.isEnabled = config.enabled ?? false;
        this.preRollBuffer = new Float32Array(this.preRollSize);
        console.log(`[Wake] Detector initialized (Enabled: ${this.isEnabled}, Debounce: ${this.debounceMs}ms)`);
    }
    setEnabled(enabled) {
        this.isEnabled = enabled;
        console.log(`[Wake] Detector enabled state: ${this.isEnabled}`);
        if (!enabled) {
            this.reset();
        }
    }
    /**
     * Reset ring buffer, speech accumulators, and temporal state.
     */
    reset() {
        this.preRollBuffer.fill(0);
        this.preRollIndex = 0;
        this.isSpeaking = false;
        this.consecutiveSpeechFrames = 0;
        this.silenceFrames = 0;
        this.speechChunks = [];
        this.totalSpeechSamples = 0;
        console.log('[Wake] Ring buffer & temporal states reset');
    }
    onWakeDetected(callback) {
        this.onWakeCallback = callback;
    }
    /**
     * Feed incoming 16kHz PCM chunk for real-time VAD utterance segmentation.
     */
    processChunk(chunk) {
        if (!this.isEnabled || !chunk || chunk.length === 0)
            return;
        // Calculate RMS on the incoming 16kHz chunk
        let sumSq = 0;
        for (let i = 0; i < chunk.length; i++) {
            const val = chunk[i];
            sumSq += val * val;
        }
        const chunkRms = Math.sqrt(sumSq / chunk.length);
        if (!this.isSpeaking) {
            // 1. Update ambient noise floor smoothly
            this.baselineRms = this.baselineRms * 0.992 + chunkRms * 0.008;
            // 2. Store chunk into pre-roll ring buffer
            for (let i = 0; i < chunk.length; i++) {
                this.preRollBuffer[this.preRollIndex] = chunk[i];
                this.preRollIndex = (this.preRollIndex + 1) % this.preRollSize;
            }
            // 3. Detect speech onset: energy must clearly exceed ambient noise
            const speechThreshold = Math.max(0.014, this.baselineRms * 2.0);
            if (chunkRms > speechThreshold) {
                this.consecutiveSpeechFrames++;
                // Require ~20ms of sustained speech energy (approx 6-8 worklet frames)
                if (this.consecutiveSpeechFrames >= 6) {
                    this.isSpeaking = true;
                    this.consecutiveSpeechFrames = 0;
                    this.silenceFrames = 0;
                    this.speechChunks = [];
                    this.totalSpeechSamples = 0;
                    // Extract linearized pre-roll buffer so the onset ('H' in 'Hey') is intact
                    const preRollLinear = new Float32Array(this.preRollSize);
                    for (let i = 0; i < this.preRollSize; i++) {
                        preRollLinear[i] = this.preRollBuffer[(this.preRollIndex + i) % this.preRollSize];
                    }
                    this.speechChunks.push(preRollLinear);
                    this.totalSpeechSamples += this.preRollSize;
                    const copy = new Float32Array(chunk.length);
                    copy.set(chunk);
                    this.speechChunks.push(copy);
                    this.totalSpeechSamples += chunk.length;
                    console.log(`[Wake] Speech onset detected (RMS: ${chunkRms.toFixed(4)}, Baseline: ${this.baselineRms.toFixed(4)})`);
                }
            }
            else {
                this.consecutiveSpeechFrames = 0;
            }
        }
        else {
            // While speaking: accumulate PCM chunks
            const copy = new Float32Array(chunk.length);
            copy.set(chunk);
            this.speechChunks.push(copy);
            this.totalSpeechSamples += chunk.length;
            // Check for silence to detect end-of-phrase
            const silenceFloor = Math.max(0.008, this.baselineRms * 1.3);
            if (chunkRms < silenceFloor) {
                this.silenceFrames++;
            }
            else {
                this.silenceFrames = 0;
            }
            // Trailing silence timeout (~380ms of silence, ~130 frames at ~46 samples each)
            // Or safety timeout if user has spoken for > 3.2s
            const isTrailingSilence = this.silenceFrames >= 130;
            const isMaxDuration = this.totalSpeechSamples >= this.sampleRate * 3.5;
            if (isTrailingSilence || isMaxDuration) {
                const durationSec = this.totalSpeechSamples / this.sampleRate;
                console.log(`[Wake] Utterance completed (${durationSec.toFixed(2)}s, Silence: ${this.silenceFrames} frames, MaxDur: ${isMaxDuration})`);
                // Check if utterance is long enough to contain "Hey Tesseract" (minimum 0.45s)
                if (this.totalSpeechSamples >= this.sampleRate * 0.45) {
                    const now = Date.now();
                    if (now - this.lastTriggerTime >= this.debounceMs) {
                        this.lastTriggerTime = now;
                        // Merge all chunks into one unified Float32 buffer
                        const merged = new Float32Array(this.totalSpeechSamples);
                        let offset = 0;
                        for (const c of this.speechChunks) {
                            merged.set(c, offset);
                            offset += c.length;
                        }
                        if (this.onWakeCallback) {
                            this.onWakeCallback(1.0, merged);
                        }
                    }
                    else {
                        console.log('[Wake] Utterance debounced (cooldown active)');
                    }
                }
                else {
                    console.log('[Wake] Discarded short noise burst (< 0.45s)');
                }
                // Reset utterance tracking back to listening
                this.isSpeaking = false;
                this.consecutiveSpeechFrames = 0;
                this.silenceFrames = 0;
                this.speechChunks = [];
                this.totalSpeechSamples = 0;
            }
        }
    }
}
exports.WakeWordDetector = WakeWordDetector;
//# sourceMappingURL=wake-word.js.map