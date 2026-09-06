/**
 * BrowserStateStore: Tracks active browser state, tab history, and visible results.
 * Enables 0-turn resolution for "Go back", "Open the second one", and "What was the other one called?".
 */
export interface BrowserTabState {
    tabId: string;
    url: string;
    title: string;
    timestamp: number;
}
export interface SearchResultItem {
    index: number;
    title: string;
    url: string;
    snippet?: string;
    price?: string;
}
export interface BrowserStateSnapshot {
    currentTab: BrowserTabState | null;
    previousTab: BrowserTabState | null;
    tabHistory: BrowserTabState[];
    lastSearch: {
        query: string;
        location: string;
        timestamp: number;
        results: SearchResultItem[];
    } | null;
    activeVideo: {
        title: string;
        channel?: string;
        url?: string;
        currentTime?: number;
        duration?: number;
    } | null;
}
export declare class BrowserStateStore {
    private static instance;
    private currentTab;
    private previousTab;
    private tabHistory;
    private lastSearch;
    private activeVideo;
    static getInstance(): BrowserStateStore;
    recordTabNavigation(tabId: string, url: string, title: string): void;
    recordSearch(query: string, location: string, results: SearchResultItem[]): void;
    recordActiveVideo(video: BrowserStateSnapshot['activeVideo']): void;
    getCurrentTab(): BrowserTabState | null;
    getPreviousTab(): BrowserTabState | null;
    getLastSearch(): {
        query: string;
        location: string;
        timestamp: number;
        results: SearchResultItem[];
    } | null;
    getVisibleResults(): SearchResultItem[];
    getActiveTab(): BrowserTabState | null;
    updateActiveTab(tab: {
        id: string;
        url: string;
        title: string;
    }): void;
    setActiveTab(tabId: string): void;
    setTabs(tabs: Array<{
        id: string;
        url: string;
        title: string;
        active?: boolean;
    }>): void;
    setLastSearch(query: string, results: SearchResultItem[]): void;
    resolveOrdinalResult(index: number): SearchResultItem | null;
    resolveOrdinalSearchResult(index: number): SearchResultItem | null;
    getActiveVideo(): {
        title: string;
        channel?: string;
        url?: string;
        currentTime?: number;
        duration?: number;
    } | null;
    getStateSummary(): string;
}
//# sourceMappingURL=browser-state-store.d.ts.map