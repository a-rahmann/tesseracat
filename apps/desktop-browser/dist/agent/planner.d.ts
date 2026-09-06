/**
 * Dynamic Mission Planner for Tesseract.
 * Generates grounded execution plans using local Gemma 3 4B.
 * Adapts to live browser observations, handles re-planning on failure, and avoids hallucinating selectors.
 */
import { AgentGoal, AgentPlan, PlanStep } from './types.js';
import { AgentModel } from '../ai/model.js';
export interface PlannerContext {
    currentUrl: string;
    pageTitle: string;
    compactSnapshot?: string;
    availableTools: string[];
}
export declare class Planner {
    private static instance;
    private model;
    constructor(model?: AgentModel);
    static getInstance(): Planner;
    /**
     * Generates a multi-step execution plan for an AgentGoal.
     */
    plan(goal: AgentGoal, context: PlannerContext): Promise<AgentPlan>;
    /**
     * Generates a revised plan when an action fails or the DOM changes unexpectedly.
     */
    replan(goal: string, failedStep: PlanStep, failureReason: string, context: PlannerContext): Promise<PlanStep[]>;
    /**
     * Deterministic template planner for core known scenarios when offline or LLM fails.
     */
    private createFallbackPlan;
}
//# sourceMappingURL=planner.d.ts.map