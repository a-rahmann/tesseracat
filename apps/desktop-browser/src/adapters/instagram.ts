/**
 * Instagram Website Adapter.
 * Semantic DM handling, sender disambiguation, drafting, and password-safe login.
 */

import { BrowserAutomator } from '../browser/browser-automator.js';
import { BrowserPerception } from '../browser/browser-perception.js';

export interface InstagramThread {
  index: number;
  username: string;
  preview: string;
  isUnread: boolean;
}

export class InstagramAdapter {
  public static isInstagramUrl(url: string): boolean {
    return /instagram\.com/i.test(url);
  }

  public static async openDirectInbox(): Promise<boolean> {
    const res = await BrowserAutomator.getInstance().navigate('https://www.instagram.com/direct/inbox/');
    await BrowserPerception.getInstance().waitForElement('div[role="listitem"], a[href*="/direct/t/"]', 6000);
    return res.success;
  }

  public static async getMessageThreads(): Promise<InstagramThread[]> {
    const webview = (document.querySelector('.tab-content.active webview') || document.querySelector('webview')) as any;
    if (!webview) return [];

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
    } catch {
      return [];
    }
  }

  public static async findSenders(query: string): Promise<InstagramThread[]> {
    const threads = await this.getMessageThreads();
    const clean = query.toLowerCase().trim();
    return threads.filter(t => t.username.toLowerCase().includes(clean));
  }

  public static async openThreadByIndex(index: number): Promise<boolean> {
    const selector = `div[role="listitem"]:nth-of-type(${index}), a[href*="/direct/t/"]:nth-of-type(${index})`;
    const res = await BrowserAutomator.getInstance().click({ selector });
    return res.success;
  }

  public static async readActiveConversation(): Promise<{ sender: string; latestMessage: string } | null> {
    const webview = (document.querySelector('.tab-content.active webview') || document.querySelector('webview')) as any;
    if (!webview) return null;

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
    } catch {
      return null;
    }
  }

  public static async draftReply(text: string): Promise<boolean> {
    const selector = 'div[role="textbox"][contenteditable="true"], textarea[placeholder*="Message"]';
    return (await BrowserAutomator.getInstance().type({ selector, text, pressEnter: false })).success;
  }

  public static async sendReply(text: string): Promise<boolean> {
    const selector = 'div[role="textbox"][contenteditable="true"], textarea[placeholder*="Message"]';
    return (await BrowserAutomator.getInstance().type({ selector, text, pressEnter: true })).success;
  }
}
