/**
 * IntentEngine: Context-aware Natural Language Understanding for Tesseract.
 * Translates raw transcription into structured, actionable intents without
 * brittle regex chains. Maintains short-lived task context to resolve
 * pronouns ("the first one"), follow-ups ("go back"), and contextual searches ("open Amazon" -> "search Sony headphones").
 */
export type IntentType = 'navigation' | 'media_playback' | 'search' | 'browser_control' | 'shopping' | 'comparison' | 'page_action' | 'check_messages' | 'reply_message' | 'autofill_form' | 'co_browse' | 'clarification';
export interface StructuredIntent {
    type: IntentType;
    confidence: number;
    rawText: string;
    cleanText: string;
    targetUrl?: string;
    query?: string;
    action?: 'navigate' | 'play' | 'search' | 'back' | 'forward' | 'reload' | 'click' | 'compare' | 'pause' | 'resume' | 'new_tab' | 'close_tab' | 'scroll_down' | 'scroll_up' | 'check_dms' | 'reply_dm' | 'autofill_address' | 'co_browse_video' | 'suggest_media';
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
    /**
     * Strip wake-up phrases and polite conversational fillers.
     * Matches "Hey Tesseract", "Hate us Iraq", "Hey test rats", "Hey test react",
     * and all regional phonetic accent variations through dual regex & phonetic skeleton matching.
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
    private matchSocialDMs;
    private matchAutofillForm;
    private matchCoBrowsing;
    private createFallbackIntent;
    private recordIntent;
}
//# sourceMappingURL=intent-engine.d.ts.map