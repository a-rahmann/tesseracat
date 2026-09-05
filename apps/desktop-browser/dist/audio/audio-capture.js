"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AudioCapture = void 0;
/**
 * AudioCapture: Manages microphone stream, AudioContext, and AudioWorkletNode
 * for non-blocking real-time PCM audio streaming.
 */
const audio_worklet_js_1 = require("./audio-worklet.js");
class AudioCapture {
    mediaStream = null;
    audioContext = null;
    workletNode = null;
    sourceNode = null;
    silentGain = null;
    isCapturing = false;
    async start(callbacks) {
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
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            this.audioContext = new AudioCtx();
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }
            const nativeSampleRate = this.audioContext.sampleRate;
            console.log(`[Voice] Microphone initialized | Native sample rate: ${nativeSampleRate}Hz`);
            // Load PCM Capture AudioWorklet
            await (0, audio_worklet_js_1.loadPcmWorklet)(this.audioContext);
            console.log('[Voice] Worklet started');
            this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
            this.workletNode = new AudioWorkletNode(this.audioContext, 'pcm-capture-processor');
            this.workletNode.port.onmessage = (event) => {
                if (!this.isCapturing)
                    return;
                const data = event.data;
                if (!data || data.length === 0)
                    return;
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
                    this.audioContext.resume().catch(() => { });
                }
            };
            this.isCapturing = true;
            this.startHealthWatchdog();
            return { sampleRate: nativeSampleRate };
        }
        catch (err) {
            console.error('[Voice] AudioCapture start failed:', err);
            if (callbacks.onError)
                callbacks.onError(err);
            await this.stop();
            throw err;
        }
    }
    watchdogInterval = null;
    startHealthWatchdog() {
        if (this.watchdogInterval)
            clearInterval(this.watchdogInterval);
        this.watchdogInterval = setInterval(() => {
            if (this.isCapturing && this.audioContext) {
                if (this.audioContext.state === 'suspended') {
                    console.log('[Voice Watchdog] AudioContext was suspended, waking back up...');
                    this.audioContext.resume().catch(() => { });
                }
            }
        }, 2000);
    }
    async resumeIfSuspended() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            console.log('[Voice] Explicitly resuming suspended AudioContext...');
            await this.audioContext.resume().catch(() => { });
        }
    }
    async stop() {
        this.isCapturing = false;
        if (this.watchdogInterval) {
            clearInterval(this.watchdogInterval);
            this.watchdogInterval = null;
        }
        if (this.workletNode) {
            try {
                this.workletNode.port.onmessage = null;
                this.workletNode.disconnect();
            }
            catch (_) { }
            this.workletNode = null;
        }
        if (this.silentGain) {
            try {
                this.silentGain.disconnect();
            }
            catch (_) { }
            this.silentGain = null;
        }
        if (this.sourceNode) {
            try {
                this.sourceNode.disconnect();
            }
            catch (_) { }
            this.sourceNode = null;
        }
        if (this.mediaStream) {
            try {
                this.mediaStream.getTracks().forEach((track) => track.stop());
            }
            catch (_) { }
            this.mediaStream = null;
        }
        if (this.audioContext) {
            try {
                await this.audioContext.close();
            }
            catch (_) { }
            this.audioContext = null;
        }
        console.log('[Voice] AudioCapture stopped and resources released');
    }
    isActive() {
        return this.isCapturing;
    }
}
exports.AudioCapture = AudioCapture;
//# sourceMappingURL=audio-capture.js.map