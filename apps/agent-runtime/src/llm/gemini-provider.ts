export interface LLMPlanStep {
  stepNumber: number;
  description: string;
  toolName: string;
  toolParameters: Record<string, any>;
}

export class GeminiLLMProvider {
  private apiKey: string;
  private localLlmUrl: string;

  constructor(apiKey = '', localLlmUrl = 'http://localhost:11434') {
    this.apiKey = apiKey || process.env.GEMINI_API_KEY || '';
    this.localLlmUrl = localLlmUrl;
  }

  public setApiKey(key: string) {
    this.apiKey = key;
  }

  public async generatePlan(userGoal: string): Promise<LLMPlanStep[]> {
    const systemPrompt = `You are Tesseract Browser AI Copilot. The user gave the goal: "${userGoal}".
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

    // 1. Try Gemini API if key is available
    if (this.apiKey) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: systemPrompt }] }],
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
        console.warn('Gemini LLM call failed, falling back:', err);
      }
    }

    // 2. Try Local Ollama endpoint if running
    try {
      const ollamaRes = await fetch(`${this.localLlmUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama3',
          prompt: systemPrompt,
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
      // Ollama not running locally
    }

    // 3. Rule-based fallback planner
    return this.generateFallbackPlan(userGoal);
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
      },
      {
        stepNumber: 2,
        description: `Navigate to target service (${targetUrl})`,
        toolName: 'browser_navigate',
        toolParameters: { url: targetUrl },
      },
      {
        stepNumber: 3,
        description: `Perform autonomous action for: "${userGoal}"`,
        toolName: 'dom_interact',
        toolParameters: { action: 'execute' },
      },
      {
        stepNumber: 4,
        description: 'Verify policy & security compliance',
        toolName: 'privacy_scan',
        toolParameters: {},
      },
    ];
  }
}
