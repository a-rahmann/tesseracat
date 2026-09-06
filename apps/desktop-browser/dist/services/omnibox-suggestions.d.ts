/**
 * OmniboxSuggestionService: Google Chrome-Style Omnibar Autocomplete & Suggestions Engine.
 * Fetches real-time suggestions from Google Suggest API (client=chrome) with bold match formatting,
 * direct site navigation detection, and smart AI command integration.
 */
export interface OmniboxSuggestion {
    text: string;
    html: string;
    description?: string;
    type: 'QUERY' | 'NAVIGATION' | 'AI' | 'HISTORY';
    isUrl: boolean;
    url?: string;
}
export declare class OmniboxSuggestionService {
    private static instance;
    private cache;
    private maxCacheSize;
    static getInstance(): OmniboxSuggestionService;
    /**
     * Fetch live suggestions for a query, mimicking Google Chrome omnibox exactly.
     */
    getSuggestions(rawQuery: string): Promise<OmniboxSuggestion[]>;
    private fetchFromGoogle;
}
//# sourceMappingURL=omnibox-suggestions.d.ts.map