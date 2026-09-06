/**
 * NaturalLanguageInterpreter: Unified Goal & Intent Understanding for Tesseract.
 * Translates arbitrary user voice/text utterances into structured AgentGoal objects.
 * Uses local Gemma 3 4B via Ollama with robust contextual pronoun & reference resolution.
 */

import { AgentGoal, IntentCategory } from './types.js';
import { AgentModel } from '../ai/model.js';
import { OllamaGemmaModel } from '../ai/ollama-gemma.js';
import { ConversationManager } from '../memory/conversation-manager.js';
import { BrowserStateStore } from '../memory/browser-state-store.js';

export class NaturalLanguageInterpreter {
  private static instance: NaturalLanguageInterpreter | null = null;
  private model: AgentModel;

  private constructor() {
    this.model = new OllamaGemmaModel('gemma3:4b');
  }

  public static getInstance(): NaturalLanguageInterpreter {
    if (!NaturalLanguageInterpreter.instance) {
      NaturalLanguageInterpreter.instance = new NaturalLanguageInterpreter();
    }
    return NaturalLanguageInterpreter.instance;
  }

  /**
   * Interprets an arbitrary user instruction into a structured AgentGoal.
   */
  public async interpret(
    rawText: string,
    currentUrl?: string,
    currentTitle?: string
  ): Promise<AgentGoal> {
    const cleanRaw = (rawText || '').trim();
    if (!cleanRaw) {
      return {
        rawUserText: rawText,
        goal: '',
        intentCategory: 'CONVERSATIONAL',
        entities: {},
        requiresBrowser: false,
        requiresPerception: false,
        isCompound: false,
        confidence: 0,
      };
    }

    // Strip wake phrases and conversational preambles
    const stripped = this.cleanWakeAndPreambles(cleanRaw);

    // Collect recent context
    const convTurns = ConversationManager.getInstance().getRecentTurns(4);
    const recentContext = convTurns
      .map((t) => `${t.speaker === 'user' ? 'User' : 'Assistant'}: "${t.text}"`)
      .join('\n');

    const browserStore = BrowserStateStore.getInstance();
    const activeTab = browserStore.getActiveTab();
    const activeUrl = currentUrl || activeTab?.url || 'about:blank';
    const activeTitle = currentTitle || activeTab?.title || '';

    // Fast-path intent detection for sub-millisecond execution (<1ms)
    const fastPathGoal = this.detectFastPathIntent(stripped, activeUrl);
    if (fastPathGoal) {
      console.log(`[NaturalLanguageInterpreter] Fast path triggered: action=${fastPathGoal.fastPathAction || 'plan'}, isCompound=${fastPathGoal.isCompound}, goal="${fastPathGoal.goal}"`);
      return fastPathGoal;
    }

    // Fast syntactic coherence gate: instantly reject dangling fragments or missing transitive targets
    const lower = stripped.toLowerCase();
    const hasActionableVerb = /\b(?:open|go|visit|navigate|search|find|lookup|check|read|see|click|press|type|enter|scroll|play|pause|stop|close|compare|buy|order|download|summarize|explain|tell|show|what|who|where|how|why|when)\b/i.test(lower);
    const isDanglingConjunction = /^(?:and|but|or|so|yet)\s+(?:you\s+)?/i.test(lower);
    const isOpenWithoutTarget = /\b(?:open|visit|navigate\s+to|go\s+to)\s+(?:and|or|then|into\s+that|a|the)?\s*$/i.test(lower) ||
                                /\b(?:open|visit|navigate\s+to|go\s+to)\s+(?:and|or|then)\s+/i.test(lower);
    const words = lower.replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 1);
    const hasSufficientContent = words.length >= 2;

    if (!hasActionableVerb || isDanglingConjunction || isOpenWithoutTarget || !hasSufficientContent) {
      console.warn(`[NaturalLanguageInterpreter] Fast coherence gate rejected incoherent utterance: "${stripped}" (dangling=${isDanglingConjunction}, noTarget=${isOpenWithoutTarget}, words=${words.length})`);
      return {
        rawUserText: rawText,
        goal: stripped,
        intentCategory: 'CONVERSATIONAL',
        entities: {},
        requiresBrowser: false,
        requiresPerception: false,
        isCompound: false,
        spokenAcknowledgment: "Sorry, I didn't catch that command. Could you please repeat?",
        confidence: 0.25,
        isCoherent: false,
        isUncertain: true,
      };
    }

