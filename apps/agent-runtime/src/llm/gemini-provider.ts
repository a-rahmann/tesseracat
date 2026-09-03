export interface LLMPlanStep {
  stepNumber: number;
  description: string;
  toolName: string;
  toolParameters: Record<string, any>;
  executionEngine?: 'LOCAL_GEMMA_3' | 'CLOUD_GEMINI' | 'FALLBACK';
}

export type RoutingStrategy = 'HYBRID_AUTO' | 'LOCAL_GEMMA_ONLY' | 'CLOUD_GEMINI_ONLY';

export class GeminiLLMProvider {
  private apiKey: string;
  private localLlmUrl: string; // e.g. http://localhost:11434 (Ollama) or http://localhost:1234 (LM Studio)
  private modelName: string; // e.g. 'gemma3', 'gemma:2b', 'gemma:7b'
  private routingStrategy: RoutingStrategy;

  constructor(
    apiKey = '',
    localLlmUrl = 'http://localhost:11434',
    modelName = 'gemma3',
    strategy: RoutingStrategy = 'HYBRID_AUTO'
  ) {
    this.apiKey = apiKey || process.env.GEMINI_API_KEY || '';
    this.localLlmUrl = localLlmUrl;
    this.modelName = modelName;
    this.routingStrategy = strategy;
  }

  public setApiKey(key: string) {
    this.apiKey = key;
  }

  public setLocalConfig(url: string, modelName = 'gemma3') {
    this.localLlmUrl = url;
    this.modelName = modelName;
  }

  public setRoutingStrategy(strategy: RoutingStrategy) {
    this.routingStrategy = strategy;
  }

  /**
   * Smart Router: Decides whether to route the request to Local Gemma 3 or Cloud Gemini.
   */
  public classifyTaskRoute(userGoal: string): 'LOCAL_GEMMA_3' | 'CLOUD_GEMINI' {
    if (this.routingStrategy === 'LOCAL_GEMMA_ONLY') return 'LOCAL_GEMMA_3';
    if (this.routingStrategy === 'CLOUD_GEMINI_ONLY') return 'CLOUD_GEMINI';

    const lower = userGoal.toLowerCase();

    // 1. Complex reasoning, deep research, coding, or long analytical questions -> Cloud Gemini
    const isComplexReasoning =
      lower.includes('code') ||
      lower.includes('refactor') ||
      lower.includes('explain quantum') ||
      lower.includes('deep research') ||
      lower.includes('summarize paper') ||
      lower.includes('compare architectures');

    if (isComplexReasoning && this.apiKey) {
      return 'CLOUD_GEMINI';
    }

    // 2. Default: Privacy-first Local Gemma 3 for all routine navigation, search, media, and private browsing tasks
    return 'LOCAL_GEMMA_3';
  }

  public async generatePlan(userGoal: string): Promise<LLMPlanStep[]> {
    const targetEngine = this.classifyTaskRoute(userGoal);
    const systemPrompt = `You are Tesseract AI Copilot running on ${targetEngine}. The user goal is: "${userGoal}".
Break this goal down into 3-4 structured execution steps in valid JSON format.
Output a JSON array of objects with the fields:
- stepNumber (number)
- description (string)
- toolName (string: "browser_navigate", "dom_interact", "user_context_analyze", "privacy_scan", or "web_search")
- toolParameters (object, e.g. { "url": "...", "query": "..." })

Return ONLY valid JSON matching this schema:
[
  {
    "stepNumber": 1,
    "description": "...",
    "toolName": "browser_navigate",
    "toolParameters": { "url": "..." }
  }
]`;

    // Strategy 1: Attempt Local Gemma 3 if routed locally
    if (targetEngine === 'LOCAL_GEMMA_3') {
      const localResult = await this.callLocalGemma(systemPrompt);
      if (localResult && localResult.length > 0) {
        return localResult.map(s => ({ ...s, executionEngine: 'LOCAL_GEMMA_3' }));
      }

      // If Local Gemma 3 server is offline, fallback to Cloud Gemini
      if (this.apiKey) {
        const cloudResult = await this.callCloudGemini(systemPrompt);
        if (cloudResult && cloudResult.length > 0) {
          return cloudResult.map(s => ({ ...s, executionEngine: 'CLOUD_GEMINI' }));
        }
      }
    }

    // Strategy 2: Attempt Cloud Gemini if routed to cloud
    if (targetEngine === 'CLOUD_GEMINI') {
      if (this.apiKey) {
        const cloudResult = await this.callCloudGemini(systemPrompt);
        if (cloudResult && cloudResult.length > 0) {
          return cloudResult.map(s => ({ ...s, executionEngine: 'CLOUD_GEMINI' }));
        }
      }

      // Fallback to Local Gemma 3 if cloud fails
      const localResult = await this.callLocalGemma(systemPrompt);
      if (localResult && localResult.length > 0) {
        return localResult.map(s => ({ ...s, executionEngine: 'LOCAL_GEMMA_3' }));
      }
    }

    // Strategy 3: Local Rule-Based Fallback Engine
    return this.generateFallbackPlan(userGoal);
  }

