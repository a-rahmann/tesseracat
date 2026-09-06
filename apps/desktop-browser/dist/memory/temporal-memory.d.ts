/**
 * TemporalMemory: Multi-dimensional episodic memory engine for Tesseract.
 * Indexes activity across:
 * 1. Timestamp (relative time: "4 minutes ago", "yesterday")
 * 2. Website (domain, title, URL)
 * 3. Task (goal, completed actions, checkpoints)
 * 4. Entities (people, products, models, prices)
 * 5. Topic (research, shopping, entertainment, communications)
 */
export interface TemporalRecord {
    id: string;
    timestamp: number;
    timeString: string;
    website?: {
        domain: string;
        url: string;
        title: string;
    };
    task?: {
        id: string;
        goal: string;
        status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
        stepSummary?: string;
    };
    entities: string[];
    topic: string;
    contentSnippet: string;
}
export interface TemporalSearchFilter {
    timeRangeMs?: number;
    domain?: string;
    entity?: string;
    topic?: string;
    keyword?: string;
}
export declare class TemporalMemory {
    private static instance;
    private filePath;
    private records;
    private maxRecords;
    private constructor();
    static getInstance(): TemporalMemory;
    private load;
    private save;
    recordEvent(data: {
        website?: {
            domain: string;
            url: string;
            title: string;
        };
        task?: {
            id: string;
            goal: string;
            status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
            stepSummary?: string;
        };
        entities?: string[];
        topic?: string;
        contentSnippet: string;
    }): TemporalRecord;
    recordVisit(data: {
        url: string;
        title: string;
    }): TemporalRecord | null;
    /**
     * Multi-dimensional search across time, entities, website, topic, and content.
     */
    search(filter: TemporalSearchFilter): TemporalRecord[];
    /**
     * Natural query interpreter for temporal memory:
     * e.g. "What did we talk about four minutes ago?", "What did Rahul say?", "Continue what we were doing"
     */
    parseAndQuery(naturalQuery: string): {
        records: TemporalRecord[];
        explanation: string;
    };
    getLastActiveTask(): TemporalRecord | null;
    searchNaturalLanguage(naturalQuery: string): TemporalRecord[];
}
//# sourceMappingURL=temporal-memory.d.ts.map