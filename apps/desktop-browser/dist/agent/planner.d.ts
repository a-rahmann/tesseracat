/**
 * Planner: Generates high-level mission plans using Local Gemma 3 4B.
 */
import { AgentModel } from '../ai/model.js';
export interface PlanStep {
    stepNumber: number;
    description: string;
    toolName: string;
    parameters: Record<string, any>;
}
export declare class Planner {
    private model;
    constructor(model: AgentModel);
    plan(goal: string): Promise<PlanStep[]>;
}
//# sourceMappingURL=planner.d.ts.map