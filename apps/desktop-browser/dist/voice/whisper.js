"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhisperBridge = void 0;
/**
 * Whisper Local ASR Client Bridge
 */
class WhisperBridge {
    static async transcribe(audioBuffer) {
        if (!audioBuffer || audioBuffer.length === 0)
            return '';
        try {
            // Check native Electron IPC bridge
            if (typeof window !== 'undefined' && window.tesseractNative?.whisperTranscribe) {
                const resp = await window.tesseractNative.whisperTranscribe(audioBuffer);
                return resp && resp.success && resp.text ? resp.text.trim() : '';
            }
            // Check electron ipcRenderer fallback
            if (typeof window !== 'undefined' && window.require) {
                const { ipcRenderer } = window.require('electron');
                const resp = await ipcRenderer.invoke('whisper:transcribe', audioBuffer);
                return resp && resp.success && resp.text ? resp.text.trim() : '';
            }
        }
        catch (err) {
            console.error('[WhisperBridge] Transcription error:', err);
        }
        return '';
    }
}
exports.WhisperBridge = WhisperBridge;
//# sourceMappingURL=whisper.js.map