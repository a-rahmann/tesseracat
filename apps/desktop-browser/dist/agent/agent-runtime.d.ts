/**
 * AgentRuntime: Authoritative Autonomous Execution Engine for Tesseract.
 * Invariant: ACTION != SEARCH. Never default to Google search.
 * Target-aware execution: WHAT, WHERE, ACTION with verified live browser state.
 */
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
    private state;
    private listeners;
    private constructor();
    static getInstance(): AgentRuntime;
    getState(): AgentTaskState;
    subscribe(listener: AgentStateListener): () => void;
    private updateState;
    cancelActiveTask(): void;
    speak(text: string): Promise<void>;
    /**
     * Main command dispatch pipeline.
     * Architecture: Voice/Text -> NLU Interpreter (Gemma 3 4B) -> Task Manager -> Dynamic Planner -> Action Loop.
     * Legacy greedy regex waterfall eliminated.
     */
    handleUserCommand(rawCommand: string): Promise<void>;
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