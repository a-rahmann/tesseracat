"use strict";
/**
 * OmniboxSuggestionService: Google Chrome-Style Omnibar Autocomplete & Suggestions Engine.
 * Fetches real-time suggestions from Google Suggest API (client=chrome) with bold match formatting,
 * direct site navigation detection, and smart AI command integration.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.OmniboxSuggestionService = void 0;
const https = __importStar(require("https"));
function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
class OmniboxSuggestionService {
    static instance = null;
    cache = new Map();
    maxCacheSize = 100;
    static getInstance() {
        if (!OmniboxSuggestionService.instance) {
            OmniboxSuggestionService.instance = new OmniboxSuggestionService();
        }
        return OmniboxSuggestionService.instance;
    }
    /**
     * Fetch live suggestions for a query, mimicking Google Chrome omnibox exactly.
     */
    async getSuggestions(rawQuery) {
        const query = rawQuery.trim();
        if (!query)
            return [];
        // Check LRU cache for 0ms backspace response
        if (this.cache.has(query.toLowerCase())) {
            return this.cache.get(query.toLowerCase());
        }
        const results = [];
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
        }
        catch (err) {
            console.warn('[Omnibox] Google suggest fetch warning:', err);
        }
        // Ensure direct Google Search option is present
        const hasExactQuery = results.some(r => r.type === 'QUERY' && r.text.toLowerCase() === query.toLowerCase());
        if (!hasExactQuery) {
            const searchItem = {
                text: query,
                html: `${escapeHtml(query)}`,
                description: 'Google Search',
                type: 'QUERY',
                isUrl: false,
            };
            if (results.length > 0 && (results[0].type === 'AI' || results[0].type === 'NAVIGATION')) {
                results.splice(1, 0, searchItem);
            }
            else {
                results.unshift(searchItem);
            }
        }
        // Limit to top 8 suggestions (matching Chrome default)
        const finalResults = results.slice(0, 8);
        // Save to cache
        if (this.cache.size >= this.maxCacheSize) {
            const oldestKey = this.cache.keys().next().value;
            if (oldestKey)
                this.cache.delete(oldestKey);
        }
        this.cache.set(query.toLowerCase(), finalResults);
        return finalResults;
    }
    fetchFromGoogle(query) {
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
                        const queries = parsed[1] || [];
                        const descriptions = parsed[2] || [];
                        const types = (parsed[4] && parsed[4]['google:suggesttype']) || [];
                        const list = [];
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
                            }
                            else {
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
                    }
                    catch {
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
exports.OmniboxSuggestionService = OmniboxSuggestionService;
//# sourceMappingURL=omnibox-suggestions.js.map