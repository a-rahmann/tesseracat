"use strict";
/**
 * Instagram Website Adapter.
 * Semantic DM handling, sender disambiguation, drafting, and password-safe login.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.InstagramAdapter = void 0;
const browser_automator_js_1 = require("../browser/browser-automator.js");
const browser_perception_js_1 = require("../browser/browser-perception.js");
class InstagramAdapter {
    static isInstagramUrl(url) {
        return /instagram\.com/i.test(url);
    }
    static async openDirectInbox() {
        const res = await browser_automator_js_1.BrowserAutomator.getInstance().navigate('https://www.instagram.com/direct/inbox/');
        await browser_perception_js_1.BrowserPerception.getInstance().waitForElement('div[role="listitem"], a[href*="/direct/t/"]', 6000);
        return res.success;
    }
    static async getMessageThreads() {
        const webview = (document.querySelector('.tab-content.active webview') || document.querySelector('webview'));
        if (!webview)
            return [];
        const script = `
      (() => {
        const results = [];
        const items = document.querySelectorAll('div[role="listitem"], a[href*="/direct/t/"]');
        let idx = 1;
        for (const item of items) {
          const userEl = item.querySelector('span[dir="auto"], span._ao3e, span.x1lliihq');
          const previewEl = item.querySelector('span.x1lliihq:last-child, div._ab8s');
          const username = userEl ? userEl.innerText.trim() : 'User ' + idx;
          const preview = previewEl ? previewEl.innerText.trim() : '';
          const isUnread = Boolean(item.querySelector('div.x14yjl9h, div[aria-label*="unread"]'));
          results.push({ index: idx++, username, preview, isUnread });
          if (results.length >= 10) break;
        }
        return results;
      })();
    `;
        try {
            return await webview.executeJavaScript(script);
        }
        catch {
            return [];
        }
    }
    static async findSenders(query) {
        const threads = await this.getMessageThreads();
        const clean = query.toLowerCase().trim();
        return threads.filter(t => t.username.toLowerCase().includes(clean));
    }
    static async openThreadByIndex(index) {
        const selector = `div[role="listitem"]:nth-of-type(${index}), a[href*="/direct/t/"]:nth-of-type(${index})`;
        const res = await browser_automator_js_1.BrowserAutomator.getInstance().click({ selector });
        return res.success;
    }
    static async readActiveConversation() {
        const webview = (document.querySelector('.tab-content.active webview') || document.querySelector('webview'));
        if (!webview)
            return null;
        const script = `
      (() => {
        const header = document.querySelector('header h2, div[role="main"] header span');
        const sender = header ? header.innerText.trim() : 'Friend';
        const messages = Array.from(document.querySelectorAll('div[role="row"], div[dir="auto"].x1lliihq'));
        const lastMsg = messages.length > 0 ? messages[messages.length - 1].innerText.trim() : '';
        return { sender, latestMessage: lastMsg };
      })();
    `;
        try {
            return await webview.executeJavaScript(script);
        }
        catch {
            return null;
        }
    }
    static async draftReply(text) {
        const selector = 'div[role="textbox"][contenteditable="true"], textarea[placeholder*="Message"]';
        return (await browser_automator_js_1.BrowserAutomator.getInstance().type({ selector, text, pressEnter: false })).success;
    }
    static async sendReply(text) {
        const selector = 'div[role="textbox"][contenteditable="true"], textarea[placeholder*="Message"]';
        return (await browser_automator_js_1.BrowserAutomator.getInstance().type({ selector, text, pressEnter: true })).success;
    }
}
exports.InstagramAdapter = InstagramAdapter;
//# sourceMappingURL=instagram.js.map