  /**
   * Execute inference against Local Gemma 3 (Ollama or LM Studio OpenAI format)
   */
  private async callLocalGemma(prompt: string): Promise<LLMPlanStep[] | null> {
    // 1. Try Ollama native endpoint
    try {
      const ollamaRes = await fetch(`${this.localLlmUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.modelName, // 'gemma3', 'gemma:2b', 'gemma:7b'
          prompt: prompt,
          format: 'json',
          stream: false,
        }),
      });
      if (ollamaRes.ok) {
        const oData = await ollamaRes.json();
        if (oData.response) {
          const steps = JSON.parse(oData.response);
          if (Array.isArray(steps) && steps.length > 0) {
            return steps;
          }
        }
      }
    } catch (_) {
      // Ollama native endpoint not reached
    }

    // 2. Try LM Studio / OpenAI-compatible local server endpoint (e.g. http://localhost:1234/v1/chat/completions)
    try {
      const lmStudioUrl = this.localLlmUrl.includes('/v1')
        ? `${this.localLlmUrl}/chat/completions`
        : `${this.localLlmUrl}/v1/chat/completions`;

      const lmRes = await fetch(lmStudioUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.modelName,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2,
        }),
      });

      if (lmRes.ok) {
        const lmData = await lmRes.json();
        const content = lmData?.choices?.[0]?.message?.content;
        if (content) {
          const cleanJson = content.replace(/```json\n?|\n?```/g, '').trim();
          const steps = JSON.parse(cleanJson);
          if (Array.isArray(steps) && steps.length > 0) {
            return steps;
          }
        }
      }
    } catch (_) {
      // LM Studio endpoint not reached
    }

    return null;
  }

  /**
   * Execute inference against Google Gemini Cloud API
   */
  private async callCloudGemini(prompt: string): Promise<LLMPlanStep[] | null> {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' },
          }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        const jsonText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (jsonText) {
          const steps = JSON.parse(jsonText);
          if (Array.isArray(steps) && steps.length > 0) {
            return steps;
          }
        }
      }
    } catch (err) {
      console.warn('Cloud Gemini API call failed:', err);
    }
    return null;
  }

  private generateFallbackPlan(userGoal: string): LLMPlanStep[] {
    const lower = userGoal.toLowerCase();
    let targetUrl = 'https://www.google.com/search?q=' + encodeURIComponent(userGoal);

    if (lower.includes('reddit')) targetUrl = 'https://www.reddit.com';
    else if (lower.includes('youtube')) targetUrl = 'https://www.youtube.com';
    else if (lower.includes('github')) targetUrl = 'https://www.github.com';

    return [
      {
        stepNumber: 1,
        description: `Analyze context for: "${userGoal}"`,
        toolName: 'user_context_analyze',
        toolParameters: { context: userGoal },
        executionEngine: 'FALLBACK',
      },
      {
        stepNumber: 2,
        description: `Navigate to target service (${targetUrl})`,
        toolName: 'browser_navigate',
        toolParameters: { url: targetUrl },
        executionEngine: 'FALLBACK',
      },
      {
        stepNumber: 3,
        description: `Perform autonomous action for: "${userGoal}"`,
        toolName: 'dom_interact',
        toolParameters: { action: 'execute' },
        executionEngine: 'FALLBACK',
      },
      {
        stepNumber: 4,
        description: 'Verify policy & security compliance',
        toolName: 'privacy_scan',
        toolParameters: {},
        executionEngine: 'FALLBACK',
      },
    ];
  }
}
