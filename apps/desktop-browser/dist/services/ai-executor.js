"use strict";
/**
 * AIExecutionCoordinator: Calm, autonomous background task execution engine.
 * Coordinates with BrowserAutomator, IntentEngine, and VoiceManager.
 *
 * CRITICAL UX RULE:
 * Autonomous task execution must NEVER automatically open the sidebar or drawers.
 * Status is surfaced non-intrusively via the calm floating activity pill.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIExecutionCoordinator = void 0;
const browser_automator_js_1 = require("./browser-automator.js");
const voice_manager_js_1 = require("./voice-manager.js");
class AIExecutionCoordinator {
    static instance = null;
    state = {
        status: 'idle',
        progress: 0,
        steps: [],
    };
    listeners = new Set();
    automator;
    collapseTimer = null;
    activeUtterances = new Set();
    constructor() {
        this.automator = browser_automator_js_1.BrowserAutomator.getInstance();
    }
    static getInstance() {
        if (!AIExecutionCoordinator.instance) {
            AIExecutionCoordinator.instance = new AIExecutionCoordinator();
        }
        return AIExecutionCoordinator.instance;
    }
    getState() {
        return { ...this.state };
    }
    subscribe(listener) {
        this.listeners.add(listener);
        listener(this.getState());
        return () => this.listeners.delete(listener);
    }
    updateState(patch) {
        this.state = { ...this.state, ...patch };
        const snap = this.getState();
        for (const listener of this.listeners) {
            try {
                listener(snap);
            }
            catch (err) {
                console.error('[AI Coordinator] Listener error:', err);
            }
        }
    }
    /**
     * Speak aloud using TTS while coordinating with VoiceManager to prevent self-triggering.
     * Defends against Chromium Web Speech garbage collection bugs by retaining utterance refs.
     */
    speak(text) {
        return new Promise((resolve) => {
            if (typeof window === 'undefined' || !('speechSynthesis' in window) || !text) {
                resolve();
                return;
            }
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 1.05;
            utterance.pitch = 1.0;
            this.activeUtterances.add(utterance);
            voice_manager_js_1.VoiceManager.getInstance().setSpeakingTTS(true);
            let finished = false;
            const cleanup = () => {
                if (!finished) {
                    finished = true;
                    this.activeUtterances.delete(utterance);
                    voice_manager_js_1.VoiceManager.getInstance().setSpeakingTTS(false);
                    resolve();
                }
            };
            utterance.onend = cleanup;
            utterance.onerror = cleanup;
            // Chrome GC failsafe timeout
            const safetyMs = Math.max(2500, text.length * 90);
            setTimeout(cleanup, safetyMs);
            window.speechSynthesis.speak(utterance);
        });
    }
    /**
     * Execute an autonomous task directly from a StructuredIntent without UI intervention.
     */
    async executeIntent(intent) {
        if (!intent)
            return;
        const taskId = `task-${Date.now()}`;
        console.log(`[AI] task created (ID: ${taskId}, Type: ${intent.type}, Raw: "${intent.rawText}")`);
        if (this.collapseTimer) {
            clearTimeout(this.collapseTimer);
            this.collapseTimer = null;
        }
        // Clarification-only intents (e.g. standalone "Hey Tesseract")
        if (intent.type === 'clarification') {
            if (intent.spokenIntro) {
                await this.speak(intent.spokenIntro);
            }
            voice_manager_js_1.VoiceManager.getInstance().resetVoiceSession();
            return;
        }
        const steps = [
            { id: 's1', stepNumber: 1, description: `Analyze request: ${intent.type}`, status: 'SUCCESS' },
            { id: 's2', stepNumber: 2, description: intent.spokenIntro || `Executing ${intent.action || intent.type}`, status: 'ACTIVE' },
            { id: 's3', stepNumber: 3, description: 'Verify page state', status: 'PENDING' },
        ];
        this.updateState({
            status: 'executing',
            taskId,
            goal: intent.cleanText || intent.rawText,
            currentAction: intent.spokenIntro || 'Working...',
            progress: 0.3,
            steps,
            error: undefined,
        });
        // 1. Brief spoken announcement (run concurrently in background with zero navigation lag)
        if (intent.spokenIntro) {
            this.speak(intent.spokenIntro).catch(() => { });
        }
        try {
            // 2. Dispatch to BrowserAutomator based on structured intent type
            let success = false;
            let actionResult = null;
            switch (intent.type) {
                case 'browser_control': {
                    console.log(`[AI] action: browser_control (${intent.action})`);
                    if (intent.action === 'back') {
                        const res = await this.automator.goBack();
                        success = res.success;
                    }
                    else if (intent.action === 'forward') {
                        const res = await this.automator.goForward();
                        success = res.success;
                    }
                    else if (intent.action === 'reload') {
                        const res = await this.automator.reload();
                        success = res.success;
                    }
                    else if (intent.action === 'new_tab') {
                        const res = await this.automator.createTab('about:blank');
                        success = res.success;
                    }
                    else if (intent.action === 'close_tab') {
                        const res = await this.automator.closeCurrentTab();
                        success = res.success;
                    }
                    else if (intent.action === 'pause') {
                        const res = await this.automator.pauseMedia();
                        success = res.success;
                    }
                    else if (intent.action === 'resume') {
                        const res = await this.automator.resumeMedia();
                        success = res.success;
                    }
                    break;
                }
                case 'navigation':
                case 'search':
                case 'shopping': {
                    if (!intent.targetUrl)
                        throw new Error('No target URL in navigation intent');
                    console.log(`[AI] action: navigate (Target: ${intent.targetUrl}, NewTab: ${Boolean(intent.inNewTab)})`);
                    this.updateState({ progress: 0.6, currentAction: `Navigating to ${intent.siteContext || 'page'}` });
                    let navRes;
                    if (intent.inNewTab) {
                        navRes = await this.automator.createTab(intent.targetUrl);
                    }
                    else {
                        navRes = await this.automator.navigate(intent.targetUrl, (msg) => {
                            this.updateState({ currentAction: msg });
                        });
                    }
                    success = navRes.success;
                    actionResult = navRes.result;
                    break;
                }
                case 'media_playback': {
                    if (!intent.targetUrl)
                        throw new Error('No target URL in media intent');
                    console.log(`[AI] action: media_playback (Target: ${intent.targetUrl}, NewTab: ${Boolean(intent.inNewTab)})`);
                    this.updateState({ progress: 0.5, currentAction: 'Loading media page...' });
                    let navRes;
                    if (intent.inNewTab) {
                        navRes = await this.automator.createTab(intent.targetUrl);
                    }
                    else {
                        navRes = await this.automator.navigate(intent.targetUrl);
                    }
                    if (navRes.success && intent.autoPlayMedia) {
                        this.updateState({ progress: 0.8, currentAction: 'Starting playback...' });
                        await new Promise((r) => setTimeout(r, 1800));
                        const mediaRes = await this.automator.playFirstMedia();
                        success = mediaRes.success;
                        actionResult = mediaRes.result;
                    }
                    else {
                        success = navRes.success;
                    }
                    break;
                }
                case 'page_action': {
                    console.log(`[AI] action: page_action (Action: ${intent.action}, Referent: ${intent.referent})`);
                    if (intent.action === 'click') {
                        const index = intent.parameters?.index ?? 0;
                        const res = await this.automator.playOrdinalMedia(index);
                        success = res.success;
                        actionResult = res.result;
                    }
                    break;
                }
                case 'comparison': {
                    console.log(`[AI] action: comparison (${intent.query})`);
                    if (intent.targetUrl) {
                        await this.automator.navigate(intent.targetUrl);
                    }
                    success = true;
                    break;
                }
                default:
                    success = true;
                    break;
            }
            steps[1].status = success ? 'SUCCESS' : 'FAILED';
            steps[2].status = success ? 'SUCCESS' : 'FAILED';
            if (success) {
                console.log(`[AI] task completed: "${intent.cleanText || intent.rawText}"`);
                this.updateState({
                    status: 'success',
                    currentAction: 'Done',
                    progress: 1.0,
                    steps,
                });
            }
            else {
                console.error(`[AI] task action failed: "${intent.cleanText || intent.rawText}"`);
                this.updateState({
                    status: 'error',
                    currentAction: 'Action could not be completed',
                    error: 'Action failed',
                    progress: 1.0,
                    steps,
                });
                await this.speak("I couldn't complete that action.");
            }
        }
        catch (err) {
            console.error('[AI] task execution error:', err);
            steps[1].status = 'FAILED';
            this.updateState({
                status: 'error',
                currentAction: 'Error occurred',
                error: err.message,
                progress: 1.0,
                steps,
            });
            await this.speak("I encountered an issue opening that page.");
        }
        finally {
            this.scheduleAutoCollapse();
            // CRITICAL PIPELINE RETURN: explicitly reset voice session and resume wake listening!
            voice_manager_js_1.VoiceManager.getInstance().resetVoiceSession();
        }
    }
    scheduleAutoCollapse() {
        if (this.collapseTimer)
            clearTimeout(this.collapseTimer);
        this.collapseTimer = setTimeout(() => {
            if (this.state.status === 'success' || this.state.status === 'error') {
                this.updateState({
                    status: 'idle',
                    currentAction: undefined,
                    progress: 0,
                });
            }
        }, 3200);
    }
}
exports.AIExecutionCoordinator = AIExecutionCoordinator;
//# sourceMappingURL=ai-executor.js.map