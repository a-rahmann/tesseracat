/**
 * AgentRuntime: Authoritative Autonomous Execution Engine for Tesseract.
 * Invariant: ACTION != SEARCH. Never default to Google search.
 * Target-aware execution: WHAT, WHERE, ACTION with verified live browser state.
 */
import { VoiceCommandPayload } from '../voice/voice-manager.js';
export interface AgentTaskState {
    status: 'idle' | 'thinking' | 'planning' | 'executing' | 'speaking' | 'success' | 'error';
    goal?: string;
    currentAction?: string;
    progress: number;
    steps: Array<{
        stepNumber: number;
        description: string;
        status: string;
    }>;
    error?: string;
    errorDetails?: {
        message: string;
        stepNumber?: number;
        toolName?: string;
        suggestedRemedy?: string;
        canAutoRetry: boolean;
    };
    currentStep?: string;
    latencySummary?: string;
}
export type AgentStateListener = (state: AgentTaskState) => void;
export declare class AgentRuntime {
    private static instance;
    private voiceManager;
    private model;
    private actionLoop;
    private tts;
    private currentCancellationToken;
    private lastExecutedGoal?;
    private state;
    private listeners;
    private constructor();
    static getInstance(): AgentRuntime;
    getState(): AgentTaskState;
    subscribe(listener: AgentStateListener): () => void;
    private updateState;
    cancelActiveTask(): void;
    /**
     * User Manual Override:
     * Called when the user clicks/interacts with the webview or video during autonomous execution.
     * Immediately halts execution, stops TTS speech, and gives control back to the user without conflict.
     */
    handleUserOverride(): void;
    /**
     * Re-runs the active or last failed task using self-healing / alternative recovery.
     * Can be triggered directly by the user via voice/text or via the HUD [Auto-Resolve & Retry] button.
     */
    retryActiveTaskWithRecovery(userCorrection?: string): Promise<void>;
    speak(text: string): Promise<void>;
    /**
     * Main command dispatch pipeline.
     * Architecture: Voice/Text -> NLU Interpreter (Gemma 3 4B) -> Task Manager -> Dynamic Planner -> Action Loop.
     * Legacy greedy regex waterfall eliminated.
     */
    handleUserCommand(commandInput: string | VoiceCommandPayload): Promise<void>;
    /**
     * Autonomous Mission Execution Engine
     */
    private executeAutonomousMission;
    /**
     * Verified Multi-step PLAY Action:
     * "Play Loser on YouTube" -> Open YouTube -> Search "Loser" -> Click Result -> Verify Playback
     */
    private executePlayAction;
    /**
     * Verified Contextual CLICK Action:
     * "Click the video on my screen", "Click the blue button", "Click Rahul"
     */
    private executeClickAction;
    private executeFastPath;
}
//# sourceMappingURL=agent-runtime.d.ts.map