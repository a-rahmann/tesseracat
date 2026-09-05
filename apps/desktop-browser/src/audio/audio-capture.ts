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
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private silentGain: GainNode | null = null;
  private isCapturing = false;

  public async start(callbacks: AudioCaptureCallbacks): Promise<{ sampleRate: number }> {
    if (this.isCapturing) {
      await this.stop();
    }

    try {
      console.log('[Voice] Initializing microphone media stream...');
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioCtx();

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      const nativeSampleRate = this.audioContext.sampleRate;
      console.log(`[Voice] Microphone initialized | Native sample rate: ${nativeSampleRate}Hz`);

      // Load PCM Capture AudioWorklet
      await loadPcmWorklet(this.audioContext);
      console.log('[Voice] Worklet started');

      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.workletNode = new AudioWorkletNode(this.audioContext, 'pcm-capture-processor');

      this.workletNode.port.onmessage = (event: MessageEvent<Float32Array>) => {
        if (!this.isCapturing) return;
        const data = event.data;
        if (!data || data.length === 0) return;

        // Calculate RMS on the incoming buffer
        let sumSq = 0;
        for (let i = 0; i < data.length; i++) {
          sumSq += data[i] * data[i];
        }
        const rms = Math.sqrt(sumSq / data.length);

        callbacks.onRmsLevel(rms);
        callbacks.onPcmChunk(data);
      };

      // Connect source to workletNode
      this.sourceNode.connect(this.workletNode);

      // Connect worklet to silent gain connected to destination
      // The destination connection is ESSENTIAL so Chromium's audio graph pulls the worklet
      this.silentGain = this.audioContext.createGain();
      this.silentGain.gain.value = 0.0;
      this.workletNode.connect(this.silentGain);
      this.silentGain.connect(this.audioContext.destination);

      // Handle audio context suspension automatically
      this.audioContext.onstatechange = () => {
        if (this.audioContext && this.audioContext.state === 'suspended' && this.isCapturing) {
          console.log('[Voice] AudioContext suspended by OS, auto-resuming...');
          this.audioContext.resume().catch(() => {});
        }
      };

      this.isCapturing = true;
      this.startHealthWatchdog();
      return { sampleRate: nativeSampleRate };
    } catch (err: any) {
      console.error('[Voice] AudioCapture start failed:', err);
      if (callbacks.onError) callbacks.onError(err);
      await this.stop();
      throw err;
    }
  }

  private watchdogInterval: any = null;

  private startHealthWatchdog(): void {
    if (this.watchdogInterval) clearInterval(this.watchdogInterval);
    this.watchdogInterval = setInterval(() => {
      if (this.isCapturing && this.audioContext) {
        if (this.audioContext.state === 'suspended') {
          console.log('[Voice Watchdog] AudioContext was suspended, waking back up...');
          this.audioContext.resume().catch(() => {});
        }
      }
    }, 2000);
  }

  public async resumeIfSuspended(): Promise<void> {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      console.log('[Voice] Explicitly resuming suspended AudioContext...');
      await this.audioContext.resume().catch(() => {});
    }
  }

  public async stop(): Promise<void> {
    this.isCapturing = false;
    if (this.watchdogInterval) {
      clearInterval(this.watchdogInterval);
      this.watchdogInterval = null;
    }

    if (this.workletNode) {
      try {
        this.workletNode.port.onmessage = null;
        this.workletNode.disconnect();
      } catch (_) {}
      this.workletNode = null;
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
