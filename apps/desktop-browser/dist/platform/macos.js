"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MacOSPlatform = void 0;
/**
 * macOS Platform Adaptations
 */
exports.MacOSPlatform = {
    isMac: true,
    isWindows: false,
    platformName: 'darwin',
    modifierKey: 'Meta',
    modifierSymbol: '⌘',
    shortcutLabel: (key) => `⌘+${key.toUpperCase()}`,
    defaultShell: '/bin/zsh',
};
//# sourceMappingURL=macos.js.map