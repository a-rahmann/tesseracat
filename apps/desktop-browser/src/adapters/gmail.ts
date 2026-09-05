/**
 * Gmail Website Adapter.
 */

import { BrowserAutomator } from '../browser/browser-automator.js';

export class GmailAdapter {
  public static isGmailUrl(url: string): boolean {
    return /mail\.google\.com/i.test(url);
  }

  public static async openInbox(): Promise<boolean> {
    return (await BrowserAutomator.getInstance().navigate('https://mail.google.com/')).success;
  }

  public static async getUnreadEmails(): Promise<Array<{ sender: string; subject: string }>> {
    const webview = (document.querySelector('.tab-content.active webview') || document.querySelector('webview')) as any;
    if (!webview) return [];

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
    } catch {
      return [];
    }
  }
}
