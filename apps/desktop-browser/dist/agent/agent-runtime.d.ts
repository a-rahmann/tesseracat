/**
 * AgentRuntime: Authoritative Autonomous Execution Engine for Tesseract.
 * Integrates Voice, FastPathClassifier, Local Gemma 3 4B, ActionLoop, Conversational Memory, and Adapters.
 */
export interface AgentTaskState {
    status: 'idle' | 'thinking' | 'executing' | 'speaking' | 'success' | 'error';
    goal?: string;
    currentAction?: string;
    progress: number;
    steps: Array<{
        stepNumber: number;
        description: string;
        status: string;
    }>;
    error?: string;
}
export type AgentStateListener = (state: AgentTaskState) => void;
export declare class AgentRuntime {
    private static instance;
    private voiceManager;
    private model;
    private actionLoop;
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
     */
    handleUserCommand(rawCommand: string): Promise<void>;
    private executeFastPathAction;
}
//# sourceMappingURL=agent-runtime.d.ts.map