    // Single-Pass Prompt: Extract intent, entities, suggested URL, AND initial plan steps in ONE LLM round-trip
    const prompt = `You are Tesseract's Natural Language Understanding Engine.
Analyze the user command and extract their true intent, goals, entities, and execution needs.
To maximize performance, generate the initial 2 to 4 plan steps directly in this single pass.

User Utterance: "${stripped}"
Active Browser URL: "${activeUrl}"
Active Page Title: "${activeTitle}"
Recent Conversation:
${recentContext || 'None'}

Rules:
1. NEVER truncate or drop compound instructions. For example, in "open Instagram and check whether Rahul messaged me", the goal is to check messages from Rahul on Instagram, NOT just opening Instagram.
2. If comparing products across multiple sites, mark intentCategory as "SHOPPING_COMPARISON" and extract product name and constraints.
3. If analyzing a PDF or document, mark intentCategory as "DOCUMENT_ANALYSIS".
4. Determine if it requires browser interaction and perception.
5. If the user mentions "first one", "second one", "that link", resolve what they are referring to from context.
6. If the utterance is incoherent, an acoustic fragment, or missing a coherent actionable target, set "isCoherent": false, "confidence": 0.2, "intentCategory": "CONVERSATIONAL", and "spokenAcknowledgment": "Sorry, I didn't catch that command. Could you please repeat?".
7. If the task targets a specific site, provide "suggestedTargetUrl" (e.g. "https://www.instagram.com" or "https://www.youtube.com").
8. Provide "initialPlan" containing 2-4 concrete steps using tools: "browser.navigate", "browser.click", "browser.type", "browser.observe", "browser.extractPdfText", "browser.synthesize".

Output strictly valid JSON matching this schema:
{
  "goal": string (clear canonical summary of what the user wants to accomplish),
  "intentCategory": "NAVIGATION" | "RESEARCH" | "SHOPPING_COMPARISON" | "SOCIAL_COMMUNICATION" | "MEDIA_CONTROL" | "FORM_AUTOFILL" | "DOCUMENT_ANALYSIS" | "GENERAL_AUTOMATION" | "CONVERSATIONAL" | "BROWSER_CONTROL",
  "entities": object (e.g. {"platform": "Instagram", "person": "Rahul", "product": "Sony WH-1000XM5"}),
  "suggestedTargetUrl": string (optional, URL of target platform),
  "requiresBrowser": boolean,
  "requiresPerception": boolean,
  "isCompound": boolean,
  "subTasks": string[] (ordered steps implied by compound goal),
  "initialPlan": [
    {
      "stepNumber": number,
      "description": string,
      "toolName": string,
      "parameters": object
    }
  ],
  "spokenAcknowledgment": string (short spoken confirmation),
  "isCoherent": boolean,
  "confidence": number
}`;

