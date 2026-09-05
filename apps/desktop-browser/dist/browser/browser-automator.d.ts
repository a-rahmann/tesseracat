/**
 * BrowserAutomator: Webview action execution engine.
 * Executes granular tools: click, type, navigate, scroll, wait, and tab controls.
 */
export declare class BrowserAutomator {
    private static instance;
    static getInstance(): BrowserAutomator;
    private getActiveWebview;
    navigate(url: string): Promise<{
        success: boolean;
        url: string;
    }>;
    click(target: {
        elementId?: string;
        selector?: string;
    }): Promise<{
        success: boolean;
    }>;
    type(target: {
        elementId?: string;
        selector?: string;
        text: string;
        pressEnter?: boolean;
    }): Promise<{
        success: boolean;
    }>;
    scroll(direction: 'up' | 'down' | 'top' | 'bottom', amount?: number): Promise<{
        success: boolean;
    }>;
    goBack(): Promise<{
        success: boolean;
    }>;
    goForward(): Promise<{
        success: boolean;
    }>;
    reload(): Promise<{
        success: boolean;
    }>;
    createTab(url?: string): Promise<{
        success: boolean;
        tabId?: string;
    }>;
    closeCurrentTab(): Promise<{
        success: boolean;
    }>;
    wait(ms: number): Promise<void>;
}
//# sourceMappingURL=browser-automator.d.ts.map