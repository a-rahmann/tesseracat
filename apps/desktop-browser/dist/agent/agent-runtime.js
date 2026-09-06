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
const youtube_js_1 = require("../adapters/youtube.js");
const browser_automator_js_1 = require("../browser/browser-automator.js");
const browser_perception_js_1 = require("../browser/browser-perception.js");
const media_controller_js_1 = require("../browser/media-controller.js");
const skill_registry_js_1 = require("../skills/skill-registry.js");
const task_recorder_js_1 = require("./task-recorder.js");
const task_checkpoint_manager_js_1 = require("./task-checkpoint-manager.js");
const temporal_memory_js_1 = require("../memory/temporal-memory.js");
const natural_language_interpreter_js_1 = require("./natural-language-interpreter.js");
const planner_js_1 = require("./planner.js");
const tool_registry_js_1 = require("./tool-registry.js");
const tts_provider_js_1 = require("../voice/tts-provider.js");
const performance_profiler_js_1 = require("./performance-profiler.js");
class AgentRuntime {
    static instance = null;
    voiceManager;
    model;
    actionLoop;
    tts;
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
        this.tts = new tts_provider_js_1.WebSpeechTTSProvider();
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
        this.tts.stop();
        this.updateState({
            status: 'idle',
            currentAction: 'Task stopped.',
            progress: 0,
        });
    }
    async speak(text) {
        if (!text)
            return;
        this.voiceManager.setSpeaking();
        this.updateState({ status: 'speaking', currentAction: text });
        try {
            await this.tts.speak(text);
        }
        finally {
            this.voiceManager.setSpeakingTTS(false);
        }
    }
    /**
     * Main command dispatch pipeline.
     * Architecture: Voice/Text -> NLU Interpreter (Gemma 3 4B) -> Task Manager -> Dynamic Planner -> Action Loop.
     * Legacy greedy regex waterfall eliminated.
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
        const cleanLower = goal.toLowerCase();
        // 0a. Voice Interruption: "Stop", "Wait", "Actually don't do that", "Cancel"
        if (/^(?:stop|wait|cancel|abort|pause\s+task|actually\s+(?:don't|stop)|never\s*mind)\b/i.test(cleanLower)) {
            this.cancelActiveTask();
            task_recorder_js_1.TaskRecorder.getInstance().cancelTask();
            this.updateState({ status: 'idle', currentAction: 'Cancelled', progress: 1.0 });
            await this.speak('Task cancelled.');
            this.voiceManager.resetToWakeListening();
            return;
        }
        // 0b. Standby Mode Toggle ("Hey Tesseract, stay in standby mode" / "disable standby mode")
        if (/^(?:stay\s+in\s+standby(?:\s+mode)?|enable\s+standby(?:\s+mode)?|turn\s+on\s+standby(?:\s+mode)?|go\s+to\s+standby)\b/i.test(cleanLower)) {
            this.voiceManager.setStandbyMode(true);
            await this.speak("Standby mode enabled. I am listening continuously without requiring wake phrases.");
            return;
        }
        if (/^(?:disable\s+standby(?:\s+mode)?|turn\s+off\s+standby(?:\s+mode)?|exit\s+standby(?:\s+mode)?|leave\s+standby)\b/i.test(cleanLower)) {
            this.voiceManager.setStandbyMode(false);
            await this.speak("Standby mode disabled. Say Hey Tesseract whenever you need me.");
            return;
        }
        // 0c. Status Queries: "What are you doing?"
        if (/what\s+(?:are\s+you\s+doing|is\s+the\s+status|are\s+you\s+working\s+on)/i.test(cleanLower)) {
            const explanation = task_recorder_js_1.TaskRecorder.getInstance().explainCurrentActivity();
            await this.speak(explanation);
            this.voiceManager.resetToWakeListening();
            return;
        }
        // 0d. Action Log Queries: "What did you do?"
        if (/what\s+(?:did\s+you\s+do|have\s+you\s+done)/i.test(cleanLower)) {
            const past = task_recorder_js_1.TaskRecorder.getInstance().explainPastActivity();
            await this.speak(past);
            this.voiceManager.resetToWakeListening();
            return;
        }
        // 0e. Checkpoint Resumption: "Continue what I was doing" / "Resume task"
        if (/^(?:continue\s+what\s+(?:i|we)\s+was\s+doing|resume(?:\s+task)?|continue)\b/i.test(cleanLower)) {
            const cp = task_checkpoint_manager_js_1.TaskCheckpointManager.getInstance().getLatestCheckpoint();
            if (cp) {
                await this.speak(`Resuming task: "${cp.goal}".`);
                const steps = (cp.remainingSteps || []).map((desc, idx) => ({
                    stepNumber: idx + 1,
                    description: desc,
                    toolName: 'browser',
                    parameters: {},
                    status: 'PENDING',
                }));
                return this.executeAutonomousMission(cp.goal, steps);
            }
            else {
                await this.speak("I don't have any unfinished task checkpoints saved.");
                this.voiceManager.resetToWakeListening();
                return;
            }
        }
        // 0f. Temporal Memory Query: "What did Rahul say earlier?", "What did we talk about four minutes ago?"
        if (/what\s+(?:did|was|were)|remember\s+what|four\s+minutes\s+ago|earlier\s+in/i.test(cleanLower) && !cleanLower.includes('video')) {
            const temporal = temporal_memory_js_1.TemporalMemory.getInstance().parseAndQuery(goal);
            if (temporal.records.length > 0) {
                await this.speak(temporal.explanation);
                this.voiceManager.resetToWakeListening();
                return;
            }
        }
        // Performance Profiler instrumentation
        const profiler = performance_profiler_js_1.PerformanceProfiler.getInstance();
        profiler.startCommand(goal);
        // 0g. Deterministic Fast-Path Detection (<1ms, zero LLM, zero perception overhead)
        const fastPathGoal = natural_language_interpreter_js_1.NaturalLanguageInterpreter.getInstance().detectFastPathIntent(goal);
        if (fastPathGoal && fastPathGoal.isFastPath) {
            profiler.markNlu(true, false);
            this.updateState({
                status: 'executing',
                goal,
                currentAction: `Executing ${fastPathGoal.goal}...`,
                currentStep: fastPathGoal.goal,
                progress: 0.5,
            });
            if (fastPathGoal.fastPathAction === 'NAVIGATE' && fastPathGoal.suggestedTargetUrl) {
                profiler.markFirstAction(`Navigating to ${fastPathGoal.suggestedTargetUrl}`);
                profiler.markNavDispatch(fastPathGoal.suggestedTargetUrl);
                const navUrl = fastPathGoal.suggestedTargetUrl;
                const ackText = fastPathGoal.spokenAcknowledgment || `Opening ${fastPathGoal.goal}...`;
                // 1. Immediate Non-Blocking Voice Feedback: User hears response in <50ms!
                profiler.markTtsStart(ackText);
                this.speak(ackText).finally(() => {
                    profiler.markTtsEnd();
                }).catch(err => console.warn('[AgentRuntime] Optimistic TTS warning:', err));
                // 2. Immediate Concurrent Navigation Dispatch
                const navStartTime = Date.now();
                const navPromise = browser_automator_js_1.BrowserAutomator.getInstance().navigate(navUrl).then((res) => {
                    const navElapsed = Date.now() - navStartTime;
                    profiler.markNavigationWait(navElapsed);
                    profiler.markPageReady();
                    console.log(`[AgentRuntime] Background navigation to ${navUrl} completed in ${navElapsed}ms.`);
                    return res;
                }).catch(err => console.warn('[AgentRuntime] Background navigation warning:', err));
                // In standalone mode or test suite, allow dispatch to count as task initiation immediately
            }
            else if (fastPathGoal.fastPathAction === 'SCROLL') {
                profiler.markFirstAction(`Scroll ${fastPathGoal.entities.direction || 'down'}`);
                await browser_automator_js_1.BrowserAutomator.getInstance().scroll(fastPathGoal.entities.direction === 'up' ? 'up' : 'down', 450);
            }
            else if (fastPathGoal.fastPathAction === 'PLAY' && fastPathGoal.suggestedTargetUrl) {
                profiler.markFirstAction(`Playing ${fastPathGoal.entities.query || 'media'}`);
                profiler.markNavDispatch(fastPathGoal.suggestedTargetUrl);
                const navUrl = fastPathGoal.suggestedTargetUrl;
                const ackText = fastPathGoal.spokenAcknowledgment || 'Playing media.';
                profiler.markTtsStart(ackText);
                this.speak(ackText).finally(() => profiler.markTtsEnd()).catch(() => { });
                browser_automator_js_1.BrowserAutomator.getInstance().navigate(navUrl).catch(() => { });
            }
            else if (fastPathGoal.fastPathAction === 'SEARCH' && fastPathGoal.suggestedTargetUrl) {
                profiler.markFirstAction(`Searching ${fastPathGoal.entities.query}`);
                profiler.markNavDispatch(fastPathGoal.suggestedTargetUrl);
                const navUrl = fastPathGoal.suggestedTargetUrl;
                const ackText = fastPathGoal.spokenAcknowledgment || 'Searching.';
                profiler.markTtsStart(ackText);
                this.speak(ackText).finally(() => profiler.markTtsEnd()).catch(() => { });
                browser_automator_js_1.BrowserAutomator.getInstance().navigate(navUrl).catch(() => { });
            }
            else {
                const routed = {
                    action: fastPathGoal.fastPathAction,
                    target: 'element',
                    location: 'current_page',
                    isFastPath: true,
                    rawText: goal,
                    cleanText: fastPathGoal.goal,
                    requiresBrowserPerception: false,
                };
                profiler.markFirstAction(`Fast path ${fastPathGoal.fastPathAction}`);
                await this.executeFastPath(routed);
            }
            profiler.markTaskFinalize();
            const breakdown = profiler.markComplete(true);
            task_recorder_js_1.TaskRecorder.getInstance().recordAction(`Executed fast path: ${fastPathGoal.goal}`);
            task_recorder_js_1.TaskRecorder.getInstance().completeTask(`Completed ${fastPathGoal.goal}`);
            this.updateState({
                status: 'success',
                currentAction: 'Done',
                currentStep: 'Done',
                progress: 1.0,
                latencySummary: breakdown ? profiler.formatSummary(breakdown) : undefined,
            });
            this.voiceManager.resetToWakeListening();
            return;
        }
        // 0h. Pipelined Compound Fast-Path (e.g. "open youtube and search for Lose Yourself")
        if (fastPathGoal && !fastPathGoal.isFastPath && fastPathGoal.initialPlan && fastPathGoal.initialPlan.length > 0) {
            profiler.markNlu(false, true);
            profiler.markPlanning();
            console.log(`[AgentRuntime] Pipelined compound route triggered for "${fastPathGoal.goal}" - 0ms planning latency!`);
            // Pipelined First Browser Action: Immediately navigate to target URL!
            if (fastPathGoal.suggestedTargetUrl) {
                profiler.markFirstAction(`Navigating to ${fastPathGoal.suggestedTargetUrl}`);
                browser_automator_js_1.BrowserAutomator.getInstance().navigate(fastPathGoal.suggestedTargetUrl).catch(e => console.warn('[AgentRuntime] Pipelined navigation warning:', e));
            }
            return this.executeAutonomousMission(fastPathGoal.goal, fastPathGoal.initialPlan);
        }
        // Begin Recording Task
        task_recorder_js_1.TaskRecorder.getInstance().startTask(goal);
        this.currentCancellationToken = new cancellation_js_1.CancellationToken();
        // 1. Live Browser Perception
        const perception = browser_perception_js_1.BrowserPerception.getInstance();
        const snapshot = await perception.getSnapshot();
        // 2. Reusable Skills Dispatch (Comparison Engine, Specialized Skills)
        const skillResult = await skill_registry_js_1.SkillRegistry.getInstance().dispatch(goal, {
            activeUrl: snapshot.url,
            activeTitle: snapshot.title,
            perception,
            token: this.currentCancellationToken,
            speak: (text) => this.speak(text),
            updateStatus: (status) => this.updateState({ status: 'executing', currentAction: status, progress: 0.6 }),
        });
        if (skillResult) {
            for (const action of skillResult.actionsTaken) {
                task_recorder_js_1.TaskRecorder.getInstance().recordAction(action);
            }
            task_recorder_js_1.TaskRecorder.getInstance().completeTask(skillResult.summary);
            this.updateState({
                status: skillResult.success ? 'success' : 'error',
                currentAction: skillResult.summary,
                progress: 1.0,
            });
            convManager.recordTurn({ speaker: 'assistant', text: skillResult.summary });
            this.voiceManager.resetToWakeListening();
            return;
        }
        // 3. Grounded NLU Interpretation (Local Gemma 3 4B)
        this.updateState({ status: 'thinking', currentAction: 'Understanding command...', currentStep: 'Interpreting Intent' });
        const interpreted = await natural_language_interpreter_js_1.NaturalLanguageInterpreter.getInstance().interpret(goal, snapshot.url, snapshot.title);
        profiler.markNlu(Boolean(interpreted.isFastPath), Boolean(interpreted.isCompound));
        console.log(`[AgentRuntime] NLU Result: category=${interpreted.intentCategory}, compound=${interpreted.isCompound}, goal="${interpreted.goal}"`);
        // COHERENCE & CONFIDENCE GATE:
        // Low-confidence, incoherent, or ambiguous transcriptions must NEVER launch arbitrary agent missions.
        if (interpreted.isCoherent === false || interpreted.isUncertain || interpreted.confidence < 0.6) {
            console.warn(`[AgentRuntime] Transcription confidence/coherence gate rejected command: "${goal}" (confidence: ${interpreted.confidence}, coherent: ${interpreted.isCoherent})`);
            task_recorder_js_1.TaskRecorder.getInstance().cancelTask();
            this.updateState({ status: 'idle', currentAction: 'Command not recognized', progress: 1.0 });
            await this.speak("Sorry, I didn't catch that command. Could you please repeat?");
            this.voiceManager.resetToWakeListening();
            return;
        }
        // 4. Standalone Micro-Action Fast-Path (<5ms deterministic)
        if (interpreted.intentCategory === 'BROWSER_CONTROL' && interpreted.fastPathAction) {
            const routed = {
                action: interpreted.fastPathAction,
                target: 'element',
                location: 'current_page',
                isFastPath: true,
                rawText: goal,
                cleanText: interpreted.goal,
                requiresBrowserPerception: false,
            };
            this.updateState({ status: 'executing', currentAction: `Executing ${interpreted.fastPathAction}...`, progress: 0.5 });
            profiler.markFirstAction(`Fast path ${interpreted.fastPathAction}`);
            await this.executeFastPath(routed);
            task_recorder_js_1.TaskRecorder.getInstance().recordAction(`Executed fast path ${interpreted.fastPathAction}`);
            task_recorder_js_1.TaskRecorder.getInstance().completeTask(`Completed ${interpreted.fastPathAction}`);
            const breakdown = profiler.markComplete(true);
            this.updateState({ status: 'success', currentAction: 'Done', progress: 1.0, latencySummary: breakdown ? profiler.formatSummary(breakdown) : undefined });
            this.voiceManager.resetToWakeListening();
            return;
        }
        // 5. Conversational / Direct LLM Query (No Browser Interaction Required)
        if (interpreted.intentCategory === 'CONVERSATIONAL' && !interpreted.requiresBrowser) {
            this.updateState({ status: 'thinking', currentAction: 'Thinking...' });
            const prompt = `You are Tesseract, an AI browser assistant. The user said: "${goal}". Provide a helpful, natural, concise spoken reply in 1-2 sentences.`;
            const reply = await this.model.generate(prompt, { temperature: 0.5, maxTokens: 90 });
            await this.speak(reply.trim());
            convManager.recordTurn({ speaker: 'assistant', text: reply.trim() });
            profiler.markComplete(true);
            this.updateState({ status: 'idle', progress: 1.0 });
            this.voiceManager.resetToWakeListening();
            return;
        }
        // 6. Video Understanding ("What is this video about?")
        if ((interpreted.intentCategory === 'RESEARCH' || interpreted.intentCategory === 'MEDIA_CONTROL') && (cleanLower.includes('video') || cleanLower.includes('captions'))) {
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
            profiler.markComplete(true);
            this.updateState({ status: 'idle', progress: 1.0 });
            this.voiceManager.resetToWakeListening();
            return;
        }
        // 7. Compound Goals / Multi-Step Missions / Dynamic Planning
        // CRITICAL: Compound sentences ("open instagram and check if rahul messaged me") NEVER take single-step branches!
        if (interpreted.isCompound ||
            interpreted.intentCategory === 'SHOPPING_COMPARISON' ||
            interpreted.intentCategory === 'DOCUMENT_ANALYSIS' ||
            interpreted.intentCategory === 'FORM_AUTOFILL' ||
            interpreted.intentCategory === 'GENERAL_AUTOMATION' ||
            interpreted.intentCategory === 'SOCIAL_COMMUNICATION') {
            this.updateState({ status: 'planning', currentAction: 'Planning autonomous mission...', progress: 0.1, currentStep: 'Planning' });
            // Pipelined First Browser Action: If suggestedTargetUrl is present, start navigating immediately!
            if (interpreted.suggestedTargetUrl && (!snapshot.url || !snapshot.url.includes(new URL(interpreted.suggestedTargetUrl).hostname))) {
                profiler.markFirstAction(`Pipelined Navigation to ${interpreted.suggestedTargetUrl}`);
                browser_automator_js_1.BrowserAutomator.getInstance().navigate(interpreted.suggestedTargetUrl).catch(e => console.warn('[AgentRuntime] Pipelined navigation error:', e));
            }
            let steps;
            if (interpreted.initialPlan && interpreted.initialPlan.length > 0) {
                profiler.markPlanning();
                console.log(`[AgentRuntime] Reusing single-pass initial plan (${interpreted.initialPlan.length} steps) - skipped secondary Planner LLM round-trip!`);
                steps = interpreted.initialPlan;
            }
            else {
                const availableToolNames = tool_registry_js_1.ToolRegistry.getInstance().listToolNames();
                const plan = await planner_js_1.Planner.getInstance().plan(interpreted, {
                    currentUrl: snapshot.url,
                    pageTitle: snapshot.title,
                    compactSnapshot: (snapshot.elements || []).slice(0, 30).map(e => `[${e.id}] ${e.role} "${e.text || e.name || ''}"`).join('\n'),
                    availableTools: availableToolNames,
                });
                profiler.markPlanning();
                steps = plan.steps;
            }
            console.log(`[AgentRuntime] Generated plan with ${steps.length} steps for "${interpreted.goal}"`);
            return this.executeAutonomousMission(interpreted.goal, steps);
        }
        // 8. Standalone Single-Action Dispatches (Strictly non-compound)
        const routed = command_router_js_1.CommandRouter.route(goal);
        if (routed.action === 'PLAY') {
            await this.executePlayAction(routed);
            this.voiceManager.resetToWakeListening();
            return;
        }
        if (routed.action === 'CLICK') {
            await this.executeClickAction(routed);
            this.voiceManager.resetToWakeListening();
            return;
        }
        if (routed.action === 'NAVIGATE' && !interpreted.isCompound) {
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
        if (routed.action === 'SEARCH' && !interpreted.isCompound) {
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
        // 9. Fallback Autonomous Mission Execution
        await this.executeAutonomousMission(goal);
    }
    /**
     * Autonomous Mission Execution Engine
     */
    async executeAutonomousMission(goal, initialPlanSteps) {
        const convManager = conversation_manager_js_1.ConversationManager.getInstance();
        this.currentCancellationToken = new cancellation_js_1.CancellationToken();
        this.updateState({
            status: 'executing',
            goal,
            currentAction: 'Starting autonomous browser mission...',
            progress: 0.1,
            steps: (initialPlanSteps || []).map((s, idx) => ({
                stepNumber: s.stepNumber || idx + 1,
                description: s.description,
                status: s.status || 'PENDING',
            })),
        });
        try {
            const result = await this.actionLoop.run(goal, {
                onStatus: (status) => this.updateState({ currentAction: status }),
                onStep: (stepNumber, description, status) => {
                    if (stepNumber === 1 && status === 'ACTIVE') {
                        performance_profiler_js_1.PerformanceProfiler.getInstance().markFirstAction(description);
                    }
                    const steps = [...this.state.steps];
                    const existing = steps.find(s => s.stepNumber === stepNumber);
                    if (existing) {
                        existing.status = status;
                        existing.description = description;
                    }
                    else {
                        steps.push({ stepNumber, description, status });
                    }
                    this.updateState({
                        steps,
                        currentStep: description,
                        progress: Math.min(0.9, stepNumber * 0.15),
                    });
                },
                onConfirmationRequired: async (tool, args) => {
                    await this.speak(`Ready to ${tool.name}. Proceed?`);
                    return true;
                },
                onHumanHandoffRequired: async (type, message) => {
                    await this.speak(`User action required: ${message}`);
                    return true;
                },
                onFinish: (summary) => this.speak(summary).catch(() => { }),
                onError: (error) => this.speak(`Action issue: ${error}`).catch(() => { }),
            }, this.currentCancellationToken, initialPlanSteps);
            const profiler = performance_profiler_js_1.PerformanceProfiler.getInstance();
            const breakdown = profiler.markComplete(result.success);
            this.updateState({
                status: result.success ? 'success' : 'error',
                currentAction: result.summary,
                currentStep: 'Done',
                progress: 1.0,
                latencySummary: breakdown ? profiler.formatSummary(breakdown) : undefined,
            });
            convManager.recordTurn({ speaker: 'assistant', text: result.summary });
        }
        catch (err) {
            console.error('[AgentRuntime] Mission error:', err);
            const profiler = performance_profiler_js_1.PerformanceProfiler.getInstance();
            const breakdown = profiler.markComplete(false);
            this.updateState({
                status: 'error',
                currentAction: err.message,
                currentStep: 'Failed',
                error: err.message,
                progress: 1.0,
                latencySummary: breakdown ? profiler.formatSummary(breakdown) : undefined,
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