import { TaskApprovalRequest, TaskRecord } from '../../core-types/src/index.js';
export interface ConsentedMemoryRecord {
    id: string;
    profileId: string;
    key: string;
    value: string;
    userConsented: boolean;
    createdAt: string;
}
export declare class TaskStateDatabase {
    private tasksByProfile;
    private memoryByProfile;
    /**
     * Save or update a task record under strict profile isolation.
     */
    saveTask(task: TaskRecord): void;
    /**
     * Retrieve task by ID for a specific profile.
     */
    getTask(profileId: string, taskId: string): TaskRecord | undefined;
    /**
     * List all task records owned by a specific profile.
     */
    listTasksByProfile(profileId: string): TaskRecord[];
    /**
     * Record user approval decision into task audit log.
     */
    recordApproval(profileId: string, approval: TaskApprovalRequest): void;
    /**
     * Store user consented memory item (e.g. user preferences).
     */
    saveConsentedMemory(profileId: string, key: string, value: string): ConsentedMemoryRecord;
    /**
     * Retrieve consented memory item under active profile context.
     */
    getConsentedMemory(profileId: string, key: string): ConsentedMemoryRecord | undefined;
    /**
     * Delete task state (durable wipe by user command).
     */
    deleteTask(profileId: string, taskId: string): boolean;
}
//# sourceMappingURL=db.d.ts.map