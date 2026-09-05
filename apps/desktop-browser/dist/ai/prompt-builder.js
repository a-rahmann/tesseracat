"use strict";
/**
 * Token-efficient Dynamic Prompt Builder for Gemma 3 4B.
 * Constructs compact prompts containing only essential task context, snapshot data, and tool schemas.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PromptBuilder = void 0;
class PromptBuilder {
    static buildSystemPrompt() {
        return `You are Tesseract, an autonomous local AI browser agent.
You operate web browsers by reasoning, issuing structured tool calls, and inspecting page feedback.
Principles:
1. Always base decisions on the actual observed page state. Never hallucinate elements.
2. If credentials or a password are required, prompt the user to input their password. NEVER attempt to guess or capture passwords.
3. For external communication (sending DMs, emails) or purchases, ALWAYS require user confirmation before transmitting.
4. Output must be valid JSON specifying the next tool to execute.`;
    }
    static buildObservationActionPrompt(ctx) {
        let prompt = `## ACTIVE MISSION\nGoal: "${ctx.goal}"\n`;
        if (ctx.currentUrl) {
            prompt += `Page: ${ctx.pageTitle || 'Untitled'} (${ctx.currentUrl})\n`;
        }
        if (ctx.lastAction) {
            prompt += `Previous Action: ${ctx.lastAction.tool}\n`;
            if (ctx.lastAction.result)
                prompt += `Result: ${ctx.lastAction.result.slice(0, 300)}\n`;
            if (ctx.lastAction.error)
                prompt += `Error: ${ctx.lastAction.error}\n`;
        }
        if (ctx.relevantMemory && ctx.relevantMemory.length > 0) {
            prompt += `\nRelevant Memory:\n- ${ctx.relevantMemory.slice(0, 3).join('\n- ')}\n`;
        }
        if (ctx.recentHistory && ctx.recentHistory.length > 0) {
            prompt += `\nRecent Conversation:\n`;
            for (const turn of ctx.recentHistory.slice(-4)) {
                prompt += `${turn.speaker}: ${turn.text}\n`;
            }
        }
        if (ctx.compactSnapshot) {
            prompt += `\nObserved Elements on Page:\n${ctx.compactSnapshot}\n`;
        }
        prompt += `\nSelect the single next tool call to make.
Respond with JSON matching:
{
  "thought": "Brief 1-sentence reasoning",
  "tool": "browser.actionName",
  "arguments": { ... },
  "isFinalStep": false
}`;
        return prompt;
    }
}
exports.PromptBuilder = PromptBuilder;
//# sourceMappingURL=prompt-builder.js.map