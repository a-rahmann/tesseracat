"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VoiceSession = void 0;
/**
 * VoiceSession: Central orchestrator managing the voice state machine,
 * continuous AudioCapture worklet, anti-aliased resampling, silence auto-stop, and Whisper IPC.
 */
const audio_capture_js_1 = require("./audio-capture.js");
const resampler_js_1 = require("./resampler.js");
const wake_word_js_1 = require("./wake-word.js");
class VoiceSession {
    state = 'idle';
    capture;
    wakeDetector;
    capturedChunks = [];
    nativeSampleRate = 44100;
    silenceTimer = null;
    initialSilenceTimer = null;
    maxDurationTimer = null;
    hasSpoken = false;
    baselineRms = 0.01;
    isCaptureActive = false;
    isWakeWordActive = false;
    options;
    constructor(options = {}) {
        this.options = options;
        this.capture = new audio_capture_js_1.AudioCapture();
        this.wakeDetector = new wake_word_js_1.WakeWordDetector({ enabled: false });
        this.wakeDetector.onWakeDetected((score) => {
            this.handleWakeDetected(score);
        });
    }
    getState() {
        return this.state;
    }
    setState(newState, detail) {
        console.log(`[Voice State] Transition: ${this.state} -> ${newState}${detail ? ` (${detail})` : ''}`);
        this.state = newState;
        if (this.options.onStateChange) {
            this.options.onStateChange(newState, detail);
        }
        if (newState === 'idle' && this.isWakeWordActive) {
            setTimeout(() => {
                if (this.state === 'idle' && this.isWakeWordActive) {
                    this.startWakeListening();
                }
            }, 500);
        }
    }
    setTranscriptionHandler(fn) {
        this.options.onTranscriptionResult = fn;
    }
    setWhisperCaller(fn) {
        this.options.whisperTranscribe = fn;
    }
    enableWakeWord(enabled) {
        this.isWakeWordActive = enabled;
        this.wakeDetector.setEnabled(enabled);
        if (enabled && this.state === 'idle') {
            this.startWakeListening();
        }
        else if (!enabled && this.state === 'listening-for-wake') {
            this.stopCaptureAndReset();
        }
    }
    isWakeWordRunning() {
        return this.isWakeWordActive;
    }
    /**
     * Ensure low-level AudioCapture worklet is running without restarting.
     */
    async ensureCaptureRunning() {
        if (this.isCaptureActive)
            return;
        try {
            const { sampleRate } = await this.capture.start({
                onPcmChunk: async (chunk) => {
                    if (this.state === 'listening-for-wake') {
                        const pcm16k = await (0, resampler_js_1.resampleTo16k)(chunk, this.nativeSampleRate);
                        this.wakeDetector.processChunk(pcm16k);
                    }
                    else if (this.state === 'recording') {
                        const copy = new Float32Array(chunk.length);
                        copy.set(chunk);
                        this.capturedChunks.push(copy);
                        // Cap buffer to max ~7 seconds
                        const maxChunks = Math.ceil((this.nativeSampleRate * 7) / chunk.length);
                        if (this.capturedChunks.length > maxChunks) {
                            this.capturedChunks.shift();
                        }
                    }
                },
                onRmsLevel: (rms) => {
                    if (this.options.onRmsUpdate) {
                        this.options.onRmsUpdate(rms);
                    }
                    if (this.state === 'recording') {
                        if (this.capturedChunks.length < 6) {
                            this.baselineRms = Math.max(0.005, (this.baselineRms + rms) / 2);
                        }
                        const speechThreshold = Math.max(0.016, this.baselineRms * 1.5);
                        const silenceFloor = Math.max(0.008, this.baselineRms * 1.15);
                        if (rms > speechThreshold) {
                            this.hasSpoken = true;
                            if (this.initialSilenceTimer) {
                                clearTimeout(this.initialSilenceTimer);
                                this.initialSilenceTimer = null;
                            }
                            if (this.silenceTimer) {
                                clearTimeout(this.silenceTimer);
                                this.silenceTimer = null;
                            }
                        }
                        else if (this.hasSpoken && rms < silenceFloor) {
                            if (!this.silenceTimer) {
                                this.silenceTimer = setTimeout(() => {
                                    if (this.state === 'recording' && this.hasSpoken) {
                                        console.log('[Voice] Silence detected after speech, stopping recording automatically');
                                        this.stopRecordingAndTranscribe();
                                    }
                                }, 1000);
                            }
                        }
                    }
                },
                onError: (err) => {
                    console.error('[Voice] Capture error:', err);
                    this.isCaptureActive = false;
                    this.setState('error', err.message);
                },
            });
            this.nativeSampleRate = sampleRate;
            this.isCaptureActive = true;
        }
        catch (err) {
            this.isCaptureActive = false;
            this.setState('error', err.message);
            throw err;
        }
    }
    /**
     * Start recording command speech (either via Wake Word or Push-to-Talk).
     */
    async startPushToTalk() {
        if (this.state === 'recording') {
            console.log('[Voice] Already recording');
            return;
        }
        this.clearTimers();
        this.capturedChunks = [];
        this.hasSpoken = false;
        this.setState('recording', 'Push-to-talk started');
        try {
            await this.ensureCaptureRunning();
            // If user doesn't start speaking within 2.8 seconds, stop waiting and return to idle
            this.initialSilenceTimer = setTimeout(() => {
                if (this.state === 'recording' && !this.hasSpoken) {
                    console.log('[Voice] No speech detected within 2.8s after trigger, resetting');
                    this.setState('idle', 'No speech detected after wake word.');
                }
            }, 2800);
            // Max duration safety timeout of 7 seconds
            this.maxDurationTimer = setTimeout(() => {
                if (this.state === 'recording') {
                    console.log('[Voice] Max duration reached, stopping recording');
                    this.stopRecordingAndTranscribe();
                }
            }, 7000);
        }
        catch (err) {
            this.setState('error', err.message);
        }
    }
    /**
     * Stop recording and send resampled PCM to Whisper.
     */
    async stopRecordingAndTranscribe() {
        if (this.state !== 'recording') {
            return;
        }
        this.clearTimers();
        this.setState('transcribing', 'Processing audio buffer');
        const rawChunks = this.capturedChunks.slice();
        this.capturedChunks = [];
        const totalSamples = rawChunks.reduce((acc, c) => acc + c.length, 0);
        const duration = totalSamples / this.nativeSampleRate;
        console.log(`[Voice] Captured frames: ${totalSamples} (${duration.toFixed(2)}s at ${this.nativeSampleRate}Hz)`);
        // Minimum check: < 0.25s is too short to contain speech
        if (totalSamples < this.nativeSampleRate * 0.25) {
            console.log('[Voice] Audio duration too short (< 0.25s), resetting to idle');
            this.setState('idle', 'Audio too short (< 0.25s). Speak command clearly.');
            return;
        }
        // Contiguous buffer
        const merged = new Float32Array(totalSamples);
        let offset = 0;
        for (const chunk of rawChunks) {
            merged.set(chunk, offset);
            offset += chunk.length;
        }
        // Sinc anti-aliasing resampling to 16kHz
        console.log(`[Voice] Resampling ${totalSamples} samples from ${this.nativeSampleRate}Hz to 16000Hz...`);
        const pcm16k = await (0, resampler_js_1.resampleTo16k)(merged, this.nativeSampleRate);
        console.log(`[Voice] Resampled frames: ${pcm16k.length} (~${(pcm16k.length / 16000).toFixed(2)}s at 16kHz)`);
        // Invoke Whisper
        try {
            let resultText = '';
            let response = null;
            if (this.options.whisperTranscribe) {
                response = await this.options.whisperTranscribe(pcm16k);
            }
            else if (typeof window.tesseractNative?.whisperTranscribe === 'function') {
                response = await window.tesseractNative.whisperTranscribe(pcm16k);
            }
            console.log('[Voice] Whisper response received:', response);
            if (response && response.success && response.text) {
                resultText = response.text.trim();
            }
            if (resultText && resultText.length > 0) {
                this.setState('processing', `Recognized: "${resultText}"`);
                if (this.options.onTranscriptionResult) {
                    this.options.onTranscriptionResult(resultText);
                }
            }
            else {
                const errorMsg = response && !response.success ? response.error : 'No words detected. Try speaking closer to mic.';
                console.log('[Voice] Transcription empty or failed:', errorMsg);
                this.setState('idle', errorMsg);
            }
        }
        catch (err) {
            console.error('[Voice] Transcription error:', err);
            this.setState('error', err.message);
        }
    }
    handleWakeDetected(score) {
        if (this.state === 'recording' || this.state === 'transcribing') {
            return; // Already busy
        }
        console.log(`[Voice] Wake word detected with score ${score.toFixed(2)}, transitioning to command recording`);
        this.setState('wake-detected', `Score: ${score.toFixed(2)}`);
        this.startPushToTalk();
    }
    async startWakeListening() {
        this.setState('listening-for-wake');
        try {
            await this.ensureCaptureRunning();
        }
        catch (err) {
            this.setState('error', err.message);
        }
    }
    async stopCaptureAndReset() {
        this.clearTimers();
        this.isCaptureActive = false;
        await this.capture.stop();
        this.setState('idle');
    }
    clearTimers() {
        if (this.initialSilenceTimer) {
            clearTimeout(this.initialSilenceTimer);
            this.initialSilenceTimer = null;
        }
        if (this.silenceTimer) {
            clearTimeout(this.silenceTimer);
            this.silenceTimer = null;
        }
        if (this.maxDurationTimer) {
            clearTimeout(this.maxDurationTimer);
            this.maxDurationTimer = null;
        }
    }
}
exports.VoiceSession = VoiceSession;
//# sourceMappingURL=voice-session.js.map