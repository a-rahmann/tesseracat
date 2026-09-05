/**
 * IntentEngine: Context-aware Natural Language Understanding for Tesseract.
 * Translates raw transcription into structured, actionable intents without
 * brittle regex chains. Maintains short-lived task context to resolve
 * pronouns ("the first one"), follow-ups ("go back"), and contextual searches ("open Amazon" -> "search Sony headphones").
 */
export type IntentType = 'navigation' | 'media_playback' | 'search' | 'browser_control' | 'shopping' | 'comparison' | 'page_action' | 'clarification';
export interface StructuredIntent {
    type: IntentType;
    confidence: number;
    rawText: string;
    cleanText: string;
    targetUrl?: string;
    query?: string;
    action?: 'navigate' | 'play' | 'search' | 'back' | 'forward' | 'reload' | 'click' | 'compare' | 'pause' | 'resume' | 'new_tab' | 'close_tab';
    referent?: 'first' | 'second' | 'third' | 'last' | number;
    spokenIntro?: string;
    spokenFeedback?: string;
    autoPlayMedia?: boolean;
    siteContext?: string;
    inNewTab?: boolean;
    parameters?: Record<string, any>;
}
export interface TaskContext {
    currentSite?: string;
    currentUrl?: string;
    lastIntent?: StructuredIntent;
    lastQuery?: string;
    lastResults?: any[];
    selectedResult?: any;
    history: StructuredIntent[];
}
export declare class IntentEngine {
    private static instance;
    private context;
    private sitePresets;
    private constructor();
    static getInstance(): IntentEngine;
    getContext(): TaskContext;
    updateCurrentUrl(url: string): void;
    /**
     * Strip wake-up phrases and polite conversational fillers.
     */
    stripWakeAndPreamble(text: string): {
        hasWakeWord: boolean;
        cleanText: string;
    };
    /**
     * Primary Entry Point: Classify raw utterance into a structured intent.
     */
    /**
     * Primary Entry Point: Classify raw utterance into a structured intent.
     */
    classify(rawTranscript: string): StructuredIntent;
    private matchBrowserControl;
    private matchOrdinalSelection;
    private matchMediaPlayback;
    private matchNavigation;
    private matchSearch;
    private matchShopping;
    private matchComparison;
    private createFallbackIntent;
    private recordIntent;
}
//# sourceMappingURL=intent-engine.d.ts.map