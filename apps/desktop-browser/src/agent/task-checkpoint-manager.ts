/**
 * TaskCheckpointManager: Persists agent checkpoints to enable task resumption.
 * Powers "Continue what I was doing" and graceful recovery after interruptions.
 */

import fs from 'fs';
import path from 'path';
import { getAppDataDir } from '../platform/index.js';

export interface TaskCheckpoint {
  taskId: string;
  goal: string;
  task?: string;
  timestamp: number;
  completedSteps: string[];
  remainingSteps: string[];
  contextData: Record<string, any>;
}

export class TaskCheckpointManager {
  private static instance: TaskCheckpointManager | null = null;
  private filePath: string;
  private checkpoints: Map<string, TaskCheckpoint> = new Map();

  private constructor() {
    const dir = getAppDataDir('tesseract');
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    } catch {}

    this.filePath = path.join(dir, 'tesseract-task-checkpoints.json');
    this.load();
  }

  public static getInstance(): TaskCheckpointManager {
    if (!TaskCheckpointManager.instance) {
      TaskCheckpointManager.instance = new TaskCheckpointManager();
    }
    return TaskCheckpointManager.instance;
  }

  private load(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const list: TaskCheckpoint[] = JSON.parse(raw);
        if (Array.isArray(list)) {
          for (const cp of list) this.checkpoints.set(cp.taskId, cp);
        }
      }
    } catch (err) {
      console.warn('[TaskCheckpointManager] Could not load checkpoints:', err);
    }
  }

  private save(): void {
    try {
      const list = Array.from(this.checkpoints.values());
      fs.writeFileSync(this.filePath, JSON.stringify(list.slice(-30), null, 2), 'utf-8');
    } catch (err) {
      console.warn('[TaskCheckpointManager] Could not save checkpoints:', err);
    }
  }

  public saveCheckpoint(cp: any): void {
    const taskId = cp.taskId || `cp_${Date.now()}`;
    const goal = cp.goal || cp.task || 'Autonomous Mission';
    const norm: TaskCheckpoint = {
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

  public getLatestCheckpoint(): TaskCheckpoint | null {
    let latest: TaskCheckpoint | null = null;
    for (const cp of this.checkpoints.values()) {
      if (!latest || cp.timestamp > latest.timestamp) {
        latest = cp;
      }
    }
    return latest;
  }

  public clearCheckpoint(taskId: string): void {
    this.checkpoints.delete(taskId);
    this.save();
  }
}
