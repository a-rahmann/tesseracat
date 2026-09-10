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
export type WhisperModelTier = 'tiny.en' | 'base.en' | 'small.en';
//# sourceMappingURL=ai-sidecar-process.d.ts.map