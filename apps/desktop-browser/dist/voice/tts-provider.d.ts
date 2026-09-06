/**
 * TTS Provider Interface and Streaming Sentence Chunker for Tesseract.
 * Enables low-latency conversational speech by streaming spoken audio on the first completed clause.
 */
export interface TTSProvider {
    speak(text: string): Promise<void>;
    stop(): void;
    streamText(tokenStream: AsyncIterable<string>): Promise<string>;
}
export declare class WebSpeechTTSProvider implements TTSProvider {
    private activeUtterances;
    private isStopped;
    speak(text: string): Promise<void>;
    stop(): void;
    /**
     * Sentence-streaming TTS: speaks complete clauses as they arrive from token streams.
     */
    streamText(tokenStream: AsyncIterable<string>): Promise<string>;
}
//# sourceMappingURL=tts-provider.d.ts.map