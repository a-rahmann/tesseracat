import { TypedTool, ElementTarget, PageObservation, VerificationResult } from '../../../core-types/dist/index.js';

export interface NavigateInput {
  url: string;
  timeoutMs?: number;
}

export interface ClickInput {
  target: ElementTarget;
  doubleClick?: boolean;
  button?: 'left' | 'right';
  timeoutMs?: number;
}

export interface TypeInput {
  target: ElementTarget;
  text: string;
  clearFirst?: boolean;
  pressEnter?: boolean;
  timeoutMs?: number;
}

export interface KeypressInput {
  key: string;
  modifiers?: ('Control' | 'Shift' | 'Alt' | 'Meta')[];
}

export interface ScrollInput {
  direction?: 'up' | 'down' | 'top' | 'bottom';
  amount?: number;
  target?: ElementTarget;
}

export interface FocusInput {
  target: ElementTarget;
}

export interface ReadPageInput {
  extractA11yTree?: boolean;
  maxElements?: number;
}

export interface WaitInput {
  condition?: 'time' | 'element' | 'navigation';
  ms?: number;
  target?: ElementTarget;
}

export interface ScreenshotInput {
  fullPage?: boolean;
}

export interface BrowserActionResult {
  success: boolean;
  action: string;
  targetDescription?: string;
  error?: string;
  observation?: PageObservation;
  verification?: VerificationResult;
  data?: unknown;
}

export const browserNavigateTool: TypedTool<NavigateInput, BrowserActionResult> = {
  name: 'browser_navigate',
  description: 'Navigate the active browser tab to a specified destination URL.',
  category: 'TAB_NAVIGATION',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Target destination URL' },
      timeoutMs: { type: 'number', description: 'Navigation timeout in ms' },
    },
    required: ['url'],
  },
  execute: async (input) => {
    return { success: true, action: 'navigate', data: { url: input.url } };
  },
};

export const browserClickTool: TypedTool<ClickInput, BrowserActionResult> = {
  name: 'browser_click',
  description: 'Click an element identified by role, name, text, selector, or coordinates.',
  category: 'INTERACT_DOM',
  inputSchema: {
    type: 'object',
    properties: {
      target: {
        type: 'object',
        properties: {
          selector: { type: 'string' },
          role: { type: 'string' },
          name: { type: 'string' },
          text: { type: 'string' },
          point: {
            type: 'object',
            properties: { x: { type: 'number' }, y: { type: 'number' } },
          },
        },
      },
      doubleClick: { type: 'boolean' },
      button: { type: 'string', enum: ['left', 'right'] },
    },
    required: ['target'],
  },
  execute: async (input) => {
    return { success: true, action: 'click', targetDescription: JSON.stringify(input.target) };
  },
};

export const browserTypeTool: TypedTool<TypeInput, BrowserActionResult> = {
  name: 'browser_type',
  description: 'Type text into a focused or targeted input field/textarea, optionally pressing Enter.',
  category: 'INTERACT_DOM',
  inputSchema: {
    type: 'object',
    properties: {
      target: {
        type: 'object',
        properties: {
          selector: { type: 'string' },
          role: { type: 'string' },
          name: { type: 'string' },
          text: { type: 'string' },
        },
      },
      text: { type: 'string' },
      clearFirst: { type: 'boolean' },
      pressEnter: { type: 'boolean' },
    },
    required: ['target', 'text'],
  },
  execute: async (input) => {
    return { success: true, action: 'type', targetDescription: JSON.stringify(input.target) };
  },
};

export const browserKeypressTool: TypedTool<KeypressInput, BrowserActionResult> = {
  name: 'browser_keypress',
  description: 'Dispatch a keypress event such as Enter, Escape, ArrowDown, Tab.',
  category: 'INTERACT_DOM',
  inputSchema: {
    type: 'object',
    properties: {
      key: { type: 'string' },
      modifiers: { type: 'array', items: { type: 'string' } },
    },
    required: ['key'],
  },
  execute: async (input) => {
    return { success: true, action: 'keypress', data: { key: input.key } };
  },
};

export const browserScrollTool: TypedTool<ScrollInput, BrowserActionResult> = {
  name: 'browser_scroll',
  description: 'Scroll the active webpage or a scrollable element up, down, or into view.',
  category: 'TAB_NAVIGATION',
  inputSchema: {
    type: 'object',
    properties: {
      direction: { type: 'string', enum: ['up', 'down', 'top', 'bottom'] },
      amount: { type: 'number' },
      target: { type: 'object' },
    },
  },
  execute: async (input) => {
    return { success: true, action: 'scroll', data: { direction: input.direction || 'down' } };
  },
};

export const browserReadPageTool: TypedTool<ReadPageInput, BrowserActionResult> = {
  name: 'browser_read_page',
  description: 'Read the current page state, URL, title, interactive elements, and visible text.',
  category: 'READ_PAGE',
  inputSchema: {
    type: 'object',
    properties: {
      extractA11yTree: { type: 'boolean' },
      maxElements: { type: 'number' },
    },
  },
  execute: async () => {
    return { success: true, action: 'read_page' };
  },
};

export const browserWaitTool: TypedTool<WaitInput, BrowserActionResult> = {
  name: 'browser_wait',
  description: 'Wait for a specified duration, element appearance, or navigation completion.',
  category: 'READ_PAGE',
  inputSchema: {
    type: 'object',
    properties: {
      condition: { type: 'string', enum: ['time', 'element', 'navigation'] },
      ms: { type: 'number' },
      target: { type: 'object' },
    },
  },
  execute: async (input) => {
    return { success: true, action: 'wait', data: { ms: input.ms || 1000 } };
  },
};