    try {
      const decision = await this.model.structuredOutput<any>(
        prompt,
        'AgentGoal JSON Schema',
        { temperature: 0.1, maxTokens: 280 }
      );

      const isCoherent = decision.isCoherent !== false && (decision.confidence ?? 0.85) >= 0.6;
      const initialPlan = Array.isArray(decision.initialPlan) && decision.initialPlan.length > 0
        ? decision.initialPlan.map((s: any, idx: number) => ({
            stepNumber: s.stepNumber || idx + 1,
            description: s.description || `Step ${idx + 1}`,
            toolName: s.toolName || 'browser.observe',
            parameters: s.parameters || {},
            status: 'PENDING' as const,
          }))
        : undefined;

      return {
        rawUserText: rawText,
        goal: decision.goal || stripped,
        intentCategory: decision.intentCategory || this.fallbackCategory(stripped),
        entities: decision.entities || {},
        suggestedTargetUrl: decision.suggestedTargetUrl || this.extractInitialDomainUrl(stripped),
        requiresBrowser: decision.requiresBrowser ?? true,
        requiresPerception: decision.requiresPerception ?? true,
        isCompound: decision.isCompound ?? (decision.subTasks ? decision.subTasks.length > 1 : false),
        subTasks: decision.subTasks || [],
        initialPlan,
        spokenAcknowledgment: decision.spokenAcknowledgment || `Working on: ${decision.goal || stripped}`,
        confidence: Math.max(0.1, Math.min(1.0, decision.confidence || 0.85)),
        isCoherent,
        isUncertain: !isCoherent,
      };
    } catch (err: any) {
      console.warn('[NaturalLanguageInterpreter] LLM interpretation error: ' + JSON.stringify({
        name: err?.name,
        message: err?.message,
        stack: err?.stack,
        cause: err?.cause,
      }, null, 2));
      return this.fallbackSemanticInterpreter(rawText, stripped, activeUrl);
    }
  }

  /**
   * Deterministic fast-path detector for standalone micro-actions and non-compound queries.
   * Invariant: ONLY triggers when the command is non-compound or a supported deterministic sequence.
   */
  public detectFastPathIntent(cleanText: string, activeUrl?: string): AgentGoal | null {
    const text = cleanText.toLowerCase().trim();
    if (!text) return null;

    // 1. COMPOUND SAFETY GUARD:
    // Any utterance with compound connectives MUST NOT take single-step micro action branches,
    // UNLESS it matches an explicitly supported pipelined sequence.
    const hasCompoundConnective = /\b(?:and|then|after|while|when|check|verify|if|whether|see\s+if|find\s+out|lookup|tell\s+me)\b/i.test(text);

    // Check for supported deterministic pipelined compound sequences FIRST
    // Pattern: "open youtube and search for <query>" or "open youtube and play <query>"
    const ytCompound = cleanText.match(/^(?:open\s+youtube\s+(?:and|&)\s+(?:search(?:\s+for)?|find|play|listen\s+to)\s+(.+))$/i);
    if (ytCompound) {
      const query = ytCompound[1].trim();
      const encodedQuery = encodeURIComponent(query);
      const searchUrl = `https://www.youtube.com/results?search_query=${encodedQuery}`;
      return {
        rawUserText: cleanText,
        goal: `Search YouTube for "${query}"`,
        intentCategory: 'MEDIA_CONTROL',
        entities: { platform: 'YouTube', query },
        requiresBrowser: true,
        requiresPerception: true,
        isCompound: true,
        isFastPath: false,
        suggestedTargetUrl: searchUrl,
        initialPlan: [
          {
            stepNumber: 1,
            description: `Navigate to YouTube search for "${query}"`,
            toolName: 'browser.navigate',
            parameters: { url: searchUrl },
            expectedOutcome: 'YouTube search results loaded',
            status: 'PENDING',
          },
          {
            stepNumber: 2,
            description: `Verify and observe video results for "${query}"`,
            toolName: 'browser.observe',
            parameters: {},
            expectedOutcome: 'Search results visible',
            status: 'PENDING',
          },
        ],
        subTasks: [`Navigate to YouTube search for ${query}`, 'Observe search results'],
        spokenAcknowledgment: `Searching YouTube for ${query}.`,
        confidence: 1.0,
        isCoherent: true,
      };
    }

    // Pattern: "open google and search for <query>"
    const googleCompound = cleanText.match(/^(?:open\s+google\s+(?:and|&)\s+(?:search(?:\s+for)?|find)\s+(.+))$/i);
    if (googleCompound) {
      const query = googleCompound[1].trim();
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
      return {
        rawUserText: cleanText,
        goal: `Search Google for "${query}"`,
        intentCategory: 'RESEARCH',
        entities: { searchEngine: 'Google', query },
        requiresBrowser: true,
        requiresPerception: true,
        isCompound: true,
        isFastPath: false,
        suggestedTargetUrl: searchUrl,
        initialPlan: [
          {
            stepNumber: 1,
            description: `Navigate to Google search for "${query}"`,
            toolName: 'browser.navigate',
            parameters: { url: searchUrl },
            expectedOutcome: 'Google search results loaded',
            status: 'PENDING',
          },
          {
            stepNumber: 2,
            description: `Observe search results for "${query}"`,
            toolName: 'browser.observe',
            parameters: {},
            expectedOutcome: 'Search results visible',
            status: 'PENDING',
          },
        ],
        subTasks: [`Navigate to Google search for ${query}`, 'Observe search results'],
        spokenAcknowledgment: `Searching Google for ${query}.`,
        confidence: 1.0,
        isCoherent: true,
      };
    }

    // If any other compound connective is present, it MUST go through full NLU / Agent reasoning
    if (hasCompoundConnective) {
      return null;
    }

    // 2. DETERMINISTIC STANDALONE MICRO-ACTIONS (<1ms)
    // History & Navigation
    if (/^(?:go\s+)?back$/i.test(text) || text === 'previous page') {
      return {
        rawUserText: cleanText,
        goal: 'Navigate back in history',
        intentCategory: 'BROWSER_CONTROL',
        fastPathAction: 'BACK',
        entities: { action: 'back' },
        requiresBrowser: true,
        requiresPerception: false,
        isCompound: false,
        isFastPath: true,
        spokenAcknowledgment: 'Going back.',
        confidence: 1.0,
        isCoherent: true,
      };
    }

    if (/^(?:go\s+)?forward$/i.test(text) || text === 'next page') {
      return {
        rawUserText: cleanText,
        goal: 'Navigate forward in history',
        intentCategory: 'BROWSER_CONTROL',
        fastPathAction: 'FORWARD',
        entities: { action: 'forward' },
        requiresBrowser: true,
        requiresPerception: false,
        isCompound: false,
        isFastPath: true,
        spokenAcknowledgment: 'Going forward.',
        confidence: 1.0,
        isCoherent: true,
      };
    }

    if (/^(?:reload|refresh)(?:\s+(?:this\s+)?page)?$/i.test(text)) {
      return {
        rawUserText: cleanText,
        goal: 'Reload current page',
        intentCategory: 'BROWSER_CONTROL',
        fastPathAction: 'NAVIGATE',
        entities: { action: 'reload' },
        requiresBrowser: true,
        requiresPerception: false,
        isCompound: false,
        isFastPath: true,
        spokenAcknowledgment: 'Reloading.',
        confidence: 1.0,
        isCoherent: true,
      };
    }

    // Tab Controls
    if (/^(?:open\s+)?(?:a\s+)?new\s+tab$/i.test(text)) {
      return {
        rawUserText: cleanText,
        goal: 'Open new tab',
        intentCategory: 'BROWSER_CONTROL',
        fastPathAction: 'OPEN',
        entities: { action: 'new_tab' },
        requiresBrowser: true,
        requiresPerception: false,
        isCompound: false,
        isFastPath: true,
        spokenAcknowledgment: 'Opening new tab.',
        confidence: 1.0,
        isCoherent: true,
      };
    }

    if (/^(?:close|shut)(?:\s+(?:this|the))?\s+tab$/i.test(text)) {
      return {
        rawUserText: cleanText,
        goal: 'Close active tab',
        intentCategory: 'BROWSER_CONTROL',
        fastPathAction: 'CLOSE',
        entities: { action: 'close_tab' },
        requiresBrowser: true,
        requiresPerception: false,
        isCompound: false,
        isFastPath: true,
        spokenAcknowledgment: 'Closing tab.',
        confidence: 1.0,
        isCoherent: true,
      };
    }

    // Scrolling
    if (/^(?:scroll\s+down|page\s+down|down)$/i.test(text)) {
      return {
        rawUserText: cleanText,
        goal: 'Scroll down',
        intentCategory: 'BROWSER_CONTROL',
        fastPathAction: 'SCROLL',
        entities: { action: 'scroll', direction: 'down' },
        requiresBrowser: true,
        requiresPerception: false,
        isCompound: false,
        isFastPath: true,
        spokenAcknowledgment: 'Scrolling down.',
        confidence: 1.0,
        isCoherent: true,
      };
    }

    if (/^(?:scroll\s+up|page\s+up|up)$/i.test(text)) {
      return {
        rawUserText: cleanText,
        goal: 'Scroll up',
        intentCategory: 'BROWSER_CONTROL',
        fastPathAction: 'SCROLL',
        entities: { action: 'scroll', direction: 'up' },
        requiresBrowser: true,
        requiresPerception: false,
        isCompound: false,
        isFastPath: true,
        spokenAcknowledgment: 'Scrolling up.',
        confidence: 1.0,
        isCoherent: true,
      };
    }

    // Stop / Cancel
    if (/^(?:stop|cancel|abort|shut\s+up|never\s*mind)$/i.test(text)) {
      return {
        rawUserText: cleanText,
        goal: 'Stop current task and speech',
        intentCategory: 'BROWSER_CONTROL',
        fastPathAction: 'STOP',
        entities: { action: 'stop' },
        requiresBrowser: false,
        requiresPerception: false,
        isCompound: false,
        isFastPath: true,
        spokenAcknowledgment: 'Task stopped.',
        confidence: 1.0,
        isCoherent: true,
      };
    }

    // 3. STANDALONE DIRECT URL / NAMED SITE NAVIGATION (<1ms)
    const namedSites: Record<string, { url: string; name: string }> = {
      youtube: { url: 'https://www.youtube.com', name: 'YouTube' },
      'youtube music': { url: 'https://music.youtube.com', name: 'YouTube Music' },
      google: { url: 'https://www.google.com', name: 'Google' },
      github: { url: 'https://github.com', name: 'GitHub' },
      twitter: { url: 'https://x.com', name: 'Twitter' },
      x: { url: 'https://x.com', name: 'X' },
      reddit: { url: 'https://www.reddit.com', name: 'Reddit' },
      wikipedia: { url: 'https://www.wikipedia.org', name: 'Wikipedia' },
      'hacker news': { url: 'https://news.ycombinator.com', name: 'Hacker News' },
      gmail: { url: 'https://mail.google.com', name: 'Gmail' },
      amazon: { url: 'https://www.amazon.com', name: 'Amazon' },
      instagram: { url: 'https://www.instagram.com', name: 'Instagram' },
    };

    const siteNavMatch = text.match(/^(?:open|go\s+to|visit|launch)\s+([a-z0-9\s.-]+)$/i);
    if (siteNavMatch) {
      const siteKey = siteNavMatch[1].trim().toLowerCase();
      if (namedSites[siteKey]) {
        const site = namedSites[siteKey];
        return {
          rawUserText: cleanText,
          goal: `Open ${site.name}`,
          intentCategory: 'NAVIGATION',
          fastPathAction: 'NAVIGATE',
          entities: { site: site.name, url: site.url },
          requiresBrowser: true,
          requiresPerception: false,
          isCompound: false,
          isFastPath: true,
          suggestedTargetUrl: site.url,
          spokenAcknowledgment: `Opening ${site.name}.`,
          confidence: 1.0,
          isCoherent: true,
        };
      }

      // Check for raw domain syntax: "go to google.com", "open wikipedia.org", "visit news.ycombinator.com"
      if (/^[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s]*)?$/i.test(siteKey) || siteKey.startsWith('http')) {
        const targetUrl = siteKey.startsWith('http') ? siteKey : `https://${siteKey}`;
        return {
          rawUserText: cleanText,
          goal: `Navigate to ${siteKey}`,
          intentCategory: 'NAVIGATION',
          fastPathAction: 'NAVIGATE',
          entities: { url: targetUrl },
          requiresBrowser: true,
          requiresPerception: false,
          isCompound: false,
          isFastPath: true,
          suggestedTargetUrl: targetUrl,
          spokenAcknowledgment: `Navigating to ${siteKey}.`,
          confidence: 1.0,
          isCoherent: true,
        };
      }
    }

    // 4. STANDALONE SEARCH / MEDIA QUERIES (<1ms)
    const playYtMatch = text.match(/^(?:play|listen\s+to)\s+(.+?)\s+on\s+youtube$/i);
    if (playYtMatch) {
      const query = playYtMatch[1].trim();
      const targetUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
      return {
        rawUserText: cleanText,
        goal: `Play "${query}" on YouTube`,
        intentCategory: 'MEDIA_CONTROL',
        fastPathAction: 'PLAY',
        entities: { platform: 'YouTube', query },
        requiresBrowser: true,
        requiresPerception: false,
        isCompound: false,
        isFastPath: true,
        suggestedTargetUrl: targetUrl,
        spokenAcknowledgment: `Playing ${query} on YouTube.`,
        confidence: 1.0,
        isCoherent: true,
      };
    }

    const searchYtMatch = text.match(/^search(?:\s+for)?\s+(.+?)\s+on\s+youtube$/i);
    if (searchYtMatch) {
      const query = searchYtMatch[1].trim();
      const targetUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
      return {
        rawUserText: cleanText,
        goal: `Search YouTube for "${query}"`,
        intentCategory: 'MEDIA_CONTROL',
        fastPathAction: 'SEARCH',
        entities: { platform: 'YouTube', query },
        requiresBrowser: true,
        requiresPerception: false,
        isCompound: false,
        isFastPath: true,
        suggestedTargetUrl: targetUrl,
        spokenAcknowledgment: `Searching YouTube for ${query}.`,
        confidence: 1.0,
        isCoherent: true,
      };
    }

    const searchGoogleMatch = text.match(/^search\s+google\s+for\s+(.+)$/i) || text.match(/^search(?:\s+for)?\s+(.+?)\s+on\s+google$/i);
    if (searchGoogleMatch) {
      const query = searchGoogleMatch[1].trim();
      const targetUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
      return {
        rawUserText: cleanText,
        goal: `Search Google for "${query}"`,
        intentCategory: 'RESEARCH',
        fastPathAction: 'SEARCH',
        entities: { searchEngine: 'Google', query },
        requiresBrowser: true,
        requiresPerception: false,
        isCompound: false,
        isFastPath: true,
        suggestedTargetUrl: targetUrl,
        spokenAcknowledgment: `Searching Google for ${query}.`,
        confidence: 1.0,
        isCoherent: true,
      };
    }

    return null;
  }

  /**
   * Helper to extract target domain URL from compound commands (e.g. "open instagram and ...")
   */
  public extractInitialDomainUrl(text: string): string | undefined {
    const lower = text.toLowerCase();
    if (lower.includes('instagram')) return 'https://www.instagram.com/direct/inbox/';
    if (lower.includes('youtube')) return 'https://www.youtube.com';
    if (lower.includes('google')) return 'https://www.google.com';
    if (lower.includes('amazon')) return 'https://www.amazon.com';
    if (lower.includes('github')) return 'https://github.com';
    if (lower.includes('wikipedia')) return 'https://www.wikipedia.org';
    if (lower.includes('hacker news')) return 'https://news.ycombinator.com';
    return undefined;
  }

  /**
   * Fallback semantic interpreter when Ollama daemon is unreachable or during single-pass fallback.
   * Invariant: Pre-synthesizes initialPlan steps to achieve <100ms planning latency without secondary LLM round-trips!
   */
  private fallbackSemanticInterpreter(rawText: string, cleanText: string, activeUrl: string): AgentGoal {
    const lower = cleanText.toLowerCase();

    // 1. Social Messaging (e.g. "open Instagram and check whether Rahul messaged me")
    if (lower.includes('instagram') || lower.includes('message') || lower.includes('dm') || lower.includes('chat')) {
      const personMatch = cleanText.match(/(?:whether|if|from|for|to)?\s+([A-Z][a-z]+)\s+(?:messaged|texted|sent|dm)/i) ||
                          cleanText.match(/(?:message|text|dm)\s+([A-Z][a-z]+)/i);
      const person = personMatch ? personMatch[1] : undefined;
      const targetUrl = 'https://www.instagram.com/direct/inbox/';

      return {
        rawUserText: rawText,
        goal: person
          ? `Check whether ${person} messaged on Instagram`
          : 'Check Instagram direct messages',
        intentCategory: 'SOCIAL_COMMUNICATION',
        entities: { platform: 'Instagram', person },
        requiresBrowser: true,
        requiresPerception: true,
        isCompound: true,
        suggestedTargetUrl: targetUrl,
        initialPlan: [
          {
            stepNumber: 1,
            description: 'Navigate to Instagram direct messages',
            toolName: 'browser.navigate',
            parameters: { url: targetUrl },
            expectedOutcome: 'Instagram inbox loaded',
            status: 'PENDING',
          },
          {
            stepNumber: 2,
            description: 'Verify login / authentication state',
            toolName: 'browser.observe',
            parameters: {},
            expectedOutcome: 'Inbox or login form visible',
            status: 'PENDING',
          },
          {
            stepNumber: 3,
            description: person ? `Locate and open chat thread with ${person}` : 'Inspect recent conversations',
            toolName: 'browser.click',
            parameters: { target: person || 'inbox' },
            expectedOutcome: 'Chat thread opened',
            status: 'PENDING',
          },
          {
            stepNumber: 4,
            description: 'Read latest direct message and report to user',
            toolName: 'browser.observe',
            parameters: {},
            expectedOutcome: 'Message extracted',
            status: 'PENDING',
          },
        ],
        subTasks: [
          'Navigate to Instagram',
          'Check authentication state',
          'Open direct messages inbox',
          person ? `Search or locate thread with ${person}` : 'Read newest unread message',
          'Read latest message and report to user',
        ],
        spokenAcknowledgment: person
          ? `Checking Instagram messages from ${person}.`
          : 'Checking your Instagram direct messages.',
        confidence: 0.85,
        isCoherent: true,
      };
    }

    // 2. Shopping Comparison (e.g. "compare Sony WH-1000XM5 across multiple websites")
    if (lower.includes('compare') || (lower.includes('across') && lower.includes('website'))) {
      const cleanItem = cleanText
        .replace(/^(?:hey\s+tesseract,?\s*)?(?:compare|find|research)\s+/i, '')
        .replace(/\s+across\s+(?:multiple\s+)?(?:websites|sites|the\s+web)$/i, '')
        .trim();

      const encodedItem = encodeURIComponent(cleanItem);
      return {
        rawUserText: rawText,
        goal: `Compare ${cleanItem} across multiple websites`,
        intentCategory: 'SHOPPING_COMPARISON',
        entities: { product: cleanItem },
        requiresBrowser: true,
        requiresPerception: true,
        isCompound: true,
        suggestedTargetUrl: `https://www.amazon.com/s?k=${encodedItem}`,
        initialPlan: [
          {
            stepNumber: 1,
            description: `Search Amazon for ${cleanItem}`,
            toolName: 'browser.navigate',
            parameters: { url: `https://www.amazon.com/s?k=${encodedItem}` },
            expectedOutcome: 'Amazon search results loaded',
            status: 'PENDING',
          },
          {
            stepNumber: 2,
            description: 'Extract Amazon prices, seller info, and availability',
            toolName: 'browser.observe',
            parameters: {},
            expectedOutcome: 'Amazon prices extracted',
            status: 'PENDING',
          },
          {
            stepNumber: 3,
            description: `Search Google Shopping for ${cleanItem}`,
            toolName: 'browser.navigate',
            parameters: { url: `https://www.google.com/search?tbm=shop&q=${encodedItem}` },
            expectedOutcome: 'Google Shopping results loaded',
            status: 'PENDING',
          },
          {
            stepNumber: 4,
            description: 'Extract Google Shopping prices and synthesize cross-site comparison',
            toolName: 'browser.synthesize',
            parameters: {},
            expectedOutcome: 'Cross-platform comparison synthesized',
            status: 'PENDING',
          },
        ],
        subTasks: [
          `Search Amazon for ${cleanItem}`,
          `Search Google Shopping for ${cleanItem}`,
          'Extract normalized prices, seller info, and availability',
          'Synthesize structured comparison report',
        ],
        spokenAcknowledgment: `Comparing ${cleanItem} across multiple websites.`,
        confidence: 0.85,
        isCoherent: true,
      };
    }

    // 3. Document Analysis (e.g. "analyze this PDF")
    if (lower.includes('pdf') || lower.includes('document') || activeUrl.endsWith('.pdf')) {
      return {
        rawUserText: rawText,
        goal: 'Analyze active PDF document',
        intentCategory: 'DOCUMENT_ANALYSIS',
        entities: { documentType: 'PDF' },
        requiresBrowser: true,
        requiresPerception: true,
        isCompound: false,
        initialPlan: [
          {
            stepNumber: 1,
            description: 'Extract structured text from PDF document',
            toolName: 'browser.extractPdfText',
            parameters: {},
            expectedOutcome: 'PDF text extracted',
            status: 'PENDING',
          },
          {
            stepNumber: 2,
            description: 'Synthesize document summary and findings',
            toolName: 'browser.synthesize',
            parameters: {},
            expectedOutcome: 'Document summary synthesized',
            status: 'PENDING',
          },
        ],
        subTasks: ['Extract text from PDF', 'Summarize key sections', 'Present findings'],
        spokenAcknowledgment: 'Analyzing this PDF document.',
        confidence: 0.9,
        isCoherent: true,
      };
    }

    // Coherence Gate: Validate utterance before allowing fallback general automation
    const hasActionableVerb = /\b(?:open|go|visit|navigate|search|find|lookup|check|read|see|click|press|type|enter|scroll|play|pause|stop|close|compare|buy|order|download|summarize|explain|tell|show|what|who|where|how|why|when)\b/i.test(lower);
    const isDanglingConjunction = /^(?:and|but|or|so|yet)\s+(?:you\s+)?/i.test(lower);
    const isOpenWithoutTarget = /\b(?:open|visit|navigate\s+to|go\s+to)\s+(?:and|or|then|into\s+that|a|the)?\s*$/i.test(lower) ||
                                /\b(?:open|visit|navigate\s+to|go\s+to)\s+(?:and|or|then)\s+/i.test(lower);
    const words = lower.replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 1);
    const hasSufficientContent = words.length >= 2;

    const isCoherent = hasActionableVerb && !isDanglingConjunction && !isOpenWithoutTarget && hasSufficientContent;

    if (!isCoherent) {
      console.warn(`[NaturalLanguageInterpreter] Coherence gate failed for utterance: "${cleanText}" (dangling=${isDanglingConjunction}, noTarget=${isOpenWithoutTarget}, words=${words.length})`);
      return {
        rawUserText: rawText,
        goal: cleanText,
        intentCategory: 'CONVERSATIONAL',
        entities: {},
        requiresBrowser: false,
        requiresPerception: false,
        isCompound: false,
        spokenAcknowledgment: "Sorry, I didn't catch that command. Could you please repeat?",
        confidence: 0.25,
        isCoherent: false,
        isUncertain: true,
      };
    }

    const suggestedTargetUrl = this.extractInitialDomainUrl(cleanText);

    // Default general automation (has action verb and coherent target, but fell back from LLM)
    return {
      rawUserText: rawText,
      goal: cleanText,
      intentCategory: 'GENERAL_AUTOMATION',
      entities: {},
      suggestedTargetUrl,
      requiresBrowser: true,
      requiresPerception: true,
      isCompound: cleanText.includes(' and ') || cleanText.includes(' then '),
      initialPlan: suggestedTargetUrl ? [
        {
          stepNumber: 1,
          description: `Navigate to ${suggestedTargetUrl}`,
          toolName: 'browser.navigate',
          parameters: { url: suggestedTargetUrl },
          expectedOutcome: 'Target page loaded',
          status: 'PENDING',
        },
        {
          stepNumber: 2,
          description: 'Observe active page content',
          toolName: 'browser.observe',
          parameters: {},
          expectedOutcome: 'Page state captured',
          status: 'PENDING',
        },
      ] : undefined,
      spokenAcknowledgment: `Working on: ${cleanText}`,
      confidence: 0.7,
      isCoherent: true,
      isUncertain: false,
    };
  }

  private cleanWakeAndPreambles(text: string): string {
    return text
      .replace(/^(?:hey|hi|hello|ok|okay)?\s*tesseract[,.]?\s*/i, '')
      .replace(/^(?:can\s+you\s+(?:please\s+)?(?:go\s+ahead\s+and\s+)?)/i, '')
      .replace(/^(?:could\s+you\s+(?:please\s+)?(?:go\s+ahead\s+and\s+)?)/i, '')
      .replace(/^(?:please\s+)/i, '')
      .replace(/[?.!]+$/g, '')
      .trim();
  }

  private fallbackCategory(text: string): IntentCategory {
    const lower = text.toLowerCase();
    if (lower.includes('compare') || lower.includes('buy') || lower.includes('price')) return 'SHOPPING_COMPARISON';
    if (lower.includes('research') || lower.includes('study') || lower.includes('find out')) return 'RESEARCH';
    if (lower.includes('message') || lower.includes('dm') || lower.includes('chat')) return 'SOCIAL_COMMUNICATION';
    if (lower.includes('pdf') || lower.includes('paper')) return 'DOCUMENT_ANALYSIS';
    if (lower.includes('play') || lower.includes('video') || lower.includes('song')) return 'MEDIA_CONTROL';
    if (/^(?:open|go\s+to|visit)\s+/i.test(lower)) return 'NAVIGATION';
    return 'GENERAL_AUTOMATION';
  }
}
