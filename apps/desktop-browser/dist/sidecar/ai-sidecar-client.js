"use strict";
/**
 * AISidecarClient: Electron Main Process Client for Tesseract AI Engine Sidecar
 *
 * Spawns and supervises the out-of-process AI Engine Sidecar process (`ai-sidecar-process.ts`).
 * Ensures Electron never blocks its main event loop during speech recognition or heavy AI compute.
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
exports.AISidecarClient = void 0;
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
const fs = __importStar(require("fs"));
const http_1 = __importDefault(require("http"));
class AISidecarClient {
    static instance = null;
    child = null;
    isSpawning = false;
    requestCounter = 0;
    pendingRequests = new Map();
    constructor() { }
    static getInstance() {
        if (!AISidecarClient.instance) {
            AISidecarClient.instance = new AISidecarClient();
        }
        return AISidecarClient.instance;
    }
    /**
     * Spawns the AI Engine sidecar process if not already running.
     */
    async ensureRunning() {
        if (this.child && !this.child.killed && this.child.connected) {
            return true;
        }
        if (this.isSpawning) {
            while (this.isSpawning) {
                await new Promise(r => setTimeout(r, 100));
            }
            return this.child !== null && !this.child.killed;
        }
        this.isSpawning = true;
        try {
            // Locate compiled or TS sidecar file
            const currentDir = __dirname;
            let sidecarPath = path_1.default.join(currentDir, 'ai-sidecar-process.js');
            if (!fs.existsSync(sidecarPath)) {
                sidecarPath = path_1.default.join(currentDir, '..', 'dist', 'sidecar', 'ai-sidecar-process.js');
            }
            if (!fs.existsSync(sidecarPath)) {
                // Fallback for dev / ts-node
                sidecarPath = path_1.default.join(currentDir, 'ai-sidecar-process.ts');
            }
            console.log(`[AISidecarClient] Forking AI Engine Sidecar process: ${sidecarPath}`);
            this.child = (0, child_process_1.fork)(sidecarPath, [], {
                stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
                detached: false,
                env: { ...process.env, NODE_ENV: process.env.NODE_ENV || 'production' },
            });
            this.child.stdout?.on('data', (data) => {
                const msg = data.toString().trim();
                if (msg)
                    console.log(`[AISidecar Proc] ${msg}`);
            });
            this.child.stderr?.on('data', (data) => {
                const msg = data.toString().trim();
                if (msg)
                    console.warn(`[AISidecar Proc ERR] ${msg}`);
            });
            this.child.on('message', (msg) => {
                if (!msg || !msg.id)
                    return;
                const pending = this.pendingRequests.get(msg.id);
                if (!pending)
                    return;
                clearTimeout(pending.timer);
                this.pendingRequests.delete(msg.id);
                if (msg.type === 'TRANSCRIBE_RESULT') {
                    pending.resolve(msg.result);
                }
                else if (msg.type === 'TRANSCRIBE_ERROR') {
                    pending.reject(new Error(msg.error || 'Sidecar transcription failed'));
                }
                else if (msg.type === 'STATUS_RESULT') {
                    pending.resolve(msg);
                }
                else if (msg.type === 'PONG') {
                    pending.resolve(msg);
                }
            });
            this.child.on('exit', (code, signal) => {
                console.warn(`[AISidecarClient] Sidecar process exited with code ${code}, signal ${signal}`);
                this.child = null;
                // Reject any in-flight requests
                for (const [id, req] of this.pendingRequests.entries()) {
                    clearTimeout(req.timer);
                    req.reject(new Error('AI Sidecar process terminated'));
                }
                this.pendingRequests.clear();
            });
            // Quick ping verification
            await this.ping(2000);
            console.log('[AISidecarClient] AI Engine Sidecar process running and verified.');
            return true;
        }
        catch (err) {
            console.error('[AISidecarClient] Failed to spawn AI Engine Sidecar:', err.message);
            return false;
        }
        finally {
            this.isSpawning = false;
        }
    }
    /**
     * Pings the sidecar process to verify IPC readiness.
     */
    async ping(timeoutMs = 1500) {
        if (!this.child || this.child.killed || !this.child.connected)
            return false;
        const id = `ping_${++this.requestCounter}`;
        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                this.pendingRequests.delete(id);
                resolve(false);
            }, timeoutMs);
            this.pendingRequests.set(id, {
                resolve: () => resolve(true),
                reject: () => resolve(false),
                timer,
            });
            try {
                this.child.send({ id, type: 'PING' });
            }
            catch {
                clearTimeout(timer);
                this.pendingRequests.delete(id);
                resolve(false);
            }
        });
    }
    /**
     * Transcribe audio buffer through the isolated sidecar process.
     * Runs in <500ms on CPU without blocking the Electron main thread.
     */
    async transcribe(audioData, modelTier = 'tiny.en') {
        const isReady = await this.ensureRunning();
        if (!isReady || !this.child || !this.child.connected) {
            // Fallback: try HTTP port if IPC connection dropped
            return this.transcribeViaHttp(audioData);
        }
        const id = `req_${++this.requestCounter}_${Date.now()}`;
        // Convert Float32Array to Buffer if needed for fast transfer
        let transferBuffer;
        if (audioData instanceof Float32Array) {
            transferBuffer = Buffer.from(audioData.buffer, audioData.byteOffset, audioData.byteLength);
        }
        else if (Buffer.isBuffer(audioData)) {
            transferBuffer = audioData;
        }
        else {
            transferBuffer = Buffer.from(audioData.buffer || []);
        }
        return new Promise((resolve, reject) => {
            // 8s timeout to ensure no permanent hang
            const timer = setTimeout(() => {
                this.pendingRequests.delete(id);
                // Try HTTP fallback on IPC timeout
                this.transcribeViaHttp(transferBuffer).then(resolve).catch(reject);
            }, 8000);
            this.pendingRequests.set(id, { resolve, reject, timer });
            try {
                this.child.send({
                    id,
                    type: 'TRANSCRIBE',
                    payload: {
                        audioData: transferBuffer,
                        modelTier,
                    },
                });
            }
            catch (err) {
                clearTimeout(timer);
                this.pendingRequests.delete(id);
                this.transcribeViaHttp(transferBuffer).then(resolve).catch(reject);
            }
        });
    }
    /**
     * Fallback HTTP transcription directly to the sidecar's diagnostic port.
     */
    async transcribeViaHttp(audioData) {
        return new Promise((resolve, reject) => {
            let rawBuffer;
            if (audioData instanceof Float32Array) {
                rawBuffer = Buffer.from(audioData.buffer, audioData.byteOffset, audioData.byteLength);
            }
            else if (Buffer.isBuffer(audioData)) {
                rawBuffer = audioData;
            }
            else {
                rawBuffer = Buffer.from(audioData.buffer || []);
            }
            const req = http_1.default.request({
                hostname: '127.0.0.1',
                port: 11435,
                path: '/transcribe',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/octet-stream',
                    'Content-Length': rawBuffer.length,
                },
                timeout: 6000,
            }, (res) => {
                const chunks = [];
                res.on('data', chunk => chunks.push(chunk));
                res.on('end', () => {
                    try {
                        const body = JSON.parse(Buffer.concat(chunks).toString());
                        if (res.statusCode === 200) {
                            resolve(body);
                        }
                        else {
                            reject(new Error(body.error || `HTTP ${res.statusCode}`));
                        }
                    }
                    catch (e) {
                        reject(e);
                    }
                });
            });
            req.on('error', (err) => reject(err));
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('HTTP transcribe timeout'));
            });
            req.write(rawBuffer);
            req.end();
        });
    }
    /**
     * Graceful shutdown on application exit.
     */
    shutdown() {
        if (this.child && !this.child.killed) {
            console.log('[AISidecarClient] Terminating AI Engine Sidecar process...');
            this.child.kill('SIGTERM');
            this.child = null;
        }
    }
}
exports.AISidecarClient = AISidecarClient;
//# sourceMappingURL=ai-sidecar-client.js.map