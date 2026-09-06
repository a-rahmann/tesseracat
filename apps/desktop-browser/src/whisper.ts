import { pipeline, env } from '@xenova/transformers';

// Suppress verbose hub download logs that can trigger EPIPE on Electron streams
(env as any).verbose = false;
env.allowLocalModels = false;

let transcriberInstance: any = null;
let isInitializing = false;

export async function getTranscriber() {
  if (transcriberInstance) return transcriberInstance;
  if (isInitializing) {
    while (isInitializing) {
      await new Promise(r => setTimeout(r, 100));
    }
    return transcriberInstance;
  }

  isInitializing = true;
  try {
    // Xenova/whisper-tiny.en is super lightweight (~39MB ONNX) and fast on CPU
    transcriberInstance = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en');
  } catch (err) {
    console.error('[Whisper] Failed to initialize Whisper model:', err);
    throw err;
  } finally {
    isInitializing = false;
  }
  return transcriberInstance;
}

export async function transcribeAudioBuffer(audioFloat32: Float32Array): Promise<string> {
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
    if (val < min) min = val;
    if (val > max) max = val;
    sumSq += val * val;
  }

  const rms = Math.sqrt(sumSq / sampleCount);
  console.log(`[Whisper] Received ${sampleCount} samples (~${durationSec.toFixed(2)}s) | Min: ${min.toFixed(4)}, Max: ${max.toFixed(4)}, RMS: ${rms.toFixed(5)}${nonFiniteCount > 0 ? ` (Fixed ${nonFiniteCount} non-finite samples)` : ''}`);

  // Reject audio that is too short (< 0.4s / 6400 samples at 16kHz)
  if (sampleCount < 6400) {
    console.log('[Whisper] Rejected: audio too short (< 0.4s / 6400 samples)');
    return '';
  }

  const maxAmp = Math.max(Math.abs(min), Math.abs(max));

  // Reject pure digital zero or non-speech background murmur
  if (maxAmp < 0.01 && rms < 0.002) {
    console.log('[Whisper] Rejected: audio is ambient background noise (Max < 0.01, RMS < 0.002)');
    return '';
  }

  // Trim leading and trailing silence to eliminate padding hallucinations and speed up inference
  let speechStart = 0;
  for (let i = 0; i < sampleCount; i++) {
    if (Math.abs(audioFloat32[i]) >= 0.008) {
      speechStart = Math.max(0, i - 2400); // 150ms pre-roll
      break;
    }
  }

  let speechEnd = sampleCount;
  for (let i = sampleCount - 1; i >= speechStart; i--) {
    if (Math.abs(audioFloat32[i]) >= 0.008) {
      speechEnd = Math.min(sampleCount, i + 3200); // 200ms post-roll
      break;
    }
  }

  const activeAudio = audioFloat32.slice(speechStart, speechEnd);
  console.log(`[Whisper] Active speech segment: ${activeAudio.length} samples (~${(activeAudio.length / 16000).toFixed(2)}s, trimmed ${speechStart} leading samples)`);

  if (activeAudio.length < 4800) {
    console.log('[Whisper] Rejected: trimmed active speech too short (< 0.3s)');
    return '';
  }

  // Gentle normalization to protect SNR without amplifying background hiss
  if (maxAmp < 0.25 && maxAmp >= 0.01) {
    const scale = Math.min(2.5, 0.45 / maxAmp);
    for (let i = 0; i < activeAudio.length; i++) {
      activeAudio[i] *= scale;
    }
  }

  const transcriber = await getTranscriber();

  console.log('[Whisper] Inference started...');
  const t0 = Date.now();

  const transcriberOptions: any = {
    language: 'en',
    task: 'transcribe',
    return_timestamps: false,
  };

  if (activeAudio.length > 20 * 16000) {
    transcriberOptions.chunk_length_s = 30;
    transcriberOptions.stride_length_s = 5;
  }

  const output = await transcriber(activeAudio, transcriberOptions);

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
