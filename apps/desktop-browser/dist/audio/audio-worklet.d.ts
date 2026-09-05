/**
 * AudioWorklet processor definition for high-performance, real-time PCM audio capture.
 * Runs on the dedicated audio rendering thread off the main UI thread.
 */
export declare const PCM_WORKLET_CODE = "\nclass PcmCaptureProcessor extends AudioWorkletProcessor {\n  process(inputs, outputs, parameters) {\n    const input = inputs[0];\n    if (input && input.length > 0) {\n      const channelData = input[0];\n      if (channelData && channelData.length > 0) {\n        // Send a dedicated copy of Float32Array to the main thread\n        this.port.postMessage(channelData.slice());\n      }\n    }\n    const output = outputs[0];\n    if (output && output.length > 0) {\n      for (let ch = 0; ch < output.length; ch++) {\n        output[ch].fill(0);\n      }\n    }\n    return true;\n  }\n}\n\nregisterProcessor('pcm-capture-processor', PcmCaptureProcessor);\n";
export declare function loadPcmWorklet(audioCtx: AudioContext): Promise<void>;
//# sourceMappingURL=audio-worklet.d.ts.map