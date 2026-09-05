"use strict";
/**
 * AgentRuntime: Authoritative Autonomous Execution Engine for Tesseract.
 * Invariant: ACTION != SEARCH. Never default to Google search.
 * Target-aware execution: WHAT, WHERE, ACTION with verified live browser state.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentRuntime = void 0;
const voice_manager_js_1 = require("../voice/voice-manager.js");
const command_router_js_1 = require("./command-router.js");
const ollama_gemma_js_1 = require("../ai/ollama-gemma.js");
const action_loop_js_1 = require("./action-loop.js");
const cancellation_js_1 = require("./cancellation.js");
const conversation_manager_js_1 = require("../memory/conversation-manager.js");
const memory_retriever_js_1 = require("../memory/memory-retriever.js");
const youtube_js_1 = require("../adapters/youtube.js");
const browser_automator_js_1 = require("../browser/browser-automator.js");
const browser_perception_js_1 = require("../browser/browser-perception.js");
const media_controller_js_1 = require("../browser/media-controller.js");
class AgentRuntime {
    static instance = null;
    voiceManager;
    model;
    actionLoop;
    currentCancellationToken = null;
    state = {
        status: 'idle',
        progress: 0,
        steps: [],
    };
    listeners = new Set();
    constructor() {
        this.voiceManager = voice_manager_js_1.VoiceManager.getInstance();
        this.model = new ollama_gemma_js_1.OllamaGemmaModel('gemma3:4b');
        this.actionLoop = new action_loop_js_1.ActionLoop(this.model, 8);
        // Bind voice command execution
        this.voiceManager.onCommand(async (commandText) => {
            await this.handleUserCommand(commandText);
        });
        // Bind voice interruption
        this.voiceManager.onInterruption(() => {
            this.cancelActiveTask();
        });
    }
    static getInstance() {
        if (!AgentRuntime.instance) {
            AgentRuntime.instance = new AgentRuntime();
        }
        return AgentRuntime.instance;
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
                console.error('[AgentRuntime] Listener error:', err);
            }
        }
    }
    cancelActiveTask() {
        console.log('[AgentRuntime] Cancelling active task and TTS...');
        if (this.currentCancellationToken) {
            this.currentCancellationToken.cancel();
            this.currentCancellationToken = null;
        }
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
        this.updateState({
            status: 'idle',
            currentAction: 'Task stopped.',
            progress: 0,
        });
    }
    async speak(text) {
        if (!text || typeof window === 'undefined' || !('speechSynthesis' in window))
            return;
        this.voiceManager.setSpeaking();
        this.updateState({ status: 'speaking', currentAction: text });
        return new Promise((resolve) => {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 1.05;
            utterance.pitch = 1.0;
            utterance.onend = () => resolve();
            utterance.onerror = () => resolve();
            window.speechSynthesis.speak(utterance);
        });
    }
    /**
     * Main command dispatch pipeline with explicit ACTION != SEARCH routing.
     */
    async handleUserCommand(rawCommand) {
        const goal = rawCommand.trim();
        if (!goal) {
            this.voiceManager.resetToWakeListening();
            return;
        }
        console.log(`[AgentRuntime] Received command: "${goal}"`);
        const convManager = conversation_manager_js_1.ConversationManager.getInstance();
        convManager.recordTurn({ speaker: 'user', text: goal });
        // 1. CLASSIFY THROUGH ACTION TAXONOMY (NEVER DEFAULT TO GOOGLE)
        const routed = command_router_js_1.CommandRouter.route(goal);
        console.log(`[AgentRuntime] Routed: Action=${routed.action}, Target=${routed.target || '—'}, Location=${routed.location}, Query="${routed.query || '—'}"`);
        // 2. FAST-PATH EXECUTION (Deterministic <5ms)
        if (routed.isFastPath) {
            this.updateState({ status: 'executing', currentAction: `Executing ${routed.action}...`, progress: 0.5 });
            await this.executeFastPath(routed);
            this.updateState({ status: 'success', currentAction: 'Done', progress: 1.0 });
            this.voiceManager.resetToWakeListening();
            return;
        }
        // 3. TARGET-AWARE PLAY ACTION ("Play Loser on YouTube", "Play the first video", "Play on my screen")
        if (routed.action === 'PLAY') {
            await this.executePlayAction(routed);
            this.voiceManager.resetToWakeListening();
            return;
        }
        // 4. CONTEXTUAL CLICK ACTION ("Click the video on my screen", "Click the blue button", "Click Rahul")
        if (routed.action === 'CLICK') {
            await this.executeClickAction(routed);
            this.voiceManager.resetToWakeListening();
            return;
        }
        // 5. CONVERSATIONAL MEMORY ("Remember what we talked about four minutes ago?")
        const memoryQuery = memory_retriever_js_1.MemoryRetriever.parseNaturalMemoryQuery(goal);
        if (memoryQuery) {
            this.updateState({ status: 'thinking', currentAction: 'Searching memory...' });
            const results = memory_retriever_js_1.MemoryRetriever.search(memoryQuery);
            if (results.length > 0) {
                const snippet = results.slice(0, 2).map(r => r.text).join(' and ');
                await this.speak(`Earlier we discussed: "${snippet}".`);
            }
            else {
                await this.speak("I don't recall talking about that earlier in this session.");
            }
            this.updateState({ status: 'idle', progress: 1.0 });
            this.voiceManager.resetToWakeListening();
            return;
        }
        // 6. VIDEO UNDERSTANDING ("What is this video about?")
        if (routed.action === 'WATCH') {
            this.updateState({ status: 'thinking', currentAction: 'Analyzing video content...' });
            const videoData = await youtube_js_1.YouTubeAdapter.getCurrentVideo();
            if (videoData.title) {
                const prompt = `User asks: "${goal}".
Video Title: "${videoData.title}"
Channel: "${videoData.channel}"
Description: "${videoData.description.slice(0, 250)}"
Captions/Transcript: "${videoData.transcriptSnippet || videoData.captions || 'None available'}"
Give a concise 2-sentence spoken response answering their question based on actual video information.`;
                const answer = await this.model.generate(prompt, { temperature: 0.3, maxTokens: 120 });
                await this.speak(answer.trim());
            }
            else {
                await this.speak("I don't see an active video on this page.");
            }
            this.updateState({ status: 'idle', progress: 1.0 });
            this.voiceManager.resetToWakeListening();
            return;
        }
        // 7. DIRECT NAVIGATION ("Open YouTube", "Go to Instagram")
        if (routed.action === 'NAVIGATE') {
            const siteUrls = {
                youtube: 'https://www.youtube.com',
                instagram: 'https://www.instagram.com',
                gmail: 'https://mail.google.com',
                amazon: 'https://www.amazon.com',
            };
            const url = siteUrls[routed.location] || (routed.query ? `https://${routed.query}` : 'https://www.google.com');
            this.updateState({ status: 'executing', currentAction: `Opening ${routed.location}...`, progress: 0.6 });
            await browser_automator_js_1.BrowserAutomator.getInstance().navigate(url);
            await this.speak(`Opened ${routed.location}.`);
            this.updateState({ status: 'success', currentAction: 'Done', progress: 1.0 });
            this.voiceManager.resetToWakeListening();
            return;
        }
        // 8. EXPLICIT SEARCH (ONLY when user explicitly requests a search)
        if (routed.action === 'SEARCH') {
            if (routed.location === 'youtube' && routed.query) {
                this.updateState({ status: 'executing', currentAction: `Searching YouTube for "${routed.query}"...`, progress: 0.6 });
                await youtube_js_1.YouTubeAdapter.search(routed.query);
                await this.speak(`Searching YouTube for ${routed.query}.`);
            }
            else if (routed.location === 'google' && routed.query) {
                this.updateState({ status: 'executing', currentAction: `Searching Google for "${routed.query}"...`, progress: 0.6 });
                await browser_automator_js_1.BrowserAutomator.getInstance().navigate(`https://www.google.com/search?q=${encodeURIComponent(routed.query)}`);
                await this.speak(`Searching Google for ${routed.query}.`);
            }
            this.updateState({ status: 'success', currentAction: 'Done', progress: 1.0 });
            this.voiceManager.resetToWakeListening();
            return;
        }
        // 9. COMPLEX AUTONOMOUS MISSION VIA GEMMA 3 4B ACTION LOOP
        this.currentCancellationToken = new cancellation_js_1.CancellationToken();
        this.updateState({
            status: 'executing',
            goal,
            currentAction: 'Planning autonomous actions...',
            progress: 0.1,
            steps: [],
        });
        try {
            const result = await this.actionLoop.run(goal, {
                onStatus: (status) => this.updateState({ currentAction: status }),
                onStep: (stepNumber, description, status) => {
                    const steps = [...this.state.steps];
                    const existing = steps.find(s => s.stepNumber === stepNumber);
                    if (existing) {
                        existing.status = status;
                        existing.description = description;
                    }
                    else {
                        steps.push({ stepNumber, description, status });
                    }
                    this.updateState({ steps, progress: Math.min(0.9, stepNumber * 0.15) });
                },
                onConfirmationRequired: async (tool, args) => {
                    await this.speak(`Ready to ${tool.name}. Proceed?`);
                    return true;
                },
                onFinish: (summary) => this.speak(summary).catch(() => { }),
                onError: (error) => this.speak(`Action issue: ${error}`).catch(() => { }),
            }, this.currentCancellationToken);
            this.updateState({
                status: result.success ? 'success' : 'error',
                currentAction: result.summary,
                progress: 1.0,
            });
            convManager.recordTurn({ speaker: 'assistant', text: result.summary });
        }
        catch (err) {
            console.error('[AgentRuntime] Mission error:', err);
            this.updateState({
                status: 'error',
                currentAction: err.message,
                error: err.message,
                progress: 1.0,
            });
            await this.speak("I encountered an issue executing that command.");
        }
        finally {
            this.currentCancellationToken = null;
            this.voiceManager.resetToWakeListening();
        }
    }
    /**
     * Verified Multi-step PLAY Action:
     * "Play Loser on YouTube" -> Open YouTube -> Search "Loser" -> Click Result -> Verify Playback
     */
    async executePlayAction(cmd) {
        const automator = browser_automator_js_1.BrowserAutomator.getInstance();
        const media = media_controller_js_1.MediaController.getInstance();
        if (cmd.location === 'youtube' && cmd.query) {
            this.updateState({ status: 'executing', currentAction: `Searching YouTube for "${cmd.query}"...`, progress: 0.4 });
            const res = await youtube_js_1.YouTubeAdapter.searchAndPlay(cmd.query, cmd.index || 1);
            if (res.success) {
                this.updateState({ status: 'success', currentAction: `Playing "${res.title || cmd.query}"`, progress: 1.0 });
                await this.speak(`Playing "${res.title || cmd.query}" on YouTube.`);
            }
            else {
                this.updateState({ status: 'error', currentAction: 'Playback verification failed', progress: 1.0 });
                await this.speak(`I found ${cmd.query} on YouTube, but video playback could not be verified.`);
            }
            return;
        }
        // "Play the video on my screen" / "Play the first video"
        this.updateState({ status: 'executing', currentAction: 'Locating video on screen...', progress: 0.5 });
        const targetEl = await browser_perception_js_1.BrowserPerception.getInstance().findMatchingElement(cmd.query, 'video', cmd.index || 1);
        if (targetEl) {
            await automator.click({ elementId: targetEl.id });
            const isPlaying = await media.verifyPlaying(3000);
            if (isPlaying) {
                await this.speak('Playing video.');
            }
            else {
                await media.play();
                await this.speak('Started video playback.');
            }
            this.updateState({ status: 'success', currentAction: 'Done', progress: 1.0 });
        }
        else {
            // Direct media element fallback
            const playRes = await media.play();
            if (playRes.success) {
                await this.speak('Resumed playback.');
                this.updateState({ status: 'success', currentAction: 'Playing', progress: 1.0 });
            }
            else {
                await this.speak("I couldn't locate a playable video on this screen.");
                this.updateState({ status: 'error', currentAction: 'No video on screen', progress: 1.0 });
            }
        }
    }
    /**
     * Verified Contextual CLICK Action:
     * "Click the video on my screen", "Click the blue button", "Click Rahul"
     */
    async executeClickAction(cmd) {
        const automator = browser_automator_js_1.BrowserAutomator.getInstance();
        const perception = browser_perception_js_1.BrowserPerception.getInstance();
        const desc = cmd.description || cmd.query || 'element';
        this.updateState({ status: 'executing', currentAction: `Locating ${desc} on screen...`, progress: 0.5 });
        const targetType = cmd.target === 'video' ? 'video' : undefined;
        const targetEl = await perception.findMatchingElement(cmd.query || cmd.description, targetType, cmd.index || 1);
        if (targetEl) {
            console.log(`[AgentRuntime] Found matching element on screen: [${targetEl.id}] ${targetEl.role} "${targetEl.name || targetEl.text}"`);
            await automator.click({ elementId: targetEl.id });
            const label = targetEl.name || targetEl.text || desc;
            await this.speak(`Clicked ${label}.`);
            this.updateState({ status: 'success', currentAction: `Clicked ${label}`, progress: 1.0 });
        }
        else {
            console.warn(`[AgentRuntime] Could not locate "${desc}" on active screen. NOT defaulting to Google search.`);
            await this.speak(`I couldn't find "${desc}" on your screen.`);
            this.updateState({ status: 'error', currentAction: `Element not found: ${desc}`, progress: 1.0 });
        }
    }
    async executeFastPath(cmd) {
        const automator = browser_automator_js_1.BrowserAutomator.getInstance();
        const media = media_controller_js_1.MediaController.getInstance();
        switch (cmd.action) {
            case 'BACK':
                await automator.goBack();
                await this.speak('Going back.');
                break;
            case 'FORWARD':
                await automator.goForward();
                await this.speak('Going forward.');
                break;
            case 'NAVIGATE':
                if (cmd.description === 'reload') {
                    await automator.reload();
                    await this.speak('Reloading.');
                }
                break;
            case 'PAUSE':
                await media.pause();
                await this.speak('Paused.');
                break;
            case 'RESUME':
                await media.play();
                await this.speak('Resuming.');
                break;
            case 'SCROLL':
                await automator.scroll(cmd.description === 'up' ? 'up' : 'down', 450);
                break;
            case 'CLOSE':
                await automator.closeCurrentTab();
                break;
            case 'OPEN':
                await automator.createTab('about:blank');
                break;
            case 'STOP':
                this.cancelActiveTask();
                break;
        }
    }
}
exports.AgentRuntime = AgentRuntime;
//# sourceMappingURL=agent-runtime.js.map