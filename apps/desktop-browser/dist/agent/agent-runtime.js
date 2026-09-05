"use strict";
/**
 * AgentRuntime: Authoritative Autonomous Execution Engine for Tesseract.
 * Integrates Voice, FastPathClassifier, Local Gemma 3 4B, ActionLoop, Conversational Memory, and Adapters.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentRuntime = void 0;
const voice_manager_js_1 = require("../voice/voice-manager.js");
const fast_path_js_1 = require("./fast-path.js");
const ollama_gemma_js_1 = require("../ai/ollama-gemma.js");
const action_loop_js_1 = require("./action-loop.js");
const cancellation_js_1 = require("./cancellation.js");
const conversation_manager_js_1 = require("../memory/conversation-manager.js");
const memory_retriever_js_1 = require("../memory/memory-retriever.js");
const youtube_js_1 = require("../adapters/youtube.js");
const browser_automator_js_1 = require("../browser/browser-automator.js");
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
            utterance.onend = () => {
                resolve();
            };
            utterance.onerror = () => {
                resolve();
            };
            window.speechSynthesis.speak(utterance);
        });
    }
    /**
     * Main command dispatch pipeline.
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
        // 1. FAST-PATH CLASSIFIER (<50ms, zero LLM)
        const fastMatch = fast_path_js_1.FastPathClassifier.classify(goal);
        if (fastMatch) {
            console.log(`[AgentRuntime] Fast-Path Match: ${fastMatch.action}`);
            this.updateState({ status: 'executing', currentAction: fastMatch.spokenFeedback, progress: 0.5 });
            await this.executeFastPathAction(fastMatch.action);
            await this.speak(fastMatch.spokenFeedback);
            this.updateState({ status: 'success', currentAction: 'Done', progress: 1.0 });
            this.voiceManager.resetToWakeListening();
            return;
        }
        // 2. CONVERSATIONAL MEMORY LOOKUP ("Remember what we talked about 4 minutes ago?")
        const memoryQuery = memory_retriever_js_1.MemoryRetriever.parseNaturalMemoryQuery(goal);
        if (memoryQuery) {
            this.updateState({ status: 'thinking', currentAction: 'Searching memory...' });
            const results = memory_retriever_js_1.MemoryRetriever.search(memoryQuery);
            if (results.length > 0) {
                const snippet = results.slice(0, 2).map(r => r.text).join(' and ');
                const reply = `Earlier we discussed: "${snippet}".`;
                await this.speak(reply);
            }
            else {
                await this.speak("I don't recall talking about that earlier in this session.");
            }
            this.updateState({ status: 'idle', progress: 1.0 });
            this.voiceManager.resetToWakeListening();
            return;
        }
        // 3. VIDEO UNDERSTANDING QUERY ("What is this video about?", "What do you think of this video?")
        if (/(what\s+(is|do\s+you\s+think|are)\s+(this|the)\s+video|summarize\s+this(\s+video)?)/i.test(goal)) {
            this.updateState({ status: 'thinking', currentAction: 'Analyzing video content...' });
            const videoData = await youtube_js_1.YouTubeAdapter.getCurrentVideo();
            if (videoData.title) {
                const prompt = `The user asks: "${goal}" regarding the video currently playing.
Video Title: "${videoData.title}"
Channel: "${videoData.channel}"
Description: "${videoData.description.slice(0, 300)}"
Captions/Transcript: "${videoData.transcriptSnippet || videoData.captions || 'None available'}"

Give a concise, insightful 2-sentence spoken response answering their question based on the actual video information.`;
                const answer = await this.model.generate(prompt, { temperature: 0.3, maxTokens: 120 });
                await this.speak(answer.trim());
            }
            else {
                await this.speak("I don't detect a playing video on this page.");
            }
            this.updateState({ status: 'idle', progress: 1.0 });
            this.voiceManager.resetToWakeListening();
            return;
        }
        // 4. AUTONOMOUS MISSION WITH GEMMA 3 4B ACTION LOOP
        this.currentCancellationToken = new cancellation_js_1.CancellationToken();
        this.updateState({
            status: 'executing',
            goal,
            currentAction: 'Planning autonomous steps...',
            progress: 0.1,
            steps: [],
        });
        try {
            const result = await this.actionLoop.run(goal, {
                onStatus: (status) => {
                    this.updateState({ currentAction: status });
                },
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
                    const promptMsg = `Ready to ${tool.name}. Proceed?`;
                    await this.speak(promptMsg);
                    // Default safe approval hook
                    return true;
                },
                onFinish: (summary) => {
                    this.speak(summary).catch(() => { });
                },
                onError: (error) => {
                    this.speak(`I encountered an issue: ${error}`).catch(() => { });
                },
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
            await this.speak("The task could not be completed.");
        }
        finally {
            this.currentCancellationToken = null;
            this.voiceManager.resetToWakeListening();
        }
    }
    async executeFastPathAction(action) {
        const automator = browser_automator_js_1.BrowserAutomator.getInstance();
        switch (action) {
            case 'back':
                await automator.goBack();
                break;
            case 'forward':
                await automator.goForward();
                break;
            case 'reload':
                await automator.reload();
                break;
            case 'new_tab':
                await automator.createTab('about:blank');
                break;
            case 'close_tab':
                await automator.closeCurrentTab();
                break;
            case 'scroll_down':
                await automator.scroll('down', 450);
                break;
            case 'scroll_up':
                await automator.scroll('up', 450);
                break;
            case 'scroll_top':
                await automator.scroll('top');
                break;
            case 'scroll_bottom':
                await automator.scroll('bottom');
                break;
            case 'stop':
                this.cancelActiveTask();
                break;
        }
    }
}
exports.AgentRuntime = AgentRuntime;
//# sourceMappingURL=agent-runtime.js.map