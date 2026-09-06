/**
 * TaskCheckpointManager: Persists agent checkpoints to enable task resumption.
 * Powers "Continue what I was doing" and graceful recovery after interruptions.
 */
import { TaskCheckpoint } from './types.js';
export { TaskCheckpoint };
export declare class TaskCheckpointManager {
    private static instance;
    private filePath;
    private checkpoints;
    private constructor();
    static getInstance(): TaskCheckpointManager;
    private load;
    private save;
    saveCheckpoint(cp: Partial<TaskCheckpoint> & {
        taskId: string;
        goal: string;
    }): void;
    getLatestCheckpoint(): TaskCheckpoint | null;
    clearCheckpoint(taskId: string): void;
}
//# sourceMappingURL=task-checkpoint-manager.d.ts.map