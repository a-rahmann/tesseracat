/**
 * High-Performance, Low-Latency Audio Resampler to 16kHz mono Float32 PCM.
 * Uses direct polyphase filtering for integer decimation (e.g. 48kHz -> 16kHz)
 * and bandlimited windowed-sinc resampling for arbitrary sample rates (e.g. 44.1kHz -> 16kHz).
 *
 * CRITICAL INVARIANT: Zero Web Audio graph allocations inside the audio streaming loop.
 */
export declare function resampleTo16k(audioBuffer: Float32Array, originalSampleRate: number): Promise<Float32Array>;
//# sourceMappingURL=resampler.d.ts.map