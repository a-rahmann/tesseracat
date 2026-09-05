"use strict";
/**
 * OllamaSidecar: Automatic local model server lifecycle manager.
 *
 * Eliminates the need for the user to open a terminal or manually run commands.
 * When Tesseract launches, OllamaSidecar:
 * 1. Checks if Ollama is already active on port 11434.
 * 2. If not, automatically locates the system binary and silently spawns `ollama serve`.
 * 3. Gracefully stops the child process on application quit.
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
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OllamaSidecar = void 0;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const path_1 = __importDefault(require("path"));
class OllamaSidecar {
    static instance = null;
    process = null;
    isManaged = false;
    constructor() { }
    static getInstance() {
        if (!OllamaSidecar.instance) {
            OllamaSidecar.instance = new OllamaSidecar();
        }
        return OllamaSidecar.instance;
    }
    /**
     * Check if Ollama is running, and auto-spawn it in the background if available.
     */
    async ensureRunning() {
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
            this.process = (0, child_process_1.spawn)(binaryPath, ['serve'], {
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
        }
        catch (err) {
            console.warn('[Ollama Sidecar] Unable to auto-spawn Ollama daemon:', err.message);
        }
        return false;
    }
    /**
     * Health ping to Ollama HTTP API.
     */
    async ping() {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 1200);
            const res = await fetch('http://localhost:11434/api/tags', { signal: controller.signal });
            clearTimeout(timeout);
            return res.ok;
        }
        catch {
            return false;
        }
    }
    /**
     * Look for ollama binary across macOS, Windows, and Linux.
     */
    findOllamaBinary() {
        const isWindows = process.platform === 'win32';
        const candidates = [];
        if (isWindows) {
            const localAppData = process.env.LOCALAPPDATA || (process.env.USERPROFILE ? path_1.default.join(process.env.USERPROFILE, 'AppData', 'Local') : '');
            const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
            if (localAppData) {
                candidates.push(path_1.default.join(localAppData, 'Programs', 'Ollama', 'ollama.exe'));
            }
            candidates.push(path_1.default.join(programFiles, 'Ollama', 'ollama.exe'));
        }
        else {
            candidates.push('/opt/homebrew/bin/ollama', '/usr/local/bin/ollama', '/Applications/Ollama.app/Contents/Resources/ollama', `${process.env.HOME || ''}/.local/bin/ollama`, '/usr/bin/ollama');
        }
        for (const p of candidates) {
            if (p && fs.existsSync(p)) {
                return p;
            }
        }
        // Check system PATH
        const envPath = process.env.PATH || '';
        const pathDirs = envPath.split(path_1.default.delimiter);
        const exeName = isWindows ? 'ollama.exe' : 'ollama';
        for (const dir of pathDirs) {
            if (!dir)
                continue;
            const fullPath = path_1.default.join(dir, exeName);
            if (fs.existsSync(fullPath)) {
                return fullPath;
            }
        }
        return null;
    }
    /**
     * Clean shutdown of managed daemon on app exit.
     */
    stop() {
        if (this.isManaged && this.process) {
            console.log('[Ollama Sidecar] Stopping managed background Ollama daemon');
            try {
                this.process.kill();
            }
            catch (_) { }
            this.process = null;
            this.isManaged = false;
        }
    }
}
exports.OllamaSidecar = OllamaSidecar;
//# sourceMappingURL=ollama-sidecar.js.map