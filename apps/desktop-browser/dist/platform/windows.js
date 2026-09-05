"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WindowsPlatform = void 0;
/**
 * Windows Platform Adaptations
 */
exports.WindowsPlatform = {
    isMac: false,
    isWindows: true,
    platformName: 'win32',
    modifierKey: 'Control',
    modifierSymbol: 'Ctrl',
    shortcutLabel: (key) => `Ctrl+${key.toUpperCase()}`,
    defaultShell: 'powershell.exe',
};
//# sourceMappingURL=windows.js.map