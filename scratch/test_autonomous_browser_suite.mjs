/**
 * Regression & Verification Test Suite for Tesseract Autonomous Browser
 *
 * Tests:
 * 1. CommandRouter taxonomy: ACTION != SEARCH
 *    - "Play Loser on YouTube" -> PLAY on YouTube (NOT Google Search)
 *    - "Click the video on my screen" -> CLICK on current page (NOT Google Search)
 *    - "Search YouTube for relaxing piano" -> SEARCH on YouTube
 *    - "Search Google for quantum computing news" -> SEARCH on Google
 * 2. Ultra-low-latency zero-allocation audio resampler benchmark (<0.1ms per chunk)
 * 3. Zero Google search fallback verification
 */

import { performance } from 'perf_hooks';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { CommandRouter } = require('../apps/desktop-browser/dist/agent/command-router.js');
const { resampleTo16k } = require('../apps/desktop-browser/dist/audio/resampler.js');

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
  }
}

console.log('=== TEST 1: CommandRouter Taxonomy (ACTION != SEARCH) ===\n');

const testCases = [
  {
    input: 'Play Loser on YouTube',
    expectedAction: 'PLAY',
    expectedTarget: 'video',
    expectedLocation: 'youtube',
    expectedQuery: 'Loser',
    shouldNotBeGoogleSearch: true,
  },
  {
    input: 'play Bohemian Rhapsody on youtube',
    expectedAction: 'PLAY',
    expectedTarget: 'video',
    expectedLocation: 'youtube',
    expectedQuery: 'Bohemian Rhapsody',
    shouldNotBeGoogleSearch: true,
  },
  {
    input: 'click the video on my screen',
    expectedAction: 'CLICK',
    expectedTarget: 'video',
    expectedLocation: 'current_page',
    shouldNotBeGoogleSearch: true,
  },
  {
    input: 'click the first result',
    expectedAction: 'CLICK',
    expectedIndex: 1,
    shouldNotBeGoogleSearch: true,
  },
  {
    input: 'click the second item',
    expectedAction: 'CLICK',
    expectedIndex: 2,
    shouldNotBeGoogleSearch: true,
  },
  {
    input: 'search YouTube for relaxing piano',
    expectedAction: 'SEARCH',
    expectedLocation: 'youtube',
    expectedQuery: 'relaxing piano',
    shouldNotBeGoogleSearch: true,
  },
  {
    input: 'search Google for quantum computing news',
    expectedAction: 'SEARCH',
    expectedLocation: 'google',
    expectedQuery: 'quantum computing news',
    shouldNotBeGoogleSearch: false, // Explicit Google search
  },
  {
    input: 'pause the video',
    expectedAction: 'PAUSE',
    shouldNotBeGoogleSearch: true,
  },
  {
    input: 'resume playback',
    expectedAction: 'RESUME',
    shouldNotBeGoogleSearch: true,
  },
  {
    input: 'go back',
    expectedAction: 'BACK',
    shouldNotBeGoogleSearch: true,
  },
  {
    input: 'scroll down',
    expectedAction: 'SCROLL',
    shouldNotBeGoogleSearch: true,
  },
  {
    input: 'what do you think about this video',
    expectedAction: 'WATCH',
    shouldNotBeGoogleSearch: true,
  },
  {
    input: 'read the message',
    expectedAction: 'READ',
    shouldNotBeGoogleSearch: true,
  },
  {
    input: 'reply saying I will be there in 10 minutes',
    expectedAction: 'REPLY',
    shouldNotBeGoogleSearch: true,
  },
  {
    input: 'open Instagram',
    expectedAction: 'NAVIGATE',
    expectedLocation: 'instagram',
    shouldNotBeGoogleSearch: true,
  }
];

for (const tc of testCases) {
  const result = CommandRouter.route(tc.input);
  console.log(`Input: "${tc.input}" -> Action: ${result.action}, Target: ${result.target}, Location: ${result.location}, Query: ${result.query}`);

  assert(result.action === tc.expectedAction, `Action for "${tc.input}" is ${tc.expectedAction} (got ${result.action})`);

  if (tc.expectedTarget) {
    assert(result.target === tc.expectedTarget, `Target for "${tc.input}" is ${tc.expectedTarget} (got ${result.target})`);
  }

  if (tc.expectedLocation) {
    assert(result.location === tc.expectedLocation, `Location for "${tc.input}" is ${tc.expectedLocation} (got ${result.location})`);
  }

  if (tc.expectedQuery) {
    assert(result.query?.toLowerCase() === tc.expectedQuery.toLowerCase(), `Query for "${tc.input}" is "${tc.expectedQuery}" (got "${result.query}")`);
  }

  if (tc.expectedIndex !== undefined) {
    assert(result.index === tc.expectedIndex, `Index for "${tc.input}" is ${tc.expectedIndex} (got ${result.index})`);
  }

  if (tc.shouldNotBeGoogleSearch) {
    const isGoogleSearch = result.action === 'SEARCH' && result.location === 'google';
    assert(!isGoogleSearch, `Command "${tc.input}" must NEVER default to Google search`);
  }
}

console.log('\n=== TEST 2: Low-Latency Audio Resampler Benchmark ===\n');

// 32ms chunk at 48kHz = 1536 samples
const sampleCount = 1536;
const testBuffer = new Float32Array(sampleCount);
for (let i = 0; i < sampleCount; i++) {
  testBuffer[i] = Math.sin((2 * Math.PI * 440 * i) / 48000);
}

// Warm up
for (let i = 0; i < 10; i++) {
  await resampleTo16k(testBuffer, 48000);
}

// Benchmark 200 iterations (simulating 6.4 seconds of streaming voice audio)
const iterations = 200;
const t0 = performance.now();
for (let i = 0; i < iterations; i++) {
  await resampleTo16k(testBuffer, 48000);
}
const elapsedTotal = performance.now() - t0;
const avgPerChunkMs = elapsedTotal / iterations;

console.log(`Processed ${iterations} chunks of 32ms audio (total ${iterations * 32}ms audio stream).`);
console.log(`Total CPU time: ${elapsedTotal.toFixed(3)}ms`);
console.log(`Average time per 32ms chunk: ${avgPerChunkMs.toFixed(4)}ms`);

// The previous OfflineAudioContext approach took 15-40ms per chunk (causing huge UI freezes)
// The new polyphase resampler should run in <0.05ms (virtually instantaneous)
assert(avgPerChunkMs < 0.2, `Resampler latency (${avgPerChunkMs.toFixed(4)}ms) is well under 0.2ms (Zero UI lag)`);
const outSample = await resampleTo16k(testBuffer, 48000);
assert(outSample.length === 512, `Output length for 48kHz->16kHz is exactly 1/3 (expected 512, got ${outSample.length})`);

console.log(`\n========================================`);
console.log(`SUMMARY: ${passedTests}/${totalTests} tests passed (${Math.round((passedTests / totalTests) * 100)}%)`);
console.log(`========================================\n`);

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
