"use strict";
/**
 * Whisper Local ASR Client Bridge
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhisperBridge = void 0;
class WhisperBridge {
    static async transcribeDetailed(audioBuffer) {
        if (!audioBuffer || audioBuffer.length === 0) {
            return { text: '', elapsedMs: 0 };
        }
        const t0 = Date.now();
        try {
            // Check native Electron IPC bridge
            if (typeof window !== 'undefined' && window.tesseractNative?.whisperTranscribe) {
                const resp = await window.tesseractNative.whisperTranscribe(audioBuffer);
                const text = resp && resp.success && resp.text ? resp.text.trim() : '';
                return {
                    text,
                    elapsedMs: resp?.elapsedMs ?? (Date.now() - t0),
                    model: resp?.model,
                    confidence: resp?.confidence ?? (text ? 0.95 : 0),
                };
            }
            // Check electron ipcRenderer fallback
            if (typeof window !== 'undefined' && window.require) {
                const { ipcRenderer } = window.require('electron');
                const resp = await ipcRenderer.invoke('whisper:transcribe', audioBuffer);
                const text = resp && resp.success && resp.text ? resp.text.trim() : '';
                return {
                    text,
                    elapsedMs: resp?.elapsedMs ?? (Date.now() - t0),
                    model: resp?.model,
                    confidence: resp?.confidence ?? (text ? 0.95 : 0),
                };
            }
        }
        catch (err) {
            console.error('[WhisperBridge] Transcription error:', err);
        }
        return { text: '', elapsedMs: Date.now() - t0 };
    }
    static async transcribe(audioBuffer) {
        const res = await WhisperBridge.transcribeDetailed(audioBuffer);
        return res.text;
    }
}
exports.WhisperBridge = WhisperBridge;
//# sourceMappingURL=whisper.js.map