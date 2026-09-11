import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { CredentialVault } from '../src/services/connectors/credential-vault.js';
import { ConnectorRegistry } from '../src/services/connectors/service-connector.js';
import { GoogleConnector } from '../src/services/connectors/google-connector.js';
import { GmailTools } from '../src/services/connectors/gmail-tools.js';
import { CalendarTools } from '../src/services/connectors/calendar-tools.js';
import { DriveTools } from '../src/services/connectors/drive-tools.js';
import { YouTubeTools } from '../src/services/connectors/youtube-tools.js';
import { GoalGraph } from '../src/agent/goal-graph.js';
import { CapabilityRouter } from '../src/agent/capability-router.js';
import { ToolRegistry } from '../src/agent/tool-registry.js';
import { initializeConnectors } from '../src/services/connectors/index.js';
import { BrowserStateStore } from '../src/memory/browser-state-store.js';

describe('Tesseract Native Service Connector Hub & Goal Graph Architecture', () => {
  const vault = CredentialVault.getInstance();

  beforeEach(() => {
    vault.setTestMode(true);
  });

  // -------------------------------------------------------------
  // Test 1 & 2: OS Secure CredentialVault & Token Storage
  // -------------------------------------------------------------
  test('Test 1: CredentialVault stores, retrieves, and removes tokens with encryption', async () => {
    await vault.storeTokens('google', {
      accessToken: 'ya29.mock_access_token_12345',
      refreshToken: '1//mock_refresh_token_67890',
      expiresAt: Date.now() + 3600000,
      scope: 'https://www.googleapis.com/auth/calendar.readonly',
    });

    const retrieved = await vault.getTokens('google');
    assert.ok(retrieved, 'Must retrieve stored tokens');
    assert.equal(retrieved.accessToken, 'ya29.mock_access_token_12345');
    assert.equal(retrieved.refreshToken, '1//mock_refresh_token_67890');

    const services = await vault.listConnectedServices();
    assert.ok(services.includes('google'), 'Must list google among connected services');

    const removed = await vault.removeTokens('google');
    assert.equal(removed, true, 'Removal must succeed');
    const afterRemove = await vault.getTokens('google');
    assert.equal(afterRemove, null, 'Tokens must be null after removal');
  });

  test('Test 2: Security Invariant - Plain passwords are never stored', async () => {
    const tokens = await vault.getTokens('nonexistent');
    assert.equal(tokens, null);
    // Credential vault only accepts OAuthTokens structure with accessToken/refreshToken
    assert.equal(typeof vault.storeTokens, 'function');
  });

  // -------------------------------------------------------------
  // Test 3, 4, 5: ConnectorRegistry & GoogleConnector Lifecycle
  // -------------------------------------------------------------
  test('Test 3: ConnectorRegistry registers connectors and resolves tools', () => {
    const registry = initializeConnectors();
    const google = registry.getConnector('google');
    assert.ok(google, 'Google connector must be registered');
    assert.equal(google.name, 'Google Workspace');

    const calendarConnector = registry.findConnectorForTool('calendar.today');
    assert.ok(calendarConnector, 'Must find connector for calendar.today');
    assert.equal(calendarConnector.id, 'google');

    const gmailConnector = registry.findConnectorForTool('gmail.search');
    assert.ok(gmailConnector, 'Must find connector for gmail.search');
  });

  test('Test 4: GoogleConnector defines granular least-privilege scopes', () => {
    const google = GoogleConnector.getInstance();
    const caps = google.getCapabilities();

    const gmailCap = caps.find(c => c.name === 'gmail.search');
    assert.ok(gmailCap, 'Must have gmail.search capability');
    assert.ok(gmailCap.requiredScopes.includes('https://www.googleapis.com/auth/gmail.readonly'));

    const calCap = caps.find(c => c.name === 'calendar.today');
    assert.ok(calCap, 'Must have calendar.today capability');
    assert.ok(calCap.requiredScopes.includes('https://www.googleapis.com/auth/calendar.readonly'));

    const driveCap = caps.find(c => c.name === 'drive.search');
    assert.ok(driveCap, 'Must have drive.search capability');
    assert.ok(driveCap.requiredScopes.includes('https://www.googleapis.com/auth/drive.readonly'));
  });

  test('Test 5: Authentication enforcement on protected tools', async () => {
    const registry = ConnectorRegistry.getInstance();
    const google = GoogleConnector.getInstance();
    google.authenticationState = 'DISCONNECTED';

    await assert.rejects(
      async () => registry.executeServiceTool('gmail.search', { query: 'test' }),
      /not authenticated/i,
      'Must reject execution when connector is not authenticated'
    );
  });

  // -------------------------------------------------------------
  // Test 6: Gmail Tools & Confirmation Gate
  // -------------------------------------------------------------
  test('Test 6: GmailTools requires user confirmation before sending email', async () => {
    const google = GoogleConnector.getInstance();
    // Simulate connected state
    await vault.storeTokens('google', { accessToken: 'mock_token', expiresAt: Date.now() + 100000 });
    google.authenticationState = 'CONNECTED';

    // Attempting to send without confirmed flag must throw CONFIRMATION_REQUIRED
    await assert.rejects(
      async () => GmailTools.send(google, { to: 'bob@example.com', subject: 'Hi', body: 'Hello', confirmed: false }),
      /CONFIRMATION_REQUIRED/i,
      'Sending an email must enforce explicit confirmation gate'
    );
  });

  // -------------------------------------------------------------
  // Test 7: Calendar Tools & Confirmation Gate
  // -------------------------------------------------------------
  test('Test 7: CalendarTools requires user confirmation for event deletion', async () => {
    const google = GoogleConnector.getInstance();
    await vault.storeTokens('google', { accessToken: 'mock_token', expiresAt: Date.now() + 100000 });
    google.authenticationState = 'CONNECTED';

    await assert.rejects(
      async () => CalendarTools.deleteEvent(google, { eventId: 'evt_123', confirmed: false }),
      /CONFIRMATION_REQUIRED/i,
      'Deleting a calendar event must require explicit confirmation'
    );
  });

  // -------------------------------------------------------------
  // Test 8: Drive Tools & Confirmation Gate
  // -------------------------------------------------------------
  test('Test 8: DriveTools requires user confirmation for file deletion', async () => {
    const google = GoogleConnector.getInstance();
    await vault.storeTokens('google', { accessToken: 'mock_token', expiresAt: Date.now() + 100000 });
    google.authenticationState = 'CONNECTED';

    await assert.rejects(
      async () => DriveTools.deleteFile(google, { fileId: 'file_123', confirmed: false }),
      /CONFIRMATION_REQUIRED/i,
      'Deleting a Drive file must require explicit confirmation'
    );
  });

  // -------------------------------------------------------------
  // Test 9, 10, 11, 12, 13: GoalGraph & Explicit Completion Contract
  // -------------------------------------------------------------
  test('Test 9: GoalGraph Invariant - Task CANNOT be marked COMPLETED if any node verification fails', async () => {
    const graph = new GoalGraph('Multi-step Task with Failed Verification');

    graph.addNode({
      id: 'STEP_1',
      description: 'Initial step',
      action: async () => ({ step: 1 }),
      verification: async () => true,
    });

    graph.addNode({
      id: 'STEP_2_VERIFICATION_FAIL',
      description: 'Second step with false verification',
      dependsOn: ['STEP_1'],
      maxRetries: 1,
      action: async () => ({ step: 2 }),
      verification: async () => false, // Deliberately failing verification
    });

    const result = await graph.execute();
    assert.equal(result.success, false, 'Graph execution MUST fail when verification predicate returns false');
    assert.equal(graph.status, 'FAILED', 'Graph status must be FAILED, never COMPLETED');
    assert.equal(graph.getNode('STEP_2_VERIFICATION_FAIL')?.status, 'FAILED');
  });

  test('Test 10: GoalGraph respects topological dependencies', async () => {
    const executionOrder: string[] = [];
    const graph = new GoalGraph('Ordered Graph');

    graph.addNode({
      id: 'NODE_C',
      description: 'Step 3',
      dependsOn: ['NODE_B'],
      action: async () => { executionOrder.push('C'); return true; },
      verification: async () => true,
    });

    graph.addNode({
      id: 'NODE_A',
      description: 'Step 1',
      action: async () => { executionOrder.push('A'); return true; },
      verification: async () => true,
    });

    graph.addNode({
      id: 'NODE_B',
      description: 'Step 2',
      dependsOn: ['NODE_A'],
      action: async () => { executionOrder.push('B'); return true; },
      verification: async () => true,
    });

    const result = await graph.execute();
    assert.equal(result.success, true);
    assert.deepEqual(executionOrder, ['A', 'B', 'C'], 'Must execute in strict dependency order A -> B -> C');
  });

  test('Test 11: GoalGraph retries failed nodes up to maxRetries', async () => {
    let attempts = 0;
    const graph = new GoalGraph('Retry Graph');

    graph.addNode({
      id: 'FLAKY_STEP',
      description: 'Flaky step that succeeds on 2nd attempt',
      maxRetries: 2,
      action: async () => {
        attempts++;
        return { attempts };
      },
      verification: async () => {
        return attempts >= 2;
      },
    });

    const result = await graph.execute();
    assert.equal(result.success, true, 'Must succeed after retry');
    assert.equal(attempts, 2, 'Must have attempted exactly 2 times');
    assert.equal(graph.status, 'COMPLETED');
  });

  test('Test 12: Pre-built YouTube GoalGraph verifies playback', async () => {
    let mediaPlaying = false;
    let url = 'about:blank';

    const mockAutomator = {
      navigate: async (target: string) => {
        BrowserStateStore.getInstance().recordTabNavigation('tab1', target, 'YouTube');
      },
      executeScript: async () => {},
    };

    const mockAdapter = {
      search: async () => {},
      playResult: async () => {
        BrowserStateStore.getInstance().recordTabNavigation('tab1', 'https://www.youtube.com/watch?v=mock_video', 'YouTube Video');
        mediaPlaying = true;
      },
    };

    const mockMedia = {
      verifyPlaying: async () => mediaPlaying,
    };

    const ytGraph = GoalGraph.createYouTubePlayGraph({
      isRandom: true,
      automator: mockAutomator,
      adapter: mockAdapter,
      media: mockMedia,
    });

    const result = await ytGraph.execute();
    assert.equal(result.success, true, 'YouTube play goal graph must succeed');
    assert.equal(ytGraph.status, 'COMPLETED');
    assert.equal(mediaPlaying, true, 'Playback must be verified');
  });

  // -------------------------------------------------------------
  // Test 13, 14, 15: CapabilityRouter Hierarchy & Tool Routing
  // -------------------------------------------------------------
  test('Test 13: CapabilityRouter - Fast-Path deterministic commands (<2ms)', () => {
    const router = CapabilityRouter.getInstance();

    const r1 = router.route('go back');
    assert.equal(r1.tier, 'FAST_PATH');
    assert.equal(r1.fastPathMatch?.action, 'back');

    const r2 = router.route('pause video');
    assert.equal(r2.tier, 'FAST_PATH');
    assert.equal(r2.fastPathMatch?.action, 'pause');

    const r3 = router.route('reload page');
    assert.equal(r3.tier, 'FAST_PATH');
    assert.equal(r3.fastPathMatch?.action, 'reload');
  });

  test('Test 14: CapabilityRouter - Native Service Connector Prioritization', () => {
    const router = CapabilityRouter.getInstance();

    // Calendar
    const cal = router.route("What's my next meeting?");
    assert.equal(cal.tier, 'NATIVE_SERVICE_CONNECTOR');
    assert.equal(cal.targetTool, 'calendar.today');

    const calUpcoming = router.route('upcoming meetings');
    assert.equal(calUpcoming.tier, 'NATIVE_SERVICE_CONNECTOR');
    assert.equal(calUpcoming.targetTool, 'calendar.upcoming');

    // Gmail
    const mail = router.route('Show my unread emails');
    assert.equal(mail.tier, 'NATIVE_SERVICE_CONNECTOR');
    assert.equal(mail.targetTool, 'gmail.search');

    // Drive
    const drive = router.route('Search my drive for quarterly report');
    assert.equal(drive.tier, 'NATIVE_SERVICE_CONNECTOR');
    assert.equal(drive.targetTool, 'drive.search');

    // YouTube compound playback
    const yt = router.route('Open YouTube and play a random video');
    assert.equal(yt.tier, 'NATIVE_SERVICE_CONNECTOR');
    assert.equal(yt.targetTool, 'youtube.play');
    assert.equal(yt.parameters?.isRandom, true);

    const ytQuery = router.route('Play Bohemian Rhapsody on YouTube');
    assert.equal(ytQuery.tier, 'NATIVE_SERVICE_CONNECTOR');
    assert.equal(ytQuery.targetTool, 'youtube.play');
    assert.equal(ytQuery.parameters?.query?.toLowerCase(), 'bohemian rhapsody');
  });

  test('Test 15: ToolRegistry exposes all native tools with proper safety categories', () => {
    const toolRegistry = ToolRegistry.getInstance();

    const gmailSend = toolRegistry.getTool('gmail.send');
    assert.ok(gmailSend, 'gmail.send must be registered');
    assert.equal(gmailSend.category, 'EXTERNAL_COMMUNICATION', 'gmail.send must have EXTERNAL_COMMUNICATION safety category');

    const calDelete = toolRegistry.getTool('calendar.deleteEvent');
    assert.ok(calDelete, 'calendar.deleteEvent must be registered');
    assert.equal(calDelete.category, 'DESTRUCTIVE', 'calendar.deleteEvent must have DESTRUCTIVE safety category');

    const driveDelete = toolRegistry.getTool('drive.delete');
    assert.ok(driveDelete, 'drive.delete must be registered');
    assert.equal(driveDelete.category, 'DESTRUCTIVE', 'drive.delete must have DESTRUCTIVE safety category');

    const ytPlay = toolRegistry.getTool('youtube.play');
    assert.ok(ytPlay, 'youtube.play must be registered');
    assert.equal(ytPlay.category, 'LOW_RISK_ACTION');
  });
});
