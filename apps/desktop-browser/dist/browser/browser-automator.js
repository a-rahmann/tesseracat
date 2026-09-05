"use strict";
/**
 * BrowserAutomator: Webview action execution engine.
 * Executes granular tools: click, type, navigate, scroll, wait, and tab controls.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrowserAutomator = void 0;
const browser_perception_js_1 = require("./browser-perception.js");
class BrowserAutomator {
    static instance = null;
    static getInstance() {
        if (!BrowserAutomator.instance) {
            BrowserAutomator.instance = new BrowserAutomator();
        }
        return BrowserAutomator.instance;
    }
    getActiveWebview() {
        if (typeof document === 'undefined')
            return null;
        const activeTab = document.querySelector('.tab-content.active webview');
        return activeTab || document.querySelector('webview');
    }
    async navigate(url) {
        const webview = this.getActiveWebview();
        if (!webview)
            return { success: false, url };
        let target = url;
        if (!target.startsWith('http://') && !target.startsWith('https://') && !target.startsWith('about:')) {
            target = `https://${target}`;
        }
        try {
            webview.loadURL(target);
            await browser_perception_js_1.BrowserPerception.getInstance().waitForPageChange(4000);
            return { success: true, url: target };
        }
        catch (err) {
            return { success: false, url: target };
        }
    }
    async click(target) {
        const webview = this.getActiveWebview();
        if (!webview)
            return { success: false };
        const selector = target.elementId
            ? `[data-tesseract-id="${target.elementId}"]`
            : target.selector;
        if (!selector)
            return { success: false };
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
        }
        catch (err) {
            return { success: false };
        }
    }
    async type(target) {
        const webview = this.getActiveWebview();
        if (!webview)
            return { success: false };
        const selector = target.elementId
            ? `[data-tesseract-id="${target.elementId}"]`
            : target.selector;
        if (!selector)
            return { success: false };
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
        }
        catch (err) {
            return { success: false };
        }
    }
    async scroll(direction, amount = 400) {
        const webview = this.getActiveWebview();
        if (!webview)
            return { success: false };
        let script = `window.scrollBy({ top: ${amount}, behavior: 'smooth' });`;
        if (direction === 'up')
            script = `window.scrollBy({ top: -${amount}, behavior: 'smooth' });`;
        else if (direction === 'top')
            script = `window.scrollTo({ top: 0, behavior: 'smooth' });`;
        else if (direction === 'bottom')
            script = `window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });`;
        try {
            await webview.executeJavaScript(script);
            return { success: true };
        }
        catch {
            return { success: false };
        }
    }
    async goBack() {
        const webview = this.getActiveWebview();
        if (webview && webview.canGoBack()) {
            webview.goBack();
            return { success: true };
        }
        return { success: false };
    }
    async goForward() {
        const webview = this.getActiveWebview();
        if (webview && webview.canGoForward()) {
            webview.goForward();
            return { success: true };
        }
        return { success: false };
    }
    async reload() {
        const webview = this.getActiveWebview();
        if (webview) {
            webview.reload();
            return { success: true };
        }
        return { success: false };
    }
    async createTab(url = 'about:blank') {
        if (typeof window.createNewTab === 'function') {
            const tab = window.createNewTab(url);
            return { success: true, tabId: tab?.id };
        }
        return { success: false };
    }
    async closeCurrentTab() {
        if (typeof window.closeActiveTab === 'function') {
            window.closeActiveTab();
            return { success: true };
        }
        return { success: false };
    }
    async executeScript(script) {
        const webview = this.getActiveWebview();
        if (!webview)
            return null;
        try {
            return await webview.executeJavaScript(script);
        }
        catch (err) {
            console.warn('[BrowserAutomator] executeScript error:', err);
            return null;
        }
    }
    async wait(ms) {
        return new Promise(r => setTimeout(r, ms));
    }
}
exports.BrowserAutomator = BrowserAutomator;
//# sourceMappingURL=browser-automator.js.map