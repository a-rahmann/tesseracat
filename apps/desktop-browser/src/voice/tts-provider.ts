/**
 * TTS Provider Interface and Streaming Sentence Chunker for Tesseract.
 * Enables low-latency conversational speech by streaming spoken audio on the first completed clause.
 */

export interface TTSProvider {
  speak(text: string): Promise<void>;
  stop(): void;
  streamText(tokenStream: AsyncIterable<string>): Promise<string>;
}

export class WebSpeechTTSProvider implements TTSProvider {
  private activeUtterances: Set<SpeechSynthesisUtterance> = new Set();
  private isStopped = false;

  public speak(text: string): Promise<void> {
    this.isStopped = false;
    return new Promise((resolve) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window) || !text) {
        resolve();
        return;
      }

      const cleanText = text.replace(/[*_#`~[\]]/g, '').trim();
      if (!cleanText) {
        resolve();
        return;
      }

      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.rate = 1.05;
      utterance.pitch = 1.0;

      this.activeUtterances.add(utterance);

      const cleanup = () => {
        this.activeUtterances.delete(utterance);
        resolve();
      };

      utterance.onend = cleanup;
      utterance.onerror = cleanup;

      // Chrome GC failsafe
      setTimeout(cleanup, Math.max(2500, cleanText.length * 85));

      window.speechSynthesis.speak(utterance);
    });
  }

  public stop(): void {
    this.isStopped = true;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    this.activeUtterances.clear();
  }

  /**
   * Sentence-streaming TTS: speaks complete clauses as they arrive from token streams.
   */
  public async streamText(tokenStream: AsyncIterable<string>): Promise<string> {
    this.isStopped = false;
    let buffer = '';
    let fullText = '';

    for await (const token of tokenStream) {
      if (this.isStopped) break;
      buffer += token;
      fullText += token;

      // Check for sentence/clause boundaries: ., !, ?, or newline
      const match = buffer.match(/^(.*?[.!?\n])\s+(.*)$/);
      if (match) {
        const sentence = match[1].trim();
        buffer = match[2];
        if (sentence.length > 3) {
          await this.speak(sentence);
        }
      }
    }

    // Speak any remaining tail
    if (!this.isStopped && buffer.trim().length > 0) {
      await this.speak(buffer.trim());
    }

    return fullText;
  }
}
