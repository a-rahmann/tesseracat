/**
 * TaskMacroCache: Remembers executed tasks and verified multi-step workflows.
 * Enables instantaneous (<1ms) execution of similar tasks and cuts redundant preloading steps.
 *
 * User specification:
 * "make processing faster for taks given learn from tasks so its instant and make sure the task is saved
 * so it can be instantanous wheneever asking a task swith fimilar steps ot cuts the previous step
 * from preloading and does the second part of task which is new and remembers it like chatgpt"
 */
import { PlanStep } from '../agent/types.js';
export interface TaskMacro {
    id: string;
    goal: string;
    normalizedPattern: string;
    domain?: string;
    intentCategory?: string;
    suggestedTargetUrl?: string;
    steps: PlanStep[];
    successCount: number;
    timestamp: number;
    lastUsed: number;
}
export declare class TaskMacroCache {
    private static instance;
    private filePath;
    private macros;
    private maxMacros;
    private constructor();
    static getInstance(): TaskMacroCache;
    private load;
    private save;
    /**
     * Normalizes a user command into an intent template.
     * e.g. "open youtube and play a random video" -> "youtube:play:video"
     * e.g. "play bohemian rhapsody on youtube" -> "youtube:play"
     */
    normalizeGoal(goal: string): string;
    /**
     * Records a successfully executed workflow into persistent memory.
     */
    recordTaskMacro(goal: string, steps: PlanStep[], domain?: string, intentCategory?: string, suggestedTargetUrl?: string): TaskMacro;
    /**
     * Matches a new request against learned task workflows.
     */
    findSimilarMacro(goal: string, activeUrl?: string): TaskMacro | undefined;
    /**
     * DYNAMIC STEP CUTTER:
     * "cuts the previous step from preloading and does the second part of task which is new"
     * If Step 1 is navigating to a site, and the browser is ALREADY on that site,
     * prunes Step 1 completely and returns the remaining steps starting directly with the new action!
     */
    cutRedundantPreloadSteps(steps: PlanStep[], activeUrl?: string): {
        steps: PlanStep[];
        wasCut: boolean;
        cutDescription?: string;
    };
    getAllMacros(): TaskMacro[];
    clearMacros(): void;
}
//# sourceMappingURL=task-macro-cache.d.ts.map