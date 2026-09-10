import { NaturalLanguageInterpreter } from '../apps/desktop-browser/dist/agent/natural-language-interpreter.js';
import { ContextManager } from '../apps/desktop-browser/dist/memory/context-manager.js';
import { AgentRuntime } from '../apps/desktop-browser/dist/agent/agent-runtime.js';

async function runTests() {
  console.log('╔═════════════════════════════════════════════════════════════════════╗');
  console.log('║        TESTING EFFICIENCY, MEDIA CONTROLS & CHAIN MEMORY            ║');
  console.log('╚═════════════════════════════════════════════════════════════════════╝\n');

  const interpreter = NaturalLanguageInterpreter.getInstance();
  const contextMgr = ContextManager.getInstance();
  const runtime = AgentRuntime.getInstance();

  let passed = 0;
  let total = 0;

  function assert(condition, name, details = '') {
    total++;
    if (condition) {
      console.log(`  ✔ [PASS] ${name} ${details ? `(${details})` : ''}`);
      passed++;
    } else {
      console.error(`  ✖ [FAIL] ${name} ${details ? `(${details})` : ''}`);
    }
  }

  // TEST 1: Media Fast Paths (Pause / Resume)
  console.log('\n--- 1. Testing Sub-millisecond Media Controls (Pause / Resume) ---');
  {
    const pauseCmds = ['pause', 'pause video', 'pause the video', 'freeze', 'hold'];
    for (const cmd of pauseCmds) {
      const t0 = performance.now();
      const goal = await interpreter.interpret(cmd);
      const elapsed = performance.now() - t0;
      assert(
        goal.fastPathAction === 'PAUSE' && goal.isFastPath === true,
        `Pause Command: "${cmd}"`,
        `${elapsed.toFixed(2)}ms`
      );
    }

    const resumeCmds = ['resume', 'resume video', 'unpause', 'continue playing', 'play'];
    for (const cmd of resumeCmds) {
      const t0 = performance.now();
      const goal = await interpreter.interpret(cmd);
      const elapsed = performance.now() - t0;
      assert(
        goal.fastPathAction === 'RESUME' && goal.isFastPath === true,
        `Resume Command: "${cmd}"`,
        `${elapsed.toFixed(2)}ms`
      );
    }
  }

  // TEST 2: YouTube and YouTube Music Playback
  console.log('\n--- 2. Testing YouTube & YouTube Music Playback Fast Paths ---');
  {
    const ytCmds = [
      { cmd: 'play Lose Yourself on YouTube', expectedQuery: 'Lose Yourself', expectedPlatform: 'YouTube' },
      { cmd: 'play a video on youtube', expectedQuery: 'popular', expectedPlatform: 'YouTube' },
      { cmd: 'play Starboy on YouTube Music', expectedQuery: 'Starboy', expectedPlatform: 'YouTube Music' },
      { cmd: 'can you please play Kon and Grey on youtube', expectedQuery: 'Kon and Grey', expectedPlatform: 'YouTube' },
      { cmd: 'i want you to play Bohemian Rhapsody', expectedQuery: 'Bohemian Rhapsody', expectedPlatform: 'YouTube' },
    ];

    for (const item of ytCmds) {
      const t0 = performance.now();
      const goal = await interpreter.interpret(item.cmd);
      const elapsed = performance.now() - t0;
      assert(
        goal.fastPathAction === 'PLAY' &&
        goal.isFastPath === true &&
        goal.entities.platform === item.expectedPlatform &&
        goal.entities.query.toLowerCase() === item.expectedQuery.toLowerCase(),
        `Play Command: "${item.cmd}"`,
        `${elapsed.toFixed(2)}ms, platform=${goal.entities.platform}, query="${goal.entities.query}"`
      );
    }
  }

  // TEST 3: Relative Ordinals & Chain Memory Resolution
  console.log('\n--- 3. Testing Relative Ordinals & Chain Memory Resolution ---');
  {
    // Simulate active YouTube state
    contextMgr.updateContext({ activeUrl: 'https://www.youtube.com/results?search_query=Lose+Yourself' });
    contextMgr.recordChainStep({
      goal: 'Play "Lose Yourself" on YouTube',
      intentCategory: 'MEDIA_CONTROL',
      action: 'PLAY',
      platform: 'YouTube',
      query: 'Lose Yourself',
      targetUrl: 'https://www.youtube.com/results?search_query=Lose+Yourself'
    });

    const ordinalCmds = [
      { cmd: 'play the second one', expectedIdx: 2 },
      { cmd: 'play result #3', expectedIdx: 3 },
      { cmd: 'play the 1st video', expectedIdx: 1 },
      { cmd: 'play 4th result', expectedIdx: 4 },
    ];

    for (const item of ordinalCmds) {
      const t0 = performance.now();
      const goal = await interpreter.interpret(item.cmd, 'https://www.youtube.com/results?search_query=Lose+Yourself');
      const elapsed = performance.now() - t0;
      assert(
        goal.fastPathAction === 'PLAY_ORDINAL' &&
        goal.entities.index === item.expectedIdx &&
        goal.entities.platform === 'YouTube',
        `Ordinal Command: "${item.cmd}"`,
        `${elapsed.toFixed(2)}ms, index=${goal.entities.index}`
      );
    }
  }

  // TEST 4: Chain Memory Step Deduplication & Pruning
  console.log('\n--- 4. Testing Chain Memory Step Deduplication & Pruning ---');
  {
    // User says "open youtube and search for eminem" while already on YouTube
    const compoundGoal = await interpreter.interpret('open youtube and search for eminem', 'https://www.youtube.com/watch?v=123');
    assert(
      compoundGoal.intentCategory === 'MEDIA_CONTROL' && compoundGoal.entities.query === 'eminem',
      'Compound YouTube Search interpreted correctly',
      `query="${compoundGoal.entities.query}"`
    );

    // Verify optimizeAndPrune cuts redundant initial navigation if present
    const planWithRedundantNav = {
      rawUserText: 'open youtube and search for eminem',
      goal: 'Search YouTube for "eminem"',
      intentCategory: 'MEDIA_CONTROL',
      entities: { platform: 'YouTube', query: 'eminem' },
      requiresBrowser: true,
      requiresPerception: true,
      isCompound: true,
      initialPlan: [
        {
          stepNumber: 1,
          description: 'Navigate to YouTube',
          toolName: 'browser.navigate',
          parameters: { url: 'https://www.youtube.com' },
          status: 'PENDING'
        },
        {
          stepNumber: 2,
          description: 'Type eminem in search box',
          toolName: 'browser.type',
          parameters: { selector: 'input#search', text: 'eminem' },
          status: 'PENDING'
        }
      ],
      confidence: 1.0,
    };

    const pruned = contextMgr.optimizeAndPrune(planWithRedundantNav, 'https://www.youtube.com/results?search_query=test');
    assert(
      pruned.initialPlan.length === 1 &&
      pruned.initialPlan[0].toolName === 'browser.type' &&
      pruned.initialPlan[0].stepNumber === 1,
      'Pruned redundant navigation step when already on YouTube',
      `Remaining steps: ${pruned.initialPlan.length} (Step 1: ${pruned.initialPlan[0].description})`
    );
  }

  // TEST 5: Manual User Override
  console.log('\n--- 5. Testing Manual User Override ---');
  {
    // Put runtime into executing state
    runtime.updateState({ status: 'executing', currentAction: 'Autonomous mission running...', progress: 0.5 });
    assert(runtime.getState().status === 'executing', 'Runtime placed in executing state');

    // User clicks video / webview -> triggers handleUserOverride
    runtime.handleUserOverride();
    const finalState = runtime.getState();

    assert(
      finalState.status === 'idle' &&
      finalState.currentAction.includes('User override'),
      'handleUserOverride() halts execution and transitions cleanly to idle',
      `status=${finalState.status}, currentAction="${finalState.currentAction}"`
    );
  }

  console.log('\n═════════════════════════════════════════════════════════════════════');
  console.log(`BENCHMARK RESULTS: ${passed}/${total} assertions passed (${((passed / total) * 100).toFixed(1)}%)`);
  console.log('═════════════════════════════════════════════════════════════════════\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
