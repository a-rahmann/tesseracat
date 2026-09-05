/**
 * Planner: Generates high-level mission plans using Local Gemma 3 4B.
 */

import { AgentModel } from '../ai/model.js';

export interface PlanStep {
  stepNumber: number;
  description: string;
  toolName: string;
  parameters: Record<string, any>;
}

export class Planner {
  private model: AgentModel;

  constructor(model: AgentModel) {
    this.model = model;
  }

  public async plan(goal: string): Promise<PlanStep[]> {
    const prompt = `Break down the user browser mission: "${goal}" into 2-4 ordered execution steps.
Output MUST be a JSON array of objects with fields:
- stepNumber (number)
- description (string)
- toolName (string)
- parameters (object)

Example:
[
  { "stepNumber": 1, "description": "Navigate to Instagram", "toolName": "browser.navigate", "parameters": { "url": "https://instagram.com" } }
]`;

    return this.model.structuredOutput<PlanStep[]>(
      prompt,
      'Array<{ stepNumber: number, description: string, toolName: string, parameters: object }>',
      { temperature: 0.1 }
    );
  }
}
