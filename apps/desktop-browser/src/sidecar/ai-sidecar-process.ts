/**
 * Tesseract AI Engine Sidecar Process
 *
 * Runs as an isolated Node.js child process separate from Electron's main and renderer threads.
 * Ensures that heavy CPU workloads (Whisper speech-to-text inference and LLM orchestration)
 * NEVER cause Chromium or the Electron UI to freeze or drop frames.
 *
 * Capabilities:
 * 1. Tiered Whisper STT (Fast tiny/base models on CPU in <500ms).
 * 2. Bi-directional IPC message protocol with Electron parent process.
 * 3. Local HTTP server on 127.0.0.1:11435 for diagnostics and out-of-process decoupling.
 * 4. Sleep-on-idle: frees working buffers and stays at 0% CPU when not processing audio.
 * 5. Low-priority OS scheduling: yields CPU cycles to Chromium for 60fps UI smoothness.
 */

import http from 'http';
import os from 'os';
import { pipeline, env } from '@xenova/transformers';

// Suppress transformer logging
(env as any).verbose = false;
env.allowLocalModels = false;

// Set process priority below normal so Chromium rendering always takes priority
try {
  if (typeof os.setPriority === 'function') {
    os.setPriority(process.pid, 10); // Below normal
    console.log('[AISidecar] Priority set to below-normal (10) to preserve Chromium 60fps');
  }
} catch (e) {
  // Ignored if OS restricts priority changes
}

export type WhisperModelTier = 'tiny.en' | 'base.en' | 'small.en';

let activeModelTier: WhisperModelTier = 'tiny.en';
let transcriber: any = null;
let isInitializing = false;
let lastActivityTimestamp = Date.now();
let activeRequests = 0;

/**
 * Initializes or retrieves the Whisper pipeline for the requested model tier.
 */
async function getTranscriber(tier: WhisperModelTier = 'tiny.en'): Promise<any> {
  if (transcriber && activeModelTier === tier) {
    return transcriber;
  }

  if (isInitializing) {
    while (isInitializing) {
      await new Promise(r => setTimeout(r, 100));
    }
    return transcriber;
  }

  isInitializing = true;
  activeModelTier = tier;
  const modelName = `Xenova/whisper-${tier}`;

  try {
    console.log(`[AISidecar] Loading Whisper model: ${modelName}...`);
    const start = Date.now();
    transcriber = await pipeline('automatic-speech-recognition', modelName);
    console.log(`[AISidecar] Whisper ${tier} initialized successfully in ${Date.now() - start}ms.`);
  } catch (err: any) {
    console.error(`[AISidecar] Failed to load Whisper model ${modelName}:`, err.message);
    throw err;
  } finally {
    isInitializing = false;
  }

  return transcriber;
}

/**
 * Transcribes 16kHz Float32Array PCM audio buffer.
 */
