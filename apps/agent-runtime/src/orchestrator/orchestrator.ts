import {
  PolicyContext,
  TaskRecord,
  TaskStatus,
  TaskStep,
  TypedTool,
} from '../../../../packages/core-types/dist/index.js';
import { DeterministicPolicyEngine, RiskClassifier } from '../../../../packages/policy-engine/dist/index.js';
import { TaskStateDatabase } from '../../../../packages/task-state-db/dist/index.js';

import {
  OllamaGemmaProvider,
  OllamaUnavailableError,
  GemmaModelMissingError,
} from '../gemma/ollama-provider.js';
import { ContextBuilder, RawPageContext } from '../gemma/context-builder.js';
import { IntentClassifier } from '../gemma/intent-classifier.js';
import { TaskPlanner } from '../gemma/task-planner.js';
import { ResponseGenerator } from '../gemma/response-generator.js';
import {
  GeneratedResponse,
  HealthCheckResult,
  IntentClassification,
  IntentType,
  TaskPlan,
} from '../gemma/schemas.js';

export interface OrchestratorOptions {
  ollamaEndpoint?: string;
  gemmaModel?: string;
}

export interface RoutedExecutionResult {
  intent: IntentType;
  route:
    | 'local_response'
    | 'research_agent'
    | 'browser_navigation'
    | 'file_agent'
    | 'form_agent'
    | 'communication_agent'
    | 'calendar_agent'
    | 'media_control'
    | 'unknown';
  toolUsed: string;
  model: string;
  response?: GeneratedResponse;
  task?: TaskRecord;
  stepResults?: unknown[];
  requiresApproval?: boolean;
  approvalReason?: string;
  actionSummary?: string;
}

export class AgentOrchestrator {
  private policyEngine: DeterministicPolicyEngine;
  private database: TaskStateDatabase;
  private registeredTools: Map<string, TypedTool> = new Map();

  // Local Gemma AI Layer
  private gemmaProvider: OllamaGemmaProvider;
  private contextBuilder: ContextBuilder;
  private intentClassifier: IntentClassifier;
  private taskPlanner: TaskPlanner;
  private responseGenerator: ResponseGenerator;

  constructor(optionsOrApiKey?: string | OrchestratorOptions) {
    this.policyEngine = new DeterministicPolicyEngine();
    this.database = new TaskStateDatabase();

    const options: OrchestratorOptions =
      typeof optionsOrApiKey === 'object' && optionsOrApiKey !== null
        ? optionsOrApiKey
        : {};

    const endpoint = options.ollamaEndpoint || 'http://127.0.0.1:11434';
    const model = options.gemmaModel || 'gemma3:4b';

    this.gemmaProvider = new OllamaGemmaProvider(endpoint, model);
    this.contextBuilder = new ContextBuilder();
    this.intentClassifier = new IntentClassifier(this.gemmaProvider, this.contextBuilder);
    this.taskPlanner = new TaskPlanner(this.gemmaProvider, this.contextBuilder);
    this.responseGenerator = new ResponseGenerator(this.gemmaProvider, this.contextBuilder);
  }

  // Getters for Local Gemma modules
  public getGemmaProvider(): OllamaGemmaProvider {
    return this.gemmaProvider;
  }

  public getContextBuilder(): ContextBuilder {
    return this.contextBuilder;
  }

  public getIntentClassifier(): IntentClassifier {
    return this.intentClassifier;
  }

  public getTaskPlanner(): TaskPlanner {
    return this.taskPlanner;
  }

  public getResponseGenerator(): ResponseGenerator {
    return this.responseGenerator;
  }

  /**
   * Health Check for Local Gemma Brain
   */
  public async checkLocalHealth(): Promise<HealthCheckResult> {
    return this.gemmaProvider.checkHealth();
  }

  /**
   * Classify user intent strictly using local Gemma
   */
  public async classifyIntent(
    userInput: string,
    rawContext?: RawPageContext
  ): Promise<IntentClassification> {
    return this.intentClassifier.classify(userInput, rawContext);
  }

  /**
   * Generate user-facing structured response strictly using local Gemma
   */
  public async generateResponse(
    query: string,
    rawContext?: RawPageContext
  ): Promise<GeneratedResponse> {
    return this.responseGenerator.generateResponse(query, rawContext);
  }

  public registerTool(tool: TypedTool): void {
    this.registeredTools.set(tool.name, tool);
  }

