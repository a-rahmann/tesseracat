"use strict";
/**
 * TaskCheckpointManager: Persists agent checkpoints to enable task resumption.
 * Powers "Continue what I was doing" and graceful recovery after interruptions.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskCheckpointManager = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const index_js_1 = require("../platform/index.js");
class TaskCheckpointManager {
    static instance = null;
    filePath;
    checkpoints = new Map();
    constructor() {
        const dir = (0, index_js_1.getAppDataDir)('tesseract');
        try {
            if (!fs_1.default.existsSync(dir))
                fs_1.default.mkdirSync(dir, { recursive: true });
        }
        catch { }
        this.filePath = path_1.default.join(dir, 'tesseract-task-checkpoints.json');
        this.load();
    }
    static getInstance() {
        if (!TaskCheckpointManager.instance) {
            TaskCheckpointManager.instance = new TaskCheckpointManager();
        }
        return TaskCheckpointManager.instance;
    }
    load() {
        try {
            if (fs_1.default.existsSync(this.filePath)) {
                const raw = fs_1.default.readFileSync(this.filePath, 'utf-8');
                const list = JSON.parse(raw);
                if (Array.isArray(list)) {
                    for (const cp of list)
                        this.checkpoints.set(cp.taskId, cp);
                }
            }
        }
        catch (err) {
            console.warn('[TaskCheckpointManager] Could not load checkpoints:', err);
        }
    }
    save() {
        try {
            const list = Array.from(this.checkpoints.values());
            fs_1.default.writeFileSync(this.filePath, JSON.stringify(list.slice(-30), null, 2), 'utf-8');
        }
        catch (err) {
            console.warn('[TaskCheckpointManager] Could not save checkpoints:', err);
        }
    }
    saveCheckpoint(cp) {
        const taskId = cp.taskId || `cp_${Date.now()}`;
        const goal = cp.goal || cp.task || 'Autonomous Mission';
        const norm = {
            taskId,
            goal,
            task: goal,
            timestamp: cp.timestamp || Date.now(),
            completedSteps: cp.completedSteps || cp.completedActions || [],
            remainingSteps: cp.remainingSteps || [],
            contextData: cp.contextData || cp.state || {},
        };
        this.checkpoints.set(taskId, norm);
        this.save();
        console.log(`[TaskCheckpointManager] Saved checkpoint for "${goal}" (${norm.completedSteps.length} steps done)`);
    }
    getLatestCheckpoint() {
        let latest = null;
        for (const cp of this.checkpoints.values()) {
            if (!latest || cp.timestamp > latest.timestamp) {
                latest = cp;
            }
        }
        return latest;
    }
    clearCheckpoint(taskId) {
        this.checkpoints.delete(taskId);
        this.save();
    }
}
exports.TaskCheckpointManager = TaskCheckpointManager;
//# sourceMappingURL=task-checkpoint-manager.js.map