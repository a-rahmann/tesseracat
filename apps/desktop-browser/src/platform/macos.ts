/**
 * macOS Platform Adaptations
 */
export const MacOSPlatform = {
  isMac: true,
  isWindows: false,
  platformName: 'darwin' as const,
  modifierKey: 'Meta',
  modifierSymbol: '⌘',
  shortcutLabel: (key: string) => `⌘+${key.toUpperCase()}`,
  defaultShell: '/bin/zsh',
};
