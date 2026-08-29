export class TaskStateDatabase {
    tasksByProfile = new Map();
    memoryByProfile = new Map();
    /**
     * Save or update a task record under strict profile isolation.
     */
    saveTask(task) {
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
    getTask(profileId, taskId) {
        const profileTasks = this.tasksByProfile.get(profileId);
        return profileTasks?.get(taskId);
    }
    /**
     * List all task records owned by a specific profile.
     */
    listTasksByProfile(profileId) {
        const profileTasks = this.tasksByProfile.get(profileId);
        if (!profileTasks)
            return [];
        return Array.from(profileTasks.values());
    }
    /**
     * Record user approval decision into task audit log.
     */
    recordApproval(profileId, approval) {
        const task = this.getTask(profileId, approval.taskId);
        if (task) {
            task.approvals.push(approval);
            this.saveTask(task);
        }
    }
    /**
     * Store user consented memory item (e.g. user preferences).
     */
    saveConsentedMemory(profileId, key, value) {
        let profileMemory = this.memoryByProfile.get(profileId);
        if (!profileMemory) {
            profileMemory = new Map();
            this.memoryByProfile.set(profileId, profileMemory);
        }
        const record = {
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
    getConsentedMemory(profileId, key) {
        const profileMemory = this.memoryByProfile.get(profileId);
        return profileMemory?.get(key);
    }
    /**
     * Delete task state (durable wipe by user command).
     */
    deleteTask(profileId, taskId) {
        const profileTasks = this.tasksByProfile.get(profileId);
        return profileTasks ? profileTasks.delete(taskId) : false;
    }
}
//# sourceMappingURL=db.js.map