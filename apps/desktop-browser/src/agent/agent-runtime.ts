/**
 * AgentRuntime: Authoritative Autonomous Execution Engine for Tesseract.
 * Invariant: ACTION != SEARCH. Never default to Google search.
 * Target-aware execution: WHAT, WHERE, ACTION with verified live browser state.
 */

import { VoiceManager } from '../voice/voice-manager.js';
import { CommandRouter, RoutedCommand } from './command-router.js';
import { OllamaGemmaModel } from '../ai/ollama-gemma.js';
import { ActionLoop } from './action-loop.js';
import { CancellationToken } from './cancellation.js';
import { ConversationManager } from '../memory/conversation-manager.js';
import { ContextManager } from '../memory/context-manager.js';
import { MemoryRetriever } from '../memory/memory-retriever.js';
import { YouTubeAdapter } from '../adapters/youtube.js';
import { InstagramAdapter } from '../adapters/instagram.js';
import { BrowserAutomator } from '../browser/browser-automator.js';
import { BrowserPerception } from '../browser/browser-perception.js';
import { MediaController } from '../browser/media-controller.js';
import { SkillRegistry } from '../skills/skill-registry.js';
import { TaskRecorder } from './task-recorder.js';
import { TaskCheckpointManager } from './task-checkpoint-manager.js';
import { TemporalMemory } from '../memory/temporal-memory.js';
import { BrowserStateStore } from '../memory/browser-state-store.js';
import { NaturalLanguageInterpreter } from './natural-language-interpreter.js';
import { TaskManager } from './task-manager.js';
import { Planner } from './planner.js';
import { ToolRegistry } from './tool-registry.js';
import { WebSpeechTTSProvider } from '../voice/tts-provider.js';
import { AgentGoal, PlanStep } from './types.js';
import { PerformanceProfiler } from './performance-profiler.js';

export interface AgentTaskState {
  status: 'idle' | 'thinking' | 'planning' | 'executing' | 'speaking' | 'success' | 'error';
  goal?: string;
  currentAction?: string;
  progress: number;
  steps: Array<{ stepNumber: number; description: string; status: string }>;
  error?: string;
  currentStep?: string;
  latencySummary?: string;
}

export type AgentStateListener = (state: AgentTaskState) => void;

export class AgentRuntime {
  private static instance: AgentRuntime | null = null;

  private voiceManager: VoiceManager;
  private model: OllamaGemmaModel;
  private actionLoop: ActionLoop;
  private tts: WebSpeechTTSProvider;
  private currentCancellationToken: CancellationToken | null = null;

  private state: AgentTaskState = {
    status: 'idle',
    progress: 0,
    steps: [],
  };

  private listeners: Set<AgentStateListener> = new Set();

  private constructor() {
    this.voiceManager = VoiceManager.getInstance();
    this.model = new OllamaGemmaModel('gemma3:4b');
    this.actionLoop = new ActionLoop(this.model, 8);
    this.tts = new WebSpeechTTSProvider();

    // Bind voice command execution
    this.voiceManager.onCommand(async (commandText: string) => {
      await this.handleUserCommand(commandText);
    });

    // Bind voice interruption
    this.voiceManager.onInterruption(() => {
      this.cancelActiveTask();
    });
  }

  public static getInstance(): AgentRuntime {
    if (!AgentRuntime.instance) {
      AgentRuntime.instance = new AgentRuntime();
    }
    return AgentRuntime.instance;
  }

  public getState(): AgentTaskState {
    return { ...this.state };
  }

