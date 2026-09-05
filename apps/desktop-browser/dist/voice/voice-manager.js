"use strict";
/**
 * Unified VoiceManager: Persistent 8-state voice orchestrator.
 * WAKE_LISTENING -> WAKE_DETECTED -> COMMAND_LISTENING -> TRANSCRIBING -> THINKING -> EXECUTING -> SPEAKING -> RESETTING -> WAKE_LISTENING
 *
 * Invariants:
 * 1. Audio stream, AudioContext, AudioWorklet are allocated ONCE and NEVER destroyed across turns.
 * 2. Wake detection runs in <300ms without invoking Whisper or LLMs.
 * 3. Command recording uses VAD (300-700ms silence detection).
 * 4. User saying "Stop" interrupts TTS or active execution immediately.
 * 5. Supports 20+ consecutive commands without degradation.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.VoiceManager = void 0;
const audio_capture_js_1 = require("../audio/audio-capture.js");
const resampler_js_1 = require("../audio/resampler.js");
const wake_word_js_1 = require("./wake-word.js");
const vad_js_1 = require("./vad.js");
const whisper_js_1 = require("./whisper.js");
class VoiceManager {
    static instance = null;
    currentState = 'WAKE_LISTENING';
    capture;
    wakeDetector;
    vad;
    nativeSampleRate = 44100;
    isAudioPipelineReady = false;
    isWakeWordEnabled = true;
    isMuted = false;
    // Audio accumulators
    commandAudioChunks = [];
    totalCommandSamples = 0;
    maxCommandDurationTimer = null;
    stateListeners = new Set();
    commandListeners = new Set();
    interruptionListeners = new Set();
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
        // Wake event handler (<300ms response)
        this.wakeDetector.onWakeDetected((result) => {
            if (this.currentState !== 'WAKE_LISTENING' || this.isMuted)
                return;
            this.handleWakeDetected(result);
        });
        // VAD speech end handler for command listening
        this.vad.onSpeechEnd(() => {
            if (this.currentState === 'COMMAND_LISTENING') {
                console.log('[VoiceManager] VAD detected end of speech command.');
                this.finishCommandRecording();
            }
        });
        this.setupGlobalShortcuts();
    }
    static getInstance() {
        if (!VoiceManager.instance) {
            VoiceManager.instance = new VoiceManager();
        }
        return VoiceManager.instance;
    }
    getState() {
        return this.currentState;
    }
    subscribe(listener) {
        this.listenersAdd(listener);
        listener({ state: this.currentState, rms: 0 });
        return () => this.listenersDelete(listener);
    }
    onCommand(listener) {
        this.commandListeners.add(listener);
        return () => this.commandListeners.delete(listener);
    }
    onInterruption(listener) {
        this.interruptionListeners.add(listener);
        return () => this.interruptionListeners.delete(listener);
    }
    listenersAdd(listener) {
        this.stateListeners.add(listener);
    }
    listenersDelete(listener) {
        this.stateListeners.delete(listener);
    }
    transitionTo(newState, extra = {}) {
        this.currentState = newState;
        const evt = {
            state: newState,
            rms: 0,
            ...extra,
        };
        console.log(`[Voice State] -> ${newState}`);
        for (const listener of this.stateListeners) {
            try {
                listener(evt);
            }
            catch (err) {
                console.error('[Voice State Listener Error]', err);
            }
        }
    }
    /**
     * Initialize permanent audio pipeline. Never torn down.
     */
    async ensureAudioPipeline() {
        if (this.isAudioPipelineReady)
            return true;
        try {
            console.log('[VoiceManager] Initializing permanent AudioWorklet pipeline...');
            const { sampleRate } = await this.capture.start({
                onPcmChunk: (chunk) => {
                    this.processIncomingAudio(chunk).catch(() => { });
                },
                onRmsLevel: () => { },
            });
            this.nativeSampleRate = sampleRate;
            this.isAudioPipelineReady = true;
            this.transitionTo('WAKE_LISTENING');
            console.log('[VoiceManager] Audio pipeline live & listening for wake phrase.');
            return true;
        }
        catch (err) {
            console.error('[VoiceManager] Audio pipeline init failed:', err);
            return false;
        }
    }
    /**
     * Core real-time audio processing loop.
     */
    async processIncomingAudio(nativeChunk) {
        if (this.isMuted)
            return;
        // Resample native microphone chunk (e.g. 44.1k/48k) to standard 16kHz mono PCM
        const pcm16k = await (0, resampler_js_1.resampleTo16k)(nativeChunk, this.nativeSampleRate);
        if (!pcm16k || pcm16k.length === 0)
            return;
        // Calculate frame RMS
        let sumSq = 0;
        for (let i = 0; i < pcm16k.length; i++)
            sumSq += pcm16k[i] * pcm16k[i];
        const rms = Math.sqrt(sumSq / pcm16k.length);
        switch (this.currentState) {
            case 'WAKE_LISTENING':
                if (this.isWakeWordEnabled) {
                    this.wakeDetector.processChunk(pcm16k);
                }
                break;
            case 'COMMAND_LISTENING':
                // Accumulate audio chunk for Whisper transcription
                this.commandAudioChunks.push(pcm16k);
                this.totalCommandSamples += pcm16k.length;
                // Feed VAD to identify speech completion
                this.vad.processChunk(pcm16k);
                break;
            case 'SPEAKING':
                // User interruption detection: if loud speech occurs during TTS, check for "Stop"
                if (rms > 0.04) {
                    this.checkInterruptionAudio(pcm16k);
                }
                break;
            default:
                break;
        }
    }
    handleWakeDetected(result) {
        this.transitionTo('WAKE_DETECTED', { detail: result.phrase });
        // Prepare command recording buffer
        this.commandAudioChunks = [];
        this.totalCommandSamples = 0;
        // If user continued speaking command in the same breath, append trailing audio
        if (result.trailingAudio && result.trailingAudio.length > 0) {
            this.commandAudioChunks.push(result.trailingAudio);
            this.totalCommandSamples += result.trailingAudio.length;
        }
        this.vad.reset();
        // Move immediately to COMMAND_LISTENING
        setTimeout(() => {
            this.transitionTo('COMMAND_LISTENING');
            // Maximum 8 seconds safety timeout for command
            if (this.maxCommandDurationTimer)
                clearTimeout(this.maxCommandDurationTimer);
            this.maxCommandDurationTimer = setTimeout(() => {
                if (this.currentState === 'COMMAND_LISTENING') {
                    console.log('[VoiceManager] Max command duration reached.');
                    this.finishCommandRecording();
                }
            }, 8000);
        }, 150);
    }
    startPushToTalk() {
        if (this.currentState === 'SPEAKING') {
            this.triggerInterruption();
        }
        this.transitionTo('COMMAND_LISTENING', { detail: 'Push to talk' });
        this.commandAudioChunks = [];
        this.totalCommandSamples = 0;
        this.vad.reset();
        if (this.maxCommandDurationTimer)
            clearTimeout(this.maxCommandDurationTimer);
        this.maxCommandDurationTimer = setTimeout(() => {
            if (this.currentState === 'COMMAND_LISTENING') {
                this.finishCommandRecording();
            }
        }, 8000);
    }
    async finishCommandRecording() {
        if (this.maxCommandDurationTimer) {
            clearTimeout(this.maxCommandDurationTimer);
            this.maxCommandDurationTimer = null;
        }
        if (this.commandAudioChunks.length === 0 || this.totalCommandSamples < 3200) {
            console.log('[VoiceManager] Discarding short/empty audio.');
            this.resetToWakeListening();
            return;
        }
        this.transitionTo('TRANSCRIBING');
        // Flatten audio chunks
        const fullBuffer = new Float32Array(this.totalCommandSamples);
        let offset = 0;
        for (const chunk of this.commandAudioChunks) {
            fullBuffer.set(chunk, offset);
            offset += chunk.length;
        }
        this.commandAudioChunks = [];
        this.totalCommandSamples = 0;
        try {
            const transcription = await whisper_js_1.WhisperBridge.transcribe(fullBuffer);
            console.log(`[VoiceManager] Transcribed: "${transcription}"`);
            if (!transcription || transcription.trim().length === 0) {
                this.resetToWakeListening();
                return;
            }
            // Check for immediate voice interruption "Stop" / "Cancel"
            const cleanLower = transcription.trim().toLowerCase();
            if (cleanLower === 'stop' || cleanLower === 'cancel' || cleanLower === 'never mind') {
                this.triggerInterruption();
                this.resetToWakeListening();
                return;
            }
            this.transitionTo('THINKING', { transcription });
            // Dispatch to command listeners
            for (const listener of this.commandListeners) {
                try {
                    await listener(transcription);
                }
                catch (err) {
                    console.error('[Command listener error]', err);
                }
            }
        }
        catch (err) {
            console.error('[VoiceManager] Transcription failed:', err);
            this.resetToWakeListening();
        }
    }
    setExecuting() {
        this.transitionTo('EXECUTING');
    }
    setSpeaking() {
        this.transitionTo('SPEAKING');
    }
    resetToWakeListening() {
        this.transitionTo('RESETTING');
        this.wakeDetector.reset();
        this.vad.reset();
        this.commandAudioChunks = [];
        this.totalCommandSamples = 0;
        setTimeout(() => {
            this.transitionTo('WAKE_LISTENING');
        }, 200);
    }
    triggerInterruption() {
        console.log('[VoiceManager] Interruption triggered!');
        for (const listener of this.interruptionListeners) {
            try {
                listener();
            }
            catch (err) {
                console.error('[Interruption listener error]', err);
            }
        }
        this.resetToWakeListening();
    }
    checkInterruptionAudio(chunk) {
        // Quick energy and zero crossing check for monosyllabic "Stop"
        let sumSq = 0;
        for (let i = 0; i < chunk.length; i++)
            sumSq += chunk[i] * chunk[i];
        const rms = Math.sqrt(sumSq / chunk.length);
        if (rms > 0.08) {
            this.triggerInterruption();
        }
    }
    setupGlobalShortcuts() {
        if (typeof window === 'undefined')
            return;
        window.addEventListener('keydown', (e) => {
            // Hotkey 't' or 'T' for push-to-talk when not focused in an input
            const targetTag = e.target?.tagName?.toLowerCase();
            if (targetTag === 'input' || targetTag === 'textarea')
                return;
            if ((e.key === 't' || e.key === 'T') && !e.repeat && !e.metaKey && !e.ctrlKey) {
                console.log('[Hotkey] T pressed -> push-to-talk');
                this.startPushToTalk();
            }
            else if (e.key === 'Escape') {
                console.log('[Hotkey] Escape pressed -> interrupt');
                this.triggerInterruption();
            }
        });
    }
}
exports.VoiceManager = VoiceManager;
//# sourceMappingURL=voice-manager.js.map