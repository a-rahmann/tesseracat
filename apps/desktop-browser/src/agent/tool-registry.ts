/**
 * ToolRegistry: Central repository for all autonomous browser tools with safety categorization.
 */

import { BrowserAutomator } from '../browser/browser-automator.js';
import { BrowserPerception } from '../browser/browser-perception.js';
import { YouTubeAdapter } from '../adapters/youtube.js';
import { InstagramAdapter } from '../adapters/instagram.js';
import { MemoryRetriever } from '../memory/memory-retriever.js';
import { CancellationToken } from './cancellation.js';

export type ActionSafetyCategory =
  | 'READ'
  | 'LOW_RISK_ACTION'
  | 'EXTERNAL_COMMUNICATION'
  | 'PURCHASE'
  | 'CREDENTIAL'
  | 'DESTRUCTIVE';

export interface AgentTool {
  name: string;
  category: ActionSafetyCategory;
  description: string;
  parameters: string;
  execute: (args: any, token?: CancellationToken) => Promise<any>;
}

export class ToolRegistry {
  private static instance: ToolRegistry | null = null;
  private tools: Map<string, AgentTool> = new Map();

  private constructor() {
    this.registerDefaultTools();
  }

  public static getInstance(): ToolRegistry {
    if (!ToolRegistry.instance) {
      ToolRegistry.instance = new ToolRegistry();
    }
    return ToolRegistry.instance;
  }

  public getTool(name: string): AgentTool | undefined {
    if (!name) return undefined;
    const direct = this.tools.get(name);
    if (direct) return direct;

    const lower = name.toLowerCase().replace(/^(browser|tool)[\._]/, '');
    if (lower === 'navigate' || lower === 'open' || lower === 'chrome' || lower === 'load_url') {
      return this.tools.get('browser.navigate');
    }
    if (lower === 'click') return this.tools.get('browser.click');
    if (lower === 'type' || lower === 'input') return this.tools.get('browser.type');
    if (lower === 'scroll') return this.tools.get('browser.scroll');
    if (lower === 'wait' || lower === 'sleep') return this.tools.get('browser.wait');

    return undefined;
  }

  public listTools(): AgentTool[] {
    return Array.from(this.tools.values());
  }

  public registerTool(tool: AgentTool): void {
    this.tools.set(tool.name, tool);
  }

  private registerDefaultTools(): void {
    const automator = BrowserAutomator.getInstance();
    const perception = BrowserPerception.getInstance();

    // 1. Navigation & Basic Controls
    this.registerTool({
      name: 'browser.navigate',
      category: 'LOW_RISK_ACTION',
      description: 'Navigate to a target URL',
      parameters: '{"url": "string"}',
      execute: async (args) => automator.navigate(args.url),
    });

    this.registerTool({
      name: 'browser.click',
      category: 'LOW_RISK_ACTION',
      description: 'Click an element by its temporary ID (e.g. e1) or CSS selector',
      parameters: '{"elementId"?: "string", "selector"?: "string"}',
      execute: async (args) => automator.click(args),
    });

    this.registerTool({
      name: 'browser.type',
      category: 'LOW_RISK_ACTION',
      description: 'Type text into an input or textbox element',
      parameters: '{"elementId"?: "string", "selector"?: "string", "text": "string", "pressEnter"?: boolean}',
      execute: async (args) => automator.type(args),
    });

    this.registerTool({
      name: 'browser.scroll',
      category: 'LOW_RISK_ACTION',
      description: 'Scroll the active page up, down, top, or bottom',
      parameters: '{"direction": "up"|"down"|"top"|"bottom", "amount"?: number}',
      execute: async (args) => automator.scroll(args.direction, args.amount),
    });

    this.registerTool({
      name: 'browser.wait',
      category: 'READ',
      description: 'Wait for a specified number of milliseconds',
      parameters: '{"ms": number}',
      execute: async (args) => automator.wait(args.ms || 1000),
    });

    // 2. Perception & Observation
    this.registerTool({
      name: 'browser.snapshot',
      category: 'READ',
      description: 'Get a fresh accessibility snapshot of interactive elements on the page',
      parameters: '{}',
      execute: async () => perception.getSnapshot(),
    });

    this.registerTool({
      name: 'browser.screenshot',
      category: 'READ',
      description: 'Capture screenshot data URL of active page',
      parameters: '{}',
      execute: async () => perception.captureScreenshot(),
    });

    this.registerTool({
      name: 'browser.observeVideo',
      category: 'READ',
      description: 'Inspect active video player metadata, title, channel, and captions',
      parameters: '{}',
      execute: async () => YouTubeAdapter.getCurrentVideo(),
    });

    // 3. YouTube Domain Tools
    this.registerTool({
      name: 'youtube.search',
      category: 'LOW_RISK_ACTION',
      description: 'Search YouTube for videos',
      parameters: '{"query": "string"}',
      execute: async (args) => YouTubeAdapter.search(args.query),
    });

    this.registerTool({
      name: 'youtube.playResult',
      category: 'LOW_RISK_ACTION',
      description: 'Play a search result video by its 1-based index (e.g. 1, 2, 3)',
      parameters: '{"index": number}',
      execute: async (args) => YouTubeAdapter.playResult(args.index),
    });

    // 4. Instagram Domain Tools
    this.registerTool({
      name: 'instagram.getMessages',
      category: 'READ',
      description: 'Inspect Direct Message inbox and list recent conversations',
      parameters: '{}',
      execute: async () => InstagramAdapter.getMessageThreads(),
    });

    this.registerTool({
      name: 'instagram.openThread',
      category: 'READ',
      description: 'Open a specific DM thread by its 1-based index',
      parameters: '{"index": number}',
      execute: async (args) => InstagramAdapter.openThreadByIndex(args.index),
    });

    this.registerTool({
      name: 'instagram.readMessage',
      category: 'READ',
      description: 'Read the newest message in the active DM conversation',
      parameters: '{}',
      execute: async () => InstagramAdapter.readActiveConversation(),
    });

    this.registerTool({
      name: 'instagram.draftReply',
      category: 'LOW_RISK_ACTION',
      description: 'Draft a direct message reply into the message field without sending',
      parameters: '{"text": "string"}',
      execute: async (args) => InstagramAdapter.draftReply(args.text),
    });

    this.registerTool({
      name: 'instagram.sendReply',
      category: 'EXTERNAL_COMMUNICATION',
      description: 'Transmit the message reply (STRICT: Requires explicit user approval)',
      parameters: '{"text": "string"}',
      execute: async (args) => InstagramAdapter.sendReply(args.text),
    });

    // 5. Memory Search
    this.registerTool({
      name: 'memory.search',
      category: 'READ',
      description: 'Search conversational history by topic query or minutes ago',
      parameters: '{"query"?: "string", "minutesAgo"?: number}',
      execute: async (args) => MemoryRetriever.search(args),
    });
  }
}
