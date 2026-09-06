"use strict";
/**
 * BrowserStateStore: Tracks active browser state, tab history, and visible results.
 * Enables 0-turn resolution for "Go back", "Open the second one", and "What was the other one called?".
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrowserStateStore = void 0;
class BrowserStateStore {
    static instance = null;
    currentTab = null;
    previousTab = null;
    tabHistory = [];
    lastSearch = null;
    activeVideo = null;
    static getInstance() {
        if (!BrowserStateStore.instance) {
            BrowserStateStore.instance = new BrowserStateStore();
        }
        return BrowserStateStore.instance;
    }
    recordTabNavigation(tabId, url, title) {
        if (this.currentTab && (this.currentTab.tabId !== tabId || this.currentTab.url !== url)) {
            this.previousTab = { ...this.currentTab };
            this.tabHistory.unshift(this.previousTab);
            if (this.tabHistory.length > 30)
                this.tabHistory.pop();
        }
        this.currentTab = {
            tabId,
            url,
            title: title || url,
            timestamp: Date.now(),
        };
    }
    recordSearch(query, location, results) {
        this.lastSearch = {
            query,
            location,
            timestamp: Date.now(),
            results: results.slice(0, 20),
        };
    }
    recordActiveVideo(video) {
        this.activeVideo = video;
    }
    getCurrentTab() {
        return this.currentTab ? { ...this.currentTab } : null;
    }
    getPreviousTab() {
        return this.previousTab ? { ...this.previousTab } : null;
    }
    getLastSearch() {
        return this.lastSearch ? { ...this.lastSearch } : null;
    }
    getVisibleResults() {
        return this.lastSearch?.results || [];
    }
    getActiveTab() {
        return this.getCurrentTab();
    }
    updateActiveTab(tab) {
        this.recordTabNavigation(tab.id, tab.url, tab.title);
    }
    setActiveTab(tabId) {
        if (this.currentTab && this.currentTab.tabId !== tabId) {
            this.previousTab = { ...this.currentTab };
        }
    }
    setTabs(tabs) {
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
    setLastSearch(query, results) {
        this.recordSearch(query, 'Google', results);
    }
    resolveOrdinalResult(index) {
        if (!this.lastSearch || !this.lastSearch.results)
            return null;
        const match = this.lastSearch.results.find(r => r.index === index);
        if (match)
            return match;
        if (index > 0 && index <= this.lastSearch.results.length) {
            return this.lastSearch.results[index - 1];
        }
        return null;
    }
    resolveOrdinalSearchResult(index) {
        return this.resolveOrdinalResult(index);
    }
    getActiveVideo() {
        return this.activeVideo ? { ...this.activeVideo } : null;
    }
    getStateSummary() {
        const parts = [];
        if (this.currentTab)
            parts.push(`Current Tab: ${this.currentTab.title} (${this.currentTab.url})`);
        if (this.previousTab)
            parts.push(`Previous Tab: ${this.previousTab.title}`);
        if (this.lastSearch) {
            parts.push(`Previous Search: "${this.lastSearch.query}" on ${this.lastSearch.location} (${this.lastSearch.results.length} results recorded)`);
        }
        if (this.activeVideo)
            parts.push(`Active Video: "${this.activeVideo.title}"`);
        return parts.join('\n') || 'Browser state empty.';
    }
}
exports.BrowserStateStore = BrowserStateStore;
//# sourceMappingURL=browser-state-store.js.map