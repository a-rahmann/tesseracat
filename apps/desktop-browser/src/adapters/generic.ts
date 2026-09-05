/**
 * Universal Generic Website Adapter.
 * Default fallback for any arbitrary website using structured browser perception.
 */

import { BrowserPerception } from '../browser/browser-perception.js';
import { BrowserAutomator } from '../browser/browser-automator.js';

export class GenericAdapter {
  public static async inspectPage() {
    return BrowserPerception.getInstance().getSnapshot();
  }

  public static async clickElement(elementId: string) {
    return BrowserAutomator.getInstance().click({ elementId });
  }

  public static async typeElement(elementId: string, text: string, pressEnter = false) {
    return BrowserAutomator.getInstance().type({ elementId, text, pressEnter });
  }
}
