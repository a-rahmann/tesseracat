/**
 * BrowserAutomator: Safe, robust webview automation engine.
 * Eliminates "The WebView must be attached to the DOM and the dom-ready event emitted" errors
 * using the executeWhenReady abstraction.
 */
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
    clickElement(selector: string): Promise<AutomatorResult>;
    playFirstMedia(): Promise<AutomatorResult<string>>;
    playOrdinalMedia(index?: number): Promise<AutomatorResult<string>>;
    createTab(url?: string): Promise<AutomatorResult>;
    closeCurrentTab(): Promise<AutomatorResult>;
    pauseMedia(): Promise<AutomatorResult>;
    resumeMedia(): Promise<AutomatorResult>;
    extractDirectMessage(contactName?: string): Promise<string>;
}
//# sourceMappingURL=browser-automator.d.ts.map