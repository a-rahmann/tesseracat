/**
 * BrowserAutomator: Safe, robust webview automation engine.
 * Eliminates "The WebView must be attached to the DOM and the dom-ready event emitted" errors
 * using the executeWhenReady abstraction.
 */
import { UserAddressProfile } from './user-memory.js';
export interface AutomatorResult<T = any> {
    success: boolean;
    result?: T;
    error?: string;
}
export declare class BrowserAutomator {
    private static instance;
    static getInstance(): BrowserAutomator;
    getWebview(): any;
    /**
     * Execute JavaScript inside a webview only after verifying it is attached,
     * not destroyed, and ready to receive commands.
     */
    executeWhenReady<T = any>(script: string, timeoutMs?: number): Promise<T | null>;
    navigate(url: string, onProgress?: (status: string) => void): Promise<AutomatorResult>;
    goBack(): Promise<AutomatorResult>;
    goForward(): Promise<AutomatorResult>;
    reload(): Promise<AutomatorResult>;
    click(options: {
        selector?: string;
        elementId?: string;
    }): Promise<AutomatorResult>;
    clickElement(selector: string): Promise<AutomatorResult>;
    playFirstMedia(): Promise<AutomatorResult<string>>;
    playOrdinalMedia(index?: number): Promise<AutomatorResult<string>>;
    createTab(url?: string): Promise<AutomatorResult>;
    closeCurrentTab(): Promise<AutomatorResult>;
    scrollDown(pixels?: number): Promise<AutomatorResult>;
    scrollUp(pixels?: number): Promise<AutomatorResult>;
    pauseMedia(): Promise<AutomatorResult>;
    resumeMedia(): Promise<AutomatorResult>;
    extractDirectMessage(contactName?: string): Promise<string>;
    /**
     * Inject login watcher into the active page to auto-fill remembered username
     * and monitor password input for 5-second typing inactivity auto-submission.
     */
    injectLoginWatcher(domain: string): Promise<AutomatorResult>;
    /**
     * Autofill shipping or billing address forms using user's saved local profile.
     */
    autofillAddress(profile?: UserAddressProfile): Promise<AutomatorResult<string>>;
    /**
     * Inspect social DMs (Instagram, Twitter, chat threads) to see who texted.
     */
    inspectSocialDMs(): Promise<AutomatorResult<{
        platform?: string;
        sender?: string;
        preview?: string;
        unreadCount?: number;
    }>>;
    /**
     * Type and send a direct message reply in the active chat thread.
     */
    sendDirectMessage(replyText: string): Promise<AutomatorResult<string>>;
    /**
     * Observe active YouTube / Shorts or webpage content for interactive co-browsing.
     */
    observeCoBrowsingContent(): Promise<AutomatorResult<{
        contentType?: string;
        title?: string;
        channel?: string;
        description?: string;
        recommendations?: string[];
    }>>;
}
//# sourceMappingURL=browser-automator.d.ts.map