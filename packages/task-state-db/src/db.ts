import {
  TaskApprovalRequest,
  TaskRecord,
  TaskStatus,
  TaskStep,
} from '../../core-types/dist/index.js';

export interface ConsentedMemoryRecord {
  id: string;
  profileId: string;
  key: string;
  value: string;
  userConsented: boolean;
  createdAt: string;
}

export class TaskStateDatabase {
  private tasksByProfile: Map<string, Map<string, TaskRecord>> = new Map();
  private memoryByProfile: Map<string, Map<string, ConsentedMemoryRecord>> = new Map();

  /**
   * Save or update a task record under strict profile isolation.
   */
  public saveTask(task: TaskRecord): void {
    let profileTasks = this.tasksByProfile.get(task.profileId);
    if (!profileTasks) {
      profileTasks = new Map();
      this.tasksByProfile.set(task.profileId, profileTasks);
    }
    profileTasks.set(task.id, { ...task, updatedAt: new Date().toISOString() });
  }

  /**
   * Retrieve task by ID for a specific profile.
   */
  public getTask(profileId: string, taskId: string): TaskRecord | undefined {
    const profileTasks = this.tasksByProfile.get(profileId);
    return profileTasks?.get(taskId);
  }

  /**
   * List all task records owned by a specific profile.
   */
  public listTasksByProfile(profileId: string): TaskRecord[] {
    const profileTasks = this.tasksByProfile.get(profileId);
    if (!profileTasks) return [];
    return Array.from(profileTasks.values());
  }

  /**
   * Record user approval decision into task audit log.
   */
  public recordApproval(profileId: string, approval: TaskApprovalRequest): void {
    const task = this.getTask(profileId, approval.taskId);
    if (task) {
      task.approvals.push(approval);
      this.saveTask(task);
    }
  }

  /**
   * Store user consented memory item (e.g. user preferences).
   */
  public saveConsentedMemory(profileId: string, key: string, value: string): ConsentedMemoryRecord {
    let profileMemory = this.memoryByProfile.get(profileId);
    if (!profileMemory) {
      profileMemory = new Map();
      this.memoryByProfile.set(profileId, profileMemory);
    }

    const record: ConsentedMemoryRecord = {
      id: `mem-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      profileId,
      key,
      value,
      userConsented: true,
      createdAt: new Date().toISOString(),
    };

    profileMemory.set(key, record);
    return record;
  }

  /**
   * Retrieve consented memory item under active profile context.
   */
  public getConsentedMemory(profileId: string, key: string): ConsentedMemoryRecord | undefined {
    const profileMemory = this.memoryByProfile.get(profileId);
    return profileMemory?.get(key);
  }

  /**
   * Delete task state (durable wipe by user command).
   */
  public deleteTask(profileId: string, taskId: string): boolean {
    const profileTasks = this.tasksByProfile.get(profileId);
    return profileTasks ? profileTasks.delete(taskId) : false;
  }
}
