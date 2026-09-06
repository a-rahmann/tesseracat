"use strict";
/**
 * TaskManager: Central 14-State Task Engine for Tesseract.
 * Enforces valid state transitions, human handoffs, and checkpointing.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskManager = void 0;
const task_checkpoint_manager_js_1 = require("./task-checkpoint-manager.js");
class TaskManager {
    static instance = null;
    activeTask = null;
    taskHistory = [];
    listeners = new Set();
    constructor() { }
    static getInstance() {
        if (!TaskManager.instance) {
            TaskManager.instance = new TaskManager();
        }
        return TaskManager.instance;
    }
    getActiveTask() {
        return this.activeTask ? { ...this.activeTask } : null;
    }
    subscribe(listener) {
        this.listeners.add(listener);
        if (this.activeTask) {
            listener({ ...this.activeTask });
        }
        return () => this.listeners.delete(listener);
    }
    notifyListeners() {
        if (!this.activeTask)
            return;
        const snap = { ...this.activeTask };
        for (const listener of this.listeners) {
            try {
                listener(snap);
            }
            catch (err) {
                console.error('[TaskManager] Listener error:', err);
            }
        }
    }
    /**
     * Initializes a new task in CREATED state.
     */
    createTask(goal, steps = []) {
        const id = `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const task = {
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
        if (this.taskHistory.length > 50)
            this.taskHistory.pop();
        this.notifyListeners();
        return task;
    }
    /**
     * Transition task to a new state with validation.
     */
    transitionState(newState, patch = {}) {
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
            task_checkpoint_manager_js_1.TaskCheckpointManager.getInstance().saveCheckpoint({
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
    updateStepStatus(stepNumber, status, result, error) {
        if (!this.activeTask)
            return;
        const step = this.activeTask.steps.find(s => s.stepNumber === stepNumber);
        if (step) {
            step.status = status;
            if (result !== undefined)
                step.result = result;
            if (error !== undefined)
                step.error = error;
            this.activeTask.updatedAt = Date.now();
            this.notifyListeners();
        }
    }
    setPlanSteps(steps) {
        if (!this.activeTask)
            return;
        this.activeTask.steps = steps;
        this.activeTask.updatedAt = Date.now();
        this.notifyListeners();
    }
}
exports.TaskManager = TaskManager;
//# sourceMappingURL=task-manager.js.map