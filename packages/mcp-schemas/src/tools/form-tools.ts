import { TypedTool } from '../../../core-types/src/index.js';

export const inspectFormFieldsTool: TypedTool<{ tabId?: number }, { fields: Array<{ id: string; label: string; type: string }> }> = {
  name: 'inspect_form_fields',
  description: 'Find form fields on the current page and inspect their target types.',
  category: 'FORM_PREVIEW',
  inputSchema: {
    type: 'object',
    properties: {
      tabId: { type: 'number', description: 'Target browser tab ID.' },
    },
  },
  execute: async () => {
    return {
      fields: [
        { id: 'input-name', label: 'Full Name', type: 'text' },
        { id: 'input-email', label: 'Email Address', type: 'email' },
      ],
    };
  },
};
