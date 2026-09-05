/**
 * BrowserPerception: Unified sensory perception layer for Tesseract.
 * Provides structured DOM accessibility snapshots, video understanding, and page change detection.
 */

import { PageSnapshot, SnapshotElement } from './snapshot.js';
import { INJECTED_DOM_SNAPSHOT_SCRIPT, AccessibilityTreeFormatter } from './accessibility-tree.js';
import { INJECTED_MEDIA_OBSERVER_SCRIPT, VideoStateObservation } from './media.js';

export class BrowserPerception {
  private static instance: BrowserPerception | null = null;
  private lastSnapshotHash = '';

  public static getInstance(): BrowserPerception {
    if (!BrowserPerception.instance) {
      BrowserPerception.instance = new BrowserPerception();
    }
    return BrowserPerception.instance;
  }

  private getActiveWebview(): any {
    if (typeof document === 'undefined') return null;
    const activeTab = document.querySelector('.tab-content.active webview') as any;
    return activeTab || document.querySelector('webview');
  }

  /**
   * Captures a compact accessibility snapshot of the active webview.
   */
  public async getSnapshot(): Promise<PageSnapshot> {
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
      const raw: any = await webview.executeJavaScript(INJECTED_DOM_SNAPSHOT_SCRIPT);
      const elements: SnapshotElement[] = raw.elements || [];
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
    } catch (err) {
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
  public async getCompactElementSummary(): Promise<string> {
    const snap = await this.getSnapshot();
    return AccessibilityTreeFormatter.toCompactString(snap.elements);
  }

  /**
   * Captures visual screenshot of the current webview.
   */
  public async captureScreenshot(): Promise<string | null> {
    const webview = this.getActiveWebview();
    if (!webview || typeof webview.capturePage !== 'function') return null;
    try {
      const nativeImage = await webview.capturePage();
      return nativeImage.toDataURL();
    } catch (err) {
      console.error('[BrowserPerception] Screenshot capture failed:', err);
      return null;
    }
  }

  /**
   * Observes video playback state, title, and captions.
   */
  public async observeVideo(): Promise<VideoStateObservation> {
    const webview = this.getActiveWebview();
    if (!webview) return { hasVideo: false };

    try {
      return await webview.executeJavaScript(INJECTED_MEDIA_OBSERVER_SCRIPT);
    } catch (err) {
      console.error('[BrowserPerception] Video observation failed:', err);
      return { hasVideo: false };
    }
  }

  /**
   * Waits for an element matching a selector to appear, with timeout.
   */
  public async waitForElement(selector: string, timeoutMs = 5000): Promise<boolean> {
    const webview = this.getActiveWebview();
    if (!webview) return false;

    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const found = await webview.executeJavaScript(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
        if (found) return true;
      } catch {}
      await new Promise(r => setTimeout(r, 250));
    }
    return false;
  }

  /**
   * Waits for URL or DOM hash to change.
   */
  public async waitForPageChange(timeoutMs = 5000): Promise<boolean> {
    const initialHash = this.lastSnapshotHash;
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const snap = await this.getSnapshot();
      if (snap.domHash !== initialHash) return true;
      await new Promise(r => setTimeout(r, 300));
    }
    return false;
  }

  public async findMatchingElement(
    query?: string,
    targetType?: string,
    ordinalIndex = 1
  ): Promise<SnapshotElement | null> {
    const snap = await this.getSnapshot();
    const cleanQuery = (query || '').toLowerCase().trim();

    let candidates = snap.elements;
    if (targetType) {
      const roleMatched = candidates.filter(el => el.role === targetType);
      if (roleMatched.length > 0) candidates = roleMatched;
    }

    if (cleanQuery) {
      const textMatched = candidates.filter(el => {
        const name = (el.name || '').toLowerCase();
        const text = (el.text || '').toLowerCase();
        return name.includes(cleanQuery) || text.includes(cleanQuery);
      });
      if (textMatched.length > 0) candidates = textMatched;
    }

    if (candidates.length === 0) return null;

    const idx = Math.min(candidates.length - 1, Math.max(0, ordinalIndex - 1));
    return candidates[idx];
  }

  private computeHash(url: string, title: string, elementCount: number): string {
    return `${url}::${title}::${elementCount}`;
  }
}
