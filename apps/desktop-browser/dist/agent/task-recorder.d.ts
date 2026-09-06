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
export declare class TaskRecorder {
    private static instance;
    private tasks;
    private activeTask;
    static getInstance(): TaskRecorder;
    startTask(goal: string): TaskRecord;
    recordAction(description: string, status?: 'ACTIVE' | 'SUCCESS' | 'FAILED'): void;
    recordStep(data: {
        action: string;
        target?: string;
        observation?: string;
    }): void;
    recordCheckpoint(name: string): void;
    completeTask(summary: string): void;
    cancelTask(): void;
    getActiveTask(): TaskRecord | null;
    getLastTask(): TaskRecord | null;
    getAllTasks(): TaskRecord[];
    explainCurrentActivity(): string;
    explainPastActivity(): string;
    explainCurrentStatus(): string;
    explainPastActions(): string;
}
//# sourceMappingURL=task-recorder.d.ts.map