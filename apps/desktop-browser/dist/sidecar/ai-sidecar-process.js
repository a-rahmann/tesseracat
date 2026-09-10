"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = __importDefault(require("http"));
const os_1 = __importDefault(require("os"));
const transformers_1 = require("@xenova/transformers");
// Suppress transformer logging
transformers_1.env.verbose = false;
transformers_1.env.allowLocalModels = false;
// Set process priority below normal so Chromium rendering always takes priority
try {
    if (typeof os_1.default.setPriority === 'function') {
        os_1.default.setPriority(process.pid, 10); // Below normal
        console.log('[AISidecar] Priority set to below-normal (10) to preserve Chromium 60fps');
    }
}
catch (e) {
    // Ignored if OS restricts priority changes
}
let activeModelTier = 'tiny.en';
let transcriber = null;
let isInitializing = false;
let lastActivityTimestamp = Date.now();
let activeRequests = 0;
/**
 * Initializes or retrieves the Whisper pipeline for the requested model tier.
 */
async function getTranscriber(tier = 'tiny.en') {
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
        transcriber = await (0, transformers_1.pipeline)('automatic-speech-recognition', modelName);
        console.log(`[AISidecar] Whisper ${tier} initialized successfully in ${Date.now() - start}ms.`);
    }
    catch (err) {
        console.error(`[AISidecar] Failed to load Whisper model ${modelName}:`, err.message);
        throw err;
    }
    finally {
        isInitializing = false;
    }
    return transcriber;
}
/**
 * Transcribes 16kHz Float32Array PCM audio buffer.
 */
async function transcribeAudio(audioFloat32, modelTier = 'tiny.en') {
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
            if (val < min)
                min = val;
            if (val > max)
                max = val;
            sumSq += val * val;
        }
        const maxAmp = Math.max(Math.abs(min), Math.abs(max));
        const rms = Math.sqrt(sumSq / sampleCount);
        // Reject empty room silence or low-energy background fans
        if (maxAmp < 0.015 && rms < 0.003) {
            console.log(`[AISidecar] Audio rejected as background noise (maxAmp: ${maxAmp.toFixed(4)}, RMS: ${rms.toFixed(5)})`);
            return { text: '', elapsedMs: Date.now() - startTime, confidence: 0, model: modelTier };
        }
        // Dynamic Normalization with safe headroom
        const targetPeak = 0.85;
        const currentPeak = Math.max(Math.abs(min), Math.abs(max));
        const normalizedAudio = new Float32Array(sampleCount);
        if (currentPeak > 0.001) {
            const scale = Math.min(targetPeak / currentPeak, 6.0);
            for (let i = 0; i < sampleCount; i++) {
                normalizedAudio[i] = Math.max(-1.0, Math.min(1.0, audioFloat32[i] * scale));
            }
        }
        else {
            normalizedAudio.set(audioFloat32);
        }
        // Find speech onset (trim leading silence)
        const windowSize = 320; // 20ms
        const energyThreshold = 0.0002;
        let speechStart = 0;
        for (let i = 0; i < sampleCount - windowSize; i += windowSize) {
            let winSum = 0;
            for (let j = 0; j < windowSize; j++) {
                winSum += normalizedAudio[i + j] * normalizedAudio[i + j];
            }
            if (winSum / windowSize > energyThreshold) {
                // 300ms pre-roll to prevent initial consonant clipping
                speechStart = Math.max(0, i - 4800);
                break;
            }
        }
        const activeAudio = speechStart > 0 ? normalizedAudio.slice(speechStart) : normalizedAudio;
        if (activeAudio.length < 1600) {
            return { text: '', elapsedMs: Date.now() - startTime, confidence: 0, model: modelTier };
        }
        const pipe = await getTranscriber(modelTier);
        const output = await pipe(activeAudio, {
            chunk_length_s: 30,
            stride_length_s: 5,
            language: 'english',
            task: 'transcribe',
            return_timestamps: false,
        });
        const elapsedMs = Date.now() - startTime;
        let rawText = (output?.text || '').trim();
        // Clean Whisper hallucinations / sound tokens
        if (/^[.\s,!?\-—;:]+$/.test(rawText))
            rawText = '';
        if (/^\[.*?\]$/.test(rawText) || /^\(.*?\)$/.test(rawText))
            rawText = '';
        console.log(`[AISidecar] Whisper ${modelTier} transcribed in ${elapsedMs}ms: "${rawText}"`);
        return { text: rawText, elapsedMs, confidence: rawText ? 0.95 : 0, model: modelTier };
    }
    finally {
        activeRequests = Math.max(0, activeRequests - 1);
    }
}
// ==========================================
// 1. IPC Message Handler (Parent Electron)
// ==========================================
if (process.send) {
    process.on('message', async (msg) => {
        if (!msg || typeof msg !== 'object')
            return;
        const { id, type, payload } = msg;
        if (type === 'PING') {
            process.send({ id, type: 'PONG', timestamp: Date.now() });
            return;
        }
        if (type === 'STATUS') {
            process.send({
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
                let float32;
                const raw = payload?.audioData;
                if (raw instanceof Float32Array) {
                    float32 = raw;
                }
                else if (Buffer.isBuffer(raw)) {
                    float32 = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
                }
                else if (raw?.type === 'Buffer' && Array.isArray(raw.data)) {
                    const b = Buffer.from(raw.data);
                    float32 = new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
                }
                else if (Array.isArray(raw)) {
                    float32 = new Float32Array(raw);
                }
                else if (raw && raw.buffer) {
                    float32 = new Float32Array(raw.buffer, raw.byteOffset || 0, (raw.byteLength || raw.length * 4) / 4);
                }
                else {
                    process.send({ id, type: 'TRANSCRIBE_ERROR', error: 'Invalid audio buffer format' });
                    return;
                }
                const tier = payload?.modelTier || activeModelTier;
                const result = await transcribeAudio(float32, tier);
                process.send({ id, type: 'TRANSCRIBE_RESULT', result });
            }
            catch (err) {
                console.error('[AISidecar] IPC Transcribe error:', err);
                process.send({ id, type: 'TRANSCRIBE_ERROR', error: err.message });
            }
        }
    });
    console.log('[AISidecar] Connected to Electron parent via Node IPC');
}
// ==========================================
// 2. HTTP Diagnostic Server (127.0.0.1:11435)
// ==========================================
const HTTP_PORT = 11435;
const server = http_1.default.createServer(async (req, res) => {
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
        const chunks = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', async () => {
            try {
                const bodyBuffer = Buffer.concat(chunks);
                const float32 = new Float32Array(bodyBuffer.buffer, bodyBuffer.byteOffset, bodyBuffer.byteLength / 4);
                const result = await transcribeAudio(float32, activeModelTier);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result));
            }
            catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
            }
        });
        return;
    }
    res.writeHead(404);
    res.end('Not Found');
});
server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.warn('[AISidecar] Diagnostic port 11435 occupied; continuing purely on Node IPC channel.');
    }
    else {
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
            try {
                global.gc();
            }
            catch { }
        }
    }
}, 30000);
//# sourceMappingURL=ai-sidecar-process.js.map