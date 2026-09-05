"use strict";
/**
 * ConversationManager: Owns multi-turn conversational session history.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConversationManager = void 0;
class ConversationManager {
    static instance = null;
    turns = [];
    maxHistorySize = 100;
    static getInstance() {
        if (!ConversationManager.instance) {
            ConversationManager.instance = new ConversationManager();
        }
        return ConversationManager.instance;
    }
    recordTurn(turn) {
        const fullTurn = {
            id: `turn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            timestamp: Date.now(),
            ...turn,
        };
        this.turns.push(fullTurn);
        if (this.turns.length > this.maxHistorySize) {
            this.turns.shift();
        }
        return fullTurn;
    }
    getRecentTurns(limit = 6) {
        return this.turns.slice(-limit);
    }
    getAllTurns() {
        return [...this.turns];
    }
    clear() {
        this.turns = [];
    }
}
exports.ConversationManager = ConversationManager;
//# sourceMappingURL=conversation-manager.js.map