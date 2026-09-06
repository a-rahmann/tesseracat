"use strict";
/**
 * BrowserPerception: Unified sensory perception layer for Tesseract.
 * Provides structured DOM accessibility snapshots, video understanding, and page change detection.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrowserPerception = void 0;
const accessibility_tree_js_1 = require("./accessibility-tree.js");
const media_js_1 = require("./media.js");
class BrowserPerception {
    static instance = null;
    lastSnapshotHash = '';
    static getInstance() {
        if (!BrowserPerception.instance) {
            BrowserPerception.instance = new BrowserPerception();
        }
        return BrowserPerception.instance;
    }
    getActiveWebview() {
        if (typeof document === 'undefined')
            return null;
        const activeTab = document.querySelector('.tab-content.active webview');
        return activeTab || document.querySelector('webview');
    }
    /**
     * Captures a compact accessibility snapshot of the active webview.
     */
    async getSnapshot() {
        const webview = this.getActiveWebview();
        if (!webview) {
            return {
                url: 'about:blank',
                title: 'No active tab',
                elements: [],
                media: [],
                domHash: '',
                timestamp: Date.now(),
            };
        }
        try {
            const raw = await webview.executeJavaScript(accessibility_tree_js_1.INJECTED_DOM_SNAPSHOT_SCRIPT);
            const elements = raw.elements || [];
            const media = raw.media || [];
            const domHash = this.computeHash(raw.url, raw.title, elements.length);
            this.lastSnapshotHash = domHash;
            return {
                url: raw.url || webview.getURL() || '',
                title: raw.title || webview.getTitle() || '',
                elements,
                media,
                domHash,
                timestamp: Date.now(),
            };
        }
        catch (err) {
            console.error('[BrowserPerception] Snapshot extraction failed:', err);
            return {
                url: webview.getURL() || '',
                title: webview.getTitle() || '',
                elements: [],
                media: [],
                domHash: '',
                timestamp: Date.now(),
            };
        }
    }
    /**
     * Formats current snapshot elements into a token-efficient string for Gemma 3.
     */
    async getCompactElementSummary() {
        const snap = await this.getSnapshot();
        return accessibility_tree_js_1.AccessibilityTreeFormatter.toCompactString(snap.elements);
    }
    /**
     * Captures visual screenshot of the current webview.
     */
    async captureScreenshot() {
        const webview = this.getActiveWebview();
        if (!webview || typeof webview.capturePage !== 'function')
            return null;
        try {
            const nativeImage = await webview.capturePage();
            return nativeImage.toDataURL();
        }
        catch (err) {
            console.error('[BrowserPerception] Screenshot capture failed:', err);
            return null;
        }
    }
    /**
     * Observes video playback state, title, and captions.
     */
    async observeVideo() {
        const webview = this.getActiveWebview();
        if (!webview)
            return { hasVideo: false };
        try {
            return await webview.executeJavaScript(media_js_1.INJECTED_MEDIA_OBSERVER_SCRIPT);
        }
        catch (err) {
            console.error('[BrowserPerception] Video observation failed:', err);
            return { hasVideo: false };
        }
    }
    /**
     * Waits for an element matching a selector to appear, with timeout.
     */
    async waitForElement(selector, timeoutMs = 5000) {
        const webview = this.getActiveWebview();
        if (!webview)
            return false;
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            try {
                const found = await webview.executeJavaScript(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
                if (found)
                    return true;
            }
            catch { }
            await new Promise(r => setTimeout(r, 250));
        }
        return false;
    }
    /**
     * Waits for URL or DOM hash to change.
     */
    async waitForPageChange(timeoutMs = 5000) {
        const initialHash = this.lastSnapshotHash;
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            const snap = await this.getSnapshot();
            if (snap.domHash !== initialHash)
                return true;
            await new Promise(r => setTimeout(r, 300));
        }
        return false;
    }
    /**
     * Formal browser observation returning structured screen state with numbered targets.
     */
    async observe() {
        const snap = await this.getSnapshot();
        const media = await this.observeVideo();
        const formattedView = accessibility_tree_js_1.AccessibilityTreeFormatter.toNumberedList(snap.elements);
        return {
            url: snap.url,
            title: snap.title,
            elements: snap.elements,
            formattedView,
            media,
            timestamp: snap.timestamp,
        };
    }
    /**
     * Finds matching element by target query, role, index, or spatial hint ("right", "left").
     */
    async findMatchingElement(query, targetType, ordinalIndex = 1, spatialHint) {
        const snap = await this.getSnapshot();
        const cleanQuery = (query || '').toLowerCase().trim();
        let candidates = snap.elements;
        // Check direct index match (e.g. "click 2", "second one")
        const numericMatch = cleanQuery.match(/^(?:#|item\s*|result\s*|number\s*)?(\d+)$/i);
        if (numericMatch) {
            const idx = parseInt(numericMatch[1], 10);
            const direct = candidates.find(el => el.index === idx);
            if (direct)
                return direct;
        }
        if (targetType) {
            const roleMatched = candidates.filter(el => el.role === targetType);
            if (roleMatched.length > 0)
                candidates = roleMatched;
        }
        if (spatialHint) {
            if (spatialHint === 'right')
                candidates = candidates.filter(el => el.spatial?.isRightHalf);
            else if (spatialHint === 'left')
                candidates = candidates.filter(el => el.spatial?.isLeftHalf);
            else if (spatialHint === 'top')
                candidates = candidates.filter(el => el.spatial?.isTopHalf);
            else if (spatialHint === 'bottom')
                candidates = candidates.filter(el => el.spatial?.isBottomHalf);
        }
        if (cleanQuery && !numericMatch) {
            const textMatched = candidates.filter(el => {
                const name = (el.name || '').toLowerCase();
                const text = (el.text || '').toLowerCase();
                return name.includes(cleanQuery) || text.includes(cleanQuery);
            });
            if (textMatched.length > 0)
                candidates = textMatched;
        }
        if (candidates.length === 0)
            return null;
        const idx = Math.min(candidates.length - 1, Math.max(0, ordinalIndex - 1));
        return candidates[idx];
    }
    computeHash(url, title, elementCount) {
        return `${url}::${title}::${elementCount}`;
    }
}
exports.BrowserPerception = BrowserPerception;
//# sourceMappingURL=browser-perception.js.map