/**
 * BrowserAutomator: Webview action execution engine.
 * Executes granular tools: click, type, navigate, scroll, wait, and tab controls.
 */

import { BrowserPerception } from './browser-perception.js';

export class BrowserAutomator {
  private static instance: BrowserAutomator | null = null;

  public static getInstance(): BrowserAutomator {
    if (!BrowserAutomator.instance) {
      BrowserAutomator.instance = new BrowserAutomator();
    }
    return BrowserAutomator.instance;
  }

  private getActiveWebview(): any {
    if (typeof document === 'undefined') return null;
    const activeTab = document.querySelector('.tab-content.active webview') as any;
    return activeTab || document.querySelector('webview');
  }

  public async navigate(url: string): Promise<{ success: boolean; url: string }> {
    const webview = this.getActiveWebview();
    if (!webview) return { success: false, url };

    let target = url;
    if (!target.startsWith('http://') && !target.startsWith('https://') && !target.startsWith('about:')) {
      target = `https://${target}`;
    }

    try {
      webview.loadURL(target);
      await BrowserPerception.getInstance().waitForPageChange(4000);
      return { success: true, url: target };
    } catch (err) {
      return { success: false, url: target };
    }
  }

  public async click(target: { elementId?: string; selector?: string }): Promise<{ success: boolean }> {
    const webview = this.getActiveWebview();
    if (!webview) return { success: false };

    const selector = target.elementId
      ? `[data-tesseract-id="${target.elementId}"]`
      : target.selector;

    if (!selector) return { success: false };

    const script = `
      (() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return false;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.focus();
        el.click();
        return true;
      })();
    `;

    try {
      const res = await webview.executeJavaScript(script);
      return { success: Boolean(res) };
    } catch (err) {
      return { success: false };
    }
  }

  public async type(target: { elementId?: string; selector?: string; text: string; pressEnter?: boolean }): Promise<{ success: boolean }> {
    const webview = this.getActiveWebview();
    if (!webview) return { success: false };

    const selector = target.elementId
      ? `[data-tesseract-id="${target.elementId}"]`
      : target.selector;

    if (!selector) return { success: false };

    const script = `
      (() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return false;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.focus();
        el.value = ${JSON.stringify(target.text)};
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        ${target.pressEnter ? `
          el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
          el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', keyCode: 13, bubbles: true }));
        ` : ''}
        return true;
      })();
    `;

    try {
      const res = await webview.executeJavaScript(script);
      return { success: Boolean(res) };
    } catch (err) {
      return { success: false };
    }
  }

  public async scroll(direction: 'up' | 'down' | 'top' | 'bottom', amount = 400): Promise<{ success: boolean }> {
    const webview = this.getActiveWebview();
    if (!webview) return { success: false };

    let script = `window.scrollBy({ top: ${amount}, behavior: 'smooth' });`;
    if (direction === 'up') script = `window.scrollBy({ top: -${amount}, behavior: 'smooth' });`;
    else if (direction === 'top') script = `window.scrollTo({ top: 0, behavior: 'smooth' });`;
    else if (direction === 'bottom') script = `window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });`;

    try {
      await webview.executeJavaScript(script);
      return { success: true };
    } catch {
      return { success: false };
    }
  }

  public async goBack(): Promise<{ success: boolean }> {
    const webview = this.getActiveWebview();
    if (webview && webview.canGoBack()) {
      webview.goBack();
      return { success: true };
    }
    return { success: false };
  }

  public async goForward(): Promise<{ success: boolean }> {
    const webview = this.getActiveWebview();
    if (webview && webview.canGoForward()) {
      webview.goForward();
      return { success: true };
    }
    return { success: false };
  }

  public async reload(): Promise<{ success: boolean }> {
    const webview = this.getActiveWebview();
    if (webview) {
      webview.reload();
      return { success: true };
    }
    return { success: false };
  }

  public async createTab(url = 'about:blank'): Promise<{ success: boolean; tabId?: string }> {
    if (typeof (window as any).createNewTab === 'function') {
      const tab = (window as any).createNewTab(url);
      return { success: true, tabId: tab?.id };
    }
    return { success: false };
  }

  public async closeCurrentTab(): Promise<{ success: boolean }> {
    if (typeof (window as any).closeActiveTab === 'function') {
      (window as any).closeActiveTab();
      return { success: true };
    }
    return { success: false };
  }

  public async wait(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }
}
