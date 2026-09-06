/**
 * OmniboxEngine: High-performance, deterministic multi-source address bar engine.
 * Ranks suggestions with sub-5ms latency without invoking the local LLM on keystrokes.
 *
 * Scoring Formula:
 * score = 0.40 * textMatch + 0.25 * frequency + 0.20 * recency + 0.10 * bookmark + 0.05 * openTab
 */
export interface OmniboxItem {
    id: string;
    text: string;
    html: string;
    description: string;
    type: 'URL' | 'TAB' | 'HISTORY' | 'BOOKMARK' | 'SEARCH' | 'AI';
    url?: string;
    score?: number;
}
export interface HistoryEntry {
    url: string;
    title: string;
    visitCount: number;
    lastVisitTime: number;
    isBookmark?: boolean;
}
export declare class OmniboxEngine {
    private static instance;
    private historyStore;
    private openTabs;
    private cache;
    private maxCacheSize;
    private historyFile;
    private constructor();
    static getInstance(): OmniboxEngine;
    private loadHistory;
    private saveHistory;
    private seedDefaultBookmarks;
    recordVisit(url: string, title: string): void;
    setOpenTabs(tabs: Array<{
        id: string;
        title: string;
        url: string;
    }>): void;
    setBookmark(url: string, isBookmark?: boolean): void;
    setBookmarks(bookmarks: Array<{
        title: string;
        url: string;
    }>): void;
    /**
     * Deterministic scoring formula:
     * score = 0.40 * textMatch + 0.25 * frequency + 0.20 * recency + 0.10 * bookmark + 0.05 * openTab
     */
    calculateScore(entry: HistoryEntry, query: string, isOpenTab: boolean): number;
    getLocalSuggestions(rawQuery: string): OmniboxItem[];
    getSuggestions(rawQuery: string): Promise<OmniboxItem[]>;
    private fetchGoogleSuggest;
    private formatMatchBold;
    private extractDomain;
    private escapeHtml;
}
//# sourceMappingURL=omnibox-engine.d.ts.map