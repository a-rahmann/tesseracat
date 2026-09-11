/**
 * Whisper Local ASR Client Bridge
 */
export interface DetailedTranscriptionResult {
    text: string;
    elapsedMs: number;
    model?: string;
    confidence?: number;
}
export declare class WhisperBridge {
    static transcribeDetailed(audioBuffer: Float32Array): Promise<DetailedTranscriptionResult>;
    static transcribe(audioBuffer: Float32Array): Promise<string>;
}
//# sourceMappingURL=whisper.d.ts.map