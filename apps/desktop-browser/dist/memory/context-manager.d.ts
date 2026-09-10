/**
 * ContextManager: Resolves anaphoric references ("it", "that", "the second one").
 */
import { AgentGoal } from '../agent/types.js';
export interface ContextualEntities {
    activeUrl?: string;
    activeTitle?: string;
    activeVideo?: {
        title: string;
        channel?: string;
        url?: string;
    };
    lastOptions?: Array<{
        index: number;
        label: string;
        value: any;
    }>;
    lastSelectedEntity?: any;
}
export interface ChainStepNode {
    id: string;
    timestamp: number;
    goal: string;
    intentCategory: string;
    action?: string;
    platform?: string;
    query?: string;
    targetUrl?: string;
    resultSummary?: string;
    entities?: Record<string, any>;
}
export declare class ContextManager {
    private static instance;
    private currentContext;
    private chainHistory;
    private maxChainNodes;
    static getInstance(): ContextManager;
    updateContext(patch: Partial<ContextualEntities>): void;
    getContext(): ContextualEntities;
    /**
     * Chain Memory: Record a completed or executing command step into the chain.
     */
    recordChainStep(node: Omit<ChainStepNode, 'id' | 'timestamp'>): ChainStepNode;
    getChainHistory(): ChainStepNode[];
    getLastChainStep(): ChainStepNode | undefined;
    /**
     * Identifies the current platform from URL or recent chain memory.
     */
    getActivePlatform(activeUrl?: string): string | undefined;
    /**
     * Chain Memory Optimizer & Pruner:
     * "it understands what it did cuts the part and then does something it should find a much better and efficent way to solve requests"
     * Prunes redundant navigation or repetition when the requested platform is already active or in memory.
     */
    optimizeAndPrune(goal: AgentGoal, activeUrl: string): AgentGoal;
    setOptionsList(options: string[] | Array<{
        label: string;
        value: any;
    }>): void;
    /**
     * Resolves ordinal references:
     * "first", "second", "the 2nd one", "third", "last"
     */
    resolveOrdinal(text: string): {
        index: number;
        resolvedItem?: any;
    } | null;
    /**
     * Resolves pronouns "it", "this", "that", "this video".
     */
    resolvePronoun(text: string): {
        type: 'video' | 'page' | 'entity';
        referent: any;
    } | null;
}
//# sourceMappingURL=context-manager.d.ts.map