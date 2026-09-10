/**
 * LearnedRulesStore: Persistent memory of mistakes, workarounds, and user corrections.
 * Enables Tesseract to be truly self-taught and continuously improve from user feedback.
 */
export interface LearnedRule {
    id: string;
    domain?: string;
    triggerPattern: string;
    mistakeDescription?: string;
    correction: string;
    replacementAction?: {
        action: string;
        parameters?: Record<string, any>;
    };
    source: 'user_correction' | 'self_healing_recovery';
    timestamp: number;
    successCount: number;
}
export declare class LearnedRulesStore {
    private static instance;
    private filePath;
    private rules;
    private maxRules;
    private constructor();
    static getInstance(): LearnedRulesStore;
    private load;
    private save;
    /**
     * Learns from an explicit user correction (e.g. "No, use YouTube Music instead of YouTube").
     */
    recordUserCorrection(params: {
        domain?: string;
        pattern?: string;
        mistake?: string;
        correction: string;
        replacementAction?: {
            action: string;
            parameters?: Record<string, any>;
        };
    }): LearnedRule;
    /**
     * Learns from automated self-healing recovery (e.g., selector failed, alternate click succeeded).
     */
    recordSelfHealingWorkaround(params: {
        domain?: string;
        pattern?: string;
        failedAction: string;
        successfulWorkaround: string;
    }): LearnedRule;
    /**
     * Finds learned rules applicable to the given domain or instruction text.
     */
    getApplicableRules(domain?: string, contextText?: string): LearnedRule[];
    /**
     * Formats applicable rules as a concise prompt snippet (<60 tokens) for LLM Planner/NLU.
     */
    formatRulesPrompt(domain?: string, contextText?: string): string;
    getAllRules(): LearnedRule[];
    clearRules(): void;
}
//# sourceMappingURL=learned-rules-store.d.ts.map