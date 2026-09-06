"use strict";
/**
 * AudioWorklet processor definition for high-performance, real-time PCM audio capture.
 * Runs on the dedicated audio rendering thread off the main UI thread.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PCM_WORKLET_CODE = void 0;
exports.loadPcmWorklet = loadPcmWorklet;
exports.PCM_WORKLET_CODE = `
class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // 768 is 6 * 128 (Web Audio frame quantum) and exactly divisible by 3 (48kHz -> 16kHz decimation: 256 samples)
    this.buffer = new Float32Array(768);
    this.bufferIndex = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input && input.length > 0) {
      const channelData = input[0];
      if (channelData && channelData.length > 0) {
        for (let i = 0; i < channelData.length; i++) {
          this.buffer[this.bufferIndex++] = channelData[i];
          if (this.bufferIndex >= 768) {
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
async function loadPcmWorklet(audioCtx) {
    const blob = new Blob([exports.PCM_WORKLET_CODE], { type: 'application/javascript' });
    const workletUrl = URL.createObjectURL(blob);
    try {
        await audioCtx.audioWorklet.addModule(workletUrl);
    }
    finally {
        // Delay revocation to ensure Chromium module compiler finishes reading
        setTimeout(() => {
            try {
                URL.revokeObjectURL(workletUrl);
            }
            catch (_) { }
        }, 10000);
    }
}
//# sourceMappingURL=audio-worklet.js.map