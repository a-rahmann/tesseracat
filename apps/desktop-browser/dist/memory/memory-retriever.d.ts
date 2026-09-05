/**
 * MemoryRetriever: Searchable short-term and long-term conversation memory.
 * Supports time-window queries ("4 minutes ago") and topic keyword queries.
 */
import { ConversationTurn } from './conversation-manager.js';
export interface MemoryQuery {
    query?: string;
    minutesAgo?: number;
    timeRange?: {
        from: number;
        to: number;
    };
}
export declare class MemoryRetriever {
    static search(query: MemoryQuery): ConversationTurn[];
    /**
     * Helper that interprets natural language time questions like:
     * "Remember what we talked about four minutes ago?"
     * "What did we talk about around 12:26?"
     */
    static parseNaturalMemoryQuery(text: string): MemoryQuery | null;
}
//# sourceMappingURL=memory-retriever.d.ts.map