import {
  HealthCheckResult,
  OllamaTagsResponseSchema,
} from './schemas.js';

export class OllamaError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'OllamaError';
  }
}

export class OllamaUnavailableError extends OllamaError {
  constructor(endpoint: string, originalError?: string) {
    super(
      `Ollama local endpoint is unavailable at ${endpoint}.${originalError ? ` Reason: ${originalError}` : ''}`,
      'OLLAMA_UNAVAILABLE'
    );
    this.name = 'OllamaUnavailableError';
  }
}

export class GemmaModelMissingError extends OllamaError {
  constructor(requestedModel: string, availableModels: string[]) {
    super(
      `Gemma model "${requestedModel}" is not installed in Ollama. Available models: [${availableModels.join(', ')}]. Please run: ollama pull gemma3:4b`,
      'GEMMA_MODEL_MISSING'
    );
    this.name = 'GemmaModelMissingError';
  }
}

export class OllamaTimeoutError extends OllamaError {
  constructor(timeoutMs: number) {
    super(`Ollama request timed out after ${timeoutMs}ms.`, 'OLLAMA_TIMEOUT');
    this.name = 'OllamaTimeoutError';
  }
}

export class OllamaCancellationError extends OllamaError {
  constructor() {
    super('Ollama request was cancelled by client.', 'OLLAMA_CANCELLED');
    this.name = 'OllamaCancellationError';
  }
}

export interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OllamaRequestOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  temperature?: number;
  format?: 'json' | undefined;
}

export class OllamaGemmaProvider {
  private readonly endpoint: string;
  private modelName: string;
  private discoveredModel: string | null = null;

  constructor(
    endpoint: string = 'http://127.0.0.1:11434',
    modelName: string = 'gemma3:4b'
  ) {
    this.validateLocalhost(endpoint);
    this.endpoint = endpoint.replace(/\/+$/, '');
    this.modelName = modelName;
  }

  private validateLocalhost(endpoint: string): void {
    try {
      const url = new URL(endpoint);
      const isLocalhost =
        url.hostname === 'localhost' ||
        url.hostname === '127.0.0.1' ||
        url.hostname === '::1';
      if (!isLocalhost) {
        throw new Error(
          `Security violation: Ollama endpoint must be localhost only. Received: "${url.hostname}"`
        );
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.message.startsWith('Security violation')) {
        throw err;
      }
      throw new Error(`Invalid Ollama endpoint URL: "${endpoint}"`);
    }
  }

  public getEndpoint(): string {
    return this.endpoint;
  }

  public getModelName(): string {
    return this.discoveredModel || this.modelName;
  }

  public setModelName(name: string): void {
    this.modelName = name;
    this.discoveredModel = null;
  }

  /**
   * Unload a model from Ollama memory/VRAM by setting keep_alive to 0.
   */
  public async unloadModel(modelName?: string): Promise<boolean> {
    const target = modelName || this.discoveredModel || this.modelName;
    if (!target) return true;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(`${this.endpoint}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: target,
          keep_alive: 0,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return res.ok;
    } catch (err) {
      console.warn(`[OllamaProvider] Failed to unload model "${target}":`, err);
      return false;
    }
  }

  /**
   * Preload / warm a model into Ollama memory/VRAM.
   * Sending an empty prompt with model name instructs Ollama to load weights into GPU/RAM.
   */
  public async preloadModel(modelName?: string): Promise<boolean> {
    const target = modelName || this.discoveredModel || this.modelName;
    if (!target) return false;
    try {
      const controller = new AbortController();
      // Allow up to 45 seconds for background model loading
      const timeoutId = setTimeout(() => controller.abort(), 45000);
      const res = await fetch(`${this.endpoint}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: target,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return res.ok;
    } catch (err) {
      console.warn(`[OllamaProvider] Failed to preload model "${target}":`, err);
      return false;
    }
  }

