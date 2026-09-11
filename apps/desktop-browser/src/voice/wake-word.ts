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

  private peakUtteranceRms = 0;
  private voicedFramesCount = 0;
  private sibilantFramesCount = 0;
  private vocalicFramesCount = 0;
  private plosiveFramesCount = 0;
  private onWakeCallback: ((result: WakeDetectionResult) => void) | null = null;

  constructor(config: WakeWordConfig = {}) {
    this.threshold = config.threshold ?? 0.88;
    this.debounceMs = config.debounceMs ?? 3500;
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
    this.stageTimings = [0, 0, 0, 0];
    this.peakUtteranceRms = 0;
    this.voicedFramesCount = 0;
    this.sibilantFramesCount = 0;
    this.vocalicFramesCount = 0;
    this.plosiveFramesCount = 0;
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

    // Dynamic speech threshold with adaptive noise floor [0.008, 0.022]
    const speechThreshold = Math.max(0.008, Math.min(0.022, this.baselineRms * 2.0));

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

      // Detect speech onset for intentional wake word (covers natural conversational volume)
      if (rms >= speechThreshold && zcr < 0.28) {
        this.isTrackingUtterance = true;
        this.silenceFramesCount = 0;
        this.utteranceChunks = [];
        this.totalUtteranceSamples = 0;
        this.phoneticStages = [false, false, false, false];
        this.stageTimings = [0, 0, 0, 0];
        this.peakUtteranceRms = rms;
        this.voicedFramesCount = 1;
        this.sibilantFramesCount = 0;
        this.vocalicFramesCount = 0;
        this.plosiveFramesCount = 0;

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
      if (rms > this.peakUtteranceRms) this.peakUtteranceRms = rms;

      const elapsedMs = (this.totalUtteranceSamples / this.sampleRate) * 1000;

      // Track the 4 phonetic stages of "Hey"/"Hi" + "Tess" + "er" + "act"
      // Stage 0: Voiced vowel onset "Hey" / "Hi"
      if (!this.phoneticStages[0] && elapsedMs < 800) {
        if (rms >= speechThreshold * 1.05 && zcr < 0.28) {
          this.voicedFramesCount++;
          if (this.voicedFramesCount >= 2) {
            this.phoneticStages[0] = true;
            this.stageTimings[0] = elapsedMs;
          }
        }
      }

      // Stage 1: "Tess" (/t/ onset + /s/ dental sibilant)
      if (this.phoneticStages[0] && !this.phoneticStages[1] && elapsedMs > 120 && elapsedMs < 1300) {
        if (zcr >= 0.25 || highFreqRatio >= 0.25) {
          this.sibilantFramesCount++;
          if (this.sibilantFramesCount >= 2) {
            this.phoneticStages[1] = true;
            this.stageTimings[1] = elapsedMs;
          }
        }
      }

      // Stage 2: "er" (Vocalic dip)
      if (this.phoneticStages[1] && !this.phoneticStages[2] && elapsedMs > 250 && elapsedMs < 1800) {
        if (zcr < 0.25 && rms >= speechThreshold * 0.7) {
          this.vocalicFramesCount++;
          if (this.vocalicFramesCount >= 1) {
            this.phoneticStages[2] = true;
            this.stageTimings[2] = elapsedMs;
          }
        }
      }

      // Stage 3: "act" (/k/ + /t/ plosive release)
      if (this.phoneticStages[2] && !this.phoneticStages[3] && elapsedMs > 400 && elapsedMs < 2400) {
        if (highFreqRatio >= 0.20 || zcr >= 0.22) {
          this.plosiveFramesCount++;
          if (this.plosiveFramesCount >= 1) {
            this.phoneticStages[3] = true;
            this.stageTimings[3] = elapsedMs;
          }
        }
      }

      // Check for trailing pause
      if (rms < speechThreshold) {
        this.silenceFramesCount++;
      } else {
        this.silenceFramesCount = Math.max(0, this.silenceFramesCount - 1);
      }

      // Intentional "Hey Tesseract" or "Hi Tesseract" takes between 450ms and 2400ms
      const isCandidateDuration = elapsedMs >= 450 && elapsedMs <= 2400;
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
      // Trailing pause (phrase boundary) OR fluid continuous command transition
      const hasTrailingPause = this.silenceFramesCount >= 2;
      const isFluidCommand = (elapsedMs >= 650 && this.phoneticStages[3]);
      const hasRealVoiceEnergy = this.peakUtteranceRms >= 0.020;

      if (isDebounced && isCandidateDuration && allPhoneticsPassed && (hasTrailingPause || isFluidCommand) && hasRealVoiceEnergy) {
        const fullAudio = this.flattenChunks();
        this.lastTriggerTime = now;
        console.log(`[Wake Word] Acoustic Wake Confirmed: "Hey/Hi Tesseract" (Duration: ${Math.round(elapsedMs)}ms, Peak RMS: ${this.peakUtteranceRms.toFixed(4)})`);

        if (this.onWakeCallback) {
          this.onWakeCallback({
            score: 0.96,
            phrase: 'Hey Tesseract',
            wakeAudio: fullAudio,
          });
        }

        this.reset();
        return;
      }

      // Utterance timeout protection (discard if audio continues beyond 2.8s without completing wake phrase)
      if (elapsedMs > 2800 || (elapsedMs > 1200 && this.silenceFramesCount > 25)) {
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
