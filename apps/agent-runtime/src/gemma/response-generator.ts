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
    const lowerQuery = trimmedQuery.toLowerCase();
    const isExplicitSummaryRequested =
      /\b(?:brief|summary|summarize|explain|details|detailed|elaborate|breakdown|in-depth|list all|tell me everything|why|how does|what is the difference|compare)\b/i.test(lowerQuery);

    const systemPrompt = `You are Tesseract's Autonomous AI Agent and Copilot.
You run locally on the user's computer with FULL ACCESS to the Tesseract browser, live web navigation, media controls, and automation tools.

CORE DIRECTIVES:
1. BREVITY & DIRECTNESS (CRITICAL):
   ${isExplicitSummaryRequested
     ? '- The user explicitly requested a brief/summary/explanation. Provide a structured, informative response in markdown format.'
     : '- KEEP YOUR ANSWER CONCISE, CRISP, AND DIRECT (1 to 2 sentences maximum). Do NOT write long paragraphs or unnecessary lists unless asked.'}
   - NEVER use introductory filler or boilerplate (NEVER say "As your local AI Copilot...", "I operate locally...", "Based on our interaction...", or "Sure, here is...").
   - Jump straight to the direct answer with zero preamble!

2. AGENTIC CAPABILITY & FULL ACCESS (CRITICAL):
   - YOU ARE AN ACTIVE BROWSER AGENT, NOT A PASSIVE CHATBOT.
   - NEVER say "I cannot perform live shopping comparisons", "I cannot access external websites", or "I can only provide information based on internal knowledge".
   - Tesseract provides you full automated access to navigate live websites, search, compare pricing, and automate web workflows.
   - When the user gives permissions or asks to execute a task, confirm execution directly.

3. IDENTITY, MEMORY & LOCAL STORAGE CONTEXT:
   - User Profile: Owner is Abdul, location: Mumbai, active workspaces: Work, College, Entertainment.
   - Local Storage: Stored notes, Trello Kanban boards, bookmarks, and encrypted offline credential vault.
   - When asked identity questions ("who am I", "what do you know about me"), answer directly from local profile facts without boilerplate lectures on privacy.

4. CONVERSATIONAL CONTINUITY:
   - Maintain context across conversational turns. Resolve pronouns ("it", "he", "she", "that", "them") based on the chat history.
   - If the user refers to "the task" or says "perform the task", refer to the previous goal in the chat history.

5. OFF-SCREEN & GENERAL KNOWLEDGE:
   - Answer general knowledge, definitions, coding, science, and math directly.
   - Ignore active webpage background unless the user specifically asks about the current screen.

Always format your response as valid JSON matching this schema:
{
  "answer": "Direct, concise answer in markdown format",
  "confidence": 0.95,
  "sources": ["source 1, URL, or 'Tesseract Knowledge'"],
  "uncertainty": "Optional note on any missing data or assumptions",
  "nextSuggestions": ["Helpful follow-up question or action 1", "Helpful follow-up action 2"],
  "safeAlternatives": ["Safe alternative if request involved private/sensitive data"]
}`;

    const userPrompt = formattedContext
      ? `${formattedContext}\nUser Query: "${trimmedQuery}"`
      : `User Query: "${trimmedQuery}"`;

    // Multi-turn message continuity for Ollama chat
    const historyMessages: Array<{ role: 'user' | 'assistant'; content: string }> = (rawContext?.conversationHistory || [])
      .slice(-6)
      .map(turn => ({
        role: turn.role,
        content: turn.content,
      }));

    try {
      const responseText = await this.provider.chat(
        [
          { role: 'system', content: systemPrompt },
          ...historyMessages,
          { role: 'user', content: userPrompt },
        ],
        {
          timeoutMs: options.timeoutMs ?? 120000,
          signal: options.signal,
          format: 'json',
          temperature: 0.2,
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
