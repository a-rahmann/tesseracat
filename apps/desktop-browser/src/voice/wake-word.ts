/**
 * Dedicated Low-Latency Wake Word Detector for "Hey Tesseract" / "Hi Tesseract".
 * Operates on real-time 16kHz mono PCM stream in <300ms without invoking Whisper or LLMs.
 */

export interface WakeDetectionResult {
  score: number;
  phrase: string;
  wakeAudio: Float32Array;
  trailingAudio?: Float32Array; // If user continued speaking command directly
}

export interface WakeWordConfig {
  threshold?: number;
  debounceMs?: number;
  enabled?: boolean;
}

export class WakeWordDetector {
  private threshold: number;
  private debounceMs: number;
  private isEnabled: boolean;
  private lastTriggerTime = 0;

  private sampleRate = 16000;
  private preRollSamples = 4000; // 250ms pre-roll at 16kHz
  private preRollBuffer: Float32Array;
  private preRollIndex = 0;

  // Real-time acoustic analysis
  private baselineRms = 0.008;
  private isTrackingUtterance = false;
  private utteranceChunks: Float32Array[] = [];
  private totalUtteranceSamples = 0;
  private silenceFramesCount = 0;

  // Cadence & phonetic stage tracking
  // Stage 0: Silence/Idle
  // Stage 1: Vowel onset ("Hey" / "Hi")
  // Stage 2: High-freq fricative burst ("Tess" - /t/ + /s/)
  // Stage 3: Mid vowel ("er")
  // Stage 4: Plosive stop release ("act" - /k/ + /t/)
  private phoneticStages = [false, false, false, false];
  private stageTimings = [0, 0, 0, 0];

  private onWakeCallback: ((result: WakeDetectionResult) => void) | null = null;

  constructor(config: WakeWordConfig = {}) {
    this.threshold = config.threshold ?? 0.65;
    this.debounceMs = config.debounceMs ?? 1500;
    this.isEnabled = config.enabled ?? true;
    this.preRollBuffer = new Float32Array(this.preRollSamples);
  }

