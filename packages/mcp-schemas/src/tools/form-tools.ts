import { TypedTool, ElementTarget } from '../../../core-types/dist/index.js';

export interface FormFieldInfo {
  id?: string;
  name?: string;
  label?: string;
  type: string;
  placeholder?: string;
  autocomplete?: string;
  isSensitive: boolean;
  selector: string;
  currentValue?: string;
}

export interface FormInspectResult {
  formCount: number;
  fields: FormFieldInfo[];
  hasSensitiveFields: boolean;
}

export interface FormFillFieldInput {
  target: ElementTarget;
  value: string;
  isSensitive?: boolean;
}

export interface FormFillInput {
  fields: FormFillFieldInput[];
  submitAfterFill?: boolean;
}

export interface FormFillResult {
  filledCount: number;
  skippedSensitiveCount: number;
  submitted: boolean;
  errors: string[];
}

export const inspectFormFieldsTool: TypedTool<{ tabId?: number }, FormInspectResult> = {
  name: 'inspect_form_fields',
  description: 'Inspect forms and interactive input fields on current page, classifying sensitive fields.',
  category: 'FORM_PREVIEW',
  inputSchema: {
    type: 'object',
    properties: {
      tabId: { type: 'number', description: 'Target browser tab ID' },
    },
  },
  execute: async () => {
    return {
      formCount: 1,
      fields: [
        { id: 'name', label: 'Full Name', type: 'text', isSensitive: false, selector: '#name' },
        { id: 'email', label: 'Email Address', type: 'email', isSensitive: false, selector: '#email' },
      ],
      hasSensitiveFields: false,
    };
  },
};

export const formFillTool: TypedTool<FormFillInput, FormFillResult> = {
  name: 'form_fill',
  description: 'Fill identified non-sensitive form fields using saved user profile information.',
  category: 'FORM_PREVIEW',
  inputSchema: {
    type: 'object',
    properties: {
      fields: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            target: { type: 'object' },
            value: { type: 'string' },
            isSensitive: { type: 'boolean' },
          },
          required: ['target', 'value'],
        },
      },
      submitAfterFill: { type: 'boolean' },
    },
    required: ['fields'],
  },
  execute: async (input) => {
    return {
      filledCount: input.fields.length,
      skippedSensitiveCount: 0,
      submitted: Boolean(input.submitAfterFill),
      errors: [],
    };
  },
};
