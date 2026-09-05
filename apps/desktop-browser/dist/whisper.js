"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTranscriber = getTranscriber;
exports.transcribeAudioBuffer = transcribeAudioBuffer;
const transformers_1 = require("@xenova/transformers");
// Suppress verbose hub download logs that can trigger EPIPE on Electron streams
transformers_1.env.verbose = false;
transformers_1.env.allowLocalModels = false;
let transcriberInstance = null;
let isInitializing = false;
async function getTranscriber() {
    if (transcriberInstance)
        return transcriberInstance;
    if (isInitializing) {
        while (isInitializing) {
            await new Promise(r => setTimeout(r, 100));
        }
        return transcriberInstance;
    }
    isInitializing = true;
    try {
        // Xenova/whisper-tiny.en is super lightweight (~39MB ONNX) and fast on CPU
        transcriberInstance = await (0, transformers_1.pipeline)('automatic-speech-recognition', 'Xenova/whisper-tiny.en');
    }
    catch (err) {
        console.error('[Whisper] Failed to initialize Whisper model:', err);
        throw err;
    }
    finally {
        isInitializing = false;
    }
    return transcriberInstance;
}
async function transcribeAudioBuffer(audioFloat32) {
    if (!audioFloat32 || audioFloat32.length === 0) {
        console.log('[Whisper] Rejected: empty audio buffer');
        return '';
    }
    const sampleCount = audioFloat32.length;
    const durationSec = sampleCount / 16000;
    // Validate finite samples & compute min, max, RMS
    let min = 0, max = 0, sumSq = 0;
    let nonFiniteCount = 0;
    for (let i = 0; i < sampleCount; i++) {
        const val = audioFloat32[i];
        if (!Number.isFinite(val)) {
            nonFiniteCount++;
            audioFloat32[i] = 0;
            continue;
        }
        if (val < min)
            min = val;
        if (val > max)
            max = val;
        sumSq += val * val;
    }
    const rms = Math.sqrt(sumSq / sampleCount);
    console.log(`[Whisper] Received ${sampleCount} samples (~${durationSec.toFixed(2)}s) | Min: ${min.toFixed(4)}, Max: ${max.toFixed(4)}, RMS: ${rms.toFixed(5)}${nonFiniteCount > 0 ? ` (Fixed ${nonFiniteCount} non-finite samples)` : ''}`);
    // Reject audio that is too short (< 0.6s / 9600 samples at 16kHz)
    if (sampleCount < 9600) {
        console.log('[Whisper] Rejected: audio too short (< 0.6s / 9600 samples)');
        return '';
    }
    // Reject pure silence or faint background murmur (RMS < 0.008)
    if (rms < 0.008) {
        console.log('[Whisper] Rejected: audio is ambient background noise (RMS < 0.008)');
        return '';
    }
    const transcriber = await getTranscriber();
    // Normalize amplitude so intentional speech is cleanly scaled without amplifying noise
    const maxAmp = Math.max(Math.abs(min), Math.abs(max));
    if (maxAmp >= 0.025 && maxAmp < 0.7) {
        const scale = 0.85 / maxAmp;
        for (let i = 0; i < sampleCount; i++) {
            audioFloat32[i] *= scale;
        }
    }
    console.log('[Whisper] Inference started...');
    const t0 = Date.now();
    // Pass max_new_tokens: 40 and temperature: 0.0 for fastest deterministic decoding on CPU
    const output = await transcriber(audioFloat32, {
        task: 'transcribe',
        max_new_tokens: 40,
        temperature: 0.0,
        return_timestamps: false,
    });
    const elapsedMs = Date.now() - t0;
    console.log(`[Whisper] Inference finished in ${elapsedMs}ms. Raw output:`, output);
    let rawText = typeof output?.text === 'string' ? output.text.trim() : '';
    // Filter out pure punctuation / repetitive dots / noise hallucinations
    if (!rawText || /^[.\s,!?;:\-_—–…]+$/.test(rawText)) {
        console.log(`[Whisper] Discarded punctuation hallucination: "${rawText}"`);
        return '';
    }
    // Filter out sound effect / background noise tokens (e.g. "[Music]", "(Applause)", "*cough*")
    if (/^(\[|\(|\*)[a-zA-Z\s_-]+(\]|\)|\*)$/i.test(rawText)) {
        console.log(`[Whisper] Ignored non-speech sound token: "${rawText}"`);
        return '';
    }
    // Strip embedded sound tokens (e.g. "[Music] Hey Tesseract")
    rawText = rawText.replace(/\[[a-zA-Z\s_-]+\]/gi, '').replace(/\([a-zA-Z\s_-]+\)/gi, '').trim();
    console.log(`[Whisper] Final extracted text: "${rawText}"`);
    return rawText;
}
//# sourceMappingURL=whisper.js.map