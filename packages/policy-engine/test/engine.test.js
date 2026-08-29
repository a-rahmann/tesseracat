"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const engine_js_1 = require("../src/engine.js");
(0, node_test_1.describe)('DeterministicPolicyEngine Unit Tests', () => {
    const engine = new engine_js_1.DeterministicPolicyEngine();
    const defaultContext = {
        profileId: 'profile-personal-1',
        isAutonomousMission: false,
        dailyCloudSpendCapUSD: 0,
        currentCloudSpendUSD: 0,
    };
    (0, node_test_1.it)('should allow read-only page inspection', () => {
        const decision = engine.evaluateAction('READ_PAGE', 'read_page_content', { tabId: 1 }, defaultContext);
        node_assert_1.default.strictEqual(decision.allowed, true);
        node_assert_1.default.strictEqual(decision.requiresApproval, false);
        node_assert_1.default.strictEqual(decision.requiresTakeover, false);
    });
    (0, node_test_1.it)('should block arbitrary JavaScript execution', () => {
        const decision = engine.evaluateAction('READ_PAGE', 'execute_arbitrary_js', { script: 'alert(1)' }, defaultContext);
        node_assert_1.default.strictEqual(decision.allowed, false);
        node_assert_1.default.strictEqual(decision.requiresTakeover, true);
    });
    (0, node_test_1.it)('should enforce user takeover for authentication & payments', () => {
        const decision = engine.evaluateAction('AUTHENTICATION', 'submit_passkey', {}, defaultContext);
        node_assert_1.default.strictEqual(decision.allowed, false);
        node_assert_1.default.strictEqual(decision.requiresTakeover, true);
    });
    (0, node_test_1.it)('should require user approval for form submission', () => {
        const decision = engine.evaluateAction('FORM_SUBMIT', 'submit_contact_form', { name: 'John Doe' }, defaultContext);
        node_assert_1.default.strictEqual(decision.allowed, true);
        node_assert_1.default.strictEqual(decision.requiresApproval, true);
    });
    (0, node_test_1.it)('should block tools outside autonomous mission allowlist', () => {
        const missionContext = {
            ...defaultContext,
            isAutonomousMission: true,
            missionAllowedTools: ['read_calendar', 'summarize_email'],
        };
        const decision = engine.evaluateAction('SEND_COMMUNICATION', 'send_email', { recipient: 'john@example.com' }, missionContext);
        node_assert_1.default.strictEqual(decision.allowed, false);
        node_assert_1.default.strictEqual(decision.reason.includes('not in the explicit allowlist'), true);
    });
});
//# sourceMappingURL=engine.test.js.map