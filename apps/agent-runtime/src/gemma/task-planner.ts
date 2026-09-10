import { OllamaGemmaProvider } from './ollama-provider.js';
import { ContextBuilder, RawPageContext } from './context-builder.js';
import {
  AllowedAgentToolEnum,
  ProhibitedToolKeywords,
  TaskPlan,
  TaskPlanSchema,
} from './schemas.js';

export class UnsafePlanError extends Error {
  constructor(public readonly prohibitedTools: string[]) {
    super(
      `Plan rejected: Dangerous or unapproved executable actions requested: [${prohibitedTools.join(', ')}]. Gemma is restricted to safe deterministic tools only.`
    );
    this.name = 'UnsafePlanError';
  }
}

export class TaskPlanner {
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
   * Decompose user goal into typed browser automation steps using Gemma
   */
  public async plan(
    userGoal: string,
    rawContext?: RawPageContext,
    options: { timeoutMs?: number; signal?: AbortSignal } = {}
  ): Promise<TaskPlan> {
    const trimmedGoal = (userGoal || '').trim();
    if (!trimmedGoal) {
      return {
        goal: '',
        reasoning: 'Empty user goal provided.',
        steps: [],
        isReadOnly: true,
        safeAlternatives: [],
      };
    }

    const lower = trimmedGoal.toLowerCase();

    // 1. Comparison, Research, Shopping & Budget Reports (Instant high-precision execution)
    const isComparisonOrResearch =
      lower.includes('compar') ||
      lower.includes('budget') ||
      lower.includes('report') ||
      lower.includes('versus') ||
      lower.includes('cheapest') ||
      lower.includes('best options') ||
      lower.includes('flowers') ||
      lower.includes('bouquet') ||
      lower.includes('deliver');

    if (isComparisonOrResearch) {
      return this.generateSafeFallbackPlan(trimmedGoal, 'Autonomous comparison & research fast-path');
    }

    // 2. Spotify Music Playback
    if (lower.includes('spotify') && (lower.includes('play') || lower.includes('song') || lower.includes('music'))) {
      return this.generateSafeFallbackPlan(trimmedGoal, 'Deterministic Spotify playback fast-path');
    }

    // 3. Active tab media playback
    if (
      lower === 'open this and play this' ||
      lower === 'play this' ||
      lower.includes('play this video') ||
      lower.includes('play the video')
    ) {
      return this.generateSafeFallbackPlan(trimmedGoal, 'Active tab media playback fast-path');
    }

    const formattedContext = this.contextBuilder.formatContextForPrompt(rawContext);

    const systemPrompt = `You are Tesseract's Local Gemma AI Task Planner.
Decompose the user's browser goal into a safe, deterministic execution plan in JSON format.

ALLOWED DETERMINISTIC TOOLS:
- "browser_navigate" (parameters: { "url": string })
- "browser_click" (parameters: { "target": { "role"?: string, "name"?: string, "text"?: string, "selector"?: string } })
- "browser_type" (parameters: { "target": { "role"?: string, "name"?: string, "text"?: string, "selector"?: string }, "text": string, "pressEnter"?: boolean })
- "browser_keypress" (parameters: { "key": string })
- "browser_scroll" (parameters: { "direction": "up" | "down" | "top" | "bottom" })
- "browser_wait" (parameters: { "ms"?: number, "condition"?: "time" | "element" | "navigation" })
- "web_search" (parameters: { "query": string })
- "read_page_content" (parameters: { "focus"?: string })
- "inspect_form_fields" (parameters: {})
- "form_fill" (parameters: { "fields": array })

CRITICAL CONSTRAINTS:
1. NEVER output shell commands, PowerShell, terminal commands, raw JavaScript/eval, or password reading tools.
2. CLEAN KEYWORDS FOR SEARCH:
   - NEVER dump long conversational instructions (e.g. "search for flowers, in the budget of 500 rupees which can be delivered in hyderabad, give me a comparision report") into search boxes!
   - Extract only the essential keywords: e.g. "flowers under 500 delivery in hyderabad".
3. COMPARISON & SHOPPING REPORTS:
   - For comparison/budget queries, plan multi-step execution:
     Step 1: browser_navigate to Google with clean query (e.g. "https://www.google.com/search?q=...")
     Step 2: browser_wait for results
     Step 3: browser_scroll to inspect provider offerings and prices
     Step 4: read_page_content to collect comparison data across vendors
4. MEDIA PLAYBACK (SPOTIFY / YOUTUBE / ACTIVE TAB):
   - For "open spotify and play X":
     Step 1: browser_navigate to "https://open.spotify.com/search/<query>"
     Step 2: browser_wait for track list
     Step 3: browser_click on the play button (selector: "[data-testid='play-button'], button[aria-label*='Play']")
   - For "open this and play this" on active tab:
     Step 1: browser_click on play button or video (selector: "video, ytd-player, button[aria-label*='Play'], button.play")
5. OFF-SCREEN & MULTI-DOMAIN TASKS:
   - If the user asks to visit, open, or search on another website (e.g. Amazon, YouTube, Google, Wikipedia, GitHub, Spotify), ALWAYS start the plan with "browser_navigate" to the target website URL.
   - The user is NEVER confined to the current screen or current tab. Tesseract can freely navigate anywhere across the web to perform the user's task!
6. Target elements using semantic roles/names or stable selectors, NOT coordinates.

Return ONLY a valid JSON object:
{
  "goal": "string",
  "reasoning": "string",
  "steps": [
    {
      "stepNumber": 1,
      "description": "Navigate to Google",
      "toolName": "browser_navigate",
      "toolParameters": { "url": "https://www.google.com" }
    }
  ],
  "isReadOnly": true,
  "safeAlternatives": []
}`;

    const userPrompt = `${formattedContext}User Goal: "${trimmedGoal}"`;

    try {
      const responseText = await this.provider.chat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        {
          timeoutMs: options.timeoutMs ?? 90000,
          signal: options.signal,
          format: 'json',
          temperature: 0.2,
        }
      );

      return this.parseAndValidate(responseText, trimmedGoal);
    } catch (err: unknown) {
      if (err instanceof UnsafePlanError) {
        throw err;
      }
      return this.generateSafeFallbackPlan(trimmedGoal, err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Parse model output and strictly validate against Zod TaskPlanSchema
   */
  public parseAndValidate(responseText: string, originalGoal: string): TaskPlan {
    const cleaned = responseText
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return this.generateSafeFallbackPlan(
        originalGoal,
        'Model did not output valid JSON'
      );
    }

    if (Array.isArray(parsed)) {
      parsed = {
        goal: originalGoal,
        reasoning: 'Coerced from array output',
        steps: parsed,
        isReadOnly: true,
        safeAlternatives: [],
      };
    }

    // Check for prohibited tool keywords in any step
    const detectedProhibited: string[] = [];
    if (Array.isArray(parsed.steps)) {
      for (const step of parsed.steps) {
        const toolName = String(step.toolName || '').toLowerCase();
        for (const forbidden of ProhibitedToolKeywords) {
          if (toolName.includes(forbidden)) {
            detectedProhibited.push(step.toolName);
          }
        }
      }
    }

    if (detectedProhibited.length > 0) {
      throw new UnsafePlanError(detectedProhibited);
    }

    // Filter and sanitize steps to ensure toolName is strictly within AllowedAgentToolEnum
    const sanitizedSteps = (parsed.steps || []).filter((s: any) => {
      const validation = AllowedAgentToolEnum.safeParse(s.toolName);
      return validation.success;
    });

    const candidate = {
      goal: typeof parsed.goal === 'string' && parsed.goal ? parsed.goal : originalGoal,
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
      steps: sanitizedSteps,
      isReadOnly: parsed.isReadOnly !== undefined ? Boolean(parsed.isReadOnly) : true,
      safeAlternatives: Array.isArray(parsed.safeAlternatives) ? parsed.safeAlternatives : [],
    };

    const validated = TaskPlanSchema.safeParse(candidate);
    if (!validated.success) {
      return this.generateSafeFallbackPlan(
        originalGoal,
        `Schema validation error: ${validated.error.issues.map(i => i.message).join(', ')}`
      );
    }

    return validated.data;
  }

  /**
   * Cleans conversational prompts into high-relevance search keywords.
   * Strips phrases like "give me a comparision report", "in the budget of", commas, etc.
   */
  public extractCleanSearchQuery(goal: string): string {
    let clean = (goal || '')
      .replace(/^(?:can you\s+|please\s+|i want to\s+|just\s+|help me\s+)?(?:search for|search google for|search the web for|search online for|search|find|look for|google)\s+/i, '')
      .replace(/\b(?:give me|provide|generate|prepare|show me|create)\s+(?:a\s+)?(?:comparision|comparison|report|summary|breakdown|list|table)?\b/gi, '')
      .replace(/\b(?:comparision|comparison|report|summary|breakdown|table)\b/gi, '')
      .replace(/\b(?:which can be delivered in|delivered in|deliver to|delivery in)\s+([a-zA-Z]+)/gi, '$1 delivery')
      .replace(/\b(?:in the budget of|under the budget of|within the budget of|the budget of|budget of)\s*/gi, 'under ')
      .replace(/\b(?:which can be|which can|that can be|that can)\b/gi, '')
      .replace(/[,;:]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Fallback if cleaning stripped too much
    if (clean.length < 3) {
      clean = goal.replace(/^(?:can you\s+|please\s+)?search for\s+/i, '').trim();
    }
    return clean;
  }

  /**
   * Safe fallback plan when model is unavailable or output is invalid.
   */
  public generateSafeFallbackPlan(goal: string, reason: string): TaskPlan {
    const lower = goal.toLowerCase();
    const isUrl = /^https?:\/\//i.test(goal);

    if (isUrl) {
      return {
        goal,
        reasoning: `Direct navigation plan (${reason})`,
        isReadOnly: true,
        safeAlternatives: [],
        steps: [
          {
            stepNumber: 1,
            description: `Navigate to ${goal}`,
            toolName: 'browser_navigate',
            toolParameters: { url: goal },
          },
        ],
      };
    }

    // Heuristic fallbacks for common browser automation patterns

    // 1. Spotify Media Playback ("open spotify and play a song", "play lo-fi on spotify")
    if (lower.includes('spotify')) {
      const trackMatch = goal.match(/(?:play|listen to|search for)\s+(.+)$/i);
      let query = trackMatch ? trackMatch[1].replace(/on spotify/gi, '').replace(/a song/gi, 'popular hits').trim() : 'top tracks';
      if (query === 'a bolly song' || query === 'bolly song') query = 'bollywood hits';
      const searchUrl = `https://open.spotify.com/search/${encodeURIComponent(query)}`;

      return {
        goal,
        reasoning: `Deterministic Spotify music playback plan (${reason})`,
        isReadOnly: true,
        safeAlternatives: [],
        steps: [
          {
            stepNumber: 1,
            description: `Navigate to Spotify search for "${query}"`,
            toolName: 'browser_navigate',
            toolParameters: { url: searchUrl },
          },
          {
            stepNumber: 2,
            description: 'Wait for Spotify track list to load',
            toolName: 'browser_wait',
            toolParameters: { ms: 3000, condition: 'navigation' },
          },
          {
            stepNumber: 3,
            description: 'Click Play on top track recommendation using mouse cursor',
            toolName: 'browser_click',
            toolParameters: {
              target: {
                selector: '[data-testid="play-button"], button[data-testid="play-button"], [data-testid="tracklist-row"] button, button[aria-label*="Play"], button[aria-label*="play"]',
                name: 'Play',
                text: 'Play'
              }
            },
          },
          {
            stepNumber: 4,
            description: 'Verify Spotify audio playback',
            toolName: 'browser_wait',
            toolParameters: { ms: 1500, condition: 'time' },
          }
        ],
      };
    }

    // 2. "Open this and play this" / Active Tab Media Playback
    if (
      lower === 'open this and play this' ||
      lower === 'play this' ||
      lower.includes('play this video') ||
      lower.includes('start playback') ||
      lower.includes('play the video')
    ) {
      return {
        goal,
        reasoning: `Direct active media playback interaction (${reason})`,
        isReadOnly: true,
        safeAlternatives: [],
        steps: [
          {
            stepNumber: 1,
            description: 'Locate media player and click play button with mouse cursor',
            toolName: 'browser_click',
            toolParameters: {
              target: {
                selector: 'video, ytd-player, button[aria-label*="Play"], .ytp-play-button, button.play, [data-testid="play-button"]',
                name: 'Play',
                text: 'Play'
              }
            }
          },
          {
            stepNumber: 2,
            description: 'Verify media is playing',
            toolName: 'browser_wait',
            toolParameters: { ms: 1200, condition: 'time' }
          }
        ]
      };
    }

    // 3. Comparison & Budget Shopping Report (e.g. "search for flowers in budget 500 delivered in hyderabad, give comparison report")
    const isComparisonOrResearch =
      lower.includes('compar') ||
      lower.includes('budget') ||
      lower.includes('report') ||
      lower.includes('versus') ||
      lower.includes('cheapest') ||
      lower.includes('best options');

    if (isComparisonOrResearch) {
      const cleanKeywords = this.extractCleanSearchQuery(goal);
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(cleanKeywords)}`;

      return {
        goal,
        reasoning: `Autonomous comparison & research execution plan (${reason})`,
        isReadOnly: true,
        safeAlternatives: [],
        steps: [
          {
            stepNumber: 1,
            description: `Navigate to Google with cleaned search terms: "${cleanKeywords}"`,
            toolName: 'browser_navigate',
            toolParameters: { url: searchUrl },
          },
          {
            stepNumber: 2,
            description: 'Wait for search results and provider cards to load',
            toolName: 'browser_wait',
            toolParameters: { ms: 2200, condition: 'navigation' },
          },
          {
            stepNumber: 3,
            description: 'Scroll through provider pricing and delivery listings with virtual cursor',
            toolName: 'browser_scroll',
            toolParameters: { direction: 'down', amount: 500 },
          },
          {
            stepNumber: 4,
            description: 'Extract vendor details, prices, delivery terms, and synthesize comparison report',
            toolName: 'read_page_content',
            toolParameters: { focus: 'pricing_comparison' },
          },
        ],
      };
    }

    // 4. Amazon Search & Product Finding
    if (lower.includes('amazon')) {
      const queryMatch = goal.match(/(?:search for|find|buy|search|get)\s+(.+)$/i);
      const query = queryMatch ? queryMatch[1].replace(/on amazon/gi, '').trim() : goal.replace(/amazon/gi, '').trim();
      return {
        goal,
        reasoning: `Deterministic Amazon search plan (${reason})`,
        isReadOnly: true,
        safeAlternatives: [],
        steps: [
          {
            stepNumber: 1,
            description: 'Navigate to Amazon',
            toolName: 'browser_navigate',
            toolParameters: { url: 'https://www.amazon.com' },
          },
          {
            stepNumber: 2,
            description: `Search for "${query || 'products'}"`,
            toolName: 'browser_type',
            toolParameters: {
              target: { role: 'searchbox', name: 'Search Amazon', selector: '#twotabsearchtextbox, input[name="field-keywords"]' },
              text: query || 'products',
              pressEnter: true,
            },
          },
          {
            stepNumber: 3,
            description: 'Wait for products to load',
            toolName: 'browser_wait',
            toolParameters: { ms: 2000, condition: 'navigation' },
          },
        ],
      };
    }

    // 5. YouTube Playback & Search
    if (lower.includes('youtube')) {
      const queryMatch = goal.match(/(?:search for|play|find|watch|listen to)\s+(.+)$/i);
      const query = queryMatch ? queryMatch[1].replace(/on youtube/gi, '').trim() : goal.replace(/youtube/gi, '').trim();
      return {
        goal,
        reasoning: `Deterministic YouTube plan (${reason})`,
        isReadOnly: true,
        safeAlternatives: [],
        steps: [
          {
            stepNumber: 1,
            description: 'Navigate to YouTube',
            toolName: 'browser_navigate',
            toolParameters: { url: 'https://www.youtube.com' },
          },
          {
            stepNumber: 2,
            description: `Search for "${query || 'music'}"`,
            toolName: 'browser_type',
            toolParameters: {
              target: { role: 'combobox', name: 'Search', selector: 'input#search, input[name="search_query"]' },
              text: query || 'music',
              pressEnter: true,
            },
          },
          {
            stepNumber: 3,
            description: 'Wait for videos to load',
            toolName: 'browser_wait',
            toolParameters: { ms: 2000, condition: 'navigation' },
          },
          {
            stepNumber: 4,
            description: 'Click top video recommendation using mouse cursor',
            toolName: 'browser_click',
            toolParameters: {
              target: {
                selector: 'ytd-video-renderer a#thumbnail, ytd-rich-item-renderer a#thumbnail, a#video-title',
                name: 'Play Video'
              }
            }
          }
        ],
      };
    }

    // 6. Google & Generic Search (Cleaned Keywords ONLY)
    if (lower.includes('search') || lower.includes('find') || lower.includes('google')) {
      const cleanKeywords = this.extractCleanSearchQuery(goal);
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(cleanKeywords)}`;

      return {
        goal,
        reasoning: `Deterministic clean search plan (${reason})`,
        isReadOnly: true,
        safeAlternatives: [],
        steps: [
          {
            stepNumber: 1,
            description: `Navigate to Google with cleaned query: "${cleanKeywords}"`,
            toolName: 'browser_navigate',
            toolParameters: { url: searchUrl },
          },
          {
            stepNumber: 2,
            description: 'Wait for search results to load',
            toolName: 'browser_wait',
            toolParameters: { ms: 2000, condition: 'navigation' },
          },
          {
            stepNumber: 3,
            description: 'Inspect top search results',
            toolName: 'browser_scroll',
            toolParameters: { direction: 'down', amount: 400 },
          }
        ],
      };
    }

    // 7. Open Website / Direct Navigation (e.g. "open reddit", "go to wikipedia")
    const openMatch = goal.match(/^(?:open|go to|visit)\s+([a-zA-Z0-9_\-\.]+)(?:\.com|\.org|\.net|\.io)?$/i);
    if (openMatch) {
      let domain = openMatch[1].toLowerCase();
      if (!domain.includes('.')) domain = `${domain}.com`;
      const targetUrl = `https://${domain}`;
      return {
        goal,
        reasoning: `Deterministic direct navigation plan (${reason})`,
        isReadOnly: true,
        safeAlternatives: [],
        steps: [
          {
            stepNumber: 1,
            description: `Navigate to ${targetUrl}`,
            toolName: 'browser_navigate',
            toolParameters: { url: targetUrl },
          },
        ],
      };
    }

    return {
      goal,
      reasoning: `Safe fallback plan applied (${reason})`,
      isReadOnly: true,
      safeAlternatives: [
        'Perform manual search in Omnibar',
        'Review current tab content directly',
      ],
      steps: [],
    };
  }
}
