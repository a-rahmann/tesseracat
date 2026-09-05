"use strict";
/**
 * Amazon Website Adapter.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AmazonAdapter = void 0;
const browser_automator_js_1 = require("../browser/browser-automator.js");
class AmazonAdapter {
    static isAmazonUrl(url) {
        return /amazon\./i.test(url);
    }
    static async search(query) {
        return (await browser_automator_js_1.BrowserAutomator.getInstance().navigate(`https://www.amazon.com/s?k=${encodeURIComponent(query)}`)).success;
    }
    static async getProducts() {
        const webview = (document.querySelector('.tab-content.active webview') || document.querySelector('webview'));
        if (!webview)
            return [];
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
        }
        catch {
            return [];
        }
    }
}
exports.AmazonAdapter = AmazonAdapter;
//# sourceMappingURL=amazon.js.map