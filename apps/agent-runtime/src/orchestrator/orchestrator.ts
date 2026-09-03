import {
  PolicyContext,
  TaskRecord,
  TaskStatus,
  TaskStep,
  TypedTool,
} from '../../../../packages/core-types/dist/index.js';
import { DeterministicPolicyEngine, RiskClassifier } from '../../../../packages/policy-engine/dist/index.js';
import { TaskStateDatabase } from '../../../../packages/task-state-db/dist/index.js';

import { GeminiLLMProvider } from '../llm/gemini-provider.js';

export class AgentOrchestrator {
  private policyEngine: DeterministicPolicyEngine;
  private database: TaskStateDatabase;
  private registeredTools: Map<string, TypedTool> = new Map();
  private llmProvider: GeminiLLMProvider;

  constructor(apiKey?: string) {
    this.policyEngine = new DeterministicPolicyEngine();
    this.database = new TaskStateDatabase();
    this.llmProvider = new GeminiLLMProvider(apiKey);
  }

  public setApiKey(apiKey: string): void {
    this.llmProvider.setApiKey(apiKey);
  }

  public registerTool(tool: TypedTool): void {
    this.registeredTools.set(tool.name, tool);
  }

  public async createTaskAndPlan(profileId: string, userGoal: string): Promise<TaskRecord> {
    const task = this.createTask(profileId, userGoal);
    const llmSteps = await this.llmProvider.generatePlan(userGoal);

    const steps: TaskStep[] = llmSteps.map((s, idx) => ({
      id: `step-${idx + 1}-${Date.now()}`,
      stepNumber: s.stepNumber || idx + 1,
      description: s.description || `Step ${idx + 1}`,
      toolName: s.toolName,
      toolParameters: s.toolParameters || {},
      status: 'PENDING',
    }));

    return this.setPlanSteps(profileId, task.id, steps);
  }

  public createTask(profileId: string, userGoal: string): TaskRecord {
    const taskId = `task-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const task: TaskRecord = {
      id: taskId,
      profileId,
      userGoal,
      status: TaskStatus.CREATED,
      planSteps: [],
      activeStepIndex: 0,
      approvals: [],
      errorHistory: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.database.saveTask(task);
    return task;
  }

  public updateTaskStatus(profileId: string, taskId: string, status: TaskStatus): TaskRecord {
    const task = this.getTask(profileId, taskId);
    task.status = status;
    task.updatedAt = new Date().toISOString();
    this.database.saveTask(task);
    return task;
  }

  public setPlanSteps(profileId: string, taskId: string, steps: TaskStep[]): TaskRecord {
    const task = this.getTask(profileId, taskId);
    task.planSteps = steps;
    task.status = TaskStatus.WAITING_FOR_APPROVAL;
    task.updatedAt = new Date().toISOString();
    this.database.saveTask(task);
    return task;
  }

  public async executeStep(
    taskId: string,
    stepId: string,
    context: PolicyContext
  ): Promise<{ success: boolean; requiresApproval?: boolean; reason?: string; result?: unknown }> {
    const task = this.getTask(context.profileId, taskId);
    const step = task.planSteps.find((s: TaskStep) => s.id === stepId);

    if (!step) {
      throw new Error(`Step '${stepId}' not found in task '${taskId}'.`);
    }

    if (!step.toolName) {
      step.status = 'SUCCESS';
      this.database.saveTask(task);
      return { success: true };
    }

    const tool = this.registeredTools.get(step.toolName);
    if (!tool) {
      step.status = 'FAILED';
      step.error = `Tool '${step.toolName}' is not registered in runtime.`;
      this.database.saveTask(task);
      return { success: false, reason: step.error };
    }

    const classification = RiskClassifier.classifyTool(step.toolName);
    const decision = this.policyEngine.evaluateAction(
      classification.category,
      step.toolName,
      step.toolParameters || {},
      context
    );

    if (!decision.allowed) {
      step.status = 'FAILED';
      step.error = decision.reason;
      this.database.saveTask(task);
      return { success: false, reason: decision.reason };
    }

    if (decision.requiresApproval) {
      step.status = 'WAITING_APPROVAL';
      task.status = TaskStatus.WAITING_FOR_APPROVAL;
      this.database.saveTask(task);
      return {
        success: false,
        requiresApproval: true,
        reason: decision.reason,
      };
    }

    // Execute tool
    step.status = 'RUNNING';
    task.status = TaskStatus.EXECUTING;
    this.database.saveTask(task);

    try {
      const output = await tool.execute(step.toolParameters || {}, {
        profileId: context.profileId,
      });
      step.status = 'SUCCESS';
      step.result = output;
      this.database.saveTask(task);
      return { success: true, result: output };
    } catch (err: unknown) {
      step.status = 'FAILED';
      const errorMessage = err instanceof Error ? err.message : String(err);
      step.error = errorMessage;
      task.errorHistory.push(errorMessage);
      this.database.saveTask(task);
      return { success: false, reason: errorMessage };
    }
  }

  public getTask(profileId: string, taskId: string): TaskRecord {
    const task = this.database.getTask(profileId, taskId);
    if (!task) {
      throw new Error(`Task '${taskId}' not found for profile '${profileId}'.`);
    }
    return task;
  }
}