  /**
   * Query all installed models from Ollama /api/tags
   */
  public async listInstalledModels(): Promise<Array<{ name: string; details?: { family?: string; parameter_size?: string } }>> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(`${this.endpoint}/api/tags`, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!res.ok) return [];
      const rawData = await res.json();
      const parsed = OllamaTagsResponseSchema.safeParse(rawData);
      return parsed.success ? parsed.data.models : [];
    } catch {
      return [];
    }
  }

  /**
   * Health Check & Model Discovery
   * Verifies Ollama is running and locates the installed target model.
   */
  public async checkHealth(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const response = await fetch(`${this.endpoint}/api/tags`, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const latencyMs = Date.now() - startTime;

      if (!response.ok) {
        return {
          status: 'UNAVAILABLE',
          endpoint: this.endpoint,
          latencyMs,
          availableModels: [],
          error: `HTTP ${response.status} from Ollama`,
        };
      }

      const rawData = await response.json();
      const parsed = OllamaTagsResponseSchema.safeParse(rawData);
      const models = parsed.success ? parsed.data.models : [];
      const modelNames = models.map((m) => m.name);

      // Look for the configured model (strictly matching the requested model, no silent fallbacks)
      const matchedModel = this.findBestGemmaModel(models);

      if (!matchedModel) {
        return {
          status: 'MODEL_MISSING',
          endpoint: this.endpoint,
          availableModels: modelNames,
          latencyMs,
          error: `Model "${this.modelName}" is not installed in local Ollama instance.`,
        };
      }

      this.discoveredModel = matchedModel;

      return {
        status: 'AVAILABLE',
        endpoint: this.endpoint,
        modelName: matchedModel,
        availableModels: modelNames,
        latencyMs,
      };
    } catch (err: unknown) {
      const latencyMs = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        status: 'UNAVAILABLE',
        endpoint: this.endpoint,
        availableModels: [],
        latencyMs,
        error: errorMsg,
      };
    }
  }

  /**
   * Discover best matching model from available tags.
   * Strictly matches the requested model name (case-insensitively and tag variations)
   * without falling back to a completely different model.
   */
  private findBestGemmaModel(
    models: Array<{ name: string; details?: { family?: string } }>
  ): string | null {
    const reqClean = this.modelName.trim().toLowerCase();

    // 1. Exact match (case-insensitive, e.g. "gemma3:4b" matches "Gemma3:4b")
    const exact = models.find(
      (m) => m.name.toLowerCase() === reqClean
    );
    if (exact) return exact.name;

    // 2. Exact match ignoring ':latest' tag
    const reqWithoutLatest = reqClean.replace(/:latest$/, '');
    const tagMatch = models.find((m) => {
      const mClean = m.name.toLowerCase().replace(/:latest$/, '');
      return mClean === reqWithoutLatest;
    });
    if (tagMatch) return tagMatch.name;

    // 3. Match base name + tag prefix (e.g. "gemma4:e2b" matches "gemma4:e2b-instruct")
    const basePrefixMatch = models.find((m) =>
      m.name.toLowerCase().startsWith(reqClean)
    );
    if (basePrefixMatch) return basePrefixMatch.name;

    // 4. Only if modelName was generically configured as "gemma" (not specific like "gemma4:e2b"),
    // check any gemma model
    if (reqClean === 'gemma' || reqClean === 'gemma:latest') {
      const anyGemma = models.find(
        (m) =>
          m.name.toLowerCase().includes('gemma') ||
          (m.details?.family && m.details.family.toLowerCase().includes('gemma'))
      );
      if (anyGemma) return anyGemma.name;
    }

    return null;
  }

  /**
   * Ensure model is discovered and available before sending inference
   */
  private async ensureModel(): Promise<string> {
    if (this.discoveredModel) return this.discoveredModel;

    const health = await this.checkHealth();
    if (health.status === 'UNAVAILABLE') {
      throw new OllamaUnavailableError(this.endpoint, health.error);
    }
    if (health.status === 'MODEL_MISSING' || !health.modelName) {
      throw new GemmaModelMissingError(this.modelName, health.availableModels);
    }

    this.discoveredModel = health.modelName;
    return this.discoveredModel;
  }

  /**
   * Standard Chat Completion
   * NOTE: Prompt and response text are NEVER logged to console/files for privacy.
   */
  public async chat(
    messages: OllamaChatMessage[] | string,
    options: OllamaRequestOptions = {}
  ): Promise<string> {
    const formattedMessages: OllamaChatMessage[] =
      typeof messages === 'string'
        ? [{ role: 'user', content: messages }]
        : messages;
    const model = await this.ensureModel();
    const timeoutMs = options.timeoutMs ?? 120000;

    const abortController = new AbortController();
    let isTimedOut = false;
    const timeoutId = setTimeout(() => {
      isTimedOut = true;
      abortController.abort();
    }, timeoutMs);

    if (options.signal) {
      options.signal.addEventListener('abort', () => abortController.abort(), {
        once: true,
      });
    }

    try {
      const res = await fetch(`${this.endpoint}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: formattedMessages,
          stream: false,
          format: options.format,
          options: {
            temperature: options.temperature ?? 0.2,
          },
        }),
        signal: abortController.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new OllamaError(
          `Ollama chat request failed with HTTP ${res.status}: ${res.statusText}`,
          `HTTP_${res.status}`
        );
      }

      const data = await res.json();
      return (data?.message?.content || '').trim();
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      if (isTimedOut) {
        throw new OllamaTimeoutError(timeoutMs);
      }
      if (abortController.signal.aborted) {
        throw new OllamaCancellationError();
      }
      if (err instanceof OllamaError) {
        throw err;
      }
      throw new OllamaUnavailableError(
        this.endpoint,
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  /**
   * Streaming Chat Completion
   * Yields text tokens as they arrive from Ollama.
   */
  public async *chatStream(
    messages: OllamaChatMessage[],
    options: OllamaRequestOptions = {}
  ): AsyncGenerator<string, void, unknown> {
    const model = await this.ensureModel();
    const timeoutMs = options.timeoutMs ?? 120000;

    const abortController = new AbortController();
    let isTimedOut = false;
    const timeoutId = setTimeout(() => {
      isTimedOut = true;
      abortController.abort();
    }, timeoutMs);

    if (options.signal) {
      options.signal.addEventListener('abort', () => abortController.abort(), {
        once: true,
      });
    }

    let res: Response;
    try {
      res = await fetch(`${this.endpoint}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          stream: true,
          options: {
            temperature: options.temperature ?? 0.2,
          },
        }),
        signal: abortController.signal,
      });
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      if (isTimedOut) throw new OllamaTimeoutError(timeoutMs);
      if (abortController.signal.aborted) throw new OllamaCancellationError();
      throw new OllamaUnavailableError(
        this.endpoint,
        err instanceof Error ? err.message : String(err)
      );
    }

    if (!res.ok || !res.body) {
      clearTimeout(timeoutId);
      throw new OllamaError(
        `Ollama stream failed with HTTP ${res.status}`,
        `HTTP_${res.status}`
      );
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    try {
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
              yield parsed.message.content;
            }
          } catch {
            // Ignore non-JSON or partial line chunks
          }
        }
      }
    } catch (err: unknown) {
      if (isTimedOut) throw new OllamaTimeoutError(timeoutMs);
      if (abortController.signal.aborted) throw new OllamaCancellationError();
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
