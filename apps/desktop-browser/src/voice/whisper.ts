/**
 * Whisper Local ASR Client Bridge
 */

export interface DetailedTranscriptionResult {
  text: string;
  elapsedMs: number;
  model?: string;
  confidence?: number;
}

export class WhisperBridge {
  public static async transcribeDetailed(audioBuffer: Float32Array): Promise<DetailedTranscriptionResult> {
    if (!audioBuffer || audioBuffer.length === 0) {
      return { text: '', elapsedMs: 0 };
    }

    const t0 = Date.now();
    try {
      // Check native Electron IPC bridge
      if (typeof window !== 'undefined' && (window as any).tesseractNative?.whisperTranscribe) {
        const resp = await (window as any).tesseractNative.whisperTranscribe(audioBuffer);
        const text = resp && resp.success && resp.text ? resp.text.trim() : '';
        return {
          text,
          elapsedMs: resp?.elapsedMs ?? (Date.now() - t0),
          model: resp?.model,
          confidence: resp?.confidence ?? (text ? 0.95 : 0),
        };
      }

      // Check electron ipcRenderer fallback
      if (typeof window !== 'undefined' && (window as any).require) {
        const { ipcRenderer } = (window as any).require('electron');
        const resp = await ipcRenderer.invoke('whisper:transcribe', audioBuffer);
        const text = resp && resp.success && resp.text ? resp.text.trim() : '';
        return {
          text,
          elapsedMs: resp?.elapsedMs ?? (Date.now() - t0),
          model: resp?.model,
          confidence: resp?.confidence ?? (text ? 0.95 : 0),
        };
      }
    } catch (err) {
      console.error('[WhisperBridge] Transcription error:', err);
    }

    return { text: '', elapsedMs: Date.now() - t0 };
  }

  public static async transcribe(audioBuffer: Float32Array): Promise<string> {
    const res = await WhisperBridge.transcribeDetailed(audioBuffer);
    return res.text;
  }
}
