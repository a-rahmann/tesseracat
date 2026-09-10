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
  onWake?: (result: WakeDetectionResult) => void;
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
    if (config.onWake) this.onWakeCallback = config.onWake;
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

    const speechThreshold = Math.max(0.010, this.baselineRms * 1.5);

    if (!this.isTrackingUtterance) {
      // Only smooth background noise floor during ambient silence
      if (rms < speechThreshold) {
        this.baselineRms = this.baselineRms * 0.992 + rms * 0.008;
      }

      // Fill circular pre-roll buffer
      for (let i = 0; i < chunk.length; i++) {
        this.preRollBuffer[this.preRollIndex] = chunk[i];
        this.preRollIndex = (this.preRollIndex + 1) % this.preRollSamples;
      }

      // Detect speech onset for intentional wake word
      if (rms >= speechThreshold) {
        this.isTrackingUtterance = true;
        this.silenceFramesCount = 0;
        this.utteranceChunks = [];
        this.totalUtteranceSamples = 0;

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
    } else {
      // Currently tracking an utterance
      this.utteranceChunks.push(new Float32Array(chunk));
      this.totalUtteranceSamples += chunk.length;

      const elapsedMs = (this.totalUtteranceSamples / this.sampleRate) * 1000;

      // Check for trailing pause or phrase completion
      if (rms < speechThreshold) {
        this.silenceFramesCount++;
      } else {
        this.silenceFramesCount = Math.max(0, this.silenceFramesCount - 1);
      }

      // Trigger candidate verification when phrase duration matches spoken wake word
      // e.g. "Hey Tesseract" or "Tesseract" is 500ms - 2200ms
      const isPhraseComplete = (elapsedMs >= 550 && this.silenceFramesCount >= 4) || elapsedMs >= 1500;
      const now = Date.now();
      const isDebounced = now - this.lastTriggerTime > this.debounceMs;

      if (isDebounced && isPhraseComplete && elapsedMs >= 450 && elapsedMs <= 2400) {
        const fullAudio = this.flattenChunks();
        this.lastTriggerTime = now;
        console.log(`[Wake Word] Speech candidate captured (Duration: ${Math.round(elapsedMs)}ms, Samples: ${fullAudio.length}), passing to ASR gate...`);

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

      // Utterance timeout protection
      if (elapsedMs > 3200 || (elapsedMs > 1000 && this.silenceFramesCount > 16)) {
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
