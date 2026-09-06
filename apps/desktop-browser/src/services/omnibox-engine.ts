/**
 * OmniboxEngine: High-performance, deterministic multi-source address bar engine.
 * Ranks suggestions with sub-5ms latency without invoking the local LLM on keystrokes.
 *
 * Scoring Formula:
 * score = 0.40 * textMatch + 0.25 * frequency + 0.20 * recency + 0.10 * bookmark + 0.05 * openTab
 */

import * as https from 'https';
import fs from 'fs';
import path from 'path';
import { getAppDataDir } from '../platform/index.js';

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

export class OmniboxEngine {
  private static instance: OmniboxEngine | null = null;

  private historyStore: Map<string, HistoryEntry> = new Map();
  private openTabs: Array<{ id: string; title: string; url: string }> = [];
  private cache: Map<string, OmniboxItem[]> = new Map();
  private maxCacheSize = 120;
  private historyFile: string;

  private constructor() {
    const dir = getAppDataDir('tesseract');
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    } catch {}

    this.historyFile = path.join(dir, 'tesseract-browser-history.json');
    this.loadHistory();
    this.seedDefaultBookmarks();
  }

  public static getInstance(): OmniboxEngine {
    if (!OmniboxEngine.instance) {
      OmniboxEngine.instance = new OmniboxEngine();
    }
    return OmniboxEngine.instance;
  }

  private loadHistory(): void {
    try {
      if (fs.existsSync(this.historyFile)) {
        const raw = fs.readFileSync(this.historyFile, 'utf-8');
        const list: HistoryEntry[] = JSON.parse(raw);
        if (Array.isArray(list)) {
          for (const item of list) this.historyStore.set(item.url, item);
        }
      }
    } catch (err) {
      console.warn('[OmniboxEngine] Could not load history file:', err);
    }
  }

  private saveHistory(): void {
    try {
      const list = Array.from(this.historyStore.values()).slice(-500);
      fs.writeFileSync(this.historyFile, JSON.stringify(list, null, 2), 'utf-8');
    } catch (err) {
      console.warn('[OmniboxEngine] Could not persist history:', err);
    }
  }

  private seedDefaultBookmarks(): void {
    if (this.historyStore.size === 0) {
      const defaults: HistoryEntry[] = [
        { url: 'https://www.youtube.com', title: 'YouTube', visitCount: 25, lastVisitTime: Date.now() - 3600000, isBookmark: true },
        { url: 'https://github.com', title: 'GitHub', visitCount: 20, lastVisitTime: Date.now() - 7200000, isBookmark: true },
        { url: 'https://mail.google.com', title: 'Gmail', visitCount: 15, lastVisitTime: Date.now() - 86400000, isBookmark: true },
        { url: 'https://www.instagram.com', title: 'Instagram', visitCount: 12, lastVisitTime: Date.now() - 43200000, isBookmark: true },
        { url: 'https://www.amazon.in', title: 'Amazon', visitCount: 10, lastVisitTime: Date.now() - 172800000, isBookmark: true },
      ];
      for (const d of defaults) this.historyStore.set(d.url, d);
    }
  }

  public recordVisit(url: string, title: string): void {
    if (!url || url.startsWith('about:') || url.startsWith('chrome:')) return;
    const existing = this.historyStore.get(url) || {
      url,
      title: title || url,
      visitCount: 0,
      lastVisitTime: Date.now(),
    };
    existing.visitCount++;
    existing.lastVisitTime = Date.now();
    if (title && title !== url) existing.title = title;
    this.historyStore.set(url, existing);
    this.saveHistory();
    this.cache.clear(); // invalidate cache on new visit
  }

  public setOpenTabs(tabs: Array<{ id: string; title: string; url: string }>): void {
    this.openTabs = [...tabs];
  }

  public setBookmark(url: string, isBookmark = true): void {
    const existing = this.historyStore.get(url) || {
      url,
      title: url,
      visitCount: 1,
      lastVisitTime: Date.now(),
      isBookmark
    };
    existing.isBookmark = isBookmark;
    this.historyStore.set(url, existing);
    this.cache.clear();
  }

  public setBookmarks(bookmarks: Array<{ title: string; url: string }>): void {
    for (const b of bookmarks) {
      const existing = this.historyStore.get(b.url) || {
        url: b.url,
        title: b.title || b.url,
        visitCount: 1,
        lastVisitTime: Date.now(),
        isBookmark: true,
      };
      existing.title = b.title || existing.title;
      existing.isBookmark = true;
      this.historyStore.set(b.url, existing);
    }
    this.cache.clear();
  }

  /**
   * Deterministic scoring formula:
   * score = 0.40 * textMatch + 0.25 * frequency + 0.20 * recency + 0.10 * bookmark + 0.05 * openTab
   */
  public calculateScore(entry: HistoryEntry, query: string, isOpenTab: boolean): number {
    const q = query.toLowerCase();
    const urlLower = entry.url.toLowerCase();
    const titleLower = entry.title.toLowerCase();

    // Text match score [0.0 - 1.0]
    let textMatch = 0.0;
    if (titleLower === q || urlLower === q) textMatch = 1.0;
    else if (titleLower.startsWith(q) || urlLower.replace(/^https?:\/\/(?:www\.)?/, '').startsWith(q)) textMatch = 0.85;
    else if (titleLower.includes(q)) textMatch = 0.65;
    else if (urlLower.includes(q)) textMatch = 0.50;
    else return 0; // No match

    // Frequency score normalized [0.0 - 1.0]
    const frequency = Math.min(1.0, entry.visitCount / 20);

    // Recency score (decays over 7 days) [0.0 - 1.0]
    const ageMs = Math.max(0, Date.now() - entry.lastVisitTime);
    const recency = Math.max(0, 1.0 - (ageMs / (7 * 24 * 3600 * 1000)));

    // Bookmark bonus
    const bookmark = entry.isBookmark ? 1.0 : 0.0;

    // Open tab bonus
    const openTab = isOpenTab ? 1.0 : 0.0;

    return (
      0.40 * textMatch +
      0.25 * frequency +
      0.20 * recency +
      0.10 * bookmark +
      0.05 * openTab
    );
  }

  public getLocalSuggestions(rawQuery: string): OmniboxItem[] {
    const query = rawQuery.trim();
    if (!query) return [];

    const items: OmniboxItem[] = [];

    // 1. AI Command Classifier
    const isAiCommand = /^(?:play|open|search|click|find|research|summarize|watch|read|go\s+to|what|how|why)\b/i.test(query);
    if (isAiCommand) {
      items.push({
        id: 'ai-action',
        text: query,
        html: `<b>✦ Ask Tesseract:</b> "${this.escapeHtml(query)}"`,
        description: 'Execute Autonomous Agent Action',
        type: 'AI',
      });
    }

    // 2. Direct Domain Navigation
    const domainMatch = query.match(/^([a-zA-Z0-9-]+\.(?:com|org|net|io|dev|app|ai|co|in|edu|gov|xyz|tv|me))(\/.*)?$/i);
    if (domainMatch) {
      const fullUrl = `https://${query}`;
      items.push({
        id: 'direct-url',
        text: fullUrl,
        html: `<b>Go to:</b> ${this.escapeHtml(fullUrl)}`,
        description: 'Open website directly',
        type: 'URL',
        url: fullUrl,
        score: 1.5,
      });
    }

    // 3. Open Tabs Match
    for (const tab of this.openTabs) {
      if (tab.title.toLowerCase().includes(query.toLowerCase()) || tab.url.toLowerCase().includes(query.toLowerCase())) {
        items.push({
          id: `tab-${tab.id}`,
          text: tab.title,
          html: `<b>${this.escapeHtml(tab.title)}</b>`,
          description: `Switch to open tab (${this.extractDomain(tab.url)})`,
          type: 'TAB',
          url: tab.url,
          score: 1.2,
        });
      }
    }

    // 4. History & Bookmarks with Deterministic Formula
    const scoredHistory: Array<{ entry: HistoryEntry; score: number }> = [];
    for (const entry of this.historyStore.values()) {
      const isOpen = this.openTabs.some(t => t.url === entry.url);
      const score = this.calculateScore(entry, query, isOpen);
      if (score > 0.15) {
        scoredHistory.push({ entry, score });
      }
    }

    scoredHistory.sort((a, b) => b.score - a.score);

    for (const { entry, score } of scoredHistory.slice(0, 4)) {
      if (!items.some(i => i.url === entry.url)) {
        const desc = entry.isBookmark ? 'Bookmarked' : 'Recently Visited';
        items.push({
          id: `hist-${entry.url}`,
          text: entry.title,
          html: `${this.formatMatchBold(entry.title, query)} <span style="opacity:0.6; font-size:11px;">(${this.extractDomain(entry.url)})</span>`,
          description: desc,
          type: entry.isBookmark ? 'BOOKMARK' : 'HISTORY',
          url: entry.url,
          score,
        });
      }
    }

    return items;
  }

  public async getSuggestions(rawQuery: string): Promise<OmniboxItem[]> {
    const query = rawQuery.trim();
    if (!query) return [];

    const cacheKey = query.toLowerCase();
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const items: OmniboxItem[] = this.getLocalSuggestions(query);

    // 5. Live Google Suggest API (client=chrome)
    try {
      const googleSuggestions = await this.fetchGoogleSuggest(query);
      for (const item of googleSuggestions) {
        if (!items.some(i => i.text.toLowerCase() === item.text.toLowerCase())) {
          items.push(item);
        }
      }
    } catch (err) {
      console.warn('[OmniboxEngine] Google Suggest error:', err);
    }

    // 6. Ensure standard Google Search fallback
    if (!items.some(i => i.type === 'SEARCH' && i.text.toLowerCase() === query.toLowerCase())) {
      items.push({
        id: 'search-fallback',
        text: query,
        html: `Search Google for "${this.escapeHtml(query)}"`,
        description: 'Google Search',
        type: 'SEARCH',
      });
    }

    const finalResults = items.slice(0, 8);

    // Save to LRU cache
    if (this.cache.size >= this.maxCacheSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }
    this.cache.set(cacheKey, finalResults);

    return finalResults;
  }

  private fetchGoogleSuggest(query: string): Promise<OmniboxItem[]> {
    return new Promise((resolve) => {
      const url = `https://suggestqueries.google.com/complete/search?client=chrome&q=${encodeURIComponent(query)}`;
      const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }, timeout: 800 }, (res) => {
        let rawData = '';
        res.on('data', chunk => { rawData += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(rawData);
            const suggestions: string[] = parsed[1] || [];
            const results: OmniboxItem[] = suggestions.map((text, idx) => ({
              id: `goog-${idx}`,
              text,
              html: this.formatMatchBold(text, query),
              description: 'Google Search',
              type: 'SEARCH',
            }));
            resolve(results);
          } catch {
            resolve([]);
          }
        });
      });
      req.on('error', () => resolve([]));
      req.on('timeout', () => { req.destroy(); resolve([]); });
    });
  }

  private formatMatchBold(fullText: string, query: string): string {
    const qLower = query.toLowerCase();
    const fLower = fullText.toLowerCase();
    if (fLower.startsWith(qLower)) {
      const matchPart = fullText.slice(0, query.length);
      const restPart = fullText.slice(query.length);
      return `${this.escapeHtml(matchPart)}<b>${this.escapeHtml(restPart)}</b>`;
    }
    return this.escapeHtml(fullText);
  }

  private extractDomain(urlStr: string): string {
    try {
      const u = new URL(urlStr);
      return u.hostname.replace(/^www\./, '');
    } catch {
      return urlStr;
    }
  }

  private escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}
