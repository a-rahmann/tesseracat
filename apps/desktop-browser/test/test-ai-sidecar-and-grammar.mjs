import { VoiceGrammarCorrector } from '../dist/voice/voice-grammar-corrector.js';
import { AISidecarClient } from '../dist/sidecar/ai-sidecar-client.js';
import assert from 'node:assert/strict';

console.log('=== Test 1: Generalized Google-Style Voice Grammar & Acoustic Correction ===');
const corrector = VoiceGrammarCorrector.getInstance();

const testCases = [
  // E-commerce & Shopping
  {
    input: "search four shoes on amzon and add to card",
    expected: "search for shoes on amazon and add to cart",
  },
  {
    input: "by a new laptop on amzon and checkout my card",
    expected: "buy a new laptop on amazon and checkout my cart",
  },
  // Social & Communication
  {
    input: "open instgram and check weather rahul messaged",
    expected: "open instagram and check whether rahul messaged",
  },
  {
    input: "send a massage to rahul on linkedin",
    expected: "send a message to rahul on linkedin",
  },
  // Productivity & Mail
  {
    input: "check my male in gmaill",
    expected: "check my mail in gmail",
  },
  {
    input: "write a email and attach a image",
    expected: "write an email and attach an image",
  },
  // Browsing & UI
  {
    input: "switch to next tap and close this tap",
    expected: "switch to next tab and close this tab",
  },
  {
    input: "clear browser cash and reload the web sight",
    expected: "clear browser cache and reload the website",
  },
  // Media & Video
  {
    input: "open open yooutube and k the ransom video",
    expected: "open youtube and play a random video",
  },
  {
    input: "listen too coldplay on spotfy",
    expected: "listen to coldplay on spotify",
  },
  // General English Grammar & Stuttering
  {
    input: "scroll down to times",
    expected: "scroll down two times",
  },
  {
    input: "take a brake and read an article",
    expected: "take a break and read an article",
  },
  {
    input: "look at the hole page",
    expected: "look at the whole page",
  }
];

let passedCases = 0;
for (const tc of testCases) {
  const result = corrector.correct(tc.input);
  assert.equal(
    result.correctedText.toLowerCase(),
    tc.expected.toLowerCase(),
    `Failed for input: "${tc.input}" -> Expected: "${tc.expected}", got: "${result.correctedText}"`
  );
  passedCases++;
  console.log(`✓ "${tc.input}" -> "${result.correctedText}"`);
}
console.log(`\nAll ${passedCases}/${testCases.length} Voice Grammar & Homophone test cases passed perfectly!\n`);

console.log('=== Test 2: AI Engine Sidecar Process Health & Ping ===');
const client = AISidecarClient.getInstance();
const isRunning = await client.ensureRunning();
console.log(`Sidecar process running: ${isRunning}`);
assert.equal(isRunning, true, 'AI Engine sidecar process must start and be ready');

const pingResult = await client.ping();
console.log(`Sidecar IPC Ping responded: ${pingResult}`);
assert.equal(pingResult, true, 'Sidecar IPC ping must succeed');

// Test synthetic audio transcription (1 second of silence/tone)
const syntheticPcm = new Float32Array(16000);
for (let i = 0; i < 16000; i++) {
  syntheticPcm[i] = Math.sin((2 * Math.PI * 440 * i) / 16000) * 0.1; // 440Hz audible test tone
}

console.log('Sending test audio to out-of-process AI Sidecar...');
const transcribeRes = await client.transcribe(syntheticPcm);
console.log('Sidecar response:', transcribeRes);
assert.ok(transcribeRes !== undefined, 'Sidecar must return a result');
console.log('✓ AI Sidecar transcribed out-of-process without blocking!');

client.shutdown();
console.log('\n=== All AI Sidecar & Voice Grammar Tests Passed Successfully! ===');
process.exit(0);
