import { describe, it } from 'node:test';
import assert from 'node:assert';
import { DeterministicPolicyEngine } from '../src/engine.js';
import { PolicyContext } from '../../core-types/src/index.js';

describe('DeterministicPolicyEngine Unit Tests', () => {
  const engine = new DeterministicPolicyEngine();

  const defaultContext: PolicyContext = {
    profileId: 'profile-personal-1',
    isAutonomousMission: false,
    dailyCloudSpendCapUSD: 0,
    currentCloudSpendUSD: 0,
  };

  it('should allow read-only page inspection', () => {
    const decision = engine.evaluateAction(
      'READ_PAGE',
      'read_page_content',
      { tabId: 1 },
      defaultContext
    );
    assert.strictEqual(decision.allowed, true);
    assert.strictEqual(decision.requiresApproval, false);
    assert.strictEqual(decision.requiresTakeover, false);
  });

  it('should block arbitrary JavaScript execution', () => {
    const decision = engine.evaluateAction(
      'READ_PAGE',
      'execute_arbitrary_js',
      { script: 'alert(1)' },
      defaultContext
    );
    assert.strictEqual(decision.allowed, false);
    assert.strictEqual(decision.requiresTakeover, true);
  });

  it('should enforce user takeover for authentication & payments', () => {
    const decision = engine.evaluateAction(
      'AUTHENTICATION',
      'submit_passkey',
      {},
      defaultContext
    );
    assert.strictEqual(decision.allowed, false);
    assert.strictEqual(decision.requiresTakeover, true);
  });

  it('should require user approval for form submission', () => {
    const decision = engine.evaluateAction(
      'FORM_SUBMIT',
      'submit_contact_form',
      { name: 'John Doe' },
      defaultContext
    );
    assert.strictEqual(decision.allowed, true);
    assert.strictEqual(decision.requiresApproval, true);
  });

  it('should block tools outside autonomous mission allowlist', () => {
    const missionContext: PolicyContext = {
      ...defaultContext,
      isAutonomousMission: true,
      missionAllowedTools: ['read_calendar', 'summarize_email'],
    };

    const decision = engine.evaluateAction(
      'SEND_COMMUNICATION',
      'send_email',
      { recipient: 'john@example.com' },
      missionContext
    );
    assert.strictEqual(decision.allowed, false);
    assert.strictEqual(decision.reason.includes('not in the explicit allowlist'), true);
  });
});
