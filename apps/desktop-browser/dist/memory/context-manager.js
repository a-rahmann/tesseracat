"use strict";
/**
 * ContextManager: Resolves anaphoric references ("it", "that", "the second one").
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContextManager = void 0;
class ContextManager {
    static instance = null;
    currentContext = {};
    chainHistory = [];
    maxChainNodes = 30;
    static getInstance() {
        if (!ContextManager.instance) {
            ContextManager.instance = new ContextManager();
        }
        return ContextManager.instance;
    }
    updateContext(patch) {
        this.currentContext = { ...this.currentContext, ...patch };
    }
    getContext() {
        return { ...this.currentContext };
    }
    /**
     * Chain Memory: Record a completed or executing command step into the chain.
     */
    recordChainStep(node) {
        const fullNode = {
            id: `chain-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            timestamp: Date.now(),
            ...node,
        };
        this.chainHistory.push(fullNode);
        if (this.chainHistory.length > this.maxChainNodes) {
            this.chainHistory.shift();
        }
        console.log(`[ChainMemory] Recorded step: action=${fullNode.action || 'n/a'} platform=${fullNode.platform || 'unknown'} goal="${fullNode.goal}"`);
        return fullNode;
    }
    getChainHistory() {
        return [...this.chainHistory];
    }
    getLastChainStep() {
        return this.chainHistory.length > 0 ? this.chainHistory[this.chainHistory.length - 1] : undefined;
    }
    /**
     * Identifies the current platform from URL or recent chain memory.
     */
    getActivePlatform(activeUrl) {
        const url = (activeUrl || this.currentContext.activeUrl || '').toLowerCase();
        if (url.includes('youtube.com') || url.includes('youtu.be'))
            return 'YouTube';
        if (url.includes('instagram.com'))
            return 'Instagram';
        if (url.includes('google.com'))
            return 'Google';
        if (url.includes('amazon.com'))
            return 'Amazon';
        if (url.includes('github.com'))
            return 'GitHub';
        if (url.includes('reddit.com'))
            return 'Reddit';
        if (url.includes('twitter.com') || url.includes('x.com'))
            return 'Twitter';
        // Fallback to last recorded platform from chain memory
        const last = this.getLastChainStep();
        return last?.platform;
    }
    /**
     * Chain Memory Optimizer & Pruner:
     * "it understands what it did cuts the part and then does something it should find a much better and efficent way to solve requests"
     * Prunes redundant navigation or repetition when the requested platform is already active or in memory.
     */
    optimizeAndPrune(goal, activeUrl) {
        const activePlatform = this.getActivePlatform(activeUrl);
        const lastChain = this.getLastChainStep();
        // 1. Ordinal Reference Resolution using Chain Memory
        // e.g. User says "play the second one", "play 2nd video", "open the 3rd result"
        const ordinal = this.resolveOrdinal(goal.rawUserText);
        if (ordinal && (activePlatform === 'YouTube' || lastChain?.platform === 'YouTube')) {
            console.log(`[ChainMemory] Resolved relative ordinal #${ordinal.index} on YouTube`);
            return {
                ...goal,
                goal: `Play YouTube result #${ordinal.index}`,
                intentCategory: 'MEDIA_CONTROL',
                fastPathAction: 'PLAY_ORDINAL',
                entities: { platform: 'YouTube', index: ordinal.index },
                requiresBrowser: true,
                requiresPerception: false,
                isCompound: false,
                isFastPath: true,
                spokenAcknowledgment: `Playing result #${ordinal.index}.`,
                confidence: 1.0,
            };
        }
        // 2. Redundant Preamble Pruning in Plans:
        // e.g., if goal has initialPlan and Step 1 is navigating to a platform that is ALREADY loaded
        if (goal.initialPlan && goal.initialPlan.length > 1) {
            const step1 = goal.initialPlan[0];
            if (step1.toolName === 'browser.navigate' && step1.parameters?.url) {
                try {
                    const targetHost = new URL(step1.parameters.url).hostname.replace(/^www\./, '');
                    const currentHost = activeUrl && !activeUrl.startsWith('about:') ? new URL(activeUrl).hostname.replace(/^www\./, '') : '';
                    if (targetHost && currentHost && (currentHost.includes(targetHost) || targetHost.includes(currentHost))) {
                        console.log(`[ChainMemory] Pruning redundant navigation to "${step1.parameters.url}" because active host is "${currentHost}".`);
                        // Prune step 1 and renumber remaining steps
                        const prunedSteps = goal.initialPlan.slice(1).map((s, idx) => ({
                            ...s,
                            stepNumber: idx + 1,
                        }));
                        return {
                            ...goal,
                            initialPlan: prunedSteps,
                            spokenAcknowledgment: goal.spokenAcknowledgment?.replace(/^(?:Opening|Navigating to)\s+[^,]+,\s*/i, ''),
                        };
                    }
                }
                catch (_) { }
            }
        }
        // 3. Search Deduplication / Chained Continuation:
        // If the user says "search for <x>" or "now search <x>" and we are already on YouTube or Google,
        // ensure the platform is retained from chain memory without falling through to generic web search.
        if ((goal.intentCategory === 'RESEARCH' || goal.intentCategory === 'MEDIA_CONTROL') && !goal.entities?.platform && activePlatform) {
            goal.entities = { ...goal.entities, platform: activePlatform };
        }
        return goal;
    }
    setOptionsList(options) {
        this.currentContext.lastOptions = options.map((opt, i) => {
            if (typeof opt === 'string') {
                return { index: i + 1, label: opt, value: opt };
            }
            return { index: i + 1, label: opt.label, value: opt.value };
        });
    }
    /**
     * Resolves ordinal references:
     * "first", "second", "the 2nd one", "third", "last"
     */
    resolveOrdinal(text) {
        if (!text)
            return null;
        const lower = text.toLowerCase();
        let targetIndex = -1;
        if (/\b(first|1st|number\s*one)\b/.test(lower))
            targetIndex = 1;
        else if (/\b(second|2nd|number\s*two)\b/.test(lower))
            targetIndex = 2;
        else if (/\b(third|3rd|number\s*three)\b/.test(lower))
            targetIndex = 3;
        else if (/\b(fourth|4th|number\s*four)\b/.test(lower))
            targetIndex = 4;
        else if (/\b(fifth|5th|number\s*five)\b/.test(lower))
            targetIndex = 5;
        else if (/\b(last|final)\b/.test(lower) && this.currentContext.lastOptions) {
            targetIndex = this.currentContext.lastOptions.length;
        }
        if (targetIndex !== -1) {
            const match = this.currentContext.lastOptions?.find(o => o.index === targetIndex);
            return {
                index: targetIndex,
                resolvedItem: match ? match.value : null,
            };
        }
        // Direct name match against options list (e.g. "rahul.k")
        if (this.currentContext.lastOptions) {
            const matched = this.currentContext.lastOptions.find(o => lower.includes(o.label.toLowerCase()));
            if (matched) {
                return { index: matched.index, resolvedItem: matched.value };
            }
        }
        return null;
    }
    /**
     * Resolves pronouns "it", "this", "that", "this video".
     */
    resolvePronoun(text) {
        const lower = text.toLowerCase();
        if (/\b(this\s+video|the\s+video)\b/.test(lower) && this.currentContext.activeVideo) {
            return { type: 'video', referent: this.currentContext.activeVideo };
        }
        if (/\b(it|this|that)\b/.test(lower)) {
            if (this.currentContext.activeVideo) {
                return { type: 'video', referent: this.currentContext.activeVideo };
            }
            if (this.currentContext.lastSelectedEntity) {
                return { type: 'entity', referent: this.currentContext.lastSelectedEntity };
            }
            if (this.currentContext.activeUrl) {
                return { type: 'page', referent: { url: this.currentContext.activeUrl, title: this.currentContext.activeTitle } };
            }
        }
        return null;
    }
}
exports.ContextManager = ContextManager;
//# sourceMappingURL=context-manager.js.map