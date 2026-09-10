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

    // Fast-path heuristic pre-checks (0ms latency for common explicit queries)
    const lowerInput = trimmedInput.toLowerCase();

    // 1. User profile, memory, identity & local storage queries
    if (
      /\b(?:what do (?:you|u) know about me|who am i|tell me about (?:myself|me)|what info (?:do you|did you) have on me|what('s| is) my name|where do i live|my workspaces?|do you remember me|what do you remember)\b/i.test(lowerInput) ||
      ((lowerInput.includes('about me') || lowerInput.includes('know about me') || lowerInput.includes('know me')) && (lowerInput.includes('what') || lowerInput.includes('tell') || lowerInput.includes('brief')))
    ) {
      return {
        intent: 'general_qa',
        confidence: 1.0,
        target: 'user_profile_storage',
        parameters: {},
        reasoning: 'Fast-path heuristic: User inquiry regarding local profile, memory, or storage awareness.',
      };
    }

    // 2. Full Access Grants, Task Continuations & Execution Triggers
    if (
      /\b(?:full access|give (?:u|you) (?:full )?access|permission granted|access granted|allow (?:all|access)|now perform|perform (?:the )?task|execute (?:the )?task|proceed|continue|go ahead|do it|start the task|finish the task)\b/i.test(lowerInput)
    ) {
      return {
        intent: 'browser_automation',
        confidence: 1.0,
        target: trimmedInput,
        parameters: { isFullAccessGrant: true },
        reasoning: 'Fast-path heuristic: User explicitly granted full access or commanded autonomous task execution.',
      };
    }

    // 3. Explicit Comparison, Research, Shopping, and Budget Analysis
    if (
      lowerInput.includes('compar') ||
      lowerInput.includes('report') ||
      (lowerInput.includes('budget') && (lowerInput.includes('search') || lowerInput.includes('find') || lowerInput.includes('for'))) ||
      lowerInput.includes('versus') ||
      lowerInput.includes('best options') ||
      /\b(?:flowers|bouquet|cheapest|pricing|deliver(?:y|ed)? in|deliver to|order online|shop for)\b/i.test(lowerInput)
    ) {
      return {
        intent: 'research_compare',
        confidence: 1.0,
        target: trimmedInput,
        parameters: {},
        reasoning: 'Fast-path heuristic: User requested comparison, budget evaluation, shopping, or research report.',
      };
    }

    // 4. Clear browser navigation / action commands
    if (
      /^(?:open|go to|visit|search for|search|find|play|buy|watch|navigate to|shop|order|browse|check)\b/i.test(lowerInput) ||
      lowerInput.includes('search for ') ||
      lowerInput.startsWith('open ')
    ) {
      return {
        intent: 'browser_navigation',
        confidence: 1.0,
        target: trimmedInput,
        parameters: {},
        reasoning: 'Fast-path heuristic: Explicit navigation or search command.',
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
   - Questions about user profile, memory, saved notes, or storage capabilities (e.g. "What info did you get about me?", "Who am I?", "What do you know about me?", "Do you have storage?", "Can we store passwords?").
   - Examples: "What info did you get about me?", "Who am I?", "Explain WW2 in 2 sentences.", "What is photosynthesis?", "Explain TCP/IP.", "Why is the sky blue?", "What is a compiler?", "How does encryption work?", "What is the difference between RAM and ROM?", "Explain recursion simply."

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
- If the user asks a general knowledge, conceptual, or factual question (e.g. "Explain WW2 in 2 sentences", "What is TCP/IP?", "How does photosynthesis work?", "Who is Einstein?"), it MUST be classified as general_qa, regardless of what webpage is open in the background.
- Do NOT classify a query as explain_current_page or summarize_page unless the user explicitly refers to the current page (e.g. "summarize this page", "what does this article say", "explain this website").
- Do NOT classify something as research_compare merely because it asks about a topic. A question like "Explain WW2 in 2 sentences." or "What is TCP/IP?" MUST be general_qa.
- When the user asks to navigate to, open, search on, or visit another site (e.g. "Open YouTube", "Go to Amazon and find RTX 5070", "Search Google for WW2"), classify as browser_navigation. The active page does NOT restrict the user from executing tasks across the web.
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

    const historyMessages: Array<{ role: 'user' | 'assistant'; content: string }> = (rawContext?.conversationHistory || [])
      .slice(-4)
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
          timeoutMs: options.timeoutMs ?? 60000,
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
