/**
 * TaskCheckpointManager: Persists agent checkpoints to enable task resumption.
 * Powers "Continue what I was doing" and graceful recovery after interruptions.
 */
export interface TaskCheckpoint {
    taskId: string;
    goal: string;
    task?: string;
    timestamp: number;
    completedSteps: string[];
    remainingSteps: string[];
    contextData: Record<string, any>;
}
export declare class TaskCheckpointManager {
    private static instance;
    private filePath;
    private checkpoints;
    private constructor();
    static getInstance(): TaskCheckpointManager;
    private load;
    private save;
    saveCheckpoint(cp: any): void;
    getLatestCheckpoint(): TaskCheckpoint | null;
    clearCheckpoint(taskId: string): void;
}
//# sourceMappingURL=task-checkpoint-manager.d.ts.map