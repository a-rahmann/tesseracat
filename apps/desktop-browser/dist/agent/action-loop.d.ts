/**
 * Autonomous Action Loop: OBSERVE -> THINK -> ACTION -> OBSERVE.
 * With self-correction (max 3 retries), cancellation tokens, and safety policy approvals.
 */
import { AgentModel } from '../ai/model.js';
import { AgentTool } from './tool-registry.js';
import { CancellationToken } from './cancellation.js';
export interface ActionLoopCallbacks {
    onStatus: (status: string) => void;
    onStep: (stepNumber: number, description: string, status: 'ACTIVE' | 'SUCCESS' | 'FAILED') => void;
    onConfirmationRequired: (tool: AgentTool, args: any) => Promise<boolean>;
    onFinish: (summary: string) => void;
    onError: (error: string) => void;
}
export interface StepActionDecision {
    thought: string;
    tool: string;
    arguments: Record<string, any>;
    isFinalStep?: boolean;
}
export declare class ActionLoop {
    private model;
    private maxSteps;
    private maxRetriesPerAction;
    constructor(model: AgentModel, maxSteps?: number);
    run(goal: string, callbacks: ActionLoopCallbacks, token: CancellationToken): Promise<{
        success: boolean;
        summary: string;
    }>;
}
//# sourceMappingURL=action-loop.d.ts.map