  public subscribe(listener: AgentStateListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  private updateState(patch: Partial<AgentTaskState>): void {
    this.state = { ...this.state, ...patch };
    const snap = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(snap);
      } catch (err) {
        console.error('[AgentRuntime] Listener error:', err);
      }
    }
  }

  public cancelActiveTask(): void {
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

  public async speak(text: string): Promise<void> {
    if (!text) return;

    this.voiceManager.setSpeaking();
    this.updateState({ status: 'speaking', currentAction: text });

    try {
      await this.tts.speak(text);
    } finally {
      this.voiceManager.setSpeakingTTS(false);
    }
  }

  /**
   * Main command dispatch pipeline.
   * Architecture: Voice/Text -> NLU Interpreter (Gemma 3 4B) -> Task Manager -> Dynamic Planner -> Action Loop.
   * Legacy greedy regex waterfall eliminated.
   */
  public async handleUserCommand(rawCommand: string): Promise<void> {
    const goal = rawCommand.trim();
    if (!goal) {
      this.voiceManager.resetToWakeListening();
      return;
    }

    console.log(`[AgentRuntime] Received command: "${goal}"`);
    const convManager = ConversationManager.getInstance();
    convManager.recordTurn({ speaker: 'user', text: goal });

    const cleanLower = goal.toLowerCase();

    // 0a. Voice Interruption: "Stop", "Wait", "Actually don't do that", "Cancel"
    if (/^(?:stop|wait|cancel|abort|pause\s+task|actually\s+(?:don't|stop)|never\s*mind)\b/i.test(cleanLower)) {
      this.cancelActiveTask();
      TaskRecorder.getInstance().cancelTask();
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
      const explanation = TaskRecorder.getInstance().explainCurrentActivity();
      await this.speak(explanation);
      this.voiceManager.resetToWakeListening();
      return;
    }

    // 0d. Action Log Queries: "What did you do?"
    if (/what\s+(?:did\s+you\s+do|have\s+you\s+done)/i.test(cleanLower)) {
      const past = TaskRecorder.getInstance().explainPastActivity();
      await this.speak(past);
      this.voiceManager.resetToWakeListening();
      return;
    }

    // 0e. Checkpoint Resumption: "Continue what I was doing" / "Resume task"
    if (/^(?:continue\s+what\s+(?:i|we)\s+was\s+doing|resume(?:\s+task)?|continue)\b/i.test(cleanLower)) {
      const cp = TaskCheckpointManager.getInstance().getLatestCheckpoint();
      if (cp) {
        await this.speak(`Resuming task: "${cp.goal}".`);
        const steps: PlanStep[] = (cp.remainingSteps || []).map((desc, idx) => ({
          stepNumber: idx + 1,
          description: desc,
          toolName: 'browser',
          parameters: {},
          status: 'PENDING' as const,
        }));
        return this.executeAutonomousMission(cp.goal, steps);
      } else {
        await this.speak("I don't have any unfinished task checkpoints saved.");
        this.voiceManager.resetToWakeListening();
        return;
      }
    }

    // 0f. Temporal Memory Query: "What did Rahul say earlier?", "What did we talk about four minutes ago?"
    if (/what\s+(?:did|was|were)|remember\s+what|four\s+minutes\s+ago|earlier\s+in/i.test(cleanLower) && !cleanLower.includes('video')) {
      const temporal = TemporalMemory.getInstance().parseAndQuery(goal);
      if (temporal.records.length > 0) {
        await this.speak(temporal.explanation);
        this.voiceManager.resetToWakeListening();
        return;
      }
    }

    // Performance Profiler instrumentation
    const profiler = PerformanceProfiler.getInstance();
    profiler.startCommand(goal);

    // 0g. Deterministic Fast-Path Detection (<1ms, zero LLM, zero perception overhead)
    const fastPathGoal = NaturalLanguageInterpreter.getInstance().detectFastPathIntent(goal);
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
        const navPromise = BrowserAutomator.getInstance().navigate(navUrl).then((res) => {
          const navElapsed = Date.now() - navStartTime;
          profiler.markNavigationWait(navElapsed);
          profiler.markPageReady();
          console.log(`[AgentRuntime] Background navigation to ${navUrl} completed in ${navElapsed}ms.`);
          return res;
        }).catch(err => console.warn('[AgentRuntime] Background navigation warning:', err));

        // In standalone mode or test suite, allow dispatch to count as task initiation immediately
      } else if (fastPathGoal.fastPathAction === 'SCROLL') {
        profiler.markFirstAction(`Scroll ${fastPathGoal.entities.direction || 'down'}`);
        await BrowserAutomator.getInstance().scroll(fastPathGoal.entities.direction === 'up' ? 'up' : 'down', 450);
      } else if (fastPathGoal.fastPathAction === 'PLAY' && fastPathGoal.suggestedTargetUrl) {
        profiler.markFirstAction(`Playing ${fastPathGoal.entities.query || 'media'}`);
        profiler.markNavDispatch(fastPathGoal.suggestedTargetUrl);
        const navUrl = fastPathGoal.suggestedTargetUrl;
        const ackText = fastPathGoal.spokenAcknowledgment || 'Playing media.';

        profiler.markTtsStart(ackText);
        this.speak(ackText).finally(() => profiler.markTtsEnd()).catch(() => {});
        BrowserAutomator.getInstance().navigate(navUrl).catch(() => {});
      } else if (fastPathGoal.fastPathAction === 'SEARCH' && fastPathGoal.suggestedTargetUrl) {
        profiler.markFirstAction(`Searching ${fastPathGoal.entities.query}`);
        profiler.markNavDispatch(fastPathGoal.suggestedTargetUrl);
        const navUrl = fastPathGoal.suggestedTargetUrl;
        const ackText = fastPathGoal.spokenAcknowledgment || 'Searching.';

        profiler.markTtsStart(ackText);
        this.speak(ackText).finally(() => profiler.markTtsEnd()).catch(() => {});
        BrowserAutomator.getInstance().navigate(navUrl).catch(() => {});
      } else {
        const routed: RoutedCommand = {
          action: fastPathGoal.fastPathAction as any,
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
      TaskRecorder.getInstance().recordAction(`Executed fast path: ${fastPathGoal.goal}`);
      TaskRecorder.getInstance().completeTask(`Completed ${fastPathGoal.goal}`);
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
        BrowserAutomator.getInstance().navigate(fastPathGoal.suggestedTargetUrl).catch(e => console.warn('[AgentRuntime] Pipelined navigation warning:', e));
      }

      return this.executeAutonomousMission(fastPathGoal.goal, fastPathGoal.initialPlan);
    }

    // Begin Recording Task
    TaskRecorder.getInstance().startTask(goal);
    this.currentCancellationToken = new CancellationToken();

    // 1. Live Browser Perception
    const perception = BrowserPerception.getInstance();
    const snapshot = await perception.getSnapshot();

    // 2. Reusable Skills Dispatch (Comparison Engine, Specialized Skills)
    const skillResult = await SkillRegistry.getInstance().dispatch(goal, {
      activeUrl: snapshot.url,
      activeTitle: snapshot.title,
      perception,
      token: this.currentCancellationToken,
      speak: (text) => this.speak(text),
      updateStatus: (status) => this.updateState({ status: 'executing', currentAction: status, progress: 0.6 }),
    });

    if (skillResult) {
      for (const action of skillResult.actionsTaken) {
        TaskRecorder.getInstance().recordAction(action);
      }
      TaskRecorder.getInstance().completeTask(skillResult.summary);
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
    const interpreted: AgentGoal = await NaturalLanguageInterpreter.getInstance().interpret(
      goal,
      snapshot.url,
      snapshot.title
    );
    profiler.markNlu(Boolean(interpreted.isFastPath), Boolean(interpreted.isCompound));
    console.log(`[AgentRuntime] NLU Result: category=${interpreted.intentCategory}, compound=${interpreted.isCompound}, goal="${interpreted.goal}"`);

    // COHERENCE & CONFIDENCE GATE:
    // Low-confidence, incoherent, or ambiguous transcriptions must NEVER launch arbitrary agent missions.
    if (interpreted.isCoherent === false || interpreted.isUncertain || interpreted.confidence < 0.6) {
      console.warn(`[AgentRuntime] Transcription confidence/coherence gate rejected command: "${goal}" (confidence: ${interpreted.confidence}, coherent: ${interpreted.isCoherent})`);
      TaskRecorder.getInstance().cancelTask();
      this.updateState({ status: 'idle', currentAction: 'Command not recognized', progress: 1.0 });
      await this.speak("Sorry, I didn't catch that command. Could you please repeat?");
      this.voiceManager.resetToWakeListening();
      return;
    }

    // 4. Standalone Micro-Action Fast-Path (<5ms deterministic)
    if (interpreted.intentCategory === 'BROWSER_CONTROL' && interpreted.fastPathAction) {
      const routed: RoutedCommand = {
        action: interpreted.fastPathAction as any,
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
      TaskRecorder.getInstance().recordAction(`Executed fast path ${interpreted.fastPathAction}`);
      TaskRecorder.getInstance().completeTask(`Completed ${interpreted.fastPathAction}`);
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
      const videoData = await YouTubeAdapter.getCurrentVideo();
      if (videoData.title) {
        const prompt = `User asks: "${goal}".
Video Title: "${videoData.title}"
Channel: "${videoData.channel}"
Description: "${videoData.description.slice(0, 250)}"
Captions/Transcript: "${videoData.transcriptSnippet || videoData.captions || 'None available'}"
Give a concise 2-sentence spoken response answering their question based on actual video information.`;
        const answer = await this.model.generate(prompt, { temperature: 0.3, maxTokens: 120 });
        await this.speak(answer.trim());
      } else {
        await this.speak("I don't see an active video on this page.");
      }
      profiler.markComplete(true);
      this.updateState({ status: 'idle', progress: 1.0 });
      this.voiceManager.resetToWakeListening();
      return;
    }

    // 7. Compound Goals / Multi-Step Missions / Dynamic Planning
    // CRITICAL: Compound sentences ("open instagram and check if rahul messaged me") NEVER take single-step branches!
    if (
      interpreted.isCompound ||
      interpreted.intentCategory === 'SHOPPING_COMPARISON' ||
      interpreted.intentCategory === 'DOCUMENT_ANALYSIS' ||
      interpreted.intentCategory === 'FORM_AUTOFILL' ||
      interpreted.intentCategory === 'GENERAL_AUTOMATION' ||
      interpreted.intentCategory === 'SOCIAL_COMMUNICATION'
    ) {
      this.updateState({ status: 'planning', currentAction: 'Planning autonomous mission...', progress: 0.1, currentStep: 'Planning' });

      // Pipelined First Browser Action: If suggestedTargetUrl is present, start navigating immediately!
      if (interpreted.suggestedTargetUrl && (!snapshot.url || !snapshot.url.includes(new URL(interpreted.suggestedTargetUrl).hostname))) {
        profiler.markFirstAction(`Pipelined Navigation to ${interpreted.suggestedTargetUrl}`);
        BrowserAutomator.getInstance().navigate(interpreted.suggestedTargetUrl).catch(e => console.warn('[AgentRuntime] Pipelined navigation error:', e));
      }

      let steps: PlanStep[];
      if (interpreted.initialPlan && interpreted.initialPlan.length > 0) {
        profiler.markPlanning();
        console.log(`[AgentRuntime] Reusing single-pass initial plan (${interpreted.initialPlan.length} steps) - skipped secondary Planner LLM round-trip!`);
        steps = interpreted.initialPlan;
      } else {
        const availableToolNames = ToolRegistry.getInstance().listToolNames();
        const plan = await Planner.getInstance().plan(interpreted, {
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
    const routed: RoutedCommand = CommandRouter.route(goal);

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
      const siteUrls: Record<string, string> = {
        youtube: 'https://www.youtube.com',
        instagram: 'https://www.instagram.com',
        gmail: 'https://mail.google.com',
        amazon: 'https://www.amazon.com',
      };
      const url = siteUrls[routed.location] || (routed.query ? `https://${routed.query}` : 'https://www.google.com');
      this.updateState({ status: 'executing', currentAction: `Opening ${routed.location}...`, progress: 0.6 });
      await BrowserAutomator.getInstance().navigate(url);
      await this.speak(`Opened ${routed.location}.`);
      this.updateState({ status: 'success', currentAction: 'Done', progress: 1.0 });
      this.voiceManager.resetToWakeListening();
      return;
    }

    if (routed.action === 'SEARCH' && !interpreted.isCompound) {
      if (routed.location === 'youtube' && routed.query) {
        this.updateState({ status: 'executing', currentAction: `Searching YouTube for "${routed.query}"...`, progress: 0.6 });
        await YouTubeAdapter.search(routed.query);
        await this.speak(`Searching YouTube for ${routed.query}.`);
      } else if (routed.location === 'google' && routed.query) {
        this.updateState({ status: 'executing', currentAction: `Searching Google for "${routed.query}"...`, progress: 0.6 });
        await BrowserAutomator.getInstance().navigate(`https://www.google.com/search?q=${encodeURIComponent(routed.query)}`);
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
  private async executeAutonomousMission(goal: string, initialPlanSteps?: PlanStep[]): Promise<void> {
    const convManager = ConversationManager.getInstance();
    this.currentCancellationToken = new CancellationToken();
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
      const result = await this.actionLoop.run(
        goal,
        {
          onStatus: (status) => this.updateState({ currentAction: status }),
          onStep: (stepNumber, description, status) => {
            if (stepNumber === 1 && status === 'ACTIVE') {
              PerformanceProfiler.getInstance().markFirstAction(description);
            }
            const steps = [...this.state.steps];
            const existing = steps.find(s => s.stepNumber === stepNumber);
            if (existing) {
              existing.status = status;
              existing.description = description;
            } else {
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
          onFinish: (summary) => this.speak(summary).catch(() => {}),
          onError: (error) => this.speak(`Action issue: ${error}`).catch(() => {}),
        },
        this.currentCancellationToken,
        initialPlanSteps
      );

      const profiler = PerformanceProfiler.getInstance();
      const breakdown = profiler.markComplete(result.success);

      this.updateState({
        status: result.success ? 'success' : 'error',
        currentAction: result.summary,
        currentStep: 'Done',
        progress: 1.0,
        latencySummary: breakdown ? profiler.formatSummary(breakdown) : undefined,
      });
      convManager.recordTurn({ speaker: 'assistant', text: result.summary });
    } catch (err: any) {
      console.error('[AgentRuntime] Mission error:', err);
      const profiler = PerformanceProfiler.getInstance();
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
    } finally {
      this.currentCancellationToken = null;
      this.voiceManager.resetToWakeListening();
    }
  }

  /**
   * Verified Multi-step PLAY Action:
   * "Play Loser on YouTube" -> Open YouTube -> Search "Loser" -> Click Result -> Verify Playback
   */
  private async executePlayAction(cmd: RoutedCommand): Promise<void> {
    const automator = BrowserAutomator.getInstance();
    const media = MediaController.getInstance();

    if (cmd.location === 'youtube' && cmd.query) {
      this.updateState({ status: 'executing', currentAction: `Searching YouTube for "${cmd.query}"...`, progress: 0.4 });
      const res = await YouTubeAdapter.searchAndPlay(cmd.query, cmd.index || 1);
      if (res.success) {
        this.updateState({ status: 'success', currentAction: `Playing "${res.title || cmd.query}"`, progress: 1.0 });
        await this.speak(`Playing "${res.title || cmd.query}" on YouTube.`);
      } else {
        this.updateState({ status: 'error', currentAction: 'Playback verification failed', progress: 1.0 });
        await this.speak(`I found ${cmd.query} on YouTube, but video playback could not be verified.`);
      }
      return;
    }

    // "Play the video on my screen" / "Play the first video"
    this.updateState({ status: 'executing', currentAction: 'Locating video on screen...', progress: 0.5 });
    const targetEl = await BrowserPerception.getInstance().findMatchingElement(cmd.query, 'video', cmd.index || 1);

    if (targetEl) {
      await automator.click({ elementId: targetEl.id });
      const isPlaying = await media.verifyPlaying(3000);
      if (isPlaying) {
        await this.speak('Playing video.');
      } else {
        await media.play();
        await this.speak('Started video playback.');
      }
      this.updateState({ status: 'success', currentAction: 'Done', progress: 1.0 });
    } else {
      // Direct media element fallback
      const playRes = await media.play();
      if (playRes.success) {
        await this.speak('Resumed playback.');
        this.updateState({ status: 'success', currentAction: 'Playing', progress: 1.0 });
      } else {
        await this.speak("I couldn't locate a playable video on this screen.");
        this.updateState({ status: 'error', currentAction: 'No video on screen', progress: 1.0 });
      }
    }
  }

  /**
   * Verified Contextual CLICK Action:
   * "Click the video on my screen", "Click the blue button", "Click Rahul"
   */
  private async executeClickAction(cmd: RoutedCommand): Promise<void> {
    const automator = BrowserAutomator.getInstance();
    const perception = BrowserPerception.getInstance();

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
    } else {
      console.warn(`[AgentRuntime] Could not locate "${desc}" on active screen. NOT defaulting to Google search.`);
      await this.speak(`I couldn't find "${desc}" on your screen.`);
      this.updateState({ status: 'error', currentAction: `Element not found: ${desc}`, progress: 1.0 });
    }
  }

  private async executeFastPath(cmd: RoutedCommand): Promise<void> {
    const automator = BrowserAutomator.getInstance();
    const media = MediaController.getInstance();

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
