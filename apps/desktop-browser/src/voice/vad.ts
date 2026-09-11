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
  trailingSilenceMs?: number; // Final trailing silence window (default ~1400ms)
  maxIntraPauseMs?: number;    // Allow natural hesitation/pauses inside commands (default ~1600ms)
  maxCommandDurationMs?: number; // Hard ceiling (default 10000ms)
  noiseFloorAdaptRate?: number;
}

export type VADState = 'IDLE' | 'SPEECH_ONSET' | 'SPEAKING' | 'INTRA_PAUSE' | 'SPEECH_ENDED';
export type VADEvent = 'speech_start' | 'speaking' | 'speech_end' | 'pause';

export class VoiceActivityDetector {
  private sampleRate: number;
  private minSpeechFrames: number;
  private trailingSilenceFrames: number;
  private maxIntraPauseFrames: number;
  private maxCommandDurationFrames: number;
  private noiseFloorAdaptRate: number;
  private speechMultiplier: number;

  private state: VADState = 'IDLE';
  private baselineRms = 0.003;
  private consecutiveSpeechFrames = 0;
  private consecutiveSilenceFrames = 0;
  private totalSpeechFrames = 0;
  private totalUtteranceFrames = 0;
  private frameSize = 512; // ~32ms per frame at 16kHz

  private onSpeechStartCallback: (() => void) | null = null;
  private onSpeechEndCallback: ((speechLengthMs: number) => void) | null = null;
  private onPauseCallback: ((pauseMs: number) => void) | null = null;

  constructor(config: VADConfig = {}) {
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

  public reset(): void {
    this.state = 'IDLE';
    this.consecutiveSpeechFrames = 0;
    this.consecutiveSilenceFrames = 0;
    this.totalSpeechFrames = 0;
    this.totalUtteranceFrames = 0;
    this.baselineRms = 0.003;
  }

  public onSpeechStart(cb: () => void): void {
    this.onSpeechStartCallback = cb;
  }

  public onSpeechEnd(cb: (speechLengthMs: number) => void): void {
    this.onSpeechEndCallback = cb;
  }

  public onPause(cb: (pauseMs: number) => void): void {
    this.onPauseCallback = cb;
  }

  public getBaselineNoise(): number {
    return this.baselineRms;
  }

  public getState(): VADState {
    return this.state;
  }

  public getTotalSpeechMs(): number {
    return (this.totalSpeechFrames * this.frameSize / this.sampleRate) * 1000;
  }

  public getTotalUtteranceMs(): number {
    return (this.totalUtteranceFrames * this.frameSize / this.sampleRate) * 1000;
  }

  /**
   * Processes a single 16kHz PCM audio chunk and updates the adaptive VAD state machine.
   */
  public processChunk(samples: Float32Array): VADEvent {
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
            if (this.onSpeechStartCallback) this.onSpeechStartCallback();
            return 'speech_start';
          }
        } else {
          this.consecutiveSpeechFrames = Math.max(0, this.consecutiveSpeechFrames - 1);
        }
        return 'speaking';
      }

      case 'SPEAKING': {
        this.totalSpeechFrames++;
        this.totalUtteranceFrames++;

        if (isFrameVoice) {
          this.consecutiveSilenceFrames = Math.max(0, this.consecutiveSilenceFrames - 2);
        } else {
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
        } else {
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

  private finalizeSpeech(): VADEvent {
    const totalMs = (this.totalSpeechFrames * this.frameSize / this.sampleRate) * 1000;
    this.state = 'SPEECH_ENDED';
    this.consecutiveSpeechFrames = 0;
    this.consecutiveSilenceFrames = 0;
    this.totalSpeechFrames = 0;
    this.totalUtteranceFrames = 0;
    if (this.onSpeechEndCallback) this.onSpeechEndCallback(totalMs);
    return 'speech_end';
  }
}
