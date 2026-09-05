/**
 * Whisper Local ASR Client Bridge
 */
export class WhisperBridge {
  public static async transcribe(audioBuffer: Float32Array): Promise<string> {
    if (!audioBuffer || audioBuffer.length === 0) return '';

    try {
      // Check native Electron IPC bridge
      if (typeof window !== 'undefined' && (window as any).tesseractNative?.whisperTranscribe) {
        const resp = await (window as any).tesseractNative.whisperTranscribe(audioBuffer);
        return resp && resp.success && resp.text ? resp.text.trim() : '';
      }

      // Check electron ipcRenderer fallback
      if (typeof window !== 'undefined' && (window as any).require) {
        const { ipcRenderer } = (window as any).require('electron');
        const resp = await ipcRenderer.invoke('whisper:transcribe', audioBuffer);
        return resp && resp.success && resp.text ? resp.text.trim() : '';
      }
    } catch (err) {
      console.error('[WhisperBridge] Transcription error:', err);
    }
    return '';
  }
}
