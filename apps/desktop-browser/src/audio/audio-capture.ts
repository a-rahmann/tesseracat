/**
 * AudioCapture: Manages microphone stream, AudioContext, and AudioWorkletNode
 * for non-blocking real-time PCM audio streaming.
 */
import { loadPcmWorklet } from './audio-worklet.js';

export interface AudioCaptureCallbacks {
  onPcmChunk: (chunk: Float32Array) => void;
  onRmsLevel: (rms: number) => void;
  onError?: (err: Error) => void;
}

export class AudioCapture {
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private scriptProcessorNode: ScriptProcessorNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private silentGain: GainNode | null = null;
  private isCapturing = false;

  public async start(callbacks: AudioCaptureCallbacks): Promise<{ sampleRate: number }> {
    if (this.isCapturing) {
      await this.stop();
    }

    try {
      console.log('[Voice] Initializing microphone media stream...');
      try {
        this.mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      } catch (conErr) {
        console.warn('[Voice] Constrained getUserMedia failed, retrying with fallback audio constraints...', conErr);
        this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      // Use native hardware sample rate to avoid CoreAudio/device driver initialization failures
      this.audioContext = new AudioCtx();

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume().catch(() => {});
      }

      const nativeSampleRate = this.audioContext.sampleRate;
      console.log(`[Voice] Microphone initialized | Native sample rate: ${nativeSampleRate}Hz | AudioContext: ${this.audioContext.state}`);

      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

      // Connect to AnalyserNode so Chromium CoreAudio HAL considers the microphone actively consumed
      const analyser = this.audioContext.createAnalyser();
      analyser.fftSize = 256;
      this.sourceNode.connect(analyser);

      // Attempt 1: AudioWorklet capture processor
      let workletActive = false;
      if (typeof this.audioContext.audioWorklet !== 'undefined') {
        try {
          await loadPcmWorklet(this.audioContext);
          this.workletNode = new AudioWorkletNode(this.audioContext, 'pcm-capture-processor');
          this.workletNode.port.onmessage = (event: MessageEvent<Float32Array>) => {
            if (!this.isCapturing) return;
            const data = event.data;
            if (!data || data.length === 0) return;
            this.handlePcmData(data, callbacks);
          };

          this.sourceNode.connect(this.workletNode);
          // Connect worklet to destination (the processor zeroes all output channels so no sound plays)
          this.workletNode.connect(this.audioContext.destination);

          workletActive = true;
          console.log('[Voice] AudioWorklet capture pipeline active');
        } catch (workletErr) {
          console.warn('[Voice] AudioWorklet failed to load or connect, switching to ScriptProcessorNode fallback:', workletErr);
          if (this.workletNode) {
            try { this.workletNode.disconnect(); } catch (_) {}
            this.workletNode = null;
          }
        }
      }

      // Attempt 2: Bulletproof ScriptProcessorNode fallback if worklet fails
      if (!workletActive) {
        console.log('[Voice] Initializing ScriptProcessorNode audio capture fallback...');
        const scriptNode = this.audioContext.createScriptProcessor(2048, 1, 1);
        this.scriptProcessorNode = scriptNode;

        scriptNode.onaudioprocess = (event: AudioProcessingEvent) => {
          if (!this.isCapturing) return;
          const inputData = event.inputBuffer.getChannelData(0);
          if (!inputData || inputData.length === 0) return;
          // Clone buffer because AudioProcessingEvent reuses channel arrays
          const clone = new Float32Array(inputData.length);
          clone.set(inputData);
          this.handlePcmData(clone, callbacks);

          // Zero out the output buffer to prevent microphone feedback on speakers
          const outputData = event.outputBuffer.getChannelData(0);
          outputData.fill(0);
        };

        this.sourceNode.connect(scriptNode);
        scriptNode.connect(this.audioContext.destination);
        console.log('[Voice] ScriptProcessorNode capture fallback active');
      }

      this.isCapturing = true;
      return { sampleRate: nativeSampleRate };
    } catch (err: any) {
      console.error('[Voice] AudioCapture start failed:', err);
      if (callbacks.onError) callbacks.onError(err);
      await this.stop();
      throw err;
    }
  }

  private handlePcmData(data: Float32Array, callbacks: AudioCaptureCallbacks): void {
    let sumSq = 0;
    for (let i = 0; i < data.length; i++) {
      sumSq += data[i] * data[i];
    }
    const rms = Math.sqrt(sumSq / data.length);
    callbacks.onRmsLevel(rms);
    callbacks.onPcmChunk(data);
  }

  public async resumeIfSuspended(): Promise<void> {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      console.log('[Voice] Explicitly resuming suspended AudioContext...');
      await this.audioContext.resume().catch(() => {});
    }
  }

  public async stop(): Promise<void> {
    this.isCapturing = false;

    if (this.workletNode) {
      try {
        this.workletNode.port.onmessage = null;
        this.workletNode.disconnect();
      } catch (_) {}
      this.workletNode = null;
    }

    if (this.scriptProcessorNode) {
      try {
        this.scriptProcessorNode.onaudioprocess = null;
        this.scriptProcessorNode.disconnect();
      } catch (_) {}
      this.scriptProcessorNode = null;
    }

    if (this.silentGain) {
      try { this.silentGain.disconnect(); } catch (_) {}
      this.silentGain = null;
    }

    if (this.sourceNode) {
      try { this.sourceNode.disconnect(); } catch (_) {}
      this.sourceNode = null;
    }

    if (this.mediaStream) {
      try {
        this.mediaStream.getTracks().forEach((track) => track.stop());
      } catch (_) {}
      this.mediaStream = null;
    }

    if (this.audioContext) {
      try {
        await this.audioContext.close();
      } catch (_) {}
      this.audioContext = null;
    }

    console.log('[Voice] AudioCapture stopped and resources released');
  }

  public isActive(): boolean {
    return this.isCapturing;
  }
}
