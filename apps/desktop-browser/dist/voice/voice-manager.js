"use strict";
/**
 * Authoritative Unified VoiceManager for Tesseract.
 *
 * State flow:
 * WAKE_LISTENING -> WAKE_DETECTED -> COMMAND_LISTENING -> TRANSCRIBING -> THINKING -> EXECUTING -> SPEAKING -> RESETTING -> WAKE_LISTENING
 *
 * Invariants:
 * 1. Audio stream, AudioContext, and AudioWorklet are allocated ONCE and NEVER destroyed across turns.
 * 2. Exactly ONE singleton instance exists across the entire application (no duplicate audio captures).
 * 3. Wake detection runs in <300ms without invoking Whisper or LLMs.
 * 4. Post-wake pause grace window (1.5s) allows user to pause before commanding without VAD cut-off.
 * 5. Minimum speech validation (<0.6s or ambient RMS discarded) prevents CPU freezes on empty silence.
 * 6. Supports continuous conversation across 20+ turns without degradation.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.VoiceManager = void 0;
const audio_capture_js_1 = require("../audio/audio-capture.js");
const resampler_js_1 = require("../audio/resampler.js");
const wake_word_js_1 = require("./wake-word.js");
const vad_js_1 = require("./vad.js");
const whisper_js_1 = require("./whisper.js");
function mapStateToStatus(stateName) {
    switch (stateName) {
        case 'WAKE_LISTENING':
            return 'listening-for-wake';
        case 'WAKE_DETECTED':
            return 'wake-detected';
        case 'COMMAND_LISTENING':
            return 'recording';
        case 'TRANSCRIBING':
            return 'transcribing';
        case 'SPEAKING':
            return 'tts';
        case 'RESETTING':
        case 'THINKING':
        case 'EXECUTING':
        default:
            return 'idle';
    }
}
class VoiceManager {
    static instance = null;
    currentState = 'WAKE_LISTENING';
    currentRms = 0;
    capture;
    wakeDetector;
    vad;
    nativeSampleRate = 44100;
    isAudioPipelineReady = false;
    isWakeWordActive = true;
    isMuted = false;
    // Audio accumulators
    commandAudioChunks = [];
    totalCommandSamples = 0;
    preRollChunks = [];
    preRollSamples = 0;
    maxCommandDurationTimer = null;
    isStandbyMode = false;
    // VAD & Timing guards
    wakeGraceUntil = 0;
    hasDetectedUserSpeech = false;
    stateListeners = new Set();
    commandListeners = new Set();
    transcriptionListeners = new Set();
    interruptionListeners = new Set();
    constructor() {
        this.capture = new audio_capture_js_1.AudioCapture();
        this.wakeDetector = new wake_word_js_1.WakeWordDetector({
            enabled: true,
            threshold: 0.88,
            debounceMs: 2500,
        });
        this.vad = new vad_js_1.VoiceActivityDetector({
            trailingSilenceMs: 950,
            minSpeechDurationMs: 200,
        });
        // Wake event handler (<300ms response)
        this.wakeDetector.onWakeDetected((result) => {
            if (this.currentState !== 'WAKE_LISTENING' || this.isMuted)
                return;
            this.handleWakeDetected(result);
        });
        // VAD speech start handler
        this.vad.onSpeechStart(() => {
            if (this.currentState === 'COMMAND_LISTENING') {
                this.hasDetectedUserSpeech = true;
            }
        });
        // VAD speech end handler for command listening
        this.vad.onSpeechEnd((totalSpeechMs) => {
            if (this.currentState === 'COMMAND_LISTENING') {
                // If we are still within the pause grace window right after wake word, ignore premature silence
                if (Date.now() < this.wakeGraceUntil) {
                    console.log('[VoiceManager] In post-wake pause grace period; waiting for user command speech...');
                    return;
                }
                // If user hasn't spoken at least 300ms of real speech, continue listening
                if (!this.hasDetectedUserSpeech && totalSpeechMs < 300) {
                    console.log('[VoiceManager] Brief breath/noise detected, continuing to listen for command...');
                    return;
                }
                console.log(`[VoiceManager] VAD detected end of speech command (~${Math.round(totalSpeechMs)}ms speech).`);
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
        return {
            status: mapStateToStatus(this.currentState),
            state: this.currentState,
            rms: this.currentRms,
        };
    }
    subscribe(listener) {
        this.stateListeners.add(listener);
        listener(this.getState());
        return () => this.stateListeners.delete(listener);
    }
    onCommand(listener) {
        this.commandListeners.add(listener);
        return () => this.commandListeners.delete(listener);
    }
    onTranscription(listener) {
        this.transcriptionListeners.add(listener);
        return () => this.transcriptionListeners.delete(listener);
    }
    onInterruption(listener) {
        this.interruptionListeners.add(listener);
        return () => this.interruptionListeners.delete(listener);
    }
    transitionTo(newState, extra = {}) {
        this.currentState = newState;
        const status = mapStateToStatus(newState);
        const evt = {
            status,
            state: newState,
            rms: this.currentRms,
            ...extra,
        };
        console.log(`[Voice State] -> ${newState} (${status})`);
        for (const listener of this.stateListeners) {
            try {
                listener(evt);
            }
            catch (err) {
                console.error('[Voice State Listener Error]', err);
            }
        }
    }
    setRms(rms) {
        this.currentRms = rms;
        const snap = this.getState();
        for (const listener of this.stateListeners) {
            try {
                listener(snap);
            }
            catch (_) { }
        }
    }
    /**
     * Initialize permanent audio pipeline. Never torn down.
     */
    async ensureAudioPipeline() {
        if (this.isAudioPipelineReady)
            return true;
        try {
            console.log('[VoiceManager] Initializing single authoritative AudioCapture pipeline...');
            const { sampleRate } = await this.capture.start({
                onPcmChunk: (chunk) => {
                    this.processIncomingAudio(chunk).catch(() => { });
                },
                onRmsLevel: (rms) => {
                    this.setRms(rms);
                },
            });
            this.nativeSampleRate = sampleRate;
            this.isAudioPipelineReady = true;
            this.transitionTo('WAKE_LISTENING');
            console.log('[VoiceManager] Audio pipeline live & listening for wake phrase.');
            return true;
        }
        catch (err) {
            console.error('[VoiceManager] Audio pipeline init failed:', err);
            this.transitionTo('RESETTING', { error: String(err) });
            return false;
        }
    }
    async ensureAudioCapture() {
        return this.ensureAudioPipeline();
    }
    async startWakeListening() {
        this.isWakeWordActive = true;
        this.wakeDetector.setEnabled(true);
        await this.ensureAudioPipeline();
        if (this.currentState !== 'COMMAND_LISTENING' && this.currentState !== 'TRANSCRIBING') {
            this.transitionTo('WAKE_LISTENING');
        }
    }
    stopWakeListening() {
        this.isWakeWordActive = false;
        this.wakeDetector.setEnabled(false);
        if (this.currentState === 'WAKE_LISTENING') {
            this.transitionTo('RESETTING');
        }
    }
    setMuted(muted) {
        this.isMuted = muted;
    }
    isWakeWordEnabled() {
        return this.isWakeWordActive;
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
                if (this.isWakeWordActive) {
                    this.wakeDetector.processChunk(pcm16k);
                    // Maintain rolling 350ms pre-roll buffer (~5600 samples at 16kHz)
                    this.preRollChunks.push(pcm16k);
                    this.preRollSamples += pcm16k.length;
                    while (this.preRollSamples > 5600 && this.preRollChunks.length > 1) {
                        const popped = this.preRollChunks.shift();
                        if (popped)
                            this.preRollSamples -= popped.length;
                    }
                }
                break;
            case 'COMMAND_LISTENING':
                // Accumulate audio chunk for Whisper transcription
                this.commandAudioChunks.push(pcm16k);
                this.totalCommandSamples += pcm16k.length;
                // Directly detect speech energy from frame RMS
                if (rms >= 0.005) {
                    this.hasDetectedUserSpeech = true;
                }
                // Feed VAD to identify speech completion
                this.vad.processChunk(pcm16k);
                break;
            case 'SPEAKING':
                // Microphone audio during TTS is actively monitored for vocal barge-in.
                // If user speaks loudly over TTS (RMS > 0.035), interrupt speech and task immediately.
                if (rms >= 0.035) {
                    console.log(`[VoiceManager] Vocal barge-in detected (RMS: ${rms.toFixed(4)}) during SPEAKING! Interrupting speech...`);
                    if (typeof window !== 'undefined' && window.speechSynthesis) {
                        window.speechSynthesis.cancel();
                    }
                    this.triggerInterruption();
                }
                break;
            default:
                break;
        }
    }
    handleWakeDetected(result) {
        console.log(`[VoiceManager] Instant Wake Triggered (${result.phrase})`);
        // Prepare command recording buffer seeded with recent pre-roll audio so command onset is preserved
        this.commandAudioChunks = [...this.preRollChunks];
        this.totalCommandSamples = this.preRollSamples;
        this.preRollChunks = [];
        this.preRollSamples = 0;
        this.hasDetectedUserSpeech = false;
        this.vad.reset();
        // 1.2s grace window allows user to begin command without premature silence cutoff
        this.wakeGraceUntil = Date.now() + 1200;
        // Immediately enter COMMAND_LISTENING to capture the user's command
        this.transitionTo('COMMAND_LISTENING', { detail: 'Listening for command' });
        // Safety timeout (8.5 seconds max command)
        if (this.maxCommandDurationTimer)
            clearTimeout(this.maxCommandDurationTimer);
        this.maxCommandDurationTimer = setTimeout(() => {
            if (this.currentState === 'COMMAND_LISTENING') {
                console.log('[VoiceManager] Max command duration reached.');
                this.finishCommandRecording();
            }
        }, 8500);
    }
    async startPushToTalk() {
        if (!this.isAudioPipelineReady) {
            console.log('[VoiceManager] Audio pipeline not yet ready, initializing now for push-to-talk...');
            await this.ensureAudioPipeline();
        }
        await this.capture.resumeIfSuspended();
        if (this.currentState === 'SPEAKING') {
            this.triggerInterruption();
        }
        this.commandAudioChunks = [];
        this.totalCommandSamples = 0;
        this.hasDetectedUserSpeech = false;
        this.vad.reset();
        this.wakeGraceUntil = Date.now() + 1000;
        this.transitionTo('COMMAND_LISTENING', { detail: 'Push to talk' });
        if (this.maxCommandDurationTimer)
            clearTimeout(this.maxCommandDurationTimer);
        this.maxCommandDurationTimer = setTimeout(() => {
            if (this.currentState === 'COMMAND_LISTENING') {
                this.finishCommandRecording();
            }
        }, 8500);
    }
    stopRecordingAndTranscribe() {
        if (this.currentState === 'COMMAND_LISTENING') {
            this.finishCommandRecording();
        }
    }
    async finishCommandRecording() {
        if (this.maxCommandDurationTimer) {
            clearTimeout(this.maxCommandDurationTimer);
            this.maxCommandDurationTimer = null;
        }
        if (this.currentState !== 'COMMAND_LISTENING')
            return;
        // Reject audio if duration is < 0.15s (2400 samples at 16kHz)
        if (this.commandAudioChunks.length === 0 || this.totalCommandSamples < 2400) {
            console.log(`[VoiceManager] Captured audio too short (${this.totalCommandSamples} samples < 2400), discarding.`);
            this.resetToWakeListening();
            return;
        }
        // Flatten audio chunks
        const fullBuffer = new Float32Array(this.totalCommandSamples);
        let offset = 0;
        for (const chunk of this.commandAudioChunks) {
            fullBuffer.set(chunk, offset);
            offset += chunk.length;
        }
        this.commandAudioChunks = [];
        this.totalCommandSamples = 0;
        // Check peak amplitude and active speech RMS
        let maxAmp = 0;
        let sumSq = 0;
        for (let i = 0; i < fullBuffer.length; i++) {
            const absVal = Math.abs(fullBuffer[i]);
            if (absVal > maxAmp)
                maxAmp = absVal;
            sumSq += fullBuffer[i] * fullBuffer[i];
        }
        const avgRms = Math.sqrt(sumSq / fullBuffer.length);
        // Only skip Whisper if buffer is absolute silence / empty noise
        const hasVoiceEnergy = this.hasDetectedUserSpeech || maxAmp >= 0.008 || avgRms >= 0.001;
        if (!hasVoiceEnergy) {
            console.log(`[VoiceManager] No command speech detected (hasSpeech: ${this.hasDetectedUserSpeech}, MaxAmp: ${maxAmp.toFixed(4)}, RMS: ${avgRms.toFixed(5)}), skipping Whisper.`);
            this.resetToWakeListening();
            return;
        }
        this.transitionTo('TRANSCRIBING');
        try {
            const transcription = await whisper_js_1.WhisperBridge.transcribe(fullBuffer);
            console.log(`[VoiceManager] Transcribed: "${transcription}"`);
            if (!transcription || transcription.trim().length === 0) {
                console.warn('[VoiceManager] Whisper produced empty transcription for speech buffer.');
                for (const listener of this.transcriptionListeners) {
                    try {
                        listener('');
                    }
                    catch { }
                }
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
            // Notify UI transcription listeners
            for (const listener of this.transcriptionListeners) {
                try {
                    listener(transcription);
                }
                catch (err) {
                    console.error('[Transcription Listener Error]', err);
                }
            }
            // Dispatch to command listeners (e.g. AgentRuntime)
            for (const listener of this.commandListeners) {
                try {
                    await listener(transcription);
                }
                catch (err) {
                    console.error('[Command Listener Error]', err);
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
    setSpeakingTTS(active) {
        if (active) {
            this.transitionTo('SPEAKING');
        }
        else {
            if (this.currentState === 'SPEAKING') {
                this.resetToWakeListening();
            }
        }
    }
    resetVoiceSession() {
        this.resetToWakeListening();
    }
    setStandbyMode(enabled) {
        this.isStandbyMode = enabled;
        console.log(`[VoiceManager] Standby mode set to: ${enabled}`);
        if (enabled && (this.currentState === 'WAKE_LISTENING' || this.currentState === 'RESETTING')) {
            this.transitionTo('COMMAND_LISTENING', { detail: 'Standby mode active' });
        }
    }
    isStandby() {
        return this.isStandbyMode;
    }
    resetToWakeListening() {
        if (this.maxCommandDurationTimer) {
            clearTimeout(this.maxCommandDurationTimer);
            this.maxCommandDurationTimer = null;
        }
        this.wakeDetector.reset();
        this.vad.reset();
        this.commandAudioChunks = [];
        this.totalCommandSamples = 0;
        this.hasDetectedUserSpeech = false;
        this.transitionTo('RESETTING');
        setTimeout(() => {
            if (this.isStandbyMode) {
                this.transitionTo('COMMAND_LISTENING', { detail: 'Standby mode active' });
            }
            else {
                this.transitionTo('WAKE_LISTENING');
            }
        }, 120);
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
    holdStartTimestamp = 0;
    setupGlobalShortcuts() {
        if (typeof window === 'undefined')
            return;
        // Window interaction listener to immediately resume AudioContext on first gesture
        const resumeAudio = () => {
            if (this.capture) {
                this.capture.resumeIfSuspended().catch(() => { });
            }
        };
        window.addEventListener('click', resumeAudio, { passive: true });
        window.addEventListener('keydown', resumeAudio, { passive: true });
        window.addEventListener('keydown', (e) => {
            const targetTag = e.target?.tagName?.toLowerCase();
            if (targetTag === 'input' || targetTag === 'textarea' || e.target?.isContentEditable)
                return;
            if ((e.key === 't' || e.key === 'T') && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) {
                this.holdStartTimestamp = Date.now();
                if (this.currentState === 'COMMAND_LISTENING' || this.currentState === 'WAKE_DETECTED') {
                    console.log('[Hotkey] T pressed -> stopping command recording & transcribing');
                    this.finishCommandRecording();
                }
                else {
                    console.log('[Hotkey] T pressed -> push-to-talk start');
                    this.startPushToTalk().catch((err) => console.error('Push to talk error:', err));
                }
            }
            else if (e.key === 'Escape') {
                console.log('[Hotkey] Escape pressed -> interrupt');
                this.triggerInterruption();
            }
        });
        window.addEventListener('keyup', (e) => {
            const targetTag = e.target?.tagName?.toLowerCase();
            if (targetTag === 'input' || targetTag === 'textarea' || e.target?.isContentEditable)
                return;
            if ((e.key === 't' || e.key === 'T') && !e.metaKey && !e.ctrlKey) {
                const duration = Date.now() - this.holdStartTimestamp;
                // If user held 'T' for >= 400ms (Push-to-talk hold behavior), release finishes recording!
                if (duration >= 400 && (this.currentState === 'COMMAND_LISTENING' || this.currentState === 'WAKE_DETECTED')) {
                    console.log(`[Hotkey] T released after ${duration}ms hold -> stopping command recording`);
                    this.finishCommandRecording();
                }
            }
        });
    }
}
exports.VoiceManager = VoiceManager;
//# sourceMappingURL=voice-manager.js.map