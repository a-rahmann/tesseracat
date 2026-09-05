/**
 * AudioWorklet processor definition for high-performance, real-time PCM audio capture.
 * Runs on the dedicated audio rendering thread off the main UI thread.
 */

export const PCM_WORKLET_CODE = `
class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(512);
    this.bufferIndex = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input && input.length > 0) {
      const channelData = input[0];
      if (channelData && channelData.length > 0) {
        for (let i = 0; i < channelData.length; i++) {
          this.buffer[this.bufferIndex++] = channelData[i];
          if (this.bufferIndex >= 512) {
            this.port.postMessage(this.buffer.slice());
            this.bufferIndex = 0;
          }
        }
      }
    }
    const output = outputs[0];
    if (output && output.length > 0) {
      for (let ch = 0; ch < output.length; ch++) {
        output[ch].fill(0);
      }
    }
    return true;
  }
}

registerProcessor('pcm-capture-processor', PcmCaptureProcessor);
`;

export async function loadPcmWorklet(audioCtx: AudioContext): Promise<void> {
  const blob = new Blob([PCM_WORKLET_CODE], { type: 'application/javascript' });
  const workletUrl = URL.createObjectURL(blob);
  try {
    await audioCtx.audioWorklet.addModule(workletUrl);
  } finally {
    URL.revokeObjectURL(workletUrl);
  }
}
