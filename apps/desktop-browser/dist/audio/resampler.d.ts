/**
 * High-fidelity Audio Resampler to 16kHz mono Float32 PCM.
 * Uses OfflineAudioContext hardware-accelerated sinc resampling with anti-aliasing filtering,
 * with a bandlimited Lanczos/sinc fallback.
 */
export declare function resampleTo16k(audioBuffer: Float32Array, originalSampleRate: number): Promise<Float32Array>;
//# sourceMappingURL=resampler.d.ts.map