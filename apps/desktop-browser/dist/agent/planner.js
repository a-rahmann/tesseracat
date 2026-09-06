"use strict";
/**
 * Dynamic Mission Planner for Tesseract.
 * Generates grounded execution plans using local Gemma 3 4B.
 * Adapts to live browser observations, handles re-planning on failure, and avoids hallucinating selectors.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Planner = void 0;
const ollama_gemma_js_1 = require("../ai/ollama-gemma.js");
class Planner {
    static instance = null;
    model;
    constructor(model) {
        this.model = model || new ollama_gemma_js_1.OllamaGemmaModel('gemma3:4b');
    }
    static getInstance() {
        if (!Planner.instance) {
            Planner.instance = new Planner();
        }
        return Planner.instance;
    }
    /**
     * Generates a multi-step execution plan for an AgentGoal.
     */
    async plan(goal, context) {
        const planId = `plan_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        // High-performance optimization: If single-pass NLU or semantic template already provided an initialPlan, reuse it!
        // This reduces planning latency from ~20s to <1ms on dual-core CPU!
        if (goal.initialPlan && goal.initialPlan.length > 0) {
            console.log(`[Planner] Reusing initialPlan from single-pass NLU (${goal.initialPlan.length} steps) - 0ms secondary planning latency!`);
            return {
                id: planId,
                goal: goal.goal,
                steps: goal.initialPlan.map((s, idx) => ({
                    stepNumber: s.stepNumber || idx + 1,
                    description: s.description || `Step ${idx + 1}`,
                    toolName: s.toolName || 'browser.observe',
                    parameters: s.parameters || {},
                    expectedOutcome: s.expectedOutcome,
                    requiresHumanReview: Boolean(s.requiresHumanReview),
                    status: 'PENDING',
                })),
                currentStepIndex: 0,
                createdAt: Date.now(),
            };
        }
        // If goal already has pre-decomposed subtasks, use them to ground the plan
        const subtaskContext = goal.subTasks && goal.subTasks.length > 0
            ? `Goal Subtasks Identified by NLU:\n${goal.subTasks.map((st, i) => `${i + 1}. ${st}`).join('\n')}`
            : '';
        const prompt = `You are Tesseract's Autonomous Browser Mission Planner.
Break down the user's objective into 2 to 6 concrete, sequential browser steps.

User Objective: "${goal.goal}"
Intent Category: ${goal.intentCategory}
Entities: ${JSON.stringify(goal.entities)}
Current Browser URL: "${context.currentUrl}"
Current Page Title: "${context.pageTitle}"
${subtaskContext}

Available Tools:
${context.availableTools.join(', ')}

Guidelines:
1. Ground your steps in the actual browser state. If already on the target domain, do not unnecessarily re-navigate.
2. If authentication or login might be needed (e.g. Instagram DMs, email), plan an authentication check step.
3. For multi-site comparison, plan to search site A, collect data, search site B, collect data, and synthesize.
4. Prefer high-level semantic tools (e.g. "instagram.getMessages", "youtube.search") when targeting supported platforms.
5. Keep steps granular and verifiable.

Output strictly valid JSON matching this schema:
[
  {
    "stepNumber": 1,
    "description": "Navigate to Instagram direct inbox",
    "toolName": "browser.navigate",
    "parameters": { "url": "https://www.instagram.com/direct/inbox/" },
    "expectedOutcome": "Direct inbox or login screen loaded",
    "requiresHumanReview": false
  }
]`;
        try {
            const steps = await this.model.structuredOutput(prompt, 'Array<PlanStep>', { temperature: 0.1, maxTokens: 250 });
            const normalizedSteps = (steps || []).map((s, idx) => ({
                stepNumber: s.stepNumber || idx + 1,
                description: s.description || `Step ${idx + 1}`,
                toolName: s.toolName || 'browser.observe',
                parameters: s.parameters || {},
                expectedOutcome: s.expectedOutcome,
                requiresHumanReview: Boolean(s.requiresHumanReview),
                status: 'PENDING',
            }));
            return {
                id: planId,
                goal: goal.goal,
                steps: normalizedSteps.length > 0 ? normalizedSteps : this.createFallbackPlan(goal, context),
                currentStepIndex: 0,
                createdAt: Date.now(),
            };
        }
        catch (err) {
            console.warn('[Planner] Model structured output planning failed, using deterministic template:', {
                name: err?.name,
                message: err?.message,
                stack: err?.stack,
                cause: err?.cause,
            });
            return {
                id: planId,
                goal: goal.goal,
                steps: this.createFallbackPlan(goal, context),
                currentStepIndex: 0,
                createdAt: Date.now(),
            };
        }
    }
    /**
     * Generates a revised plan when an action fails or the DOM changes unexpectedly.
     */
    async replan(goal, failedStep, failureReason, context) {
        const prompt = `A step in our autonomous browser plan failed. Generate 1 to 3 alternative recovery steps to accomplish the goal.

Overall Goal: "${goal}"
Failed Step: ${failedStep.stepNumber}. "${failedStep.description}" (Tool: ${failedStep.toolName})
Failure Reason: "${failureReason}"
Active URL: "${context.currentUrl}"
Active Page Elements Summary:
${context.compactSnapshot || 'None'}

Available Tools:
${context.availableTools.join(', ')}

Output strictly valid JSON array of recovery PlanStep objects.`;
        try {
            const newSteps = await this.model.structuredOutput(prompt, 'Array<PlanStep>', { temperature: 0.2, maxTokens: 500 });
            return newSteps.map((s, idx) => ({
                stepNumber: failedStep.stepNumber + idx,
                description: s.description,
                toolName: s.toolName || 'browser.observe',
                parameters: s.parameters || {},
                expectedOutcome: s.expectedOutcome,
                requiresHumanReview: Boolean(s.requiresHumanReview),
                status: 'PENDING',
            }));
        }
        catch (err) {
            console.warn('[Planner] Model replan error:', {
                name: err?.name,
                message: err?.message,
                stack: err?.stack,
                cause: err?.cause,
            });
            return [
                {
                    stepNumber: failedStep.stepNumber,
                    description: 'Re-observe page and locate alternative interactive element',
                    toolName: 'browser.observe',
                    parameters: {},
                    status: 'PENDING',
                },
            ];
        }
    }
    /**
     * Deterministic template planner for core known scenarios when offline or LLM fails.
     */
    createFallbackPlan(goal, context) {
        // 1. Social Messaging / Instagram
        if (goal.intentCategory === 'SOCIAL_COMMUNICATION' || goal.entities?.platform === 'Instagram') {
            const person = goal.entities?.person;
            return [
                {
                    stepNumber: 1,
                    description: 'Open Instagram direct inbox',
                    toolName: 'browser.navigate',
                    parameters: { url: 'https://www.instagram.com/direct/inbox/' },
                    expectedOutcome: 'Direct message inbox loaded',
                    status: 'PENDING',
                },
                {
                    stepNumber: 2,
                    description: 'Check whether login is required',
                    toolName: 'browser.observe',
                    parameters: {},
                    expectedOutcome: 'Detect authenticated state or login form',
                    status: 'PENDING',
                },
                {
                    stepNumber: 3,
                    description: person ? `Locate conversation thread with ${person}` : 'Inspect message threads',
                    toolName: 'instagram.getMessages',
                    parameters: {},
                    expectedOutcome: 'Message thread located',
                    status: 'PENDING',
                },
                {
                    stepNumber: 4,
                    description: 'Read the newest message in conversation',
                    toolName: 'instagram.readMessage',
                    parameters: {},
                    expectedOutcome: 'Extracted message text',
                    status: 'PENDING',
                },
            ];
        }
        // 2. Shopping Comparison
        if (goal.intentCategory === 'SHOPPING_COMPARISON') {
            const product = goal.entities?.product || 'product';
            return [
                {
                    stepNumber: 1,
                    description: `Search Amazon for ${product}`,
                    toolName: 'browser.navigate',
                    parameters: { url: `https://www.amazon.in/s?k=${encodeURIComponent(product)}` },
                    expectedOutcome: 'Amazon search results loaded',
                    status: 'PENDING',
                },
                {
                    stepNumber: 2,
                    description: 'Extract top product pricing and ratings',
                    toolName: 'browser.observe',
                    parameters: {},
                    expectedOutcome: 'Extracted product cards',
                    status: 'PENDING',
                },
            ];
        }
        // 3. Document Analysis / PDF
        if (goal.intentCategory === 'DOCUMENT_ANALYSIS') {
            return [
                {
                    stepNumber: 1,
                    description: 'Extract text contents from active PDF document',
                    toolName: 'document.read_pdf',
                    parameters: { url: context.currentUrl },
                    expectedOutcome: 'Structured text segments extracted',
                    status: 'PENDING',
                },
                {
                    stepNumber: 2,
                    description: 'Analyze content and synthesize summary',
                    toolName: 'document.extract_text',
                    parameters: { query: 'summary' },
                    expectedOutcome: 'Document analysis synthesized',
                    status: 'PENDING',
                },
            ];
        }
        // Default 2-step plan
        return [
            {
                stepNumber: 1,
                description: `Observe active page for "${goal.goal}"`,
                toolName: 'browser.observe',
                parameters: {},
                status: 'PENDING',
            },
            {
                stepNumber: 2,
                description: `Execute action towards "${goal.goal}"`,
                toolName: 'browser.click',
                parameters: {},
                status: 'PENDING',
            },
        ];
    }
}
exports.Planner = Planner;
//# sourceMappingURL=planner.js.map