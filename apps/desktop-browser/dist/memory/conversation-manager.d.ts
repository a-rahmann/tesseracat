/**
 * ConversationManager: Owns multi-turn conversational session history.
 */
export interface ConversationTurn {
    id: string;
    timestamp: number;
    speaker: 'user' | 'assistant' | 'system';
    text: string;
    intent?: string;
    entities?: Record<string, any>;
    browserUrl?: string;
    browserTitle?: string;
    taskId?: string;
    resultSummary?: string;
}
export declare class ConversationManager {
    private static instance;
    private turns;
    private maxHistorySize;
    static getInstance(): ConversationManager;
    recordTurn(turn: Omit<ConversationTurn, 'id' | 'timestamp'>): ConversationTurn;
    getRecentTurns(limit?: number): ConversationTurn[];
    getAllTurns(): ConversationTurn[];
    clear(): void;
}
//# sourceMappingURL=conversation-manager.d.ts.map