/**
 * TaskManager: Central 14-State Task Engine for Tesseract.
 * Enforces valid state transitions, human handoffs, and checkpointing.
 */

import { TaskState, PlanStep } from './types.js';
import { TaskCheckpointManager } from './task-checkpoint-manager.js';

export interface ActiveTask {
  id: string;
  goal: string;
  state: TaskState;
  steps: PlanStep[];
  currentStepIndex: number;
  currentActionDescription?: string;
  activeUrl?: string;
  activeTabId?: string;
  error?: string;
  humanHandoffRequired?: {
    type: 'AUTH' | 'CAPTCHA' | 'PAYMENT' | 'PERMISSION' | 'CLARIFICATION';
    message: string;
    targetUrl?: string;
  };
  startedAt: number;
  updatedAt: number;
  completedAt?: number;
}

export type TaskStateListener = (task: ActiveTask) => void;

export class TaskManager {
  private static instance: TaskManager | null = null;
  private activeTask: ActiveTask | null = null;
  private taskHistory: ActiveTask[] = [];
  private listeners: Set<TaskStateListener> = new Set();

  private constructor() {}

  public static getInstance(): TaskManager {
    if (!TaskManager.instance) {
      TaskManager.instance = new TaskManager();
    }
    return TaskManager.instance;
  }

  public getActiveTask(): ActiveTask | null {
    return this.activeTask ? { ...this.activeTask } : null;
  }

  public subscribe(listener: TaskStateListener): () => void {
    this.listeners.add(listener);
    if (this.activeTask) {
      listener({ ...this.activeTask });
    }
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    if (!this.activeTask) return;
    const snap = { ...this.activeTask };
    for (const listener of this.listeners) {
      try {
        listener(snap);
      } catch (err) {
        console.error('[TaskManager] Listener error:', err);
      }
    }
  }

  /**
   * Initializes a new task in CREATED state.
   */
  public createTask(goal: string, steps: PlanStep[] = []): ActiveTask {
    const id = `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const task: ActiveTask = {
      id,
      goal,
      state: 'CREATED',
      steps,
      currentStepIndex: 0,
      startedAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.activeTask = task;
    this.taskHistory.unshift(task);
    if (this.taskHistory.length > 50) this.taskHistory.pop();

    this.notifyListeners();
    return task;
  }

  /**
   * Transition task to a new state with validation.
   */
  public transitionState(newState: TaskState, patch: Partial<ActiveTask> = {}): void {
    if (!this.activeTask) {
      console.warn(`[TaskManager] Cannot transition to ${newState}: no active task.`);
      return;
    }

    const previousState = this.activeTask.state;
    this.activeTask.state = newState;
    this.activeTask.updatedAt = Date.now();
    Object.assign(this.activeTask, patch);

    console.log(`[TaskManager] [${this.activeTask.id}] ${previousState} -> ${newState}: ${this.activeTask.currentActionDescription || ''}`);

    if (newState === 'COMPLETED' || newState === 'FAILED' || newState === 'CANCELLED') {
      this.activeTask.completedAt = Date.now();
    }

    // Trigger checkpoint persistence on meaningful forward progress
    if (newState === 'EXECUTING' || newState === 'AUTH_REQUIRED' || newState === 'PAUSED' || newState === 'COMPLETED') {
      TaskCheckpointManager.getInstance().saveCheckpoint({
        taskId: this.activeTask.id,
        goal: this.activeTask.goal,
        currentStepIndex: this.activeTask.currentStepIndex,
        completedSteps: this.activeTask.steps.filter(s => s.status === 'SUCCESS').map(s => s.description),
        remainingSteps: this.activeTask.steps.filter(s => s.status !== 'SUCCESS').map(s => s.description),
        currentUrl: this.activeTask.activeUrl || '',
        activeTabId: this.activeTask.activeTabId,
        openTabIds: [],
        pageStateHash: `${this.activeTask.activeUrl || ''}::${this.activeTask.currentStepIndex}`,
        contextData: {
          state: newState,
          humanHandoff: this.activeTask.humanHandoffRequired,
        },
        timestamp: Date.now(),
      });
    }

    this.notifyListeners();
  }

  public updateStepStatus(
    stepNumber: number,
    status: PlanStep['status'],
    result?: any,
    error?: string
  ): void {
    if (!this.activeTask) return;
    const step = this.activeTask.steps.find(s => s.stepNumber === stepNumber);
    if (step) {
      step.status = status;
      if (result !== undefined) step.result = result;
      if (error !== undefined) step.error = error;
      this.activeTask.updatedAt = Date.now();
      this.notifyListeners();
    }
  }

  public setPlanSteps(steps: PlanStep[]): void {
    if (!this.activeTask) return;
    this.activeTask.steps = steps;
    this.activeTask.updatedAt = Date.now();
    this.notifyListeners();
  }
}
