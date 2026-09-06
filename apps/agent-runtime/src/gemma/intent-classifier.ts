import { OllamaGemmaProvider } from './ollama-provider.js';
import { ContextBuilder, RawPageContext } from './context-builder.js';
import { IntentClassification, IntentSchema, IntentType } from './schemas.js';

export class IntentClassifier {
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
   * Classify user input (text command or voice transcript) into a Zod-validated intent
   */
  public async classify(
    userInput: string,
    rawContext?: RawPageContext,
    options: { timeoutMs?: number; signal?: AbortSignal } = {}
  ): Promise<IntentClassification> {
    const trimmedInput = (userInput || '').trim();
    if (!trimmedInput) {
      return {
        intent: 'unknown',
        confidence: 0,
        target: '',
        parameters: {},
        reasoning: 'Empty user input',
      };
    }

    const formattedContext = this.contextBuilder.formatContextForPrompt(rawContext);

    const systemPrompt = `You are Tesseract's Local Gemma AI Intent Classifier.
Analyze the user's input and optional page context to classify their semantic intent into exactly ONE category.

Allowed intents:
1. general_qa:
   - General knowledge, explanations, definitions, how/why questions, conceptual questions.
   - Questions that can be answered directly from the model's knowledge base without web browsing.
   - No current/live/fresh information requirement.
   - No explicit web search request.
   - No explicit citation or source requirement.
   - Examples: "Explain WW2 in 2 sentences.", "What is photosynthesis?", "Explain TCP/IP.", "Why is the sky blue?", "What is a compiler?", "How does encryption work?", "What is the difference between RAM and ROM?", "Explain recursion simply."

2. research_compare:
   - Explicit research or deep search requests.
   - Comparing multiple items, products, theories, papers, or technologies.
   - Requiring multiple external sources or citations.
   - Current, latest, today's, or recent developments/prices requiring external verification.
   - Examples: "What are the latest developments in quantum computing?", "Research the latest AI chips.", "Compare today's prices of these phones.", "Find current information about India's GDP.", "Research the top 3 programming languages for AI development and compare them using multiple sources."

3. browser_navigation:
   - Explicit browser navigation or search actions.
   - Opening URLs, visiting websites ("Open YouTube", "Go to github.com", "Open the official OpenAI website").
   - Explicit web search commands ("Search Google for WW2 causes", "Search the web for recipe").
   - Clicking links or tab management.

4. explain_current_page: User asks to explain the active webpage or concepts currently visible on it.
5. summarize_page: User asks for a summary, key takeaways, or TL;DR of current page content.
6. explain_selected_text: User highlighted or selected text and asks what it means.
7. file_task: Mentions local files, downloading files, reading documents, or file system operations.
8. form_task: User requests filling out forms, login, registration, or data entry on a page.
9. communication_task: User asks to send emails, chats, tweets, or messages (e.g. "Send an email to John saying I'll be late").
10. calendar_query: User asks about dates, appointments, schedules, meetings.
11. media_control: Play, pause, resume, mute, stop video/audio commands.
12. unknown: Input is unintelligible, ambiguous, or unrelated.

CRITICAL ROUTING RULES:
- Do NOT classify something as research_compare merely because it asks about a topic. A question like "Explain WW2 in 2 sentences." or "What is TCP/IP?" MUST be general_qa.
- Do NOT classify general questions as browser_navigation unless the user explicitly mentions searching Google / web or opening a website.
- Freshness words ("latest", "today", "recent", "current") or explicit comparison across multiple sources imply research_compare.

Return ONLY a valid JSON object matching this schema:
{
  "intent": "general_qa",
  "confidence": 0.95,
  "target": "the subject or goal",
  "parameters": {},
  "reasoning": "Clear explanation of why this intent was selected"
}`;

    const userPrompt = `${formattedContext}User Input: "${trimmedInput}"`;

    try {
      const responseText = await this.provider.chat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        {
          timeoutMs: options.timeoutMs ?? 45000,
          signal: options.signal,
          format: 'json',
          temperature: 0.1,
        }
      );

      return this.parseAndValidate(responseText);
    } catch (err: unknown) {
      // Safe fallback on provider error or parse failure
      return {
        intent: 'unknown',
        confidence: 0,
        target: '',
        parameters: {},
        reasoning: `Intent classification fallback: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  /**
   * Parse response string and validate against Zod IntentSchema
   */
  public parseAndValidate(responseText: string): IntentClassification {
    try {
      // Clean possible markdown code fences
      const cleaned = responseText
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      const parsedJson = JSON.parse(cleaned);
      const validated = IntentSchema.safeParse(parsedJson);

      if (validated.success) {
        return validated.data;
      }

      // Check if partial intent matched
      if (typeof parsedJson.intent === 'string') {
        const fallbackIntent = parsedJson.intent.toLowerCase() as IntentType;
        const validIntents: IntentType[] = [
          'general_qa',
          'explain_current_page',
          'summarize_page',
          'explain_selected_text',
          'research_compare',
          'browser_navigation',
          'file_task',
          'form_task',
          'communication_task',
          'calendar_query',
          'media_control',
          'unknown',
        ];

        if (validIntents.includes(fallbackIntent)) {
          return {
            intent: fallbackIntent,
            confidence: typeof parsedJson.confidence === 'number' ? parsedJson.confidence : 0.5,
            target: typeof parsedJson.target === 'string' ? parsedJson.target : '',
            parameters: typeof parsedJson.parameters === 'object' ? parsedJson.parameters : {},
            reasoning: typeof parsedJson.reasoning === 'string' ? parsedJson.reasoning : 'Schema coerced',
          };
        }
      }

      return {
        intent: 'unknown',
        confidence: 0,
        target: '',
        parameters: {},
        reasoning: `Validation error: ${validated.error.issues.map(i => i.message).join(', ')}`,
      };
    } catch (err: unknown) {
      return {
        intent: 'unknown',
        confidence: 0,
        target: '',
        parameters: {},
        reasoning: `JSON parse failure on model response`,
      };
    }
  }
}
