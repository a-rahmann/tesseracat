"use strict";
/**
 * VoiceManager: Persistent, UI-independent voice orchestrator for Tesseract.
 * Owns the single persistent microphone stream, AudioContext, AudioWorklet,
 * WakeWordDetector, sinc resampler, Whisper IPC bridge, IntentEngine, and VoiceState machine.
 *
 * CRITICAL INVARIANT:
 * Opening, closing, or re-rendering UI elements (sidebar, drawer, modal, toast)
 * CANNOT and MUST NOT touch, reset, or destroy the VoiceManager or microphone stream.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.VoiceManager = void 0;
const audio_capture_js_1 = require("../audio/audio-capture.js");
const resampler_js_1 = require("../audio/resampler.js");
const wake_word_js_1 = require("../audio/wake-word.js");
const intent_engine_js_1 = require("./intent-engine.js");
const ai_executor_js_1 = require("./ai-executor.js");
class VoiceManager {
    static instance = null;
    state = { status: 'idle', rms: 0 };
    capture;
    wakeDetector;
    capturedChunks = [];
    nativeSampleRate = 44100;
    isCaptureActive = false;
    isWakeWordActive = true;
    isTTSActive = false;
    silenceTimer = null;
    initialSilenceTimer = null;
    maxDurationTimer = null;
    hasSpoken = false;
    baselineRms = 0.01;
    recordingTrigger = 'wake';
    isVerifyingWake = false;
    stateListeners = new Set();
    transcriptionListeners = new Set();
    constructor() {
        this.capture = new audio_capture_js_1.AudioCapture();
        this.wakeDetector = new wake_word_js_1.WakeWordDetector({
            enabled: false,
            threshold: 0.42,
            debounceMs: 2000,
        });
        this.wakeDetector.onWakeDetected(async (score, speechBuffer) => {
            if (this.isVerifyingWake || this.state.status === 'recording' || this.state.status === 'transcribing' || this.isTTSActive) {
                return;
            }
            this.isVerifyingWake = true;
            try {
                if (typeof window.tesseractNative?.whisperTranscribe === 'function') {
                    const resp = await window.tesseractNative.whisperTranscribe(speechBuffer);
                    const raw = resp?.success && resp?.text ? resp.text.trim() : '';
                    const durSec = (speechBuffer.length / 16000).toFixed(2);
                    console.log(`[Wake Verify] Candidate utterance (${durSec}s) | Whisper heard: "${raw}"`);
                    const { hasWakeWord, cleanText } = intent_engine_js_1.IntentEngine.getInstance().stripWakeAndPreamble(raw);
                    if (hasWakeWord) {
                        console.log(`[Wake Verify] ✅ CONFIRMED WAKE WORD: "${raw}"${cleanText ? ` (Command: "${cleanText}")` : ''}`);
                        this.handleWakeDetected(score, raw);
                    }
                    else {
                        console.log(`[Wake Verify] ❌ REJECTED non-wake speech: "${raw}"`);
                    }
                }
                else {
                    this.handleWakeDetected(score);
                }
            }
            catch (err) {
                console.error('[Wake Verify] Error during phonetic verification:', err);
            }
            finally {
                this.isVerifyingWake = false;
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
        console.log(`[Voice] State: ${this.state.status} -> ${status}${detail ? ` (${detail})` : ''}${error ? ` [ERROR: ${error}]` : ''}`);
        this.state = {
            ...this.state,
            status,
            detail,
            error,
        };
        this.notifyState();
    }
    setRms(rms) {
        this.state.rms = rms;
        this.notifyState();
    }
    notifyState() {
        const snap = this.getState();
        for (const listener of this.stateListeners) {
            try {
                listener(snap);
            }
            catch (err) {
                console.error('[Voice] Listener error:', err);
            }
        }
    }
    /**
     * Start or ensure the persistent AudioCapture worklet is streaming.
     */
    async ensureAudioCapture() {
        if (this.isCaptureActive)
            return;
        try {
            console.log('[Voice] Initializing persistent microphone stream...');
            const { sampleRate } = await this.capture.start({
                onPcmChunk: (chunk) => {
                    if (this.state.status === 'listening-for-wake' && !this.isTTSActive) {
                        if (this.nativeSampleRate === 16000) {
                            this.wakeDetector.processChunk(chunk);
                        }
                        else {
                            const ratio = this.nativeSampleRate / 16000;
                            const len = Math.floor(chunk.length / ratio);
                            const pcm16 = new Float32Array(len);
                            for (let i = 0; i < len; i++) {
                                pcm16[i] = chunk[Math.floor(i * ratio)];
                            }
                            this.wakeDetector.processChunk(pcm16);
                        }
                    }
                    else if (this.state.status === 'recording' || this.state.status === 'wake-detected') {
                        const copy = new Float32Array(chunk.length);
                        copy.set(chunk);
                        this.capturedChunks.push(copy);
                        // Buffer cap: max 8 seconds
                        const maxChunks = Math.ceil((this.nativeSampleRate * 8) / chunk.length);
                        if (this.capturedChunks.length > maxChunks) {
                            this.capturedChunks.shift();
                        }
                    }
                },
                onRmsLevel: (rms) => {
                    this.setRms(rms);
                    // Continuously adapt ambient background noise floor while listening
                    if (this.state.status === 'listening-for-wake' || this.state.status === 'idle') {
                        this.baselineRms = this.baselineRms * 0.95 + rms * 0.05;
                    }
                    if (this.state.status === 'recording' || this.state.status === 'wake-detected') {
                        // Speech threshold requires distinct vocal energy above ambient noise
                        const speechThreshold = Math.max(0.014, this.baselineRms * 1.8);
                        const silenceFloor = Math.max(0.007, this.baselineRms * 1.25);
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
                                // Swift trailing silence detection: 550ms for wake commands, 800ms for PTT
                                const timeoutMs = this.recordingTrigger === 'wake' ? 550 : 800;
                                this.silenceTimer = setTimeout(() => {
                                    if ((this.state.status === 'recording' || this.state.status === 'wake-detected') && this.hasSpoken) {
                                        console.log(`[Voice] recording stopped (Reason: trailing_silence, Trigger: ${this.recordingTrigger})`);
                                        this.stopRecordingAndTranscribe();
                                    }
                                }, timeoutMs);
                            }
                        }
                    }
                },
                onError: (err) => {
                    console.error('[Voice] Persistent audio capture error:', err);
                    this.isCaptureActive = false;
                    this.setState('error', undefined, err.message);
                },
            });
            this.nativeSampleRate = sampleRate;
            this.isCaptureActive = true;
            console.log(`[Voice] AudioCapture active at native rate ${this.nativeSampleRate}Hz`);
            if (this.isWakeWordActive && this.state.status === 'idle') {
                this.startWakeListening();
            }
        }
        catch (err) {
            this.isCaptureActive = false;
            this.setState('error', undefined, err.message);
            throw err;
        }
    }
    enableWakeWord(enabled) {
        this.isWakeWordActive = enabled;
        this.wakeDetector.setEnabled(enabled);
        console.log(`[Voice] Wake word listening: ${enabled ? 'ENABLED' : 'DISABLED'}`);
        if (enabled && this.state.status === 'idle') {
            this.startWakeListening();
        }
        else if (!enabled && this.state.status === 'listening-for-wake') {
            this.setState('idle', 'Wake word paused');
        }
    }
    isWakeWordEnabled() {
        return this.isWakeWordActive;
    }
    async startWakeListening() {
        if (this.state.status === 'recording' || this.isTTSActive) {
            return;
        }
        console.log('[Voice] returning to wake listening');
        this.setState('listening-for-wake', 'Listening for "Hey Tesseract"');
        this.wakeDetector.setEnabled(true);
        try {
            await this.ensureAudioCapture();
        }
        catch (err) {
            this.setState('error', undefined, err.message);
        }
    }
    async startPushToTalk() {
        if (this.state.status === 'recording')
            return;
        this.recordingTrigger = 'ptt';
        this.clearTimers();
        this.capturedChunks = [];
        this.hasSpoken = false;
        console.log('[Voice] recording started (Trigger: ptt)');
        this.setState('recording', 'Recording command');
        try {
            await this.ensureAudioCapture();
            // Initial silence timer: if user doesn't speak within 3.5s, return to idle
            this.initialSilenceTimer = setTimeout(() => {
                if (this.state.status === 'recording' && !this.hasSpoken) {
                    console.log('[Voice] recording stopped (Reason: initial_silence)');
                    this.resetVoiceSession();
                }
            }, 3500);
            // Hard max safety timeout of 8.0s
            this.maxDurationTimer = setTimeout(() => {
                if (this.state.status === 'recording') {
                    console.log('[Voice] recording stopped (Reason: max_duration)');
                    this.stopRecordingAndTranscribe();
                }
            }, 8000);
        }
        catch (err) {
            this.setState('error', undefined, err.message);
        }
    }
    async stopRecordingAndTranscribe() {
        if (this.state.status !== 'recording' && this.state.status !== 'wake-detected')
            return;
        this.clearTimers();
        this.setState('transcribing', 'Processing locally with Whisper');
        const rawChunks = this.capturedChunks.slice();
        this.capturedChunks = [];
        const totalSamples = rawChunks.reduce((acc, c) => acc + c.length, 0);
        const durationSec = totalSamples / this.nativeSampleRate;
        if (totalSamples < this.nativeSampleRate * 0.25) {
            console.log(`[Voice] audio samples too short (${totalSamples}), discarding`);
            this.resetVoiceSession();
            return;
        }
        // Merge into single Float32 buffer
        const merged = new Float32Array(totalSamples);
        let offset = 0;
        for (const chunk of rawChunks) {
            merged.set(chunk, offset);
            offset += chunk.length;
        }
        // Anti-aliased sinc resampling to 16kHz
        const pcm16k = await (0, resampler_js_1.resampleTo16k)(merged, this.nativeSampleRate);
        console.log(`[Voice] audio samples: ${pcm16k.length} (~${(pcm16k.length / 16000).toFixed(2)}s at 16kHz)`);
        try {
            console.log(`[Whisper] started (${pcm16k.length} samples)`);
            const timeoutMs = Math.max(12000, Math.ceil(durationSec * 2500));
            const timeoutPromise = new Promise((resolve) => {
                setTimeout(() => resolve({ success: false, error: 'Transcription timed out' }), timeoutMs);
            });
            let response = null;
            if (typeof window.tesseractNative?.whisperTranscribe === 'function') {
                response = await Promise.race([
                    window.tesseractNative.whisperTranscribe(pcm16k),
                    timeoutPromise
                ]);
            }
            const rawText = response?.success && response?.text ? response.text.trim() : '';
            console.log(`[Whisper] raw result: "${rawText}"`);
            if (rawText && rawText.length > 0) {
                console.log(`[Whisper] cleaned result: "${rawText}"`);
                this.setState('processing', `Heard: "${rawText}"`);
                // Classify intent directly via IntentEngine
                const intent = intent_engine_js_1.IntentEngine.getInstance().classify(rawText);
                // Notify UI observers
                for (const listener of this.transcriptionListeners) {
                    try {
                        listener(rawText, intent);
                    }
                    catch (err) {
                        console.error('[Voice] Transcription listener error:', err);
                    }
                }
                // Direct pipeline execution: Hand off to AIExecutionCoordinator
                ai_executor_js_1.AIExecutionCoordinator.getInstance().executeIntent(intent).catch((err) => {
                    console.error('[AI] Execution error caught:', err);
                    this.resetVoiceSession();
                });
            }
            else {
                const errNotice = response && !response.success ? response.error : 'No speech recognized';
                console.log(`[Whisper] output empty: ${errNotice}`);
                this.resetVoiceSession();
            }
        }
        catch (err) {
            console.error('[Whisper] Transcribe failure:', err);
            this.resetVoiceSession();
        }
    }
    handleWakeDetected(score, verifiedUtterance) {
        if (this.state.status === 'recording' || this.state.status === 'transcribing' || this.isTTSActive) {
            return;
        }
        console.log(`[Voice] wake detected (Score: ${score.toFixed(2)})${verifiedUtterance ? ` [Utterance: "${verifiedUtterance}"]` : ''}`);
        // If the user already spoke their command in the same breath as "Hey Tesseract":
        if (verifiedUtterance) {
            const { cleanText } = intent_engine_js_1.IntentEngine.getInstance().stripWakeAndPreamble(verifiedUtterance);
            if (cleanText && cleanText.length >= 3) {
                console.log(`[Voice] Single-breath command recognized: "${cleanText}"`);
                this.recordingTrigger = 'wake';
                this.clearTimers();
                this.setState('wake-detected', `Score: ${score.toFixed(2)}`);
                setTimeout(() => {
                    this.setState('processing', `Heard: "${cleanText}"`);
                    const intent = intent_engine_js_1.IntentEngine.getInstance().classify(cleanText);
                    for (const listener of this.transcriptionListeners) {
                        try {
                            listener(cleanText, intent);
                        }
                        catch (e) { }
                    }
                    ai_executor_js_1.AIExecutionCoordinator.getInstance().executeIntent(intent).catch((err) => {
                        console.error('[AI] Execution error caught:', err);
                        this.resetVoiceSession();
                    });
                }, 100);
                return;
            }
        }
        this.recordingTrigger = 'wake';
        this.clearTimers();
        this.capturedChunks = [];
        this.hasSpoken = false;
        this.setState('wake-detected', `Score: ${score.toFixed(2)}`);
        // Immediate 180ms transition for chime & visual recognition while buffering command speech
        setTimeout(() => {
            if (this.state.status === 'wake-detected') {
                console.log('[Voice] recording started (Trigger: wake)');
                this.setState('recording', 'Recording command');
                // Initial silence timer: if user doesn't speak within 3.5s after wake, reset
                this.initialSilenceTimer = setTimeout(() => {
                    if ((this.state.status === 'recording' || this.state.status === 'wake-detected') && !this.hasSpoken) {
                        console.log('[Voice] recording stopped (Reason: initial_silence)');
                        this.resetVoiceSession();
                    }
                }, 3500);
                // Hard max safety timeout of 8.0s
                this.maxDurationTimer = setTimeout(() => {
                    if (this.state.status === 'recording' || this.state.status === 'wake-detected') {
                        console.log('[Voice] recording stopped (Reason: max_duration)');
                        this.stopRecordingAndTranscribe();
                    }
                }, 8000);
            }
        }, 180);
    }
    /**
     * Cleanly reset voice session after every command or abort.
     * Clears temporary recording buffers and resets the wake detector while preserving
     * the persistent microphone stream and AudioWorklet.
     */
    resetVoiceSession() {
        console.log('[Voice] session completed');
        this.clearTimers();
        this.capturedChunks = [];
        this.hasSpoken = false;
        this.wakeDetector.reset();
        if (this.isWakeWordActive && !this.isTTSActive) {
            this.startWakeListening();
        }
        else {
            this.setState('idle', 'Session reset');
        }
    }
    /**
     * Notify VoiceManager when TTS speaks aloud to prevent self-triggering.
     */
    setSpeakingTTS(isSpeaking) {
        this.isTTSActive = isSpeaking;
        if (isSpeaking) {
            console.log('[Voice] TTS active: suppressing wake detector');
            this.wakeDetector.setEnabled(false);
            this.setState('tts', 'Speaking aloud');
        }
        else {
            console.log('[Voice] TTS finished: resuming wake detector');
            this.resetVoiceSession();
        }
    }
    /**
     * Setup global push-to-talk listener on window (independent of UI focus/panels).
     */
    setupGlobalKeyListeners() {
        if (typeof window === 'undefined')
            return;
        let isKeyDown = false;
        let pttStartTime = 0;
        window.addEventListener('keydown', (e) => {
            if (e.repeat)
                return;
            if (e.key === 't' || e.key === 'T') {
                const activeEl = document.activeElement;
                const isTyping = activeEl && (activeEl.tagName === 'INPUT' ||
                    activeEl.tagName === 'TEXTAREA' ||
                    activeEl.isContentEditable);
                if (isTyping)
                    return; // User is legitimately typing 't' in a text box
                isKeyDown = true;
                pttStartTime = Date.now();
                this.startPushToTalk();
            }
        }, true);
        window.addEventListener('keyup', (e) => {
            if ((e.key === 't' || e.key === 'T') && isKeyDown) {
                isKeyDown = false;
                const duration = Date.now() - pttStartTime;
                // If user tapped 'T' (< 450ms), let recording stay alive so they can speak!
                // Silence detection will automatically stop after they finish speaking.
                if (duration < 450) {
                    console.log('[Voice] PTT quick tap detected: keeping recording open for speech');
                    return;
                }
                if (this.state.status === 'recording' || this.state.status === 'wake-detected') {
                    console.log('[Voice] recording stopped (Reason: ptt_release)');
                    this.stopRecordingAndTranscribe();
                }
            }
        }, true);
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
exports.VoiceManager = VoiceManager;
//# sourceMappingURL=voice-manager.js.map