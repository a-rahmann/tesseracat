/**
 * Amazon Website Adapter.
 */

import { BrowserAutomator } from '../browser/browser-automator.js';

export class AmazonAdapter {
  public static isAmazonUrl(url: string): boolean {
    return /amazon\./i.test(url);
  }

  public static async search(query: string): Promise<boolean> {
    return (await BrowserAutomator.getInstance().navigate(`https://www.amazon.com/s?k=${encodeURIComponent(query)}`)).success;
  }

  public static async getProducts(): Promise<Array<{ title: string; price: string; rating?: string }>> {
    const webview = (document.querySelector('.tab-content.active webview') || document.querySelector('webview')) as any;
    if (!webview) return [];

    const script = `
      (() => {
        const cards = document.querySelectorAll('div[data-component-type="s-search-result"]');
        const items = [];
        for (const card of cards) {
          const title = card.querySelector('h2 a span')?.textContent || '';
          const priceWhole = card.querySelector('.a-price-whole')?.textContent || '';
          const priceFraction = card.querySelector('.a-price-fraction')?.textContent || '';
          const price = priceWhole ? ('$' + priceWhole + (priceFraction ? '.' + priceFraction : '')) : '';
          if (title && price) {
            items.push({ title: title.trim(), price: price.trim() });
          }
          if (items.length >= 6) break;
        }
        return items;
      })();
    `;

    try {
      return await webview.executeJavaScript(script);
    } catch {
      return [];
    }
  }
}
