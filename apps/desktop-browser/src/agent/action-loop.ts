/**
 * Autonomous Action Loop: OBSERVE -> THINK -> ACTION -> OBSERVE.
 * With self-correction (max 3 retries), cancellation tokens, and safety policy approvals.
 */

import { AgentModel } from '../ai/model.js';
import { PromptBuilder, PromptContext } from '../ai/prompt-builder.js';
import { ToolRegistry, AgentTool } from './tool-registry.js';
import { BrowserPerception } from '../browser/browser-perception.js';
import { CancellationToken } from './cancellation.js';
import { ConversationManager } from '../memory/conversation-manager.js';

export interface ActionLoopCallbacks {
  onStatus: (status: string) => void;
  onStep: (stepNumber: number, description: string, status: 'ACTIVE' | 'SUCCESS' | 'FAILED') => void;
  onConfirmationRequired: (tool: AgentTool, args: any) => Promise<boolean>;
  onFinish: (summary: string) => void;
  onError: (error: string) => void;
}

export interface StepActionDecision {
  thought: string;
  tool: string;
  arguments: Record<string, any>;
  isFinalStep?: boolean;
}

export class ActionLoop {
  private model: AgentModel;
  private maxSteps = 10;
  private maxRetriesPerAction = 3;

  constructor(model: AgentModel, maxSteps = 10) {
    this.model = model;
    this.maxSteps = maxSteps;
  }

  public async run(
    goal: string,
    callbacks: ActionLoopCallbacks,
    token: CancellationToken
  ): Promise<{ success: boolean; summary: string }> {
    console.log(`[ActionLoop] Starting mission: "${goal}"`);
    callbacks.onStatus('Understanding goal...');

    const perception = BrowserPerception.getInstance();
    const toolRegistry = ToolRegistry.getInstance();
    const convManager = ConversationManager.getInstance();

    let stepNumber = 1;
    let lastActionInfo: { tool: string; result?: string; error?: string } | undefined;
    let currentRetries = 0;

    while (stepNumber <= this.maxSteps) {
      token.throwIfCancelled();

      // 1. OBSERVE: capture fresh snapshot
      callbacks.onStatus('Observing page...');
      const snapshot = await perception.getSnapshot();
      const compactElements = await perception.getCompactElementSummary();

      // 2. THINK: query model for next structured tool action
      callbacks.onStatus('Planning next step...');
      callbacks.onStep(stepNumber, `Reasoning step ${stepNumber}`, 'ACTIVE');

      const promptContext: PromptContext = {
        goal,
        currentUrl: snapshot.url,
        pageTitle: snapshot.title,
        compactSnapshot: compactElements,
        recentHistory: convManager.getRecentTurns(4).map(t => ({ speaker: t.speaker, text: t.text })),
        lastAction: lastActionInfo,
      };

      const prompt = PromptBuilder.buildObservationActionPrompt(promptContext);

      let decision: StepActionDecision;
      try {
        decision = await this.model.structuredOutput<StepActionDecision>(
          prompt,
          `{
  "thought": string,
  "tool": string,
  "arguments": object,
  "isFinalStep": boolean
}`,
          { systemPrompt: PromptBuilder.buildSystemPrompt(), temperature: 0.1 }
        );
      } catch (err: any) {
        console.error('[ActionLoop] Model reasoning failed:', err);
        currentRetries++;
        if (currentRetries >= this.maxRetriesPerAction) {
          const errStr = `Could not decide next action after ${currentRetries} attempts.`;
          callbacks.onError(errStr);
          return { success: false, summary: errStr };
        }
        await new Promise(r => setTimeout(r, 600));
        continue;
      }

      token.throwIfCancelled();

      console.log(`[ActionLoop] Step ${stepNumber} Decision:`, decision);
      if (decision.thought) {
        callbacks.onStatus(decision.thought);
      }

      // Check if finished
      if (decision.isFinalStep || decision.tool === 'task.finish') {
        callbacks.onStep(stepNumber, decision.thought || 'Goal accomplished', 'SUCCESS');
        const summary = decision.thought || 'Mission completed successfully.';
        callbacks.onFinish(summary);
        return { success: true, summary };
      }

      // 3. POLICY CHECK & EXECUTE ACTION
      const tool = toolRegistry.getTool(decision.tool);
      if (!tool) {
        lastActionInfo = { tool: decision.tool, error: `Unknown tool: ${decision.tool}` };
        currentRetries++;
        if (currentRetries >= this.maxRetriesPerAction) {
          callbacks.onError(`Unknown tool: ${decision.tool}`);
          return { success: false, summary: `Failed on unknown tool: ${decision.tool}` };
        }
        continue;
      }

      // If action requires explicit confirmation (external communications or purchases)
      if (tool.category === 'EXTERNAL_COMMUNICATION' || tool.category === 'PURCHASE') {
        callbacks.onStatus(`Approval required for: ${tool.name}`);
        const approved = await callbacks.onConfirmationRequired(tool, decision.arguments);
        if (!approved) {
          lastActionInfo = { tool: decision.tool, error: 'User denied permission for this action' };
          callbacks.onStep(stepNumber, 'Action denied by user', 'FAILED');
          callbacks.onFinish('Action cancelled per user request.');
          return { success: false, summary: 'Action denied by user' };
        }
      }

      token.throwIfCancelled();

      // Execute tool
      try {
        callbacks.onStatus(`Executing ${tool.name}...`);
        const result = await tool.execute(decision.arguments, token);
        callbacks.onStep(stepNumber, `${tool.name} succeeded`, 'SUCCESS');
        lastActionInfo = {
          tool: decision.tool,
          result: typeof result === 'object' ? JSON.stringify(result) : String(result),
        };
        currentRetries = 0; // Reset retry counter upon success
      } catch (err: any) {
        console.error(`[ActionLoop] Tool ${tool.name} failed:`, err);
        callbacks.onStep(stepNumber, `${tool.name} failed: ${err.message}`, 'FAILED');
        lastActionInfo = { tool: decision.tool, error: err.message };
        currentRetries++;

        if (currentRetries >= this.maxRetriesPerAction) {
          const errStr = `Action ${tool.name} failed 3 times: ${err.message}`;
          callbacks.onError(errStr);
          return { success: false, summary: errStr };
        }
      }

      stepNumber++;
      // Brief pause between steps for DOM stabilization
      await new Promise(r => setTimeout(r, 400));
    }

    callbacks.onFinish('Task reached maximum execution steps.');
    return { success: true, summary: 'Task completed limit of steps.' };
  }
}
