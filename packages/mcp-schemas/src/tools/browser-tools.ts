import { TypedTool } from '../../../core-types/src/index.js';

export const readPageContentTool: TypedTool<{ tabId?: number }, { url: string; title: string; textContent: string }> = {
  name: 'read_page_content',
  description: 'Read the active tab visible text, headings, and structured text elements.',
  category: 'READ_PAGE',
  inputSchema: {
    type: 'object',
    properties: {
      tabId: { type: 'number', description: 'Target browser tab ID. Defaults to active tab.' },
    },
  },
  execute: async (input) => {
    return {
      url: 'https://example.com/product-specs',
      title: 'Product Specifications',
      textContent: 'High-performance developer laptop with 32GB RAM and 1TB NVMe SSD.',
    };
  },
};

export const inspectA11yTreeTool: TypedTool<{ tabId?: number }, { accessibilityTree: string }> = {
  name: 'inspect_a11y_tree',
  description: 'Inspect the structured accessibility tree of the current page for reliable UI interactions.',
  category: 'READ_PAGE',
  inputSchema: {
    type: 'object',
    properties: {
      tabId: { type: 'number', description: 'Target browser tab ID.' },
    },
  },
  execute: async () => {
    return {
      accessibilityTree: '[role=main] -> [role=button name="Buy Now"]',
    };
  },
};
