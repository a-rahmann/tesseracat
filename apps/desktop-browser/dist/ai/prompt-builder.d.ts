/**
 * Token-efficient Dynamic Prompt Builder for Gemma 3 4B.
 * Constructs compact prompts containing only essential task context, snapshot data, and tool schemas.
 */
export interface PromptContext {
    goal: string;
    currentUrl?: string;
    pageTitle?: string;
    compactSnapshot?: string;
    recentHistory?: Array<{
        speaker: string;
        text: string;
    }>;
    relevantMemory?: string[];
    lastAction?: {
        tool: string;
        result?: string;
        error?: string;
    };
    availableTools?: Array<{
        name: string;
        description: string;
        parameters: string;
    }>;
}
export declare class PromptBuilder {
    static buildSystemPrompt(): string;
    static buildObservationActionPrompt(ctx: PromptContext): string;
}
//# sourceMappingURL=prompt-builder.d.ts.map