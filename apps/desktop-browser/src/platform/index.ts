import path from 'path';
import os from 'os';
import { MacOSPlatform } from './macos.js';
import { WindowsPlatform } from './windows.js';

const isMacPlatform = process.platform === 'darwin';
export const currentPlatform = isMacPlatform ? MacOSPlatform : WindowsPlatform;

export function getAppDataDir(appName = 'tesseract'): string {
  // If Electron app is accessible
  try {
    const { app } = require('electron');
    if (app && typeof app.getPath === 'function') {
      return app.getPath('userData');
    }
  } catch {}

  // Cross-platform home directory fallback
  const home = os.homedir();
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), appName);
  }
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', appName);
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), appName);
}

export function isPlatformModifierKey(e: KeyboardEvent): boolean {
  return isMacPlatform ? e.metaKey : e.ctrlKey;
}

export function getPushToTalkKey(): string {
  return 't';
}
