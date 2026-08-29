export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolCallId?: string;
}

export interface ModelToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ModelStructuredResponse {
  text?: string;
  toolCalls?: ModelToolCall[];
  finishReason: 'stop' | 'tool_calls' | 'length' | 'content_filter';
  tokensUsed?: {
    prompt: number;
    completion: number;
    total: number;
  };
}

export interface CostEstimate {
  estimatedCostUSD: number;
  provider: string;
  modelName: string;
  isLocal: boolean;
}

export interface ModelProvider {
  id: string;
  name: string;
  isLocal: boolean;
  
  chat(
    messages: ChatMessage[],
    tools?: unknown[],
    policyOptions?: unknown
  ): Promise<ModelStructuredResponse>;
  
  embed(texts: string[]): Promise<number[][]>;
  
  vision?(input: { imageBase64: string; prompt: string }): Promise<ModelStructuredResponse>;
  
  health(): Promise<{ available: boolean; latencyMs: number }>;
  
  estimateCost(tokenCount: { prompt: number; completion: number }): CostEstimate;
}
