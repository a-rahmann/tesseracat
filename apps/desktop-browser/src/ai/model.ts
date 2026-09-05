/**
 * Generic AgentModel interface for Tesseract.
 * Decouples reasoning and tool planning from specific LLM providers.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ModelGenerateOptions {
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
  systemPrompt?: string;
}

export interface ModelStreamCallbacks {
  onToken: (token: string) => void;
  onComplete?: (fullText: string) => void;
  onError?: (err: Error) => void;
}

export interface AgentModel {
  readonly name: string;
  readonly provider: string;

  /**
   * One-shot completion.
   */
  generate(prompt: string, options?: ModelGenerateOptions): Promise<string>;

  /**
   * Streaming completion for low perceived latency.
   */
  stream(prompt: string, callbacks: ModelStreamCallbacks, options?: ModelGenerateOptions): Promise<string>;

  /**
   * Multi-turn chat completion.
   */
  chat(messages: ChatMessage[], options?: ModelGenerateOptions): Promise<string>;

  /**
   * Structured JSON output adhering to a schema or TypeScript interface.
   */
  structuredOutput<T = any>(prompt: string, schemaDescription: string, options?: ModelGenerateOptions): Promise<T>;
}
