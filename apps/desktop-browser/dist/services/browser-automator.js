"use strict";
/**
 * BrowserAutomator: Safe, robust webview automation engine.
 * Eliminates "The WebView must be attached to the DOM and the dom-ready event emitted" errors
 * using the executeWhenReady abstraction.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrowserAutomator = void 0;
const dom_agent_js_1 = require("./dom-agent.js");
const user_memory_js_1 = require("./user-memory.js");
class BrowserAutomator {
    static instance = null;
    static getInstance() {
        if (!BrowserAutomator.instance) {
            BrowserAutomator.instance = new BrowserAutomator();
        }
        return BrowserAutomator.instance;
    }
    getWebview() {
        if (typeof document === 'undefined')
            return null;
        return document.getElementById('webview');
    }
    async executeScript(script, timeoutMs = 6000) {
        return this.executeWhenReady(script, timeoutMs);
    }
    /**
     * Execute JavaScript inside a webview only after verifying it is attached,
     * not destroyed, and ready to receive commands.
     */
    async executeWhenReady(script, timeoutMs = 6000) {
        const wv = this.getWebview();
        if (!wv) {
            console.warn('[Automator] Webview element not found in DOM');
            return null;
        }
        if (!document.contains(wv)) {
            console.warn('[Automator] Webview is detached from document body');
            return null;
        }
        // Await dom-ready if webview is currently loading or uninitialized
        if (typeof wv.isLoading === 'function' && wv.isLoading()) {
            await new Promise((resolve) => {
                let timer = null;
                const onDomReady = () => {
                    if (timer)
                        clearTimeout(timer);
                    wv.removeEventListener('dom-ready', onDomReady);
                    resolve();
                };
                timer = setTimeout(() => {
                    wv.removeEventListener('dom-ready', onDomReady);
                    resolve();
                }, timeoutMs);
                wv.addEventListener('dom-ready', onDomReady, { once: true });
            });
        }
        try {
            if (typeof wv.executeJavaScript === 'function') {
                return await wv.executeJavaScript(script);
            }
        }
        catch (err) {
            console.warn('[Automator] executeJavaScript caught:', err.message);
        }
        return null;
    }
    async navigate(url, onProgress) {
        console.log(`[Browser] navigate started: "${url}"`);
        const wv = this.getWebview();
        if (!wv) {
            console.error('[Browser] navigate failed: no webview');
            return { success: false, error: 'Webview not found' };
        }
        if (onProgress)
            onProgress(`Navigating to ${url}...`);
        return new Promise((resolve) => {
            let resolved = false;
            const onDone = () => {
                if (!resolved) {
                    resolved = true;
                    wv.removeEventListener('did-finish-load', onDone);
                    wv.removeEventListener('dom-ready', onDone);
                    console.log(`[Browser] navigate completed: "${url}"`);
                    resolve({ success: true, result: url });
                }
            };
            wv.addEventListener('dom-ready', onDone, { once: true });
            wv.addEventListener('did-finish-load', onDone, { once: true });
            setTimeout(onDone, 4000); // Fast safety fallback
            try {
                if (url.startsWith('data:') || url.startsWith('file:') || url.startsWith('about:')) {
                    wv.src = url;
                }
                else if (typeof window.navigateToUrl === 'function') {
                    window.navigateToUrl(url);
                }
                else {
                    wv.src = url;
                }
            }
            catch (err) {
                console.error('[Browser] navigate error:', err);
                resolve({ success: false, error: err.message });
            }
        });
    }
    async goBack() {
        console.log('[Browser] action started: goBack');
        const wv = this.getWebview();
        if (!wv)
            return { success: false, error: 'Webview not found' };
        try {
            if (typeof wv.canGoBack === 'function' && wv.canGoBack()) {
                wv.goBack();
                console.log('[Browser] action completed: goBack');
                return { success: true, result: 'Navigated back' };
            }
            return { success: false, error: 'Cannot go back (history start)' };
        }
        catch (err) {
            return { success: false, error: err.message };
        }
    }
    async goForward() {
        console.log('[Browser] action started: goForward');
        const wv = this.getWebview();
        if (!wv)
            return { success: false, error: 'Webview not found' };
        try {
            if (typeof wv.canGoForward === 'function' && wv.canGoForward()) {
                wv.goForward();
                console.log('[Browser] action completed: goForward');
                return { success: true, result: 'Navigated forward' };
            }
            return { success: false, error: 'Cannot go forward (history end)' };
        }
        catch (err) {
            return { success: false, error: err.message };
        }
    }
    async reload() {
        console.log('[Browser] action started: reload');
        const wv = this.getWebview();
        if (!wv)
            return { success: false, error: 'Webview not found' };
        try {
            wv.reload();
            console.log('[Browser] action completed: reload');
            return { success: true, result: 'Reloaded' };
        }
        catch (err) {
            return { success: false, error: err.message };
        }
    }
    async click(options) {
        if (options.selector) {
            return this.clickElement(options.selector);
        }
        if (options.elementId) {
            console.log(`[Browser] click by elementId started: "${options.elementId}"`);
            const script = `
        (() => {
          function queryDeep(sel, root = document) {
            let found = root.querySelector(sel);
            if (found) return found;
            const all = root.querySelectorAll('*');
            for (const el of all) {
              if (el.shadowRoot) {
                found = queryDeep(sel, el.shadowRoot);
                if (found) return found;
              }
              if (el.tagName === 'IFRAME') {
                try {
                  if (el.contentDocument && el.contentDocument.body) {
                    found = queryDeep(sel, el.contentDocument.body);
                    if (found) return found;
                  }
                } catch (_) {}
              }
            }
            return null;
          }

          const el = queryDeep('[data-tesseract-id="${options.elementId}"]') || document.getElementById('${options.elementId}');
          if (!el) return false;
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
          el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
          el.click();
          return true;
        })()
      `;
            const result = await this.executeWhenReady(script);
            return { success: Boolean(result), result };
        }
        return { success: false, error: 'No selector or elementId provided' };
    }
    async clickElement(selector) {
        console.log(`[Browser] clickElement started: "${selector}"`);
        const script = `
      (() => {
        function queryDeep(sel, root = document) {
          let found = root.querySelector(sel);
          if (found) return found;
          const all = root.querySelectorAll('*');
          for (const el of all) {
            if (el.shadowRoot) {
              found = queryDeep(sel, el.shadowRoot);
              if (found) return found;
            }
            if (el.tagName === 'IFRAME') {
              try {
                if (el.contentDocument && el.contentDocument.body) {
                  found = queryDeep(sel, el.contentDocument.body);
                  if (found) return found;
                }
              } catch (_) {}
            }
          }
          return null;
        }

        const el = queryDeep(${JSON.stringify(selector)});
        if (!el) return false;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const prevOutline = el.style.outline;
        el.style.outline = '2px solid #38bdf8';
        el.style.boxShadow = '0 0 12px rgba(56, 189, 248, 0.4)';
        setTimeout(() => {
          el.style.outline = prevOutline;
          el.style.boxShadow = '';
        }, 1200);

        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        el.click();
        return true;
      })()
    `;
        const result = await this.executeWhenReady(script);
        console.log(`[Browser] clickElement completed: ${Boolean(result)}`);
        return { success: Boolean(result), result };
    }
    async playFirstMedia() {
        return this.playOrdinalMedia(0);
    }
    async playOrdinalMedia(index = 0) {
        console.log(`[Browser] playOrdinalMedia started (index: ${index})`);
        const script = `
      (() => {
        // 1. YouTube video links
        const ytItems = Array.from(document.querySelectorAll('ytd-video-renderer a#thumbnail, ytd-rich-item-renderer a#thumbnail, a#video-title'));
        if (ytItems.length > 0) {
          const target = ytItems[${index}] || ytItems[0];
          target.click();
          return 'Started YouTube video playback';
        }

        // 2. Generic video elements
        const videos = Array.from(document.querySelectorAll('video'));
        if (videos.length > 0) {
          const v = videos[${index}] || videos[0];
          v.play().catch(() => {});
          return 'Playing HTML5 video';
        }

        // 3. Search result links (Google, etc.)
        const searchResults = Array.from(document.querySelectorAll('.g a, [data-component-type="s-search-result"] h2 a, .result__url'));
        if (searchResults.length > 0) {
          const target = searchResults[${index}] || searchResults[0];
          target.click();
          return 'Opened search result';
        }

        return 'No actionable media or result elements found';
      })()
    `;
        const result = await this.executeWhenReady(script);
        console.log(`[Browser] playOrdinalMedia completed: "${result}"`);
        return { success: Boolean(result && !result.includes('No actionable')), result: result || undefined };
    }
    async createTab(url = 'about:blank') {
        console.log(`[Browser] createTab requested: "${url}"`);
        try {
            if (typeof window.createNewTab === 'function') {
                window.createNewTab(url);
                return { success: true, result: url };
            }
            return { success: false, error: 'createNewTab not available on window' };
        }
        catch (err) {
            return { success: false, error: err.message };
        }
    }
    async closeCurrentTab() {
        console.log('[Browser] closeCurrentTab requested');
        try {
            if (typeof window.closeCurrentTab === 'function') {
                window.closeCurrentTab();
                return { success: true };
            }
            return { success: false, error: 'closeCurrentTab not available on window' };
        }
        catch (err) {
            return { success: false, error: err.message };
        }
    }
    async scrollDown(pixels = 500) {
        return this.scroll('down', pixels);
    }
    async scrollUp(pixels = 500) {
        return this.scroll('up', pixels);
    }
    async scroll(direction, amount = 450) {
        console.log(`[Browser] scroll started: ${direction} (${amount}px)`);
        let script = '';
        switch (direction) {
            case 'up':
                script = `window.scrollBy({ top: -${amount}, behavior: 'smooth' });`;
                break;
            case 'down':
                script = `window.scrollBy({ top: ${amount}, behavior: 'smooth' });`;
                break;
            case 'top':
                script = `window.scrollTo({ top: 0, behavior: 'smooth' });`;
                break;
            case 'bottom':
                script = `window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });`;
                break;
            default:
                script = `window.scrollBy({ top: ${amount}, behavior: 'smooth' });`;
        }
        await this.executeWhenReady(script);
        return { success: true };
    }
    async wait(ms = 1000) {
        console.log(`[Browser] wait started: ${ms}ms`);
        await new Promise((r) => setTimeout(r, ms));
        return { success: true, result: `Waited ${ms}ms` };
    }
    async type(options) {
        const { selector, elementId, text, pressEnter = false } = options;
        console.log(`[Browser] type started: text="${text}", selector="${selector || ''}", elementId="${elementId || ''}", pressEnter=${pressEnter}`);
        const script = `
      (() => {
        function queryDeep(sel, root = document) {
          let found = root.querySelector(sel);
          if (found) return found;
          const all = root.querySelectorAll('*');
          for (const el of all) {
            if (el.shadowRoot) {
              found = queryDeep(sel, el.shadowRoot);
              if (found) return found;
            }
            if (el.tagName === 'IFRAME') {
              try {
                if (el.contentDocument && el.contentDocument.body) {
                  found = queryDeep(sel, el.contentDocument.body);
                  if (found) return found;
                }
              } catch (_) {}
            }
          }
          return null;
        }

        let el = null;
        if (${JSON.stringify(elementId || '')}) {
          el = queryDeep('[data-tesseract-id="${elementId}"]') || document.getElementById('${elementId}');
        }
        if (!el && ${JSON.stringify(selector || '')}) {
          el = queryDeep(${JSON.stringify(selector || '')});
        }
        if (!el) return false;

        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.focus();

        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
          el.value = ${JSON.stringify(text)};
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (el.isContentEditable || el.getAttribute('contenteditable') === 'true') {
          el.textContent = ${JSON.stringify(text)};
          el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ${JSON.stringify(text)} }));
        }

        if (${Boolean(pressEnter)}) {
          el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
          el.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
          el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
          if (el.form) {
            el.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
          }
        }
        return true;
      })()
    `;
        const result = await this.executeWhenReady(script);
        return { success: Boolean(result), result };
    }
    async pauseMedia() {
        console.log('[Browser] pauseMedia started');
        const script = `
      (() => {
        // 1. YouTube player pause button
        const ytBtn = document.querySelector('.ytp-play-button');
        if (ytBtn && (ytBtn.getAttribute('data-title-no-tooltip')?.toLowerCase().includes('pause') || ytBtn.getAttribute('aria-label')?.toLowerCase().includes('pause'))) {
          ytBtn.click();
          return 'Triggered YouTube pause button';
        }

        // 2. HTML5 video elements
        const videos = Array.from(document.querySelectorAll('video'));
        let count = 0;
        videos.forEach(v => {
          if (!v.paused) {
            v.pause();
            count++;
          }
        });
        if (count > 0) return 'Paused ' + count + ' video(s)';

        // 3. Fallback keyboard event
        const event = new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', keyCode: 75, which: 75, bubbles: true });
        document.body.dispatchEvent(event);
        return 'Dispatched playback toggle event';
      })()
    `;
        const result = await this.executeWhenReady(script);
        return { success: true, result };
    }
    async resumeMedia() {
        console.log('[Browser] resumeMedia started');
        const script = `
      (() => {
        // 1. YouTube player play button
        const ytBtn = document.querySelector('.ytp-play-button');
        if (ytBtn && (ytBtn.getAttribute('data-title-no-tooltip')?.toLowerCase().includes('play') || ytBtn.getAttribute('aria-label')?.toLowerCase().includes('play'))) {
          ytBtn.click();
          return 'Triggered YouTube play button';
        }

        // 2. HTML5 video elements
        const videos = Array.from(document.querySelectorAll('video'));
        let count = 0;
        videos.forEach(v => {
          if (v.paused) {
            v.play().catch(() => {});
            count++;
          }
        });
        if (count > 0) return 'Resumed ' + count + ' video(s)';

        // 3. Fallback keyboard event
        const event = new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', keyCode: 75, which: 75, bubbles: true });
        document.body.dispatchEvent(event);
        return 'Dispatched playback toggle event';
      })()
    `;
        const result = await this.executeWhenReady(script);
        return { success: true, result };
    }
    async extractDirectMessage(contactName = '') {
        const res = await this.inspectSocialDMs();
        if (res.success && res.result?.sender) {
            return `${res.result.sender}: "${res.result.preview}"`;
        }
        return 'No active message thread visible';
    }
    /**
     * Inject login watcher into the active page to auto-fill remembered username
     * and monitor password input for 5-second typing inactivity auto-submission.
     */
    async injectLoginWatcher(domain) {
        const rememberedUser = user_memory_js_1.UserMemoryStore.getInstance().getUsername(domain);
        const script = dom_agent_js_1.DOMAgent.getLoginWatcherScript(rememberedUser);
        const result = await this.executeWhenReady(script);
        console.log(`[Browser] Login watcher armed on ${domain} (Remembered: ${rememberedUser || 'None'})`);
        return { success: Boolean(result), result };
    }
    /**
     * Autofill shipping or billing address forms using user's saved local profile.
     */
    async autofillAddress(profile) {
        const userProfile = profile || user_memory_js_1.UserMemoryStore.getInstance().getAddressProfile();
        if (!userProfile) {
            return { success: false, error: 'No saved address profile found in local memory' };
        }
        const script = dom_agent_js_1.DOMAgent.getAutofillAddressScript(userProfile);
        const result = await this.executeWhenReady(script);
        console.log(`[Browser] Autofill address completed: "${result}"`);
        return { success: Boolean(result && !result.includes('No matching')), result: result || undefined };
    }
    /**
     * Inspect social DMs (Instagram, Twitter, chat threads) to see who texted.
     */
    async inspectSocialDMs() {
        const script = dom_agent_js_1.DOMAgent.getDMInspectionScript();
        const raw = await this.executeWhenReady(script);
        try {
            if (raw) {
                const parsed = JSON.parse(raw);
                if (!parsed.error) {
                    return { success: true, result: parsed };
                }
            }
        }
        catch (_) { }
        return { success: false, error: 'No direct messages found on active page' };
    }
    /**
     * Type and send a direct message reply in the active chat thread.
     */
    async sendDirectMessage(replyText) {
        const script = dom_agent_js_1.DOMAgent.getDMSendReplyScript(replyText);
        const result = await this.executeWhenReady(script);
        return { success: Boolean(result && !result.includes('not found')), result: result || undefined };
    }
    /**
     * Observe active YouTube / Shorts or webpage content for interactive co-browsing.
     */
    async observeCoBrowsingContent() {
        const script = dom_agent_js_1.DOMAgent.getCoBrowsingObservationScript();
        const raw = await this.executeWhenReady(script);
        try {
            if (raw) {
                const parsed = JSON.parse(raw);
                return { success: true, result: parsed };
            }
        }
        catch (_) { }
        return { success: false, error: 'Could not observe current page content' };
    }
    /**
     * Hover over an element.
     */
    async hover(options) {
        const script = `
      (() => {
        let el = null;
        if (${JSON.stringify(options.elementId || '')}) {
          el = document.querySelector('[data-tesseract-id="${options.elementId}"]') || document.getElementById('${options.elementId}');
        }
        if (!el && ${JSON.stringify(options.selector || '')}) {
          el = document.querySelector(${JSON.stringify(options.selector || '')});
        }
        if (!el) return false;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        return true;
      })()
    `;
        const result = await this.executeWhenReady(script);
        return { success: Boolean(result), result };
    }
    /**
     * Select an option from a <select> dropdown element.
     */
    async selectOption(options) {
        const script = `
      (() => {
        let el = null;
        if (${JSON.stringify(options.elementId || '')}) {
          el = document.querySelector('[data-tesseract-id="${options.elementId}"]') || document.getElementById('${options.elementId}');
        }
        if (!el && ${JSON.stringify(options.selector || '')}) {
          el = document.querySelector(${JSON.stringify(options.selector || '')});
        }
        if (!el || el.tagName !== 'SELECT') return false;
        el.value = ${JSON.stringify(options.value)};
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()
    `;
        const result = await this.executeWhenReady(script);
        return { success: Boolean(result), result };
    }
    /**
     * Press key with optional modifiers.
     */
    async pressKey(key, modifiers = {}) {
        const script = `
      (() => {
        const eventInit = {
          key: ${JSON.stringify(key)},
          code: ${JSON.stringify(key.length === 1 ? 'Key' + key.toUpperCase() : key)},
          ctrlKey: ${Boolean(modifiers.ctrl)},
          shiftKey: ${Boolean(modifiers.shift)},
          altKey: ${Boolean(modifiers.alt)},
          metaKey: ${Boolean(modifiers.meta)},
          bubbles: true,
          cancelable: true
        };
        const target = document.activeElement || document.body;
        target.dispatchEvent(new KeyboardEvent('keydown', eventInit));
        target.dispatchEvent(new KeyboardEvent('keypress', eventInit));
        target.dispatchEvent(new KeyboardEvent('keyup', eventInit));
        return true;
      })()
    `;
        const result = await this.executeWhenReady(script);
        return { success: Boolean(result) };
    }
    /**
     * Switch active tab by tabId.
     */
    async switchTab(tabId) {
        try {
            if (typeof window.activateTab === 'function') {
                window.activateTab(tabId);
                return { success: true, result: tabId };
            }
            return { success: false, error: 'activateTab not available on window' };
        }
        catch (err) {
            return { success: false, error: err.message };
        }
    }
    /**
     * List open browser tabs.
     */
    async listTabs() {
        try {
            const tabs = window.tabs || [];
            const activeId = window.activeTabId;
            const formatted = tabs.map((t) => ({
                id: t.id,
                url: t.url,
                title: t.title,
                active: t.id === activeId,
            }));
            return { success: true, result: formatted };
        }
        catch (err) {
            return { success: false, error: err.message };
        }
    }
    /**
     * Verify whether an element matching a selector or condition exists.
     */
    async verifyElement(selector, timeoutMs = 4000) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            const found = await this.executeWhenReady(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
            if (found)
                return true;
            await new Promise(r => setTimeout(r, 200));
        }
        return false;
    }
}
exports.BrowserAutomator = BrowserAutomator;
//# sourceMappingURL=browser-automator.js.map