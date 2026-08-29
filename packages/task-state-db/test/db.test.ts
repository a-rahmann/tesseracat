import { describe, it } from 'node:test';
import assert from 'node:assert';
import { TaskStateDatabase } from '../src/db.js';
import { TaskRecord, TaskStatus } from '../../core-types/src/index.js';

describe('TaskStateDatabase Profile Isolation & Persistence Tests', () => {
  const db = new TaskStateDatabase();

  const profileA = 'prof-personal';
  const profileB = 'prof-work';

  it('should save and retrieve tasks under profile A', () => {
    const taskA: TaskRecord = {
      id: 'task-1001',
      profileId: profileA,
      userGoal: 'Research laptops under budget',
      status: TaskStatus.CREATED,
      planSteps: [],
      activeStepIndex: 0,
      approvals: [],
      errorHistory: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    db.saveTask(taskA);
    const retrieved = db.getTask(profileA, 'task-1001');
    assert.ok(retrieved);
    assert.strictEqual(retrieved?.userGoal, 'Research laptops under budget');
  });

  it('should isolate tasks between Profile A and Profile B', () => {
    const taskA = db.getTask(profileA, 'task-1001');
    assert.ok(taskA);

    // Profile B should NOT see Profile A task
    const crossAccess = db.getTask(profileB, 'task-1001');
    assert.strictEqual(crossAccess, undefined);
  });

  it('should store and isolate consented memory by profile', () => {
    db.saveConsentedMemory(profileA, 'user_theme_pref', 'dark');
    db.saveConsentedMemory(profileB, 'user_theme_pref', 'light');

    const memA = db.getConsentedMemory(profileA, 'user_theme_pref');
    const memB = db.getConsentedMemory(profileB, 'user_theme_pref');

    assert.strictEqual(memA?.value, 'dark');
    assert.strictEqual(memB?.value, 'light');
  });
});
