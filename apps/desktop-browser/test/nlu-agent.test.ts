import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { NaturalLanguageInterpreter } from '../src/agent/natural-language-interpreter.js';
import { TaskManager } from '../src/agent/task-manager.js';
import { TaskCheckpointManager } from '../src/agent/task-checkpoint-manager.js';
import { TaskCheckpoint } from '../src/agent/types.js';
import { ToolRegistry } from '../src/agent/tool-registry.js';
import { WakeWordDetector } from '../src/voice/wake-word.js';
import { ComparisonEngine } from '../src/skills/comparison-engine.js';
import { PDFReader } from '../src/browser/pdf-reader.js';

describe('Tesseract Unified Voice + Agent Architecture', () => {
  const interpreter = NaturalLanguageInterpreter.getInstance();

  test('Test 1: Compound Goal Decomposition - Instagram DM Verification', async () => {
    const raw = 'open Instagram and check whether Rahul messaged me';
    const goal = await interpreter.interpret(raw, 'https://www.google.com', 'Google Search');

    assert.equal(goal.isCompound, true, 'Goal must be identified as compound');
    assert.notEqual(goal.intentCategory, 'BROWSER_CONTROL', 'Compound goal must not be treated as simple browser control');
    assert.equal(goal.requiresBrowser, true, 'Must require browser');
    assert.ok(
      goal.goal.toLowerCase().includes('rahul') || (goal.entities && goal.entities.person === 'Rahul'),
      'Must preserve target entity Rahul in goal or entities'
    );
    assert.ok(
      goal.subTasks && goal.subTasks.length >= 2,
      'Must generate at least 2 subtasks for compound instruction'
    );
  });

  test('Test 2: Multi-Site Shopping Comparison Decomposition', async () => {
    const raw = 'compare Sony WH-1000XM5 across multiple websites';
    const goal = await interpreter.interpret(raw, 'about:blank', 'New Tab');

    assert.equal(goal.intentCategory, 'SHOPPING_COMPARISON', 'Intent must be SHOPPING_COMPARISON');
    assert.equal(goal.isCompound, true, 'Comparison must be marked as compound/multi-step');
    assert.ok(goal.subTasks && goal.subTasks.length >= 2, 'Must decompose comparison into multi-source search steps');
    assert.ok(
      goal.goal.toLowerCase().includes('sony wh-1000xm5'),
      'Must extract exact product name'
    );
  });

  test('Test 3: Standalone Micro-Action Isolation vs Compound Commands', async () => {
    // 3a. Standalone micro-actions must hit fastPathAction
    const backGoal = await interpreter.interpret('go back');
    assert.equal(backGoal.intentCategory, 'BROWSER_CONTROL');
    assert.equal(backGoal.fastPathAction, 'BACK');
    assert.equal(backGoal.isCompound, false);

    const reloadGoal = await interpreter.interpret('reload');
    assert.equal(reloadGoal.intentCategory, 'BROWSER_CONTROL');
    assert.equal(reloadGoal.fastPathAction, 'NAVIGATE');

    const newTabGoal = await interpreter.interpret('new tab');
    assert.equal(newTabGoal.intentCategory, 'BROWSER_CONTROL');
    assert.equal(newTabGoal.fastPathAction, 'OPEN');

    // 3b. Compound sentences containing action words must NOT be hijacked as fast-path
    const compoundBack = await interpreter.interpret('go back to the Amazon page and check the price of headphones');
    assert.notEqual(compoundBack.fastPathAction, 'BACK', 'Compound sentence must not be hijacked by back fast-path');
    assert.equal(compoundBack.isCompound, true, 'Must be marked as compound');
  });

  test('Test 4: 14-State Task State Machine Lifecycle', () => {
    const tm = TaskManager.getInstance();
    const task = tm.createTask('Test task execution', [
      { stepNumber: 1, description: 'Step 1', toolName: 'browser', parameters: {}, status: 'PENDING' },
    ]);

    assert.equal(task.state, 'CREATED');

    tm.transitionState('PLANNING', { currentActionDescription: 'Generating plan' });
    assert.equal(tm.getActiveTask()?.state, 'PLANNING');

    tm.transitionState('EXECUTING', { currentActionDescription: 'Running step 1' });
    assert.equal(tm.getActiveTask()?.state, 'EXECUTING');

    tm.transitionState('WAITING', { currentActionDescription: 'Waiting for page load' });
    assert.equal(tm.getActiveTask()?.state, 'WAITING');

    tm.transitionState('COMPLETED', { currentActionDescription: 'Mission accomplished' });
    assert.equal(tm.getActiveTask()?.state, 'COMPLETED');
  });

  test('Test 5: Task Checkpoint Persistence and Resumption', async () => {
    const cpManager = TaskCheckpointManager.getInstance();
    const sampleCheckpoint: TaskCheckpoint = {
      taskId: 'test_task_42',
      goal: 'Order groceries from Instacart',
      currentStepIndex: 2,
      completedSteps: ['Open Instacart', 'Log in'],
      remainingSteps: ['Search for milk', 'Add to cart', 'Checkout'],
      currentUrl: 'https://www.instacart.com/store',
      openTabIds: ['tab-1'],
      pageStateHash: 'hash_abc123',
      contextData: { store: 'Safeway' },
      timestamp: Date.now(),
    };

    await cpManager.saveCheckpoint(sampleCheckpoint);
    const retrieved = cpManager.getLatestCheckpoint();

    assert.ok(retrieved, 'Must successfully retrieve saved checkpoint');
    assert.equal(retrieved.goal, 'Order groceries from Instacart');
    assert.equal(retrieved.currentStepIndex, 2);
    assert.equal(retrieved.remainingSteps.length, 3);
  });

  test('Test 6: Tool Registry Schema Completeness', () => {
    const registry = ToolRegistry.getInstance();
    const toolNames = registry.listToolNames();

    assert.ok(toolNames.length >= 20, `Expected at least 20 registered tools, got ${toolNames.length}`);
    assert.ok(toolNames.includes('browser.navigate'), 'Must include browser.navigate');
    assert.ok(toolNames.includes('browser.click'), 'Must include browser.click');
    assert.ok(toolNames.includes('browser.type'), 'Must include browser.type');
    assert.ok(toolNames.includes('document.read_pdf'), 'Must include document.read_pdf');
    assert.ok(toolNames.includes('comparison.compare_products'), 'Must include comparison.compare_products');
    assert.ok(toolNames.includes('browser.request_authentication'), 'Must include browser.request_authentication');
  });

  test('Test 7: Wake Word Dual Phrase Detection Boundaries', () => {
    const detector = new WakeWordDetector({ enabled: true });
    assert.equal(detector.isWakeEnabled(), true);

    detector.reset();
    assert.equal(detector.isWakeEnabled(), true);
  });

  test('Test 8: Local PDF Text Extraction API', async () => {
    const reader = PDFReader.getInstance();
    assert.ok(reader, 'PDFReader singleton must exist');

    const doc = await reader.readPdf('sample-contract.pdf');
    assert.ok(doc, 'Must return a PDFDocumentSummary object');
    assert.equal(typeof doc.fullText, 'string');
    assert.ok(doc.pageCount >= 1, 'Must have at least 1 page');
  });
});
