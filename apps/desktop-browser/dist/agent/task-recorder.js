"use strict";
/**
 * TaskRecorder: Records executed browser agent actions and checkpoints.
 * Answers queries like: "What are you doing?" and "What did you do?".
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskRecorder = void 0;
class TaskRecorder {
    static instance = null;
    tasks = [];
    activeTask = null;
    static getInstance() {
        if (!TaskRecorder.instance) {
            TaskRecorder.instance = new TaskRecorder();
        }
        return TaskRecorder.instance;
    }
    startTask(goal) {
        const task = {
            id: `task_${Date.now()}`,
            goal,
            startedAt: Date.now(),
            status: 'RUNNING',
            actions: [],
            checkpoints: [],
        };
        this.activeTask = task;
        this.tasks.unshift(task);
        if (this.tasks.length > 50)
            this.tasks.pop();
        return task;
    }
    recordAction(description, status = 'SUCCESS') {
        if (!this.activeTask)
            return;
        const step = this.activeTask.actions.length + 1;
        this.activeTask.actions.push({
            step,
            description,
            timestamp: Date.now(),
            status,
        });
    }
    recordStep(data) {
        const desc = `${data.action} ${data.target || ''}: ${data.observation || ''}`.trim();
        this.recordAction(desc);
    }
    recordCheckpoint(name) {
        if (!this.activeTask)
            return;
        this.activeTask.checkpoints.push(name);
    }
    completeTask(summary) {
        if (!this.activeTask)
            return;
        this.activeTask.status = 'COMPLETED';
        this.activeTask.completedAt = Date.now();
        this.activeTask.summary = summary;
        this.activeTask = null;
    }
    cancelTask() {
        if (!this.activeTask)
            return;
        this.activeTask.status = 'CANCELLED';
        this.activeTask.completedAt = Date.now();
        this.activeTask.summary = 'Task cancelled by user.';
        this.activeTask = null;
    }
    getActiveTask() {
        return this.activeTask;
    }
    getLastTask() {
        return this.tasks[0] || null;
    }
    getAllTasks() {
        return [...this.tasks];
    }
    explainCurrentActivity() {
        if (!this.activeTask) {
            return "I'm not currently running any background tasks. I'm ready for your next command.";
        }
        const lastAction = this.activeTask.actions[this.activeTask.actions.length - 1];
        const stepText = lastAction ? ` Currently: ${lastAction.description}.` : '';
        return `I am working on "${this.activeTask.goal}".${stepText}`;
    }
    explainPastActivity() {
        const last = this.activeTask || this.tasks[0];
        if (!last) {
            return "No recent tasks recorded in this session.";
        }
        const actionList = last.actions.map(a => `• ${a.description}`).join('\n');
        return `Task: "${last.goal}" (${last.status})\nActions taken:\n${actionList || '• Started'}`;
    }
    explainCurrentStatus() {
        return this.explainCurrentActivity();
    }
    explainPastActions() {
        return this.explainPastActivity();
    }
}
exports.TaskRecorder = TaskRecorder;
//# sourceMappingURL=task-recorder.js.map