/**
 * MemoryRetriever: Searchable short-term and long-term conversation memory.
 * Supports time-window queries ("4 minutes ago") and topic keyword queries.
 */

import { ConversationManager, ConversationTurn } from './conversation-manager.js';

export interface MemoryQuery {
  query?: string;
  minutesAgo?: number;
  timeRange?: { from: number; to: number };
}

export class MemoryRetriever {
  public static search(query: MemoryQuery): ConversationTurn[] {
    const turns = ConversationManager.getInstance().getAllTurns();
    const now = Date.now();

    // 1. Time-window filter
    let filtered = turns;
    if (query.minutesAgo) {
      const windowStart = now - query.minutesAgo * 60 * 1000;
      const windowEnd = windowStart + 3 * 60 * 1000; // ±3 min window
      filtered = filtered.filter(t => t.timestamp >= windowStart - 60000 && t.timestamp <= windowEnd);
    } else if (query.timeRange) {
      filtered = filtered.filter(t => t.timestamp >= query.timeRange!.from && t.timestamp <= query.timeRange!.to);
    }

    // 2. Keyword matching if query text provided
    if (query.query && query.query.trim()) {
      const terms = query.query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
      if (terms.length > 0) {
        filtered = filtered.filter(t => {
          const content = `${t.text} ${t.browserTitle || ''} ${t.resultSummary || ''}`.toLowerCase();
          return terms.some(term => content.includes(term));
        });
      }
    }

    return filtered;
  }

  /**
   * Helper that interprets natural language time questions like:
   * "Remember what we talked about four minutes ago?"
   * "What did we talk about around 12:26?"
   */
  public static parseNaturalMemoryQuery(text: string): MemoryQuery | null {
    const lower = text.toLowerCase();

    // Match "X minutes ago"
    const minMatch = lower.match(/(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+minutes?\s+ago/);
    if (minMatch) {
      const wordMap: Record<string, number> = {
        one: 1, two: 2, three: 3, four: 4, five: 5,
        six: 6, seven: 7, eight: 8, nine: 9, ten: 10
      };
      const num = wordMap[minMatch[1]] || parseInt(minMatch[1], 10) || 5;
      return { minutesAgo: num };
    }

    // Match topic: "what we talked about regarding X"
    const topicMatch = lower.match(/(?:talked|discussed|looked\s+at)\s+(?:about|regarding)?\s+(.+?)(?:\?|$)/);
    if (topicMatch && topicMatch[1]) {
      return { query: topicMatch[1].trim() };
    }

    return null;
  }
}
