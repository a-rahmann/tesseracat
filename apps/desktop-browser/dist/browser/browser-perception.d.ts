/**
 * BrowserPerception: Unified sensory perception layer for Tesseract.
 * Provides structured DOM accessibility snapshots, video understanding, and page change detection.
 */
import { PageSnapshot, SnapshotElement } from './snapshot.js';
import { VideoStateObservation } from './media.js';
export declare class BrowserPerception {
    private static instance;
    private lastSnapshotHash;
    static getInstance(): BrowserPerception;
    private getActiveWebview;
    /**
     * Captures a compact accessibility snapshot of the active webview.
     */
    getSnapshot(): Promise<PageSnapshot>;
    /**
     * Formats current snapshot elements into a token-efficient string for Gemma 3.
     */
    getCompactElementSummary(): Promise<string>;
    /**
     * Captures visual screenshot of the current webview.
     */
    captureScreenshot(): Promise<string | null>;
    /**
     * Observes video playback state, title, and captions.
     */
    observeVideo(): Promise<VideoStateObservation>;
    /**
     * Waits for an element matching a selector to appear, with timeout.
     */
    waitForElement(selector: string, timeoutMs?: number): Promise<boolean>;
    /**
     * Waits for URL or DOM hash to change.
     */
    waitForPageChange(timeoutMs?: number): Promise<boolean>;
    findMatchingElement(query?: string, targetType?: string, ordinalIndex?: number): Promise<SnapshotElement | null>;
    private computeHash;
}
//# sourceMappingURL=browser-perception.d.ts.map