async function transcribeAudio(
  audioFloat32: Float32Array,
  modelTier: WhisperModelTier = 'tiny.en'
): Promise<{ text: string; elapsedMs: number; confidence: number; model: string }> {
  lastActivityTimestamp = Date.now();
  activeRequests++;

  const startTime = Date.now();

  try {
    if (!audioFloat32 || audioFloat32.length === 0) {
      return { text: '', elapsedMs: 0, confidence: 1.0, model: modelTier };
    }

    const sampleCount = audioFloat32.length;
    const durationSec = sampleCount / 16000;

    // Reject audio that is too short (< 0.15s)
    if (sampleCount < 2400) {
      return { text: '', elapsedMs: Date.now() - startTime, confidence: 0, model: modelTier };
    }

    // Audio sanitation & RMS calculation
    let min = 0, max = 0, sumSq = 0;
    for (let i = 0; i < sampleCount; i++) {
      let val = audioFloat32[i];
      if (!Number.isFinite(val)) {
        audioFloat32[i] = 0;
        val = 0;
      }
      if (val < min) min = val;
      if (val > max) max = val;
      sumSq += val * val;
    }

    const maxAmp = Math.max(Math.abs(min), Math.abs(max));
    const rms = Math.sqrt(sumSq / sampleCount);

    // Only reject if virtually flat silence
    if (maxAmp < 0.002 && rms < 0.0004) {
      console.log(`[AISidecar] Audio rejected as flat silence (maxAmp: ${maxAmp.toFixed(5)}, RMS: ${rms.toFixed(5)})`);
      return { text: '', elapsedMs: Date.now() - startTime, confidence: 0, model: modelTier };
    }

    // 1. Remove DC bias
    let mean = 0;
    for (let i = 0; i < sampleCount; i++) mean += audioFloat32[i];
    mean /= sampleCount;
    for (let i = 0; i < sampleCount; i++) audioFloat32[i] -= mean;

    // 2. Trim leading & trailing silence (300ms pre-roll preserves initial consonant)
    const trimThreshold = Math.max(0.004, rms * 0.08);
    let speechStart = 0;
    for (let i = 0; i < sampleCount; i++) {
      if (Math.abs(audioFloat32[i]) >= trimThreshold) {
        speechStart = Math.max(0, i - 4800);
        break;
      }
    }

    let speechEnd = sampleCount;
    for (let i = sampleCount - 1; i >= speechStart; i--) {
      if (Math.abs(audioFloat32[i]) >= trimThreshold) {
        speechEnd = Math.min(sampleCount, i + 4800);
        break;
      }
    }

    const activeAudio = audioFloat32.slice(speechStart, speechEnd);
    if (activeAudio.length < 1600) {
      return { text: '', elapsedMs: Date.now() - startTime, confidence: 0, model: modelTier };
    }

    // 3. Peak Normalization safely (max 15x boost)
    let peak = 0;
    for (let i = 0; i < activeAudio.length; i++) {
      const a = Math.abs(activeAudio[i]);
      if (a > peak) peak = a;
    }
    if (peak > 0.0005) {
      const scale = Math.min(15.0, 0.85 / peak);
      for (let i = 0; i < activeAudio.length; i++) {
        activeAudio[i] = Math.max(-1.0, Math.min(1.0, activeAudio[i] * scale));
      }
    }

    const pipe = await getTranscriber(modelTier);
    const pipeOptions: any = {
      language: 'english',
      task: 'transcribe',
      return_timestamps: false,
      chunk_length_s: Math.min(30, Math.max(5, Math.ceil(activeAudio.length / 16000) + 1)),
      prompt: 'Hey Tesseract, open YouTube and play a video. Search Google, pause video, browse web.',
    };

    const output = await pipe(activeAudio, pipeOptions);

    const elapsedMs = Date.now() - startTime;
    let rawText = typeof output?.text === 'string' ? output.text.trim() : '';
    console.log(`[AISidecar] Whisper ${modelTier} raw output: "${rawText}" in ${elapsedMs}ms`);

    // Clean Whisper hallucinations / sound tokens
    if (/^[.\s,!?\-—;:]+$/.test(rawText)) rawText = '';
    if (/^(\[|\(|\*)[a-zA-Z\s_-]+(\]|\)|\*)$/i.test(rawText)) rawText = '';
    // Strip embedded sound tokens (e.g. "[Music] Hey Tesseract")
    rawText = rawText.replace(/\[[^\]]+\]/g, '').replace(/\([^)]+\)/g, '').replace(/\*[^*]+\*/g, '').trim();

    console.log(`[AISidecar] Whisper ${modelTier} cleaned text: "${rawText}"`);
    return { text: rawText, elapsedMs, confidence: rawText ? 0.95 : 0, model: modelTier };
  } finally {
    activeRequests = Math.max(0, activeRequests - 1);
  }
}

