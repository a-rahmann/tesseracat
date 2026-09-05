"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.currentPlatform = void 0;
exports.getAppDataDir = getAppDataDir;
exports.isPlatformModifierKey = isPlatformModifierKey;
exports.getPushToTalkKey = getPushToTalkKey;
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const macos_js_1 = require("./macos.js");
const windows_js_1 = require("./windows.js");
const isMacPlatform = process.platform === 'darwin';
exports.currentPlatform = isMacPlatform ? macos_js_1.MacOSPlatform : windows_js_1.WindowsPlatform;
function getAppDataDir(appName = 'tesseract') {
    // If Electron app is accessible
    try {
        const { app } = require('electron');
        if (app && typeof app.getPath === 'function') {
            return app.getPath('userData');
        }
    }
    catch { }
    // Cross-platform home directory fallback
    const home = os_1.default.homedir();
    if (process.platform === 'win32') {
        return path_1.default.join(process.env.APPDATA || path_1.default.join(home, 'AppData', 'Roaming'), appName);
    }
    if (process.platform === 'darwin') {
        return path_1.default.join(home, 'Library', 'Application Support', appName);
    }
    return path_1.default.join(process.env.XDG_CONFIG_HOME || path_1.default.join(home, '.config'), appName);
}
function isPlatformModifierKey(e) {
    return isMacPlatform ? e.metaKey : e.ctrlKey;
}
function getPushToTalkKey() {
    return 't';
}
//# sourceMappingURL=index.js.map