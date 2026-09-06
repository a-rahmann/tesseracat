/**
 * TaskRecorder: Records executed browser agent actions and checkpoints.
 * Answers queries like: "What are you doing?" and "What did you do?".
 */

export interface RecordedAction {
  step: number;
  description: string;
  timestamp: number;
  status: 'ACTIVE' | 'SUCCESS' | 'FAILED';
}

export interface TaskRecord {
  id: string;
  goal: string;
  startedAt: number;
  completedAt?: number;
  status: 'RUNNING' | 'COMPLETED' | 'CANCELLED' | 'FAILED';
  actions: RecordedAction[];
  checkpoints: string[];
  summary?: string;
}

export class TaskRecorder {
  private static instance: TaskRecorder | null = null;
  private tasks: TaskRecord[] = [];
  private activeTask: TaskRecord | null = null;

  public static getInstance(): TaskRecorder {
    if (!TaskRecorder.instance) {
      TaskRecorder.instance = new TaskRecorder();
    }
    return TaskRecorder.instance;
  }

  public startTask(goal: string): TaskRecord {
    const task: TaskRecord = {
      id: `task_${Date.now()}`,
      goal,
      startedAt: Date.now(),
      status: 'RUNNING',
      actions: [],
      checkpoints: [],
    };
    this.activeTask = task;
    this.tasks.unshift(task);
    if (this.tasks.length > 50) this.tasks.pop();
    return task;
  }

  public recordAction(description: string, status: 'ACTIVE' | 'SUCCESS' | 'FAILED' = 'SUCCESS'): void {
    if (!this.activeTask) return;
    const step = this.activeTask.actions.length + 1;
    this.activeTask.actions.push({
      step,
      description,
      timestamp: Date.now(),
      status,
    });
  }

  public recordStep(data: { action: string; target?: string; observation?: string }): void {
    const desc = `${data.action} ${data.target || ''}: ${data.observation || ''}`.trim();
    this.recordAction(desc);
  }

  public recordCheckpoint(name: string): void {
    if (!this.activeTask) return;
    this.activeTask.checkpoints.push(name);
  }

  public completeTask(summary: string): void {
    if (!this.activeTask) return;
    this.activeTask.status = 'COMPLETED';
    this.activeTask.completedAt = Date.now();
    this.activeTask.summary = summary;
    this.activeTask = null;
  }

  public cancelTask(): void {
    if (!this.activeTask) return;
    this.activeTask.status = 'CANCELLED';
    this.activeTask.completedAt = Date.now();
    this.activeTask.summary = 'Task cancelled by user.';
    this.activeTask = null;
  }

  public getActiveTask(): TaskRecord | null {
    return this.activeTask;
  }

  public getLastTask(): TaskRecord | null {
    return this.tasks[0] || null;
  }

  public getAllTasks(): TaskRecord[] {
    return [...this.tasks];
  }

  public explainCurrentActivity(): string {
    if (!this.activeTask) {
      return "I'm not currently running any background tasks. I'm ready for your next command.";
    }
    const lastAction = this.activeTask.actions[this.activeTask.actions.length - 1];
    const stepText = lastAction ? ` Currently: ${lastAction.description}.` : '';
    return `I am working on "${this.activeTask.goal}".${stepText}`;
  }

  public explainPastActivity(): string {
    const last = this.activeTask || this.tasks[0];
    if (!last) {
      return "No recent tasks recorded in this session.";
    }
    const actionList = last.actions.map(a => `• ${a.description}`).join('\n');
    return `Task: "${last.goal}" (${last.status})\nActions taken:\n${actionList || '• Started'}`;
  }

  public explainCurrentStatus(): string {
    return this.explainCurrentActivity();
  }

  public explainPastActions(): string {
    return this.explainPastActivity();
  }
}
