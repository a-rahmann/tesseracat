"use strict";
/**
 * Gmail Website Adapter.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GmailAdapter = void 0;
const browser_automator_js_1 = require("../browser/browser-automator.js");
class GmailAdapter {
    static isGmailUrl(url) {
        return /mail\.google\.com/i.test(url);
    }
    static async openInbox() {
        return (await browser_automator_js_1.BrowserAutomator.getInstance().navigate('https://mail.google.com/')).success;
    }
    static async getUnreadEmails() {
        const webview = (document.querySelector('.tab-content.active webview') || document.querySelector('webview'));
        if (!webview)
            return [];
        const script = `
      (() => {
        const rows = document.querySelectorAll('tr.zA');
        const results = [];
        for (const row of rows) {
          const sender = row.querySelector('.yX span, .zF')?.textContent || '';
          const subject = row.querySelector('.bog span, .bqe')?.textContent || '';
          results.push({ sender: sender.trim(), subject: subject.trim() });
          if (results.length >= 8) break;
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
}
exports.GmailAdapter = GmailAdapter;
//# sourceMappingURL=gmail.js.map