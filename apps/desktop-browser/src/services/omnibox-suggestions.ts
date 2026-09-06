/**
 * OmniboxSuggestionService: Google Chrome-Style Omnibar Autocomplete & Suggestions Engine.
 * Fetches real-time suggestions from Google Suggest API (client=chrome) with bold match formatting,
 * direct site navigation detection, and smart AI command integration.
 */

import * as https from 'https';

export interface OmniboxSuggestion {
  text: string;
  html: string;
  description?: string;
  type: 'QUERY' | 'NAVIGATION' | 'AI' | 'HISTORY';
  isUrl: boolean;
  url?: string;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export class OmniboxSuggestionService {
  private static instance: OmniboxSuggestionService | null = null;
  private cache: Map<string, OmniboxSuggestion[]> = new Map();
  private maxCacheSize = 100;

  public static getInstance(): OmniboxSuggestionService {
    if (!OmniboxSuggestionService.instance) {
      OmniboxSuggestionService.instance = new OmniboxSuggestionService();
    }
    return OmniboxSuggestionService.instance;
  }

  /**
   * Fetch live suggestions for a query, mimicking Google Chrome omnibox exactly.
   */
  public async getSuggestions(rawQuery: string): Promise<OmniboxSuggestion[]> {
    const query = rawQuery.trim();
    if (!query) return [];

    // Check LRU cache for 0ms backspace response
    if (this.cache.has(query.toLowerCase())) {
      return this.cache.get(query.toLowerCase())!;
    }

    const results: OmniboxSuggestion[] = [];

    // 1. If query looks like an AI action command, prepend a smart Tesseract AI suggestion
    const aiActionMatch = /^(play|open|click|watch|read|search|summarize|scroll|go to)\b/i.test(query);
    if (aiActionMatch) {
      results.push({
        text: query,
        html: `<b>✦ Ask Tesseract:</b> "${escapeHtml(query)}"`,
        description: 'Execute autonomous browser action',
        type: 'AI',
        isUrl: false,
      });
    }

    // 2. Direct URL suggestion if user is typing a domain name
    const domainMatch = query.match(/^([a-zA-Z0-9-]+\.(?:com|org|net|io|dev|app|ai|co|in|edu|gov|xyz|tv|me))(\/.*)?$/i);
    if (domainMatch) {
      const fullUrl = `https://${query}`;
      results.push({
        text: query,
        html: `<b>${escapeHtml(query)}</b>`,
        description: 'Direct Website Navigation',
        type: 'NAVIGATION',
        isUrl: true,
        url: fullUrl,
      });
    }

    // 3. Fetch from Google Suggest API (client=chrome)
    try {
      const googleResults = await this.fetchFromGoogle(query);
      for (const item of googleResults) {
        // Prevent duplicate entries
        if (!results.some(r => r.text.toLowerCase() === item.text.toLowerCase())) {
          results.push(item);
        }
      }
    } catch (err) {
      console.warn('[Omnibox] Google suggest fetch warning:', err);
    }

    // Ensure direct Google Search option is present
    const hasExactQuery = results.some(r => r.type === 'QUERY' && r.text.toLowerCase() === query.toLowerCase());
    if (!hasExactQuery) {
      const searchItem: OmniboxSuggestion = {
        text: query,
        html: `${escapeHtml(query)}`,
        description: 'Google Search',
        type: 'QUERY',
        isUrl: false,
      };
      if (results.length > 0 && (results[0].type === 'AI' || results[0].type === 'NAVIGATION')) {
        results.splice(1, 0, searchItem);
      } else {
        results.unshift(searchItem);
      }
    }

    // Limit to top 8 suggestions (matching Chrome default)
    const finalResults = results.slice(0, 8);

    // Save to cache
    if (this.cache.size >= this.maxCacheSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }
    this.cache.set(query.toLowerCase(), finalResults);

    return finalResults;
  }

  private fetchFromGoogle(query: string): Promise<OmniboxSuggestion[]> {
    return new Promise((resolve) => {
      const url = `https://suggestqueries.google.com/complete/search?client=chrome&q=${encodeURIComponent(query)}`;
      const req = https.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
          'Accept': '*/*',
        },
        timeout: 1800,
      }, (res) => {
        if (res.statusCode !== 200) {
          resolve([]);
          return;
        }

        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            const q = parsed[0] || query;
            const queries: string[] = parsed[1] || [];
            const descriptions: string[] = parsed[2] || [];
            const types: string[] = (parsed[4] && parsed[4]['google:suggesttype']) || [];

            const list: OmniboxSuggestion[] = [];
            for (let i = 0; i < queries.length; i++) {
              const text = queries[i];
              const desc = descriptions[i] || '';
              const type = types[i] || 'QUERY';
              const isNav = type === 'NAVIGATION' || /^https?:\/\//i.test(text);

              // Chrome-style bolding: matched query characters are standard, suggested extension is bold
              let html = '';
              const lowerText = text.toLowerCase();
              const lowerQ = q.toLowerCase();
              if (lowerText.startsWith(lowerQ)) {
                html = escapeHtml(text.slice(0, q.length)) + '<b>' + escapeHtml(text.slice(q.length)) + '</b>';
              } else {
                html = escapeHtml(text);
              }

              list.push({
                text,
                html,
                description: desc || (isNav ? 'Website' : ''),
                type: isNav ? 'NAVIGATION' : 'QUERY',
                isUrl: isNav,
                url: isNav ? text : undefined,
              });
            }
            resolve(list);
          } catch {
            resolve([]);
          }
        });
      });

      req.on('error', () => resolve([]));
      req.on('timeout', () => {
        req.destroy();
        resolve([]);
      });
    });
  }
}
