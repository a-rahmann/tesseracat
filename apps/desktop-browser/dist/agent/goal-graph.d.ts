/**
 * Goal Graph and Explicit Completion Contract for Tesseract.
 *
 * Enforces strict completion semantics:
 * - A mission CANNOT be marked COMPLETED unless all goal nodes and their verification predicates succeed.
 * - Multi-step tasks ("Open YouTube and play a random video") must satisfy every step's verification gate.
 * - Automatically retries failed nodes or fails fast with diagnostic reasons.
 */
export type GoalNodeStatus = 'PENDING' | 'RUNNING' | 'VERIFYING' | 'COMPLETED' | 'FAILED' | 'RETRYING';
export interface GoalVerificationContext {
    graph: GoalGraph;
    node: GoalNode;
    nodeResults: Map<string, any>;
    customData?: any;
}
export type GoalVerificationFn = (ctx: GoalVerificationContext) => Promise<boolean> | boolean;
export interface GoalNode {
    id: string;
    description: string;
    action: (ctx: GoalVerificationContext) => Promise<any>;
    verification: GoalVerificationFn;
    dependsOn?: string[];
    maxRetries?: number;
    retryCount?: number;
    status: GoalNodeStatus;
    result?: any;
    error?: string;
}
export declare class GoalGraph {
    goal: string;
    status: 'PENDING' | 'EXECUTING' | 'COMPLETED' | 'FAILED';
    private nodes;
    private nodeResults;
    private onNodeStateChange?;
    constructor(goal: string);
    addNode(node: Omit<GoalNode, 'status' | 'retryCount'>): this;
    getNode(id: string): GoalNode | undefined;
    getNodes(): GoalNode[];
    getProgress(): number;
    setOnNodeStateChange(cb: (node: GoalNode) => void): void;
    /**
     * Executes the entire goal graph respecting topological dependencies.
     * Returns true ONLY if all nodes pass their verification gates.
     */
    execute(customData?: any): Promise<{
        success: boolean;
        error?: string;
        results: Map<string, any>;
    }>;
    private executeNode;
    /**
     * Pre-built GoalGraph for YouTube video playback.
     * Solves "Open YouTube and play a random video" with complete verification.
     */
    static createYouTubePlayGraph(params: {
        query?: string;
        isRandom?: boolean;
        index?: number;
        automator: any;
        adapter: any;
        media: any;
    }): GoalGraph;
}
//# sourceMappingURL=goal-graph.d.ts.map