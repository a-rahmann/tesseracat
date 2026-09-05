/**
 * Ollama Gemma 3 4B Implementation of AgentModel.
 * Connects directly to local Ollama instance with streaming token support.
 */

import { AgentModel, ChatMessage, ModelGenerateOptions, ModelStreamCallbacks } from './model.js';
import { StructuredOutputParser } from './structured-output.js';

export class OllamaGemmaModel implements AgentModel {
  readonly name: string;
  readonly provider = 'Ollama Local';
  private baseUrl: string;

  constructor(modelName = 'gemma3:4b', baseUrl = 'http://localhost:11434') {
    this.name = modelName;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  public async generate(prompt: string, options: ModelGenerateOptions = {}): Promise<string> {
    const messages: ChatMessage[] = [];
    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });
    return this.chat(messages, options);
  }

  public async stream(
    prompt: string,
    callbacks: ModelStreamCallbacks,
    options: ModelGenerateOptions = {}
  ): Promise<string> {
    const messages: ChatMessage[] = [];
    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const payload = {
      model: this.name,
      messages,
      stream: true,
      options: {
        temperature: options.temperature ?? 0.2,
        num_predict: options.maxTokens ?? 1024,
        stop: options.stopSequences ?? [],
      },
    };

    let accumulated = '';
    try {
      const resp = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        throw new Error(`Ollama HTTP error ${resp.status}: ${await resp.text()}`);
      }

      if (!resp.body) {
        throw new Error('No response body returned from Ollama');
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const parsed = JSON.parse(trimmed);
            if (parsed.message?.content) {
              const token = parsed.message.content;
              accumulated += token;
              callbacks.onToken(token);
            }
          } catch {}
        }
      }

      if (callbacks.onComplete) callbacks.onComplete(accumulated);
      return accumulated;
    } catch (err: any) {
      console.error('[OllamaGemmaModel] Stream error:', err);
      if (callbacks.onError) callbacks.onError(err);
      throw err;
    }
  }

  public async chat(messages: ChatMessage[], options: ModelGenerateOptions = {}): Promise<string> {
    const payload = {
      model: this.name,
      messages,
      stream: false,
      options: {
        temperature: options.temperature ?? 0.2,
        num_predict: options.maxTokens ?? 1024,
        stop: options.stopSequences ?? [],
      },
    };

    const resp = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      throw new Error(`Ollama HTTP error ${resp.status}: ${await resp.text()}`);
    }

    const json = await resp.json();
    return json.message?.content || '';
  }

  public async structuredOutput<T = any>(
    prompt: string,
    schemaDescription: string,
    options: ModelGenerateOptions = {}
  ): Promise<T> {
    const structuredSystem = `${options.systemPrompt || 'You are Tesseract autonomous browser planner.'}
CRITICAL REQUIREMENT: Output MUST be valid JSON conforming exactly to this specification:
${schemaDescription}
DO NOT wrap in conversational preamble. Output ONLY the JSON block.`;

    const raw = await this.generate(prompt, {
      ...options,
      systemPrompt: structuredSystem,
    });

    return StructuredOutputParser.parseJson<T>(raw);
  }
}
