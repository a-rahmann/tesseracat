import { OllamaGemmaProvider } from './ollama-provider.js';
import { ContextBuilder, RawPageContext } from './context-builder.js';
import {
  AllowedReadOnlyToolEnum,
  ProhibitedToolKeywords,
  TaskPlan,
  TaskPlanSchema,
} from './schemas.js';

export class UnsafePlanError extends Error {
  constructor(public readonly prohibitedTools: string[]) {
    super(
      `Plan rejected: Dangerous or unapproved executable actions requested: [${prohibitedTools.join(', ')}]. Gemma is restricted to read-only and navigation planning only.`
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
   * Decompose user goal into read-only and navigation steps using Gemma
   * NO tool execution happens here.
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

    const formattedContext = this.contextBuilder.formatContextForPrompt(rawContext);

    const systemPrompt = `You are Tesseract's Local Gemma AI Task Planner.
Decompose the user's goal into a safe, structured execution plan in JSON format.

CRITICAL SAFETY CONSTRAINTS:
1. You may ONLY propose read-only and navigation tools.
   ALLOWED TOOLS:
   - "browser_navigate" (parameters: { "url": string })
   - "web_search" (parameters: { "query": string })
   - "read_page_content" (parameters: { "focus"?: string })
   - "privacy_scan" (parameters: {})
   - "user_context_analyze" (parameters: { "context": string })

2. FORBIDDEN ACTIONS:
   - NEVER suggest or plan form submissions, password inputs, payments, money transfers, file uploads, file deletions, message sending, or script execution.
   - If the user asks for an unsafe action (e.g. "buy this", "submit password", "delete file"), DO NOT plan an executable tool. Instead, plan a safe read-only step (e.g. browse to page or search) and note safe alternatives.

Return ONLY a valid JSON object matching this schema:
{
  "goal": "string",
  "reasoning": "string",
  "steps": [
    {
      "stepNumber": 1,
      "description": "Navigate to official documentation",
      "toolName": "browser_navigate",
      "toolParameters": { "url": "https://..." }
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
          timeoutMs: options.timeoutMs ?? 25000,
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
      // Return safe fallback plan on network or parse failure
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

    // Handle array output if model returned array instead of wrapped object
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

    // Filter and sanitize steps to ensure toolName is strictly within AllowedReadOnlyToolEnum
    const sanitizedSteps = (parsed.steps || []).filter((s: any) => {
      const validation = AllowedReadOnlyToolEnum.safeParse(s.toolName);
      return validation.success;
    });

    const candidate = {
      goal: typeof parsed.goal === 'string' && parsed.goal ? parsed.goal : originalGoal,
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
      steps: sanitizedSteps,
      isReadOnly: true,
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
   * Safe fallback plan when model is unavailable or output is invalid.
   * Does NOT blindly force web_search for conversational or non-executable goals.
   */
  public generateSafeFallbackPlan(goal: string, reason: string): TaskPlan {
    const isUrl = /^https?:\/\//i.test(goal);
    return {
      goal,
      reasoning: `Safe fallback plan applied (${reason})`,
      isReadOnly: true,
      safeAlternatives: [
        'Perform manual search in Omnibar',
        'Review current tab content directly',
      ],
      steps: isUrl
        ? [
            {
              stepNumber: 1,
              description: `Navigate to ${goal}`,
              toolName: 'browser_navigate',
              toolParameters: { url: goal },
            },
          ]
        : [],
    };
  }
}
