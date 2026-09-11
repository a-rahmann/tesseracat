"use strict";
/**
 * Goal Graph and Explicit Completion Contract for Tesseract.
 *
 * Enforces strict completion semantics:
 * - A mission CANNOT be marked COMPLETED unless all goal nodes and their verification predicates succeed.
 * - Multi-step tasks ("Open YouTube and play a random video") must satisfy every step's verification gate.
 * - Automatically retries failed nodes or fails fast with diagnostic reasons.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoalGraph = void 0;
const browser_state_store_js_1 = require("../memory/browser-state-store.js");
class GoalGraph {
    goal;
    status = 'PENDING';
    nodes = new Map();
    nodeResults = new Map();
    onNodeStateChange;
    constructor(goal) {
        this.goal = goal;
    }
    addNode(node) {
        this.nodes.set(node.id, {
            ...node,
            status: 'PENDING',
            retryCount: 0,
            maxRetries: node.maxRetries !== undefined ? node.maxRetries : 2,
            dependsOn: node.dependsOn || [],
        });
        return this;
    }
    getNode(id) {
        return this.nodes.get(id);
    }
    getNodes() {
        return Array.from(this.nodes.values());
    }
    getProgress() {
        const total = this.nodes.size;
        if (total === 0)
            return 1.0;
        const completed = Array.from(this.nodes.values()).filter(n => n.status === 'COMPLETED').length;
        return Math.round((completed / total) * 100) / 100;
    }
    setOnNodeStateChange(cb) {
        this.onNodeStateChange = cb;
    }
    /**
     * Executes the entire goal graph respecting topological dependencies.
     * Returns true ONLY if all nodes pass their verification gates.
     */
    async execute(customData) {
        this.status = 'EXECUTING';
        const pendingNodes = new Set(this.nodes.keys());
        while (pendingNodes.size > 0) {
            // Find nodes whose dependencies are completed
            const readyNodeIds = Array.from(pendingNodes).filter(id => {
                const node = this.nodes.get(id);
                return (node.dependsOn || []).every(depId => {
                    const dep = this.nodes.get(depId);
                    return dep && dep.status === 'COMPLETED';
                });
            });
            if (readyNodeIds.length === 0) {
                // Deadlock or dependency failure
                const failedDep = Array.from(this.nodes.values()).find(n => n.status === 'FAILED');
                const reason = failedDep ? `Dependency "${failedDep.id}" failed: ${failedDep.error}` : 'Unresolvable circular dependency in GoalGraph';
                this.status = 'FAILED';
                return { success: false, error: reason, results: this.nodeResults };
            }
            // Execute ready nodes
            for (const id of readyNodeIds) {
                const node = this.nodes.get(id);
                const success = await this.executeNode(node, customData);
                if (!success) {
                    this.status = 'FAILED';
                    return {
                        success: false,
                        error: `Goal step "${node.description}" failed verification: ${node.error || 'Verification returned false'}`,
                        results: this.nodeResults,
                    };
                }
                pendingNodes.delete(id);
            }
        }
        // Invariant check: Are ALL nodes completed?
        const allCompleted = Array.from(this.nodes.values()).every(n => n.status === 'COMPLETED');
        if (!allCompleted) {
            this.status = 'FAILED';
            return { success: false, error: 'Not all goal nodes were completed', results: this.nodeResults };
        }
        this.status = 'COMPLETED';
        return { success: true, results: this.nodeResults };
    }
    async executeNode(node, customData) {
        const ctx = {
            graph: this,
            node,
            nodeResults: this.nodeResults,
            customData,
        };
        while ((node.retryCount || 0) <= (node.maxRetries || 2)) {
            try {
                node.status = (node.retryCount || 0) > 0 ? 'RETRYING' : 'RUNNING';
                this.onNodeStateChange?.(node);
                // 1. Action
                const actionResult = await node.action(ctx);
                node.result = actionResult;
                this.nodeResults.set(node.id, actionResult);
                // 2. Verification Gate
                node.status = 'VERIFYING';
                this.onNodeStateChange?.(node);
                const verified = await node.verification(ctx);
                if (verified) {
                    node.status = 'COMPLETED';
                    this.onNodeStateChange?.(node);
                    return true;
                }
                throw new Error(`Verification predicate returned false for step "${node.id}"`);
            }
            catch (err) {
                node.error = err.message || String(err);
                node.retryCount = (node.retryCount || 0) + 1;
                console.warn(`[GoalGraph] Node "${node.id}" attempt ${node.retryCount} failed: ${node.error}`);
                if (node.retryCount > (node.maxRetries || 2)) {
                    node.status = 'FAILED';
                    this.onNodeStateChange?.(node);
                    return false;
                }
                // Small exponential backoff before retry
                await new Promise(r => setTimeout(r, 400 * node.retryCount));
            }
        }
        node.status = 'FAILED';
        this.onNodeStateChange?.(node);
        return false;
    }
    /**
     * Pre-built GoalGraph for YouTube video playback.
     * Solves "Open YouTube and play a random video" with complete verification.
     */
    static createYouTubePlayGraph(params) {
        const { query, isRandom, index, automator, adapter, media } = params;
        const graph = new GoalGraph(`Play ${query || (isRandom ? 'random video' : 'video')} on YouTube`);
        // Node 1: Navigate & Verify YouTube Loaded
        graph.addNode({
            id: 'NAVIGATE_YOUTUBE',
            description: 'Navigate to YouTube and dismiss overlays',
            dependsOn: [],
            action: async () => {
                const currentUrl = browser_state_store_js_1.BrowserStateStore.getInstance().getActiveTab()?.url || '';
                if (!currentUrl.includes('youtube.com')) {
                    await automator.navigate('https://www.youtube.com');
                }
                return { loaded: true };
            },
            verification: async () => {
                const url = browser_state_store_js_1.BrowserStateStore.getInstance().getActiveTab()?.url || '';
                return url.includes('youtube.com');
            },
        });
        // Node 2: Search or Feed Video Selection
        graph.addNode({
            id: 'SELECT_VIDEO',
            description: query ? `Search and select video for "${query}"` : 'Select video from YouTube',
            dependsOn: ['NAVIGATE_YOUTUBE'],
            action: async () => {
                if (query && !isRandom && query.toLowerCase() !== 'a random video') {
                    await adapter.search(query);
                    await new Promise(r => setTimeout(r, 800));
                    await adapter.playResult(index || 1);
                }
                else {
                    const targetIndex = index || (Math.floor(Math.random() * 4) + 1);
                    await adapter.playResult(targetIndex);
                }
                return { selected: true };
            },
            verification: async () => {
                const url = browser_state_store_js_1.BrowserStateStore.getInstance().getActiveTab()?.url || '';
                return url.includes('/watch?v=');
            },
        });
        // Node 3: Start & Verify Playback
        graph.addNode({
            id: 'VERIFY_PLAYBACK',
            description: 'Verify video media is actively playing audio/video',
            dependsOn: ['SELECT_VIDEO'],
            action: async () => {
                // Attempt play & unmute if needed
                await automator.executeScript(`
          (() => {
            const v = document.querySelector('video');
            if (v && v.paused) {
              v.play().catch(() => {});
            }
          })()
        `).catch(() => { });
                return { triggered: true };
            },
            verification: async () => {
                return media.verifyPlaying(4000);
            },
        });
        return graph;
    }
}
exports.GoalGraph = GoalGraph;
//# sourceMappingURL=goal-graph.js.map