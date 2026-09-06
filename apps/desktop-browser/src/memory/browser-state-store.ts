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

export class BrowserStateStore {
  private static instance: BrowserStateStore | null = null;

  private currentTab: BrowserTabState | null = null;
  private previousTab: BrowserTabState | null = null;
  private tabHistory: BrowserTabState[] = [];
  private lastSearch: BrowserStateSnapshot['lastSearch'] = null;
  private activeVideo: BrowserStateSnapshot['activeVideo'] = null;

  public static getInstance(): BrowserStateStore {
    if (!BrowserStateStore.instance) {
      BrowserStateStore.instance = new BrowserStateStore();
    }
    return BrowserStateStore.instance;
  }

  public recordTabNavigation(tabId: string, url: string, title: string): void {
    if (this.currentTab && (this.currentTab.tabId !== tabId || this.currentTab.url !== url)) {
      this.previousTab = { ...this.currentTab };
      this.tabHistory.unshift(this.previousTab);
      if (this.tabHistory.length > 30) this.tabHistory.pop();
    }

    this.currentTab = {
      tabId,
      url,
      title: title || url,
      timestamp: Date.now(),
    };
  }

  public recordSearch(query: string, location: string, results: SearchResultItem[]): void {
    this.lastSearch = {
      query,
      location,
      timestamp: Date.now(),
      results: results.slice(0, 20),
    };
  }

  public recordActiveVideo(video: BrowserStateSnapshot['activeVideo']): void {
    this.activeVideo = video;
  }

  public getCurrentTab(): BrowserTabState | null {
    return this.currentTab ? { ...this.currentTab } : null;
  }

  public getPreviousTab(): BrowserTabState | null {
    return this.previousTab ? { ...this.previousTab } : null;
  }

  public getLastSearch() {
    return this.lastSearch ? { ...this.lastSearch } : null;
  }

  public getVisibleResults(): SearchResultItem[] {
    return this.lastSearch?.results || [];
  }

  public getActiveTab(): BrowserTabState | null {
    return this.getCurrentTab();
  }

  public updateActiveTab(tab: { id: string; url: string; title: string }): void {
    this.recordTabNavigation(tab.id, tab.url, tab.title);
  }

  public setActiveTab(tabId: string): void {
    if (this.currentTab && this.currentTab.tabId !== tabId) {
      this.previousTab = { ...this.currentTab };
    }
  }

  public setTabs(tabs: Array<{ id: string; url: string; title: string; active?: boolean }>): void {
    for (const tab of tabs) {
      if (!tab.active && !this.previousTab) {
        this.previousTab = {
          tabId: tab.id,
          url: tab.url,
          title: tab.title || tab.url,
          timestamp: Date.now() - 5000,
        };
      }
    }
    const active = tabs.find(t => t.active);
    if (active) {
      this.recordTabNavigation(active.id, active.url, active.title);
    }
  }

  public setLastSearch(query: string, results: SearchResultItem[]): void {
    this.recordSearch(query, 'Google', results);
  }

  public resolveOrdinalResult(index: number): SearchResultItem | null {
    if (!this.lastSearch || !this.lastSearch.results) return null;
    const match = this.lastSearch.results.find(r => r.index === index);
    if (match) return match;
    if (index > 0 && index <= this.lastSearch.results.length) {
      return this.lastSearch.results[index - 1];
    }
    return null;
  }

  public resolveOrdinalSearchResult(index: number): SearchResultItem | null {
    return this.resolveOrdinalResult(index);
  }

  public getActiveVideo() {
    return this.activeVideo ? { ...this.activeVideo } : null;
  }

  public getStateSummary(): string {
    const parts: string[] = [];
    if (this.currentTab) parts.push(`Current Tab: ${this.currentTab.title} (${this.currentTab.url})`);
    if (this.previousTab) parts.push(`Previous Tab: ${this.previousTab.title}`);
    if (this.lastSearch) {
      parts.push(`Previous Search: "${this.lastSearch.query}" on ${this.lastSearch.location} (${this.lastSearch.results.length} results recorded)`);
    }
    if (this.activeVideo) parts.push(`Active Video: "${this.activeVideo.title}"`);
    return parts.join('\n') || 'Browser state empty.';
  }
}
