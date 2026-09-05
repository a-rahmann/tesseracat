"use strict";
/**
 * VoiceManager: Persistent, UI-independent voice orchestrator for Tesseract.
 * Powered by low-latency WakeWordDetector (<300ms, no Whisper for wake),
 * VoiceActivityDetector (300-700ms silence), sinc resampler, and permanent audio pipeline.
 *
 * CRITICAL INVARIANTS:
 * 1. Audio stream, AudioContext, AudioWorklet are NEVER destroyed across turns.
 * 2. Second command and 20+ consecutive commands work seamlessly.
 * 3. User saying "Stop" interrupts TTS or active execution immediately.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.VoiceManager = void 0;
const audio_capture_js_1 = require("../audio/audio-capture.js");
const resampler_js_1 = require("../audio/resampler.js");
const wake_word_js_1 = require("../voice/wake-word.js");
const vad_js_1 = require("../voice/vad.js");
const intent_engine_js_1 = require("./intent-engine.js");
const ai_executor_js_1 = require("./ai-executor.js");
class VoiceManager {
    static instance = null;
    state = { status: 'idle', rms: 0 };
    capture;
    wakeDetector;
    vad;
    capturedChunks = [];
    totalCapturedSamples = 0;
    nativeSampleRate = 44100;
    isCaptureActive = false;
    isWakeWordActive = true;
    isTTSActive = false;
    maxDurationTimer = null;
    stateListeners = new Set();
    transcriptionListeners = new Set();
    constructor() {
        this.capture = new audio_capture_js_1.AudioCapture();
        this.wakeDetector = new wake_word_js_1.WakeWordDetector({
            enabled: true,
            threshold: 0.65,
            debounceMs: 1200,
        });
        this.vad = new vad_js_1.VoiceActivityDetector({
            trailingSilenceMs: 450,
            minSpeechDurationMs: 150,
        });
        // Pure acoustic wake detection (<300ms, NO continuous Whisper)
        this.wakeDetector.onWakeDetected((result) => {
            if (this.state.status === 'recording' || this.state.status === 'transcribing' || this.isTTSActive) {
                return;
            }
            this.handleWakeDetected(result);
        });
        // VAD speech-end callback for command recording
        this.vad.onSpeechEnd(() => {
            if (this.state.status === 'recording') {
                console.log('[VoiceManager] VAD detected end-of-speech silence window.');
                this.stopRecordingAndTranscribe();
            }
        });
        this.setupGlobalKeyListeners();
    }
    static getInstance() {
        if (!VoiceManager.instance) {
            VoiceManager.instance = new VoiceManager();
        }
        return VoiceManager.instance;
    }
    getState() {
        return { ...this.state };
    }
    subscribe(listener) {
        this.stateListeners.add(listener);
        listener(this.getState());
        return () => this.stateListeners.delete(listener);
    }
    onTranscription(listener) {
        this.transcriptionListeners.add(listener);
        return () => this.transcriptionListeners.delete(listener);
    }
    setState(status, detail, error) {
        console.log(`[Voice] State: ${this.state.status} -> ${status}${detail ? ` (${detail})` : ''}`);
        this.state = {
            ...this.state,
            status,
            detail,
            error,
        };
        this.notifyStateListeners();
    }
    setRms(rms) {
        this.state.rms = rms;
        this.notifyStateListeners();
    }
    notifyStateListeners() {
        const snap = this.getState();
        for (const listener of this.stateListeners) {
            try {
                listener(snap);
            }
            catch (err) {
                console.error('[Voice] Error in state listener:', err);
            }
        }
    }
    isWakeWordEnabled() {
        return this.isWakeWordActive;
    }
    setTTSActive(active) {
        this.isTTSActive = active;
        if (active) {
            this.setState('tts');
        }
        else {
            if (this.state.status === 'tts') {
                this.resetVoiceSession();
            }
        }
    }
    setSpeakingTTS(active) {
        this.setTTSActive(active);
    }
    /**
     * Initialize permanent audio capture. Never torn down.
     */
    async ensureAudioCapture() {
        if (this.isCaptureActive)
            return true;
        try {
            console.log('[VoiceManager] Starting permanent AudioCapture pipeline...');
            const { sampleRate } = await this.capture.start({
                onPcmChunk: (chunk) => {
                    this.processAudioChunk(chunk).catch(() => { });
                },
                onRmsLevel: (rms) => {
                    this.setRms(rms);
                },
            });
            this.nativeSampleRate = sampleRate;
            this.isCaptureActive = true;
            this.wakeDetector.setEnabled(this.isWakeWordActive);
            this.setState('listening-for-wake', 'Microphone active');
            return true;
        }
        catch (err) {
            console.error('[VoiceManager] Audio capture start failed:', err);
            this.setState('error', undefined, err.message);
            return false;
        }
    }
    async startWakeListening() {
        this.isWakeWordActive = true;
        this.wakeDetector.setEnabled(true);
        await this.ensureAudioCapture();
        if (this.state.status !== 'recording' && this.state.status !== 'transcribing') {
            this.setState('listening-for-wake');
        }
    }
    stopWakeListening() {
        this.isWakeWordActive = false;
        this.wakeDetector.setEnabled(false);
        if (this.state.status === 'listening-for-wake') {
            this.setState('idle');
        }
    }
    startPushToTalk() {
        if (this.isTTSActive) {
            ai_executor_js_1.AIExecutionCoordinator.getInstance().stopSpeaking();
        }
        this.capturedChunks = [];
        this.totalCapturedSamples = 0;
        this.vad.reset();
        this.setState('recording', 'Push-to-talk');
        if (this.maxDurationTimer)
            clearTimeout(this.maxDurationTimer);
        this.maxDurationTimer = setTimeout(() => {
            if (this.state.status === 'recording') {
                this.stopRecordingAndTranscribe();
            }
        }, 7500);
    }
    handleWakeDetected(result) {
        console.log(`[VoiceManager] Instant Wake Triggered (${result.phrase}) in <300ms`);
        this.setState('wake-detected', result.phrase);
        this.capturedChunks = [];
        this.totalCapturedSamples = 0;
        // If user continued speaking command directly (e.g. "Hey Tesseract, open YouTube")
        if (result.trailingAudio && result.trailingAudio.length > 0) {
            this.capturedChunks.push(result.trailingAudio);
            this.totalCapturedSamples += result.trailingAudio.length;
        }
        this.vad.reset();
        // Transition immediately to command recording
        setTimeout(() => {
            if (this.state.status === 'wake-detected') {
                this.setState('recording', 'Listening for command');
                if (this.maxDurationTimer)
                    clearTimeout(this.maxDurationTimer);
                this.maxDurationTimer = setTimeout(() => {
                    if (this.state.status === 'recording') {
                        this.stopRecordingAndTranscribe();
                    }
                }, 7500);
            }
        }, 120);
    }
    async processAudioChunk(nativeChunk) {
        const pcm16k = await (0, resampler_js_1.resampleTo16k)(nativeChunk, this.nativeSampleRate);
        if (!pcm16k || pcm16k.length === 0)
            return;
        // Calculate RMS
        let sumSq = 0;
        for (let i = 0; i < pcm16k.length; i++)
            sumSq += pcm16k[i] * pcm16k[i];
        const rms = Math.sqrt(sumSq / pcm16k.length);
        this.setRms(rms);
        if (this.state.status === 'listening-for-wake' && this.isWakeWordActive) {
            this.wakeDetector.processChunk(pcm16k);
        }
        else if (this.state.status === 'recording') {
            this.capturedChunks.push(pcm16k);
            this.totalCapturedSamples += pcm16k.length;
            this.vad.processChunk(pcm16k);
        }
        else if (this.isTTSActive && rms > 0.08) {
            // Immediate interruption when speaking aloud
            ai_executor_js_1.AIExecutionCoordinator.getInstance().stopSpeaking();
            this.resetVoiceSession();
        }
    }
    async stopRecordingAndTranscribe() {
        if (this.maxDurationTimer) {
            clearTimeout(this.maxDurationTimer);
            this.maxDurationTimer = null;
        }
        if (this.state.status !== 'recording')
            return;
        if (this.capturedChunks.length === 0 || this.totalCapturedSamples < 3200) {
            console.log('[VoiceManager] Recording too brief, returning to wake listening.');
            this.resetVoiceSession();
            return;
        }
        this.setState('transcribing');
        const merged = new Float32Array(this.totalCapturedSamples);
        let offset = 0;
        for (const chunk of this.capturedChunks) {
            merged.set(chunk, offset);
            offset += chunk.length;
        }
        this.capturedChunks = [];
        this.totalCapturedSamples = 0;
        try {
            let rawText = '';
            if (typeof window.tesseractNative?.whisperTranscribe === 'function') {
                const resp = await window.tesseractNative.whisperTranscribe(merged);
                rawText = resp?.success && resp?.text ? resp.text.trim() : '';
            }
            console.log(`[VoiceManager] Transcribed text: "${rawText}"`);
            if (!rawText) {
                this.resetVoiceSession();
                return;
            }
            // Check for voice interruption "Stop" / "Cancel"
            const lower = rawText.toLowerCase();
            if (lower === 'stop' || lower === 'cancel' || lower === 'never mind') {
                ai_executor_js_1.AIExecutionCoordinator.getInstance().stopSpeaking();
                this.resetVoiceSession();
                return;
            }
            const intent = intent_engine_js_1.IntentEngine.getInstance().classify(rawText);
            // Notify listeners
            for (const listener of this.transcriptionListeners) {
                try {
                    listener(rawText, intent);
                }
                catch (err) {
                    console.error('[VoiceManager] Error in transcription listener:', err);
                }
            }
            // Automatically execute through AI coordinator
            ai_executor_js_1.AIExecutionCoordinator.getInstance().executeIntent(intent).catch(() => { });
        }
        catch (err) {
            console.error('[VoiceManager] Transcription error:', err);
            this.resetVoiceSession();
        }
    }
    resetVoiceSession() {
        if (this.maxDurationTimer) {
            clearTimeout(this.maxDurationTimer);
            this.maxDurationTimer = null;
        }
        this.capturedChunks = [];
        this.totalCapturedSamples = 0;
        this.wakeDetector.reset();
        this.vad.reset();
        // Smooth return to wake listening without tearing down microphone
        if (this.isWakeWordActive && this.isCaptureActive) {
            this.setState('listening-for-wake');
            this.wakeDetector.setEnabled(true);
        }
        else {
            this.setState('idle');
        }
    }
    setupGlobalKeyListeners() {
        if (typeof window === 'undefined')
            return;
        window.addEventListener('keydown', (e) => {
            const tag = e.target?.tagName?.toLowerCase();
            if (tag === 'input' || tag === 'textarea')
                return;
            if ((e.key === 't' || e.key === 'T') && !e.repeat && !e.metaKey && !e.ctrlKey) {
                this.startPushToTalk();
            }
            else if (e.key === 'Escape') {
                ai_executor_js_1.AIExecutionCoordinator.getInstance().stopSpeaking();
                this.resetVoiceSession();
            }
        });
    }
}
exports.VoiceManager = VoiceManager;
//# sourceMappingURL=voice-manager.js.map