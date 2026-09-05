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

export class ConversationManager {
  private static instance: ConversationManager | null = null;
  private turns: ConversationTurn[] = [];
  private maxHistorySize = 100;

  public static getInstance(): ConversationManager {
    if (!ConversationManager.instance) {
      ConversationManager.instance = new ConversationManager();
    }
    return ConversationManager.instance;
  }

  public recordTurn(turn: Omit<ConversationTurn, 'id' | 'timestamp'>): ConversationTurn {
    const fullTurn: ConversationTurn = {
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

  public getRecentTurns(limit = 6): ConversationTurn[] {
    return this.turns.slice(-limit);
  }

  public getAllTurns(): ConversationTurn[] {
    return [...this.turns];
  }

  public clear(): void {
    this.turns = [];
  }
}
