"use strict";
/**
 * ContextManager: Resolves anaphoric references ("it", "that", "the second one").
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContextManager = void 0;
class ContextManager {
    static instance = null;
    currentContext = {};
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