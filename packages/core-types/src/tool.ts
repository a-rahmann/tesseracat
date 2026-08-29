import { ActionCategory } from './policy.js';

export interface JSONSchemaProperty {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description?: string;
  enum?: string[];
  items?: JSONSchemaProperty;
}

export interface JSONSchema {
  type: 'object';
  properties: Record<string, JSONSchemaProperty>;
  required?: string[];
}

export interface TypedTool<TInput = Record<string, unknown>, TOutput = unknown> {
  name: string;
  description: string;
  category: ActionCategory;
  inputSchema: JSONSchema;
  outputSchema?: JSONSchema;
  execute: (input: TInput, context: { profileId: string; tabId?: number }) => Promise<TOutput>;
}

export interface ToolExecutionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  executionTimeMs: number;
}
