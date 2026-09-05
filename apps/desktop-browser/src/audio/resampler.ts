/**
 * High-fidelity Audio Resampler to 16kHz mono Float32 PCM.
 * Uses OfflineAudioContext hardware-accelerated sinc resampling with anti-aliasing filtering,
 * with a bandlimited Lanczos/sinc fallback.
 */

export async function resampleTo16k(
  audioBuffer: Float32Array,
  originalSampleRate: number
): Promise<Float32Array> {
  if (!audioBuffer || audioBuffer.length === 0) {
    return new Float32Array(0);
  }

  const targetSampleRate = 16000;
  if (originalSampleRate === targetSampleRate) {
    return audioBuffer;
  }

  const numFrames = Math.max(1, Math.round((audioBuffer.length * targetSampleRate) / originalSampleRate));

  // Primary: Native OfflineAudioContext with hardware C++ anti-aliasing sinc filter
  if (typeof OfflineAudioContext !== 'undefined' || typeof (window as any)?.OfflineAudioContext !== 'undefined') {
    try {
      const OfflineCtxClass = typeof OfflineAudioContext !== 'undefined'
        ? OfflineAudioContext
        : (window as any).OfflineAudioContext;

      const offlineCtx = new OfflineCtxClass(1, numFrames, targetSampleRate);
      const audioBuf = offlineCtx.createBuffer(1, audioBuffer.length, originalSampleRate);
      
      // Copy PCM data to channel 0
      audioBuf.copyToChannel(audioBuffer, 0);

      const source = offlineCtx.createBufferSource();
      source.buffer = audioBuf;
      source.connect(offlineCtx.destination);
      source.start(0);

      const rendered = await offlineCtx.startRendering();
      const output = rendered.getChannelData(0);

      // Clean non-finite samples if any
      const cleaned = new Float32Array(output.length);
      for (let i = 0; i < output.length; i++) {
        cleaned[i] = Number.isFinite(output[i]) ? output[i] : 0;
      }
      return cleaned;
    } catch (err) {
      console.warn('[Resampler] OfflineAudioContext resampler failed, falling back to sinc filter:', err);
    }
  }

  // Fallback: Bandlimited Windowed-Sinc Resampler with Low-Pass Filtering
  return bandlimitedSincResample(audioBuffer, originalSampleRate, targetSampleRate);
}

/**
 * Bandlimited windowed sinc resampler with cutoff filter at Nyquist frequency.
 * Prevents high-frequency aliasing folding into the 0-8kHz speech band.
 */
function bandlimitedSincResample(
  input: Float32Array,
  inRate: number,
  outRate: number
): Float32Array {
  const ratio = outRate / inRate;
  const outLength = Math.max(1, Math.round(input.length * ratio));
  const output = new Float32Array(outLength);

  // Anti-aliasing cutoff frequency (normalized to input rate)
  const cutoff = ratio < 1.0 ? 0.9 * ratio * 0.5 : 0.5;
  const filterWindow = 8; // Sinc lobe count

  for (let i = 0; i < outLength; i++) {
    const srcIndex = i / ratio;
    const center = Math.floor(srcIndex);
    let sum = 0;
    let weightSum = 0;

    for (let j = center - filterWindow; j <= center + filterWindow; j++) {
      if (j >= 0 && j < input.length) {
        const x = (srcIndex - j) * Math.PI;
        let sinc = 1.0;
        if (x !== 0) {
          sinc = Math.sin(2 * cutoff * x) / x;
        }
        // Blackman window
        const winIdx = (j - (srcIndex - filterWindow)) / (2 * filterWindow);
        const window = 0.42 - 0.5 * Math.cos(2 * Math.PI * winIdx) + 0.08 * Math.cos(4 * Math.PI * winIdx);
        const weight = sinc * window;
        sum += input[j] * weight;
        weightSum += weight;
      }
    }

    output[i] = weightSum > 0.0001 ? sum / weightSum : 0;
  }

  return output;
}
