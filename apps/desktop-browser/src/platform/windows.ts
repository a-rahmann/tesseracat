/**
 * Windows Platform Adaptations
 */
export const WindowsPlatform = {
  isMac: false,
  isWindows: true,
  platformName: 'win32' as const,
  modifierKey: 'Control',
  modifierSymbol: 'Ctrl',
  shortcutLabel: (key: string) => `Ctrl+${key.toUpperCase()}`,
  defaultShell: 'powershell.exe',
};
