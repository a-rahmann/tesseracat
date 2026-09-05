"use strict";
/**
 * Planner: Generates high-level mission plans using Local Gemma 3 4B.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Planner = void 0;
class Planner {
    model;
    constructor(model) {
        this.model = model;
    }
    async plan(goal) {
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
        return this.model.structuredOutput(prompt, 'Array<{ stepNumber: number, description: string, toolName: string, parameters: object }>', { temperature: 0.1 });
    }
}
exports.Planner = Planner;
//# sourceMappingURL=planner.js.map