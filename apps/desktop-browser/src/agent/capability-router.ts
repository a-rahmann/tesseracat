/**
 * Capability Router for Tesseract.
 *
 * Implements the 5-tier Tool Priority Hierarchy:
 * 1. Fast-Path Deterministic Execution (<2ms)
 * 2. Native Service API Connectors (Gmail, Calendar, Drive, YouTube)
 * 3. Structured LLM Tool Calling (Gemma 3 4B Orchestrator)
 * 4. Autonomous Browser Perception & Action Loop (Arbitrary Websites)
 * 5. Human Handoff (Auth, Payments, Captchas)
 */

import { ConnectorRegistry } from '../services/connectors/service-connector.js';
import { FastPathClassifier, FastPathMatch } from './fast-path.js';

export type RoutingTier =
  | 'FAST_PATH'
  | 'NATIVE_SERVICE_CONNECTOR'
  | 'STRUCTURED_TOOL_CALLING'
  | 'BROWSER_AGENT'
  | 'HUMAN_HANDOFF';

export interface RouteResolution {
  tier: RoutingTier;
  targetTool?: string;
  serviceId?: string;
  parameters?: Record<string, any>;
  fastPathMatch?: FastPathMatch;
  spokenResponse?: string;
  reason: string;
}

export class CapabilityRouter {
  private static instance: CapabilityRouter | null = null;
  private connectorRegistry = ConnectorRegistry.getInstance();

  private constructor() {}

  public static getInstance(): CapabilityRouter {
    if (!CapabilityRouter.instance) {
      CapabilityRouter.instance = new CapabilityRouter();
    }
    return CapabilityRouter.instance;
  }