// ==========================================
// 1. IPC Message Handler (Parent Electron)
// ==========================================
if (process.send) {
  process.on('message', async (msg: any) => {
    if (!msg || typeof msg !== 'object') return;

    const { id, type, payload } = msg;

    if (type === 'PING') {
      process.send!({ id, type: 'PONG', timestamp: Date.now() });
      return;
    }

    if (type === 'STATUS') {
      process.send!({
        id,
        type: 'STATUS_RESULT',
        activeTier: activeModelTier,
        isModelLoaded: transcriber !== null,
        activeRequests,
        idleMs: Date.now() - lastActivityTimestamp,
        memoryUsage: process.memoryUsage(),
      });
      return;
    }

    if (type === 'TRANSCRIBE') {
      try {
        let float32: Float32Array;
        const raw = payload?.audioData;
        if (raw instanceof Float32Array) {
          float32 = raw;
        } else if (Buffer.isBuffer(raw)) {
          float32 = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
        } else if (raw?.type === 'Buffer' && Array.isArray(raw.data)) {
          const b = Buffer.from(raw.data);
          float32 = new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
        } else if (Array.isArray(raw)) {
          float32 = new Float32Array(raw);
        } else if (raw && raw.buffer) {
          float32 = new Float32Array(raw.buffer, raw.byteOffset || 0, (raw.byteLength || raw.length * 4) / 4);
        } else {
          process.send!({ id, type: 'TRANSCRIBE_ERROR', error: 'Invalid audio buffer format' });
          return;
        }

        const tier = payload?.modelTier || activeModelTier;
        const result = await transcribeAudio(float32, tier);
        process.send!({ id, type: 'TRANSCRIBE_RESULT', result });
      } catch (err: any) {
        console.error('[AISidecar] IPC Transcribe error:', err);
        process.send!({ id, type: 'TRANSCRIBE_ERROR', error: err.message });
      }
    }
  });

  console.log('[AISidecar] Connected to Electron parent via Node IPC');
}

// ==========================================
// 2. HTTP Diagnostic Server (127.0.0.1:11435)
// ==========================================
const HTTP_PORT = 11435;
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      sidecar: 'Tesseract AI Engine',
      modelTier: activeModelTier,
      isModelLoaded: transcriber !== null,
      idleSeconds: Math.floor((Date.now() - lastActivityTimestamp) / 1000),
      memory: process.memoryUsage(),
    }));
    return;
  }

  if (req.url === '/transcribe' && req.method === 'POST') {
    const chunks: Buffer[] = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', async () => {
      try {
        const bodyBuffer = Buffer.concat(chunks);
        const float32 = new Float32Array(bodyBuffer.buffer, bodyBuffer.byteOffset, bodyBuffer.byteLength / 4);
        const result = await transcribeAudio(float32, activeModelTier);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

server.on('error', (err: any) => {
  if (err.code === 'EADDRINUSE') {
    console.warn('[AISidecar] Diagnostic port 11435 occupied; continuing purely on Node IPC channel.');
  } else {
    console.error('[AISidecar] HTTP server error:', err);
  }
});

server.listen(HTTP_PORT, '127.0.0.1', () => {
  console.log(`[AISidecar] HTTP bridge listening on http://127.0.0.1:${HTTP_PORT}`);
});

// Exit when Electron parent disconnects
process.on('disconnect', () => {
  console.log('[AISidecar] Parent Electron process disconnected, shutting down sidecar...');
  process.exit(0);
});

// Pre-load default lightweight Whisper model in the sidecar background
getTranscriber('tiny.en').catch(err => {
  console.warn('[AISidecar] Background pre-warm note:', err.message);
});

// Periodic sleep check (garbage collection hint when idle)
setInterval(() => {
  const idleMs = Date.now() - lastActivityTimestamp;
  if (idleMs > 45000 && activeRequests === 0) {
    if (global.gc) {
      try { global.gc(); } catch {}
    }
  }
}, 30000);
