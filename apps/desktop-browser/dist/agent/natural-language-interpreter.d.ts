/**
 * NaturalLanguageInterpreter: Unified Goal & Intent Understanding for Tesseract.
 * Translates arbitrary user voice/text utterances into structured AgentGoal objects.
 * Uses local Gemma 3 4B via Ollama with robust contextual pronoun & reference resolution.
 */
import { AgentGoal } from './types.js';
export declare class NaturalLanguageInterpreter {
    private static instance;
    private model;
    private constructor();
    static getInstance(): NaturalLanguageInterpreter;
    /**
     * Interprets an arbitrary user instruction into a structured AgentGoal.
     */
    interpret(rawText: string, currentUrl?: string, currentTitle?: string): Promise<AgentGoal>;
    /**
     * Deterministic fast-path detector for standalone micro-actions and non-compound queries.
     * Invariant: ONLY triggers when the command is non-compound or a supported deterministic sequence.
     */
    detectFastPathIntent(cleanText: string, activeUrl?: string): AgentGoal | null;
    /**
     * Helper to extract target domain URL from compound commands (e.g. "open instagram and ...")
     */
    extractInitialDomainUrl(text: string): string | undefined;
    /**
     * Fallback semantic interpreter when Ollama daemon is unreachable or during single-pass fallback.
     * Invariant: Pre-synthesizes initialPlan steps to achieve <100ms planning latency without secondary LLM round-trips!
     */
    private fallbackSemanticInterpreter;
    private cleanWakeAndPreambles;
    private fallbackCategory;
}
//# sourceMappingURL=natural-language-interpreter.d.ts.map