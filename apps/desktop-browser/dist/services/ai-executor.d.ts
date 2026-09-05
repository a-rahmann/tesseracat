/**
 * AIExecutionCoordinator: Calm, autonomous background task execution engine.
 * Coordinates with BrowserAutomator, IntentEngine, and VoiceManager.
 *
 * CRITICAL UX RULE:
 * Autonomous task execution must NEVER automatically open the sidebar or drawers.
 * Status is surfaced non-intrusively via the calm floating activity pill.
 */
import { StructuredIntent } from './intent-engine.js';
export type AIExecutionStatus = 'idle' | 'thinking' | 'executing' | 'waiting' | 'success' | 'error';
export interface AIStep {
    id: string;
    stepNumber: number;
    description: string;
    status: 'PENDING' | 'ACTIVE' | 'SUCCESS' | 'FAILED';
    result?: any;
}
export interface AIExecutionState {
    status: AIExecutionStatus;
    taskId?: string;
    goal?: string;
    currentAction?: string;
    progress: number;
    steps: AIStep[];
    requiresApproval?: boolean;
    approvalPayload?: any;
    error?: string;
}
export type AIStateListener = (state: AIExecutionState) => void;
export declare class AIExecutionCoordinator {
    private static instance;
    private state;
    private listeners;
    private automator;
    private collapseTimer;
    private activeUtterances;
    private constructor();
    static getInstance(): AIExecutionCoordinator;
    getState(): AIExecutionState;
    subscribe(listener: AIStateListener): () => void;
    private updateState;
    /**
     * Speak aloud using TTS while coordinating with VoiceManager to prevent self-triggering.
     * Defends against Chromium Web Speech garbage collection bugs by retaining utterance refs.
     */
    speak(text: string): Promise<void>;
    /**
     * Execute an autonomous task directly from a StructuredIntent without UI intervention.
     */
    executeIntent(intent: StructuredIntent): Promise<void>;
    private scheduleAutoCollapse;
}
//# sourceMappingURL=ai-executor.d.ts.map