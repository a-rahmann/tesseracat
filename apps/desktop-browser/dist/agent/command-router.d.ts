/**
 * CommandRouter: Explicit Action-Oriented Command Classification and Routing.
 * Invariant: ACTION != SEARCH. Never default to Google search.
 */
export type ActionType = 'NAVIGATE' | 'SEARCH' | 'CLICK' | 'TYPE' | 'SCROLL' | 'PLAY' | 'PAUSE' | 'RESUME' | 'OPEN' | 'CLOSE' | 'BACK' | 'FORWARD' | 'SELECT' | 'READ' | 'SUMMARIZE' | 'COMPARE' | 'MESSAGE' | 'REPLY' | 'DOWNLOAD' | 'UPLOAD' | 'LOGIN' | 'FORM_FILL' | 'RESEARCH' | 'WATCH' | 'ANALYZE' | 'STOP' | 'CANCEL' | 'UNKNOWN';
export interface RoutedCommand {
    action: ActionType;
    target?: 'video' | 'button' | 'link' | 'textbox' | 'tab' | 'screen' | 'message' | 'element' | 'web' | 'unknown';
    location: 'current_page' | 'youtube' | 'instagram' | 'google' | 'amazon' | 'gmail' | 'web' | 'new_tab';
    query?: string;
    index?: number;
    description?: string;
    rawText: string;
    cleanText: string;
    isFastPath: boolean;
    requiresBrowserPerception: boolean;
}
export declare class CommandRouter {
    static route(rawInput: string): RoutedCommand;
}
//# sourceMappingURL=command-router.d.ts.map