"use strict";
/**
 * Universal Generic Website Adapter.
 * Default fallback for any arbitrary website using structured browser perception.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GenericAdapter = void 0;
const browser_perception_js_1 = require("../browser/browser-perception.js");
const browser_automator_js_1 = require("../browser/browser-automator.js");
class GenericAdapter {
    static async inspectPage() {
        return browser_perception_js_1.BrowserPerception.getInstance().getSnapshot();
    }
    static async clickElement(elementId) {
        return browser_automator_js_1.BrowserAutomator.getInstance().click({ elementId });
    }
    static async typeElement(elementId, text, pressEnter = false) {
        return browser_automator_js_1.BrowserAutomator.getInstance().type({ elementId, text, pressEnter });
    }
}
exports.GenericAdapter = GenericAdapter;
//# sourceMappingURL=generic.js.map