  public setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    if (!enabled) this.reset();
  }

  public isWakeEnabled(): boolean {
    return this.isEnabled;
  }

  public reset(): void {
    this.preRollBuffer.fill(0);
    this.preRollIndex = 0;
    this.isTrackingUtterance = false;
    this.utteranceChunks = [];
    this.totalUtteranceSamples = 0;
    this.silenceFramesCount = 0;
    this.phoneticStages = [false, false, false, false];
  }

  public onWakeDetected(cb: (result: WakeDetectionResult) => void): void {
    this.onWakeCallback = cb;
  }

  /**
   * Process 16kHz PCM audio chunk (typically 512 or 1024 samples, 32-64ms).
   */
  public processChunk(chunk: Float32Array): void {
    if (!this.isEnabled || !chunk || chunk.length === 0) return;

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

    const speechThreshold = Math.max(0.012, this.baselineRms * 1.9);

    if (!this.isTrackingUtterance) {
      // Background noise floor smoothing
      this.baselineRms = this.baselineRms * 0.992 + rms * 0.008;

      // Fill circular pre-roll buffer
      for (let i = 0; i < chunk.length; i++) {
        this.preRollBuffer[this.preRollIndex] = chunk[i];
        this.preRollIndex = (this.preRollIndex + 1) % this.preRollSamples;
      }

      // Detect speech onset
      if (rms > speechThreshold) {
        this.isTrackingUtterance = true;
        this.silenceFramesCount = 0;
        this.utteranceChunks = [];
        this.totalUtteranceSamples = 0;
        this.phoneticStages = [false, false, false, false];

        // Linearize pre-roll buffer
        const preRollLinear = new Float32Array(this.preRollSamples);
        for (let i = 0; i < this.preRollSamples; i++) {
          preRollLinear[i] = this.preRollBuffer[(this.preRollIndex + i) % this.preRollSamples];
        }
        this.utteranceChunks.push(preRollLinear);
        this.totalUtteranceSamples += this.preRollSamples;
        this.utteranceChunks.push(new Float32Array(chunk));
        this.totalUtteranceSamples += chunk.length;
      }
    } else {
      // Currently tracking an utterance
      this.utteranceChunks.push(new Float32Array(chunk));
      this.totalUtteranceSamples += chunk.length;

      const elapsedMs = (this.totalUtteranceSamples / this.sampleRate) * 1000;

      // Track the 4 phonetic stages of "Hey / Hi" + "Tess" + "er" + "act"
      // Stage 1: "Hey" / "Hi" (Voiced vowel: strong RMS, low-moderate ZCR < 0.22)
      if (!this.phoneticStages[0] && elapsedMs < 450) {
        if (rms > speechThreshold * 1.5 && zcr < 0.25) {
          this.phoneticStages[0] = true;
          this.stageTimings[0] = elapsedMs;
        }
      }

      // Stage 2: "Tess" (/t/ transient + /s/ fricative: high ZCR > 0.28, strong highFreqRatio > 0.4)
      if (this.phoneticStages[0] && !this.phoneticStages[1] && elapsedMs > 180 && elapsedMs < 850) {
        if (zcr > 0.25 && highFreqRatio > 0.35) {
          this.phoneticStages[1] = true;
          this.stageTimings[1] = elapsedMs;
        }
      }

      // Stage 3: "er" (Vocalic dip: moderate RMS, dip in ZCR)
      if (this.phoneticStages[1] && !this.phoneticStages[2] && elapsedMs > 350 && elapsedMs < 1150) {
        if (zcr < 0.26 && rms > speechThreshold) {
          this.phoneticStages[2] = true;
          this.stageTimings[2] = elapsedMs;
        }
      }

      // Stage 4: "act" (/k/ + /t/ release: sharp high-frequency transient)
      if (this.phoneticStages[2] && !this.phoneticStages[3] && elapsedMs > 450 && elapsedMs < 1400) {
        if (zcr > 0.24 && highFreqRatio > 0.3) {
          this.phoneticStages[3] = true;
          this.stageTimings[3] = elapsedMs;
        }
      }

      // Check for trailing pause or wake completion
      if (rms < speechThreshold) {
        this.silenceFramesCount++;
      } else {
        this.silenceFramesCount = Math.max(0, this.silenceFramesCount - 1);
      }

      // Evaluate detection criteria when phrase has completed or silence is encountered
      const isCandidateDuration = elapsedMs >= 480 && elapsedMs <= 2200;
      const hasSilencePause = this.silenceFramesCount >= 6; // ~190ms trailing silence
      const allPhoneticsPassed = this.phoneticStages[0] && this.phoneticStages[1] && this.phoneticStages[2] && this.phoneticStages[3];
      const threePhoneticsPassed = (this.phoneticStages[0] ? 1 : 0) + (this.phoneticStages[1] ? 1 : 0) + (this.phoneticStages[2] ? 1 : 0) + (this.phoneticStages[3] ? 1 : 0) >= 3;

      const now = Date.now();
      const isDebounced = now - this.lastTriggerTime > this.debounceMs;

      if (isDebounced && isCandidateDuration && (allPhoneticsPassed || (threePhoneticsPassed && hasSilencePause))) {
        // Assemble audio buffer
        const fullAudio = this.flattenChunks();
        const score = allPhoneticsPassed ? 0.95 : 0.82;

        if (score >= this.threshold) {
          this.lastTriggerTime = now;
          console.log(`[Wake Word] Instant Wake Detected (Score: ${score.toFixed(2)}, Latency: <${Math.round((this.silenceFramesCount * chunk.length / 16))}ms)`);

          // Split wake word and trailing command audio if user spoke without pause
          // e.g. "Hey Tesseract, open YouTube"
          let wakeCutoff = Math.min(fullAudio.length, Math.round(1.1 * this.sampleRate));
          const wakeAudio = fullAudio.slice(0, wakeCutoff);
          const trailingAudio = fullAudio.length > wakeCutoff ? fullAudio.slice(wakeCutoff) : undefined;

          if (this.onWakeCallback) {
            this.onWakeCallback({
              score,
              phrase: 'Hey Tesseract',
              wakeAudio,
              trailingAudio,
            });
          }

          this.reset();
          return;
        }
      }

      // Utterance timeout protection (exceeded 3.5 seconds)
      if (elapsedMs > 3500 || (elapsedMs > 1200 && this.silenceFramesCount > 15)) {
        this.reset();
      }
    }
  }

  private flattenChunks(): Float32Array {
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
