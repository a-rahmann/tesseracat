/**
 * AISidecarClient: Electron Main Process Client for Tesseract AI Engine Sidecar
 *
 * Spawns and supervises the out-of-process AI Engine Sidecar process (`ai-sidecar-process.ts`).
 * Ensures Electron never blocks its main event loop during speech recognition or heavy AI compute.
 */

import { fork, ChildProcess } from 'child_process';
import path from 'path';
import * as fs from 'fs';
import http from 'http';

export interface SidecarTranscribeResult {
  text: string;
  elapsedMs: number;
  confidence: number;
  model: string;
}

export class AISidecarClient {
  private static instance: AISidecarClient | null = null;
  private child: ChildProcess | null = null;
  private isSpawning = false;
  private requestCounter = 0;
  private pendingRequests: Map<string, {
    resolve: (val: any) => void;
    reject: (err: any) => void;
    timer: NodeJS.Timeout;
  }> = new Map();

  private constructor() {}

  public static getInstance(): AISidecarClient {
    if (!AISidecarClient.instance) {
      AISidecarClient.instance = new AISidecarClient();
    }
    return AISidecarClient.instance;
  }

  /**
   * Spawns the AI Engine sidecar process if not already running.
   */
  public async ensureRunning(): Promise<boolean> {
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
      let sidecarPath = path.join(currentDir, 'ai-sidecar-process.js');
      if (!fs.existsSync(sidecarPath)) {
        sidecarPath = path.join(currentDir, '..', 'dist', 'sidecar', 'ai-sidecar-process.js');
      }
      if (!fs.existsSync(sidecarPath)) {
        // Fallback for dev / ts-node
        sidecarPath = path.join(currentDir, 'ai-sidecar-process.ts');
      }

      console.log(`[AISidecarClient] Forking AI Engine Sidecar process: ${sidecarPath}`);

      this.child = fork(sidecarPath, [], {
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        detached: false,
        env: { ...process.env, NODE_ENV: process.env.NODE_ENV || 'production' },
      });

      this.child.stdout?.on('data', (data) => {
        const msg = data.toString().trim();
        if (msg) console.log(`[AISidecar Proc] ${msg}`);
      });

      this.child.stderr?.on('data', (data) => {
        const msg = data.toString().trim();
        if (msg) console.warn(`[AISidecar Proc ERR] ${msg}`);
      });

      this.child.on('message', (msg: any) => {
        if (!msg || !msg.id) return;
        const pending = this.pendingRequests.get(msg.id);
        if (!pending) return;

        clearTimeout(pending.timer);
        this.pendingRequests.delete(msg.id);

        if (msg.type === 'TRANSCRIBE_RESULT') {
          pending.resolve(msg.result);
        } else if (msg.type === 'TRANSCRIBE_ERROR') {
          pending.reject(new Error(msg.error || 'Sidecar transcription failed'));
        } else if (msg.type === 'STATUS_RESULT') {
          pending.resolve(msg);
        } else if (msg.type === 'PONG') {
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
    } catch (err: any) {
      console.error('[AISidecarClient] Failed to spawn AI Engine Sidecar:', err.message);
      return false;
    } finally {
      this.isSpawning = false;
    }
  }

  /**
   * Pings the sidecar process to verify IPC readiness.
   */
  public async ping(timeoutMs = 1500): Promise<boolean> {
    if (!this.child || this.child.killed || !this.child.connected) return false;

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
        this.child!.send({ id, type: 'PING' });
      } catch {
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
  public async transcribe(audioData: Float32Array | Buffer, modelTier = 'tiny.en'): Promise<SidecarTranscribeResult> {
    const isReady = await this.ensureRunning();
    if (!isReady || !this.child || !this.child.connected) {
      // Fallback: try HTTP port if IPC connection dropped
      return this.transcribeViaHttp(audioData);
    }

    const id = `req_${++this.requestCounter}_${Date.now()}`;

    // Convert Float32Array to Buffer if needed for fast transfer
    let transferBuffer: Buffer;
    if (audioData instanceof Float32Array) {
      transferBuffer = Buffer.from(audioData.buffer, audioData.byteOffset, audioData.byteLength);
    } else if (Buffer.isBuffer(audioData)) {
      transferBuffer = audioData;
    } else {
      transferBuffer = Buffer.from((audioData as any).buffer || []);
    }

    return new Promise<SidecarTranscribeResult>((resolve, reject) => {
      // 8s timeout to ensure no permanent hang
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        // Try HTTP fallback on IPC timeout
        this.transcribeViaHttp(transferBuffer).then(resolve).catch(reject);
      }, 8000);

      this.pendingRequests.set(id, { resolve, reject, timer });

      try {
        this.child!.send({
          id,
          type: 'TRANSCRIBE',
          payload: {
            audioData: transferBuffer,
            modelTier,
          },
        });
      } catch (err: any) {
        clearTimeout(timer);
        this.pendingRequests.delete(id);
        this.transcribeViaHttp(transferBuffer).then(resolve).catch(reject);
      }
    });
  }

  /**
   * Fallback HTTP transcription directly to the sidecar's diagnostic port.
   */
  private async transcribeViaHttp(audioData: Float32Array | Buffer): Promise<SidecarTranscribeResult> {
    return new Promise((resolve, reject) => {
      let rawBuffer: Buffer;
      if (audioData instanceof Float32Array) {
        rawBuffer = Buffer.from(audioData.buffer, audioData.byteOffset, audioData.byteLength);
      } else if (Buffer.isBuffer(audioData)) {
        rawBuffer = audioData;
      } else {
        rawBuffer = Buffer.from((audioData as any).buffer || []);
      }

      const req = http.request({
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
        const chunks: Buffer[] = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString());
            if (res.statusCode === 200) {
              resolve(body);
            } else {
              reject(new Error(body.error || `HTTP ${res.statusCode}`));
            }
          } catch (e: any) {
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
  public shutdown(): void {
    if (this.child && !this.child.killed) {
      console.log('[AISidecarClient] Terminating AI Engine Sidecar process...');
      this.child.kill('SIGTERM');
      this.child = null;
    }
  }
}