  /**
   * Authoritative Intent-Based Request Router
   * Routes user requests cleanly based on semantic classification:
   * - general_qa -> ResponseGenerator -> Local Gemma (Direct answer, NO Google, NO web_search)
   * - explain_current_page / summarize_page / explain_selected_text -> ResponseGenerator
   * - research_compare -> TaskPlanner / Research Agent with web_search tools
   * - browser_navigation -> Navigation tools
   * - communication_task -> Communication Agent & Policy Approval (Never silently sent)
   * - form_task / file_task / calendar_query / media_control -> Appropriate agents/tools
   */
  public async routeAndExecute(
    profileId: string,
    userGoal: string,
    rawContext?: RawPageContext
  ): Promise<RoutedExecutionResult> {
    const modelName = this.gemmaProvider.getModelName();
    const classification = await this.classifyIntent(userGoal, rawContext);
    const intent = classification.intent;

    // 1. GENERAL KNOWLEDGE & PAGE DIRECT RESPONSES -> ResponseGenerator (Local Gemma, direct answer)
    if (
      intent === 'general_qa' ||
      intent === 'explain_current_page' ||
      intent === 'summarize_page' ||
      intent === 'explain_selected_text'
    ) {
      console.log(`[Intent] ${intent}\n[Route] local_response\n[Tool] none\n[Model] ${modelName}`);
      const response = await this.generateResponse(userGoal, rawContext);
      return {
        intent,
        route: 'local_response',
        toolUsed: 'none',
        model: modelName,
        response,
        actionSummary: response.answer,
      };
    }

    // 2. RESEARCH / COMPARISON -> TaskPlanner / Research Agent with web_search/browser tools
    if (intent === 'research_compare') {
      console.log(`[Intent] ${intent}\n[Route] research_agent\n[Tool] web_search\n[Model] ${modelName}`);
      const taskRecord = await this.createTaskAndPlan(profileId, userGoal, rawContext);
      const steps = taskRecord.planSteps || [];
      const context: PolicyContext = {
        profileId,
        isAutonomousMission: true,
        dailyCloudSpendCapUSD: 10,
        currentCloudSpendUSD: 0,
      };

      const stepResults: unknown[] = [];
      let toolUsed = 'web_search';
      for (let i = 0; i < steps.length; i++) {
        if (steps[i].toolName) toolUsed = steps[i].toolName!;
        const res = await this.executeStep(taskRecord.id, steps[i].id, context);
        stepResults.push(res);
      }

      // Synthesize answer if possible
      let finalResponse: GeneratedResponse | undefined;
      try {
        const enrichedContext: RawPageContext = {
          ...rawContext,
          mainVisibleText: `Research Results: ${JSON.stringify(stepResults)}`,
        };
        finalResponse = await this.generateResponse(userGoal, enrichedContext);
      } catch (_) {}

      return {
        intent,
        route: 'research_agent',
        toolUsed,
        model: modelName,
        task: this.getTask(profileId, taskRecord.id),
        stepResults,
        response: finalResponse,
        actionSummary: finalResponse?.answer || `Completed research for: "${userGoal}"`,
      };
    }

    // 3. EXPLICIT BROWSER NAVIGATION -> browser/navigation tools
    if (intent === 'browser_navigation') {
      console.log(`[Intent] ${intent}\n[Route] browser_navigation\n[Tool] browser_navigate\n[Model] ${modelName}`);
      const taskRecord = await this.createTaskAndPlan(profileId, userGoal, rawContext);
      const steps = taskRecord.planSteps || [];
      const context: PolicyContext = {
        profileId,
        isAutonomousMission: true,
        dailyCloudSpendCapUSD: 10,
        currentCloudSpendUSD: 0,
      };

      const stepResults: unknown[] = [];
      for (let i = 0; i < steps.length; i++) {
        const res = await this.executeStep(taskRecord.id, steps[i].id, context);
        stepResults.push(res);
      }

      return {
        intent,
        route: 'browser_navigation',
        toolUsed: steps[0]?.toolName || 'browser_navigate',
        model: modelName,
        task: this.getTask(profileId, taskRecord.id),
        stepResults,
        actionSummary: `Navigated to target for: "${userGoal}"`,
      };
    }

    // 4. COMMUNICATION -> Communication Agent & Policy Approval
    if (intent === 'communication_task') {
      console.log(`[Intent] ${intent}\n[Route] communication_agent\n[Tool] send_communication [Approval Required]\n[Model] ${modelName}`);
      const decision = this.policyEngine.evaluateAction(
        'SEND_COMMUNICATION',
        'send_communication',
        classification.parameters || {},
        { profileId, isAutonomousMission: false, dailyCloudSpendCapUSD: 10, currentCloudSpendUSD: 0 }
      );

      const task = this.createTask(profileId, userGoal);
      task.status = TaskStatus.WAITING_FOR_APPROVAL;
      this.database.saveTask(task);

      return {
        intent,
        route: 'communication_agent',
        toolUsed: 'send_communication',
        model: modelName,
        task,
        requiresApproval: true,
        approvalReason: decision.reason || 'Sending messages or emails requires explicit user confirmation.',
        actionSummary: `Approval required before sending communication: "${userGoal}"`,
      };
    }

    // 5. FILES -> File Agent & Policy System
    if (intent === 'file_task') {
      console.log(`[Intent] ${intent}\n[Route] file_agent\n[Tool] file_action\n[Model] ${modelName}`);
      const taskRecord = await this.createTaskAndPlan(profileId, userGoal, rawContext);
      return {
        intent,
        route: 'file_agent',
        toolUsed: 'file_action',
        model: modelName,
        task: taskRecord,
        actionSummary: `Processed file task: "${userGoal}"`,
      };
    }

    // 6. FORMS -> Form Agent & Policy System
    if (intent === 'form_task') {
      console.log(`[Intent] ${intent}\n[Route] form_agent\n[Tool] form_action\n[Model] ${modelName}`);
      const decision = this.policyEngine.evaluateAction(
        'FORM_SUBMIT',
        'submit_form',
        classification.parameters || {},
        { profileId, isAutonomousMission: false, dailyCloudSpendCapUSD: 10, currentCloudSpendUSD: 0 }
      );
      const task = this.createTask(profileId, userGoal);
      if (decision.requiresApproval) {
        task.status = TaskStatus.WAITING_FOR_APPROVAL;
        this.database.saveTask(task);
      }
      return {
        intent,
        route: 'form_agent',
        toolUsed: 'form_action',
        model: modelName,
        task,
        requiresApproval: decision.requiresApproval,
        approvalReason: decision.reason,
        actionSummary: `Form task evaluated: "${userGoal}"`,
      };
    }

    // 7. CALENDAR -> Calendar Tools
    if (intent === 'calendar_query') {
      console.log(`[Intent] ${intent}\n[Route] calendar_agent\n[Tool] calendar_query\n[Model] ${modelName}`);
      const response = await this.generateResponse(userGoal, rawContext);
      return {
        intent,
        route: 'calendar_agent',
        toolUsed: 'calendar_query',
        model: modelName,
        response,
        actionSummary: response.answer,
      };
    }

    // 8. MEDIA -> Media Controls
    if (intent === 'media_control') {
      console.log(`[Intent] ${intent}\n[Route] media_control\n[Tool] dom_interact\n[Model] ${modelName}`);
      return {
        intent,
        route: 'media_control',
        toolUsed: 'dom_interact',
        model: modelName,
        actionSummary: `Applied media control for: "${userGoal}"`,
      };
    }

    // Default / Unknown -> Local response without web search
    console.log(`[Intent] unknown\n[Route] local_response\n[Tool] none\n[Model] ${modelName}`);
    const response = await this.generateResponse(userGoal, rawContext);
    return {
      intent: 'unknown',
      route: 'local_response',
      toolUsed: 'none',
      model: modelName,
      response,
      actionSummary: response.answer,
    };
  }