  /**
   * Evaluates raw voice/text input and determines the optimal execution tier.
   */
  public route(input: string): RouteResolution {
    const raw = input || '';
    const clean = raw
      .toLowerCase()
      .replace(/^(?:hey|hi|hello|ok|okay)?\s*tesseract[,.]?\s*/i, '')
      .replace(/^(?:can\s+you\s+(?:please\s+)?(?:go\s+ahead\s+and\s+)?)/i, '')
      .replace(/^(?:could\s+you\s+(?:please\s+)?(?:go\s+ahead\s+and\s+)?)/i, '')
      .replace(/^(?:i\s+want\s+(?:you\s+)?to\s+|would\s+you\s+(?:please\s+)?|let\'?s\s+|just\s+)/i, '')
      .replace(/^(?:please\s+)/i, '')
      .replace(/[?.!,]/g, '')
      .trim();

    // ----------------------------------------------------
    // Tier 1: Fast-Path Deterministic Controls (<2ms)
    // ----------------------------------------------------
    const fastMatch = FastPathClassifier.classify(raw);
    if (fastMatch) {
      return {
        tier: 'FAST_PATH',
        fastPathMatch: fastMatch,
        reason: `Fast-path matched deterministic action: ${fastMatch.action}`,
      };
    }

    // ----------------------------------------------------
    // Tier 2: Native Service API Connectors
    // ----------------------------------------------------
    // Calendar queries
    if (/^(what('s|\s+is)\s+my\s+next\s+meeting|do\s+i\s+have\s+(any\s+)?meetings?\s+today|what('s|\s+is)\s+on\s+my\s+calendar|schedule\s+today|today('s)?\s+schedule)$/i.test(clean)) {
      return {
        tier: 'NATIVE_SERVICE_CONNECTOR',
        serviceId: 'google',
        targetTool: 'calendar.today',
        reason: 'Direct calendar schedule query matched native tool calendar.today',
      };
    }

    if (/^(what('s|\s+is)\s+my\s+schedule\s+this\s+week|upcoming\s+meetings?|upcoming\s+events?|what\s+meetings?\s+do\s+i\s+have)$/i.test(clean)) {
      return {
        tier: 'NATIVE_SERVICE_CONNECTOR',
        serviceId: 'google',
        targetTool: 'calendar.upcoming',
        parameters: { days: 7 },
        reason: 'Upcoming calendar query matched native tool calendar.upcoming',
      };
    }

    // Gmail queries
    if (
      /^(?:show|check|read|list|get|open)\s+(?:my\s+)?(?:recent\s+|unread\s+|new\s+)?emails?$/i.test(clean) ||
      /^(?:what\s+are\s+my\s+recent\s+emails|unread\s+emails?|check\s+inbox|open\s+inbox)$/i.test(clean)
    ) {
      return {
        tier: 'NATIVE_SERVICE_CONNECTOR',
        serviceId: 'google',
        targetTool: 'gmail.search',
        parameters: { query: 'is:unread', maxResults: 5 },
        reason: 'Email check query matched native tool gmail.search',
      };
    }

    const emailSearchMatch = clean.match(/^(?:search|find)\s+(?:my\s+)?(?:emails?|gmail)\s+(?:for\s+)?(.+)$/i);
    if (emailSearchMatch) {
      return {
        tier: 'NATIVE_SERVICE_CONNECTOR',
        serviceId: 'google',
        targetTool: 'gmail.search',
        parameters: { query: emailSearchMatch[1].trim(), maxResults: 5 },
        reason: 'Email search query matched native tool gmail.search',
      };
    }

    // Google Drive queries
    const driveSearchMatch = clean.match(
      /^(?:search|find)\s+(?:(?:my\s+)?(?:drive|google\s+drive|files?|documents?)\s+(?:for\s+)?|in\s+(?:my\s+)?(?:drive|google\s+drive)\s+for\s+)(.+)$/i
    );
    if (driveSearchMatch) {
      return {
        tier: 'NATIVE_SERVICE_CONNECTOR',
        serviceId: 'google',
        targetTool: 'drive.search',
        parameters: { query: driveSearchMatch[1].trim() },
        reason: 'Drive search query matched native tool drive.search',
      };
    }

    // YouTube playback & search (compound & single)
    // "Open YouTube and play a random video", "Play cats on YouTube", "Play a random video"
    const ytCompoundMatch = clean.match(/^(?:open\s+youtube(?:\s+music)?\s+(?:and|&)\s+(?:play|listen\s+to)\s+(.+))$/i);
    if (ytCompoundMatch) {
      const q = ytCompoundMatch[1].trim();
      const isRandom = /^(a\s+)?random\s+video$/i.test(q);
      return {
        tier: 'NATIVE_SERVICE_CONNECTOR',
        serviceId: 'google',
        targetTool: 'youtube.play',
        parameters: { query: isRandom ? undefined : q, isRandom },
        reason: 'Compound YouTube play matched native youtube.play tool flow',
      };
    }

    if (/^play\s+(a\s+)?random\s+video(\s+(?:on|from)\s+youtube)?$/i.test(clean)) {
      return {
        tier: 'NATIVE_SERVICE_CONNECTOR',
        serviceId: 'google',
        targetTool: 'youtube.play',
        parameters: { isRandom: true },
        reason: 'Random video request matched native youtube.play',
      };
    }

    const ytPlaySpecific = clean.match(/^play\s+(.+?)(?:\s+(?:on|from)\s+youtube)?$/i);
    if (ytPlaySpecific && !/^(the\s+)?(video|one|result)$/i.test(ytPlaySpecific[1])) {
      return {
        tier: 'NATIVE_SERVICE_CONNECTOR',
        serviceId: 'google',
        targetTool: 'youtube.play',
        parameters: { query: ytPlaySpecific[1].trim() },
        reason: 'Specific video request matched native youtube.play',
      };
    }

    // ----------------------------------------------------
    // Tier 4: Browser Agent (Arbitrary Web, Form filling, Shopping)
    // ----------------------------------------------------
    const isNavigation = /^(?:open|go\s+to|navigate\s+to|launch|visit)\s+(.+)$/i.test(clean);
    const isWebTask = /\b(buy|order|compare|scrape|extract|read|scroll|fill|submit|login|search)\b/i.test(clean);

    if (isNavigation || isWebTask) {
      return {
        tier: 'BROWSER_AGENT',
        reason: 'Arbitrary web task delegated to DOM perception and ActionLoop',
      };
    }

    // ----------------------------------------------------
    // Tier 3: Structured Tool Calling via Gemma Orchestrator
    // ----------------------------------------------------
    return {
      tier: 'STRUCTURED_TOOL_CALLING',
      reason: 'General or multi-step command requiring Gemma reasoning and tool orchestration',
    };
  }
}
