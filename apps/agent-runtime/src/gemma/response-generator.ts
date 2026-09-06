import { OllamaGemmaProvider } from './ollama-provider.js';
import { ContextBuilder, RawPageContext } from './context-builder.js';
import { GeneratedResponse, ResponseSchema } from './schemas.js';

export class ResponseGenerator {
  private readonly provider: OllamaGemmaProvider;
  private readonly contextBuilder: ContextBuilder;

  constructor(
    provider: OllamaGemmaProvider,
    contextBuilder: ContextBuilder = new ContextBuilder()
  ) {
    this.provider = provider;
    this.contextBuilder = contextBuilder;
  }

  /**
   * Generate a structured user-facing final response validated by Zod
   */
  public async generateResponse(
    query: string,
    rawContext?: RawPageContext,
    options: { timeoutMs?: number; signal?: AbortSignal } = {}
  ): Promise<GeneratedResponse> {
    const trimmedQuery = (query || '').trim();
    if (!trimmedQuery) {
      return {
        answer: 'I did not receive an input to process.',
        confidence: 0,
        sources: [],
        nextSuggestions: ['Type a question in the address bar', 'Hold [T] to speak a command'],
      };
    }

    const formattedContext = this.contextBuilder.formatContextForPrompt(rawContext);

    const systemPrompt = `You are Tesseract's Local Gemma AI Copilot.
You provide clear, accurate, and concise answers based strictly on available page context and verified knowledge.

Always format your response as valid JSON matching this schema:
{
  "answer": "Clear, friendly, and well-structured answer in markdown format",
  "confidence": 0.95,
  "sources": ["source 1 or URL"],
  "uncertainty": "Optional note on any missing data or assumptions",
  "nextSuggestions": ["Helpful follow-up question or action 1", "Helpful follow-up action 2"],
  "safeAlternatives": ["Safe alternative if request involved private/sensitive data"]
}

Rules:
- Never disclose passwords, tokens, cookies, or sensitive credentials.
- If data is missing or ambiguous, indicate it in "uncertainty" and provide safe suggestions.`;

    const userPrompt = `${formattedContext}User Query: "${trimmedQuery}"`;

    try {
      const responseText = await this.provider.chat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        {
          timeoutMs: options.timeoutMs ?? 30000,
          signal: options.signal,
          format: 'json',
          temperature: 0.3,
        }
      );

      return this.parseAndValidate(responseText, trimmedQuery);
    } catch (err: unknown) {
      return {
        answer: `I could not complete inference locally: ${err instanceof Error ? err.message : String(err)}`,
        confidence: 0,
        sources: [],
        uncertainty: 'Local Gemma model is unreachable or encountered a timeout.',
        nextSuggestions: [
          'Verify Ollama is running at http://127.0.0.1:11434',
          'Run "ollama pull gemma3:4b" to ensure the model is installed',
        ],
      };
    }
  }

  /**
   * Parse and validate model response against Zod ResponseSchema
   */
  public parseAndValidate(responseText: string, fallbackQuery: string): GeneratedResponse {
    const cleaned = responseText
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    try {
      const parsed = JSON.parse(cleaned);
      const validated = ResponseSchema.safeParse(parsed);
      if (validated.success) {
        return validated.data;
      }
      return {
        answer: typeof parsed.answer === 'string' ? parsed.answer : cleaned,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.7,
        sources: Array.isArray(parsed.sources) ? parsed.sources : [],
        uncertainty: typeof parsed.uncertainty === 'string' ? parsed.uncertainty : undefined,
        nextSuggestions: Array.isArray(parsed.nextSuggestions) ? parsed.nextSuggestions : [],
        safeAlternatives: Array.isArray(parsed.safeAlternatives) ? parsed.safeAlternatives : undefined,
      };
    } catch {
      // If model returned plain text instead of JSON
      return {
        answer: cleaned || `Response generated for: ${fallbackQuery}`,
        confidence: 0.8,
        sources: [],
        nextSuggestions: ['Ask a follow-up question', 'Summarize this page'],
      };
    }
  }

  /**
   * Stream response text token by token for live chat UI & voice UI
   */
  public async *generateResponseStream(
    query: string,
    rawContext?: RawPageContext,
    options: { timeoutMs?: number; signal?: AbortSignal } = {}
  ): AsyncGenerator<string, void, unknown> {
    const trimmedQuery = (query || '').trim();
    if (!trimmedQuery) {
      yield 'I did not receive an input to process.';
      return;
    }

    const formattedContext = this.contextBuilder.formatContextForPrompt(rawContext);
    const systemPrompt = `You are Tesseract's Local Gemma AI Copilot.
Provide a clear, helpful, and concise response in markdown format. Do not use JSON formatting for this streaming response.`;

    const userPrompt = `${formattedContext}User Query: "${trimmedQuery}"`;

    for await (const chunk of this.provider.chatStream(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      options
    )) {
      yield chunk;
    }
  }
}
