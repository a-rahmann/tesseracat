/**
 * TaskManager: Central 14-State Task Engine for Tesseract.
 * Enforces valid state transitions, human handoffs, and checkpointing.
 */
import { TaskState, PlanStep } from './types.js';
export interface ActiveTask {
    id: string;
    goal: string;
    state: TaskState;
    steps: PlanStep[];
    currentStepIndex: number;
    currentActionDescription?: string;
    activeUrl?: string;
    activeTabId?: string;
    error?: string;
    humanHandoffRequired?: {
        type: 'AUTH' | 'CAPTCHA' | 'PAYMENT' | 'PERMISSION' | 'CLARIFICATION';
        message: string;
        targetUrl?: string;
    };
    startedAt: number;
    updatedAt: number;
    completedAt?: number;
}
export type TaskStateListener = (task: ActiveTask) => void;
export declare class TaskManager {
    private static instance;
    private activeTask;
    private taskHistory;
    private listeners;
    private constructor();
    static getInstance(): TaskManager;
    getActiveTask(): ActiveTask | null;
    subscribe(listener: TaskStateListener): () => void;
    private notifyListeners;
    /**
     * Initializes a new task in CREATED state.
     */
    createTask(goal: string, steps?: PlanStep[]): ActiveTask;
    /**
     * Transition task to a new state with validation.
     */
    transitionState(newState: TaskState, patch?: Partial<ActiveTask>): void;
    updateStepStatus(stepNumber: number, status: PlanStep['status'], result?: any, error?: string): void;
    setPlanSteps(steps: PlanStep[]): void;
}
//# sourceMappingURL=task-manager.d.ts.map