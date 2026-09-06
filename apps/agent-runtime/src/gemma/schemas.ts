import { z } from 'zod';

/**
 * 1. Intent Classification Schemas
 */
export const IntentTypeEnum = z.enum([
  'general_qa',
  'explain_current_page',
  'summarize_page',
  'explain_selected_text',
  'research_compare',
  'browser_navigation',
  'file_task',
  'form_task',
  'communication_task',
  'calendar_query',
  'media_control',
  'unknown',
]);

export type IntentType = z.infer<typeof IntentTypeEnum>;

export const IntentSchema = z.object({
  intent: IntentTypeEnum,
  confidence: z.number().min(0).max(1),
  target: z.string().optional().default(''),
  parameters: z.record(z.string(), z.unknown()).optional().default({}),
  reasoning: z.string().optional().default(''),
});

export type IntentClassification = z.infer<typeof IntentSchema>;

/**
 * 2. Task Planning Schemas (Read-only & Navigation Tools ONLY)
 */
export const AllowedReadOnlyToolEnum = z.enum([
  'browser_navigate',
  'web_search',
  'read_page_content',
  'privacy_scan',
  'user_context_analyze',
]);

export type AllowedReadOnlyTool = z.infer<typeof AllowedReadOnlyToolEnum>;

export const ProhibitedToolKeywords = [
  'form_submit',
  'submit',
  'upload',
  'send',
  'delete',
  'payment',
  'pay',
  'file_write',
  'file_delete',
  'execute_script',
  'shell',
  'terminal',
] as const;

export const TaskPlanStepSchema = z.object({
  stepNumber: z.number().int().positive(),
  description: z.string().min(1),
  toolName: AllowedReadOnlyToolEnum,
  toolParameters: z.record(z.string(), z.unknown()).default({}),
});

export type TaskPlanStep = z.infer<typeof TaskPlanStepSchema>;

export const TaskPlanSchema = z.object({
  goal: z.string().min(1),
  reasoning: z.string().default(''),
  steps: z.array(TaskPlanStepSchema),
  isReadOnly: z.literal(true).default(true),
  safeAlternatives: z.array(z.string()).optional().default([]),
});

export type TaskPlan = z.infer<typeof TaskPlanSchema>;

/**
 * 3. Response Generation Schemas
 */
export const ResponseSchema = z.object({
  answer: z.string().min(1),
  confidence: z.number().min(0).max(1),
  sources: z.array(z.string()).default([]),
  uncertainty: z.string().optional(),
  nextSuggestions: z.array(z.string()).default([]),
  safeAlternatives: z.array(z.string()).optional(),
});

export type GeneratedResponse = z.infer<typeof ResponseSchema>;

/**
 * 4. Ollama Provider & Health Schemas
 */
export const OllamaHealthStatusEnum = z.enum([
  'AVAILABLE',
  'UNAVAILABLE',
  'MODEL_MISSING',
  'ERROR',
]);

export type OllamaHealthStatus = z.infer<typeof OllamaHealthStatusEnum>;

export const OllamaModelDetailSchema = z.object({
  name: z.string(),
  model: z.string().optional(),
  modified_at: z.string().optional(),
  size: z.number().optional(),
  digest: z.string().optional(),
  details: z
    .object({
      family: z.string().optional(),
      parameter_size: z.string().optional(),
      quantization_level: z.string().optional(),
    })
    .optional(),
});

export const OllamaTagsResponseSchema = z.object({
  models: z.array(OllamaModelDetailSchema).default([]),
});

export const HealthCheckResultSchema = z.object({
  status: OllamaHealthStatusEnum,
  endpoint: z.string(),
  modelName: z.string().optional(),
  availableModels: z.array(z.string()).default([]),
  latencyMs: z.number().default(0),
  error: z.string().optional(),
});

export type HealthCheckResult = z.infer<typeof HealthCheckResultSchema>;