  /**
   * Create task and plan using local Gemma reasoning.
   * STRICT LOCAL-ONLY: Zero cloud calls, zero cloud fallback.
   * If local Ollama/Gemma is unavailable, returns a clear LOCAL_AI_UNAVAILABLE task state.
   */
  public async createTaskAndPlan(
    profileId: string,
    userGoal: string,
    rawContext?: RawPageContext
  ): Promise<TaskRecord> {
    const task = this.createTask(profileId, userGoal);

    try {
      // Decompose goal into read-only and navigation steps via Local Gemma TaskPlanner
      const plan: TaskPlan = await this.taskPlanner.plan(userGoal, rawContext);

      const steps: TaskStep[] = plan.steps.map((s, idx) => ({
        id: `step-${idx + 1}-${Date.now()}`,
        stepNumber: s.stepNumber || idx + 1,
        description: s.description || `Step ${idx + 1}`,
        toolName: s.toolName,
        toolParameters: (s.toolParameters as Record<string, unknown>) || {},
        status: 'PENDING',
      }));

      return this.setPlanSteps(profileId, task.id, steps);
    } catch (err: unknown) {
      task.status = TaskStatus.FAILED;
      const isUnavailable =
        err instanceof OllamaUnavailableError ||
        err instanceof GemmaModelMissingError ||
        (err instanceof Error && err.message.includes('unavailable'));

      const errorMsg = isUnavailable
        ? `LOCAL_AI_UNAVAILABLE: ${err instanceof Error ? err.message : String(err)}`
        : `PLANNING_ERROR: ${err instanceof Error ? err.message : String(err)}`;

      task.errorHistory.push(errorMsg);
      task.updatedAt = new Date().toISOString();
      this.database.saveTask(task);
      return task;
    }
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

  /**
   * Execute a single step through DeterministicPolicyEngine
   * NOTE: Gemma NEVER directly executes tools; execution occurs through Orchestrator
   * and is strictly evaluated by the Policy Engine.
   */
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

    // Policy Engine Evaluation
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
