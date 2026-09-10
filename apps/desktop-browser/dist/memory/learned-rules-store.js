"use strict";
/**
 * LearnedRulesStore: Persistent memory of mistakes, workarounds, and user corrections.
 * Enables Tesseract to be truly self-taught and continuously improve from user feedback.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LearnedRulesStore = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const index_js_1 = require("../platform/index.js");
class LearnedRulesStore {
    static instance = null;
    filePath;
    rules = [];
    maxRules = 100;
    constructor() {
        const dir = (0, index_js_1.getAppDataDir)('tesseract');
        try {
            if (!fs_1.default.existsSync(dir))
                fs_1.default.mkdirSync(dir, { recursive: true });
        }
        catch { }
        this.filePath = path_1.default.join(dir, 'tesseract-learned-rules.json');
        this.rules = this.load();
    }
    static getInstance() {
        if (!LearnedRulesStore.instance) {
            LearnedRulesStore.instance = new LearnedRulesStore();
        }
        return LearnedRulesStore.instance;
    }
    load() {
        try {
            if (fs_1.default.existsSync(this.filePath)) {
                const raw = fs_1.default.readFileSync(this.filePath, 'utf-8');
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed))
                    return parsed;
            }
        }
        catch (err) {
            console.warn('[LearnedRulesStore] Failed to load learned rules from disk:', err);
        }
        return [];
    }
    save() {
        try {
            fs_1.default.writeFileSync(this.filePath, JSON.stringify(this.rules, null, 2), 'utf-8');
        }
        catch (err) {
            console.error('[LearnedRulesStore] Failed to persist learned rules:', err);
        }
    }
    /**
     * Learns from an explicit user correction (e.g. "No, use YouTube Music instead of YouTube").
     */
    recordUserCorrection(params) {
        const cleanDomain = params.domain ? params.domain.toLowerCase().replace(/^www\./, '') : undefined;
        const rule = {
            id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            domain: cleanDomain,
            triggerPattern: (params.pattern || params.correction).toLowerCase().trim(),
            mistakeDescription: params.mistake,
            correction: params.correction.trim(),
            replacementAction: params.replacementAction,
            source: 'user_correction',
            timestamp: Date.now(),
            successCount: 1,
        };
        // Replace existing matching rule if same pattern/domain, otherwise prepend
        const existingIdx = this.rules.findIndex(r => r.domain === rule.domain &&
            (r.triggerPattern.includes(rule.triggerPattern) || rule.triggerPattern.includes(r.triggerPattern)));
        if (existingIdx !== -1) {
            this.rules[existingIdx] = rule;
        }
        else {
            this.rules.unshift(rule);
        }
        if (this.rules.length > this.maxRules) {
            this.rules = this.rules.slice(0, this.maxRules);
        }
        this.save();
        console.log(`[LearnedRulesStore] Saved user-taught rule: "${rule.correction}" (domain=${rule.domain || 'all'})`);
        return rule;
    }
    /**
     * Learns from automated self-healing recovery (e.g., selector failed, alternate click succeeded).
     */
    recordSelfHealingWorkaround(params) {
        const cleanDomain = params.domain ? params.domain.toLowerCase().replace(/^www\./, '') : undefined;
        const rule = {
            id: `heal-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            domain: cleanDomain,
            triggerPattern: (params.pattern || cleanDomain || 'general').toLowerCase().trim(),
            mistakeDescription: `Failed action: ${params.failedAction}`,
            correction: `Use verified workaround: ${params.successfulWorkaround}`,
            source: 'self_healing_recovery',
            timestamp: Date.now(),
            successCount: 1,
        };
        this.rules.unshift(rule);
        if (this.rules.length > this.maxRules) {
            this.rules = this.rules.slice(0, this.maxRules);
        }
        this.save();
        console.log(`[LearnedRulesStore] Saved self-taught workaround: "${params.successfulWorkaround}"`);
        return rule;
    }
    /**
     * Finds learned rules applicable to the given domain or instruction text.
     */
    getApplicableRules(domain, contextText) {
        const cleanDomain = domain ? domain.toLowerCase().replace(/^www\./, '') : '';
        const cleanText = (contextText || '').toLowerCase();
        return this.rules.filter(r => {
            // Domain matching
            if (r.domain && cleanDomain && (cleanDomain.includes(r.domain) || r.domain.includes(cleanDomain))) {
                return true;
            }
            // Pattern matching
            if (r.triggerPattern && cleanText && cleanText.includes(r.triggerPattern)) {
                return true;
            }
            // Global user corrections
            if (!r.domain && r.source === 'user_correction') {
                const words = r.triggerPattern.split(/\s+/).filter(w => w.length > 3);
                if (words.some(w => cleanText.includes(w)))
                    return true;
            }
            return false;
        });
    }
    /**
     * Formats applicable rules as a concise prompt snippet (<60 tokens) for LLM Planner/NLU.
     */
    formatRulesPrompt(domain, contextText) {
        const applicable = this.getApplicableRules(domain, contextText).slice(0, 3);
        if (applicable.length === 0)
            return '';
        const lines = applicable.map(r => `- Rule: ${r.correction} (Past issue: ${r.mistakeDescription || 'suboptimal action'})`);
        return `\nLearned User Rules & Past Self-Corrections:\n${lines.join('\n')}\n`;
    }
    getAllRules() {
        return [...this.rules];
    }
    clearRules() {
        this.rules = [];
        this.save();
    }
}
exports.LearnedRulesStore = LearnedRulesStore;
//# sourceMappingURL=learned-rules-store.js.map