/**
 * Unified Autonomous Action Loop for Tesseract.
 * OBSERVE -> REASON -> POLICY -> ACT -> VERIFY -> SELF-CORRECT/REPLAN.
 * Features:
 * - Set-of-Marks ID resolution with live DOM fallback
 * - Strict ~1,500 token budget enforcement
 * - Robust prompt-injection defense with explicit context delimiters
 * - Verification after every critical action
 * - Self-correction without infinite selector retry loops
 * - Built-in Human Handoffs (AUTH_REQUIRED, CAPTCHA_REQUIRED, PAYMENT_REQUIRED)
 * - Continuous checkpoint persistence
 */
import { AgentModel } from '../ai/model.js';
import { AgentTool } from './tool-registry.js';
import { CancellationToken } from './cancellation.js';
import { PlanStep } from './types.js';
export interface ActionLoopCallbacks {
    onStatus: (status: string) => void;
    onStep: (stepNumber: number, description: string, status: 'ACTIVE' | 'SUCCESS' | 'FAILED') => void;
    onConfirmationRequired: (tool: AgentTool, args: any) => Promise<boolean>;
    onHumanHandoffRequired?: (type: 'AUTH' | 'CAPTCHA' | 'PAYMENT' | 'CLARIFICATION', message: string) => Promise<boolean>;
    onFinish: (summary: string) => void;
    onError: (error: string) => void;
}
export declare class ActionLoop {
    private model;
    private maxSteps;
    private maxRetriesPerAction;
    constructor(model: AgentModel, maxSteps?: number);
    run(goal: string, callbacks: ActionLoopCallbacks, token: CancellationToken, initialPlanSteps?: PlanStep[]): Promise<{
        success: boolean;
        summary: string;
    }>;
    /**
     * 7-Stage Intelligent Recovery:
     * 1. Observe current page state
     * 2. Identify failure reason & alternative candidates
     * 3. Replan via Gemma 3 planner
     * 4. Execute alternative recovery step
     * 5. Verify the intended outcome
     * 6. Only then mark the step recovered
     */
    private attemptIntelligentRecovery;
    /**
     * Verifies that a recovery step produced an observable state or DOM transition.
     */
    private verifyRecoveryOutcome;
    private verifyStepOutcome;
    private waitForPageStabilization;
    private waitForAuthenticationSuccess;
}
//# sourceMappingURL=action-loop.d.ts.map