/**
 * OllamaSidecar: Automatic local model server lifecycle manager.
 *
 * Eliminates the need for the user to open a terminal or manually run commands.
 * When Tesseract launches, OllamaSidecar:
 * 1. Checks if Ollama is already active on port 11434.
 * 2. If not, automatically locates the system binary and silently spawns `ollama serve`.
 * 3. Gracefully stops the child process on application quit.
 */

import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';

export class OllamaSidecar {
  private static instance: OllamaSidecar | null = null;
  private process: ChildProcess | null = null;
  private isManaged = false;

  private constructor() {}

  public static getInstance(): OllamaSidecar {
    if (!OllamaSidecar.instance) {
      OllamaSidecar.instance = new OllamaSidecar();
    }
    return OllamaSidecar.instance;
  }

  /**
   * Check if Ollama is running, and auto-spawn it in the background if available.
   */
  public async ensureRunning(): Promise<boolean> {
    // 1. Check if already online
    const isOnline = await this.ping();
    if (isOnline) {
      console.log('[Ollama Sidecar] Connected to active Ollama instance on port 11434');
      return true;
    }

    // 2. Discover ollama binary location
    const binaryPath = this.findOllamaBinary();
    if (!binaryPath) {
      console.log('[Ollama Sidecar] Ollama not installed on system; using in-process local engines');
      return false;
    }

    // 3. Auto-spawn silently in the background
    try {
      console.log(`[Ollama Sidecar] Auto-spawning background Ollama daemon: ${binaryPath}`);
      this.process = spawn(binaryPath, ['serve'], {
        detached: false,
        stdio: 'ignore',
        env: { ...process.env, OLLAMA_ORIGINS: '*' },
      });

      this.isManaged = true;

      // Poll until port 11434 responds (up to 4.5 seconds)
      for (let i = 0; i < 9; i++) {
        await new Promise((r) => setTimeout(r, 500));
        if (await this.ping()) {
          console.log('[Ollama Sidecar] Background Ollama daemon is online and ready!');
          return true;
        }
      }
    } catch (err: any) {
      console.warn('[Ollama Sidecar] Unable to auto-spawn Ollama daemon:', err.message);
    }

    return false;
  }

  /**
   * Health ping to Ollama HTTP API.
   */
  public async ping(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1200);
      const res = await fetch('http://localhost:11434/api/tags', { signal: controller.signal });
      clearTimeout(timeout);
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Look for ollama binary in common macOS and Linux install directories.
   */
  public findOllamaBinary(): string | null {
    const candidates = [
      '/opt/homebrew/bin/ollama',
      '/usr/local/bin/ollama',
      '/Applications/Ollama.app/Contents/Resources/ollama',
      `${process.env.HOME}/.local/bin/ollama`,
      '/usr/bin/ollama',
    ];

    for (const p of candidates) {
      if (fs.existsSync(p)) {
        return p;
      }
    }
    return null;
  }

  /**
   * Clean shutdown of managed daemon on app exit.
   */
  public stop(): void {
    if (this.isManaged && this.process) {
      console.log('[Ollama Sidecar] Stopping managed background Ollama daemon');
      try {
        this.process.kill();
      } catch (_) {}
      this.process = null;
      this.isManaged = false;
    }
  }
}
