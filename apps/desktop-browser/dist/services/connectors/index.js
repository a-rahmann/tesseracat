"use strict";
/**
 * Native Service Connectors Index and Initialization.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeConnectors = initializeConnectors;
const service_connector_js_1 = require("./service-connector.js");
const google_connector_js_1 = require("./google-connector.js");
const gmail_tools_js_1 = require("./gmail-tools.js");
const calendar_tools_js_1 = require("./calendar-tools.js");
const drive_tools_js_1 = require("./drive-tools.js");
const youtube_tools_js_1 = require("./youtube-tools.js");
__exportStar(require("./service-connector.js"), exports);
__exportStar(require("./credential-vault.js"), exports);
__exportStar(require("./google-connector.js"), exports);
__exportStar(require("./gmail-tools.js"), exports);
__exportStar(require("./calendar-tools.js"), exports);
__exportStar(require("./drive-tools.js"), exports);
__exportStar(require("./youtube-tools.js"), exports);
function initializeConnectors() {
    const registry = service_connector_js_1.ConnectorRegistry.getInstance();
    const google = google_connector_js_1.GoogleConnector.getInstance();
    // Register domain tools on the Google connector
    gmail_tools_js_1.GmailTools.register(google);
    calendar_tools_js_1.CalendarTools.register(google);
    drive_tools_js_1.DriveTools.register(google);
    youtube_tools_js_1.YouTubeTools.register(google);
    // Register Google connector with the central registry
    registry.registerConnector(google);
    return registry;
}
//# sourceMappingURL=index.js.map