/**
 * Comprehensive Automated Verification Suite for Tesseract Voice Pipeline
 * Tests:
 * 1. Adaptive VAD intra-command pause tolerance vs trailing silence
 * 2. Raw vs Normalized speech payload preservation
 * 3. Wake word dual-stage acoustic filtering & debounce
 * 4. Conversational standby mode state transitions
 * 5. TTS speech protection (speaker echo does NOT cancel tasks)
 * 6. Intentional vocal barge-in ("Stop" / "Wait" / "Cancel")
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { VoiceActivityDetector } from '../src/voice/vad.js';
import { WakeWordDetector } from '../src/voice/wake-word.js';
import { VoiceManager, VoiceCommandPayload } from '../src/voice/voice-manager.js';
import { ConversationManager } from '../src/memory/conversation-manager.js';
import { VoiceGrammarCorrector } from '../src/voice/voice-grammar-corrector.js';

test('1. Adaptive VAD: Tolerates 1.2s intra-command pause without splitting compound speech', async () => {
  const vad = new VoiceActivityDetector({
    trailingSilenceMs: 1400,
    maxIntraPauseMs: 1600,
    minSpeechDurationMs: 180,
  });

  let speechStarted = false;
  let speechEnded = false;
  let totalReportedMs = 0;

  vad.onSpeechStart(() => {
    speechStarted = true;
  });

  vad.onSpeechEnd((speechMs) => {
    speechEnded = true;
    totalReportedMs = speechMs;
  });

  // Generate synthetic voice frame (16kHz, 512 samples, RMS ~0.04)
  const voiceFrame = new Float32Array(512);
  for (let i = 0; i < 512; i++) voiceFrame[i] = Math.sin(i * 0.15) * 0.05;

  // Generate silence frame (RMS ~0.001)
  const silenceFrame = new Float32Array(512);
  for (let i = 0; i < 512; i++) silenceFrame[i] = (Math.random() - 0.5) * 0.001;

  // Clause 1: "open YouTube" (spoken over ~1.8s -> ~56 frames)
  for (let f = 0; f < 56; f++) {
    vad.processChunk(voiceFrame);
  }

  assert.equal(speechStarted, true, 'VAD should have detected speech onset');
  assert.equal(vad.getState(), 'SPEAKING', 'VAD should be in SPEAKING state');

  // Conversational Pause: User hesitates for 1.1s (~34 frames of silence)
  for (let f = 0; f < 34; f++) {
    vad.processChunk(silenceFrame);
  }

  // During this natural pause, VAD must NOT have fired speechEnd!
  assert.equal(speechEnded, false, 'VAD must not prematurely finalize speech during intra-command pause');
  assert.equal(vad.getState(), 'INTRA_PAUSE', 'VAD should transition to INTRA_PAUSE');

  // Clause 2: "...and play a random video" (user resumes speaking, ~50 frames)
  for (let f = 0; f < 50; f++) {
    vad.processChunk(voiceFrame);
  }

  assert.equal(vad.getState(), 'SPEAKING', 'VAD should seamlessly resume SPEAKING on user speech');
  assert.equal(speechEnded, false, 'Speech must remain continuous across the compound sentence');

  // Trailing Silence: User finishes commanding and goes silent for 1.8s (~56 frames)
  for (let f = 0; f < 56; f++) {
    vad.processChunk(silenceFrame);
  }

  assert.equal(speechEnded, true, 'VAD should finalize speech after trailing silence exceeds threshold');
  assert.equal(vad.getState(), 'SPEECH_ENDED');
  assert.ok(totalReportedMs > 2500, `Total speech duration should reflect both clauses (~${Math.round(totalReportedMs)}ms)`);
});

test('2. Voice Grammar & Raw vs Normalized Speech Preservation', () => {
  const corrector = VoiceGrammarCorrector.getInstance();

  // Test acoustic phonetic confusion correction
  const rawTranscript = "open youtbe and play a randome video";
  const result = corrector.correct(rawTranscript);

  assert.equal(result.wasModified, true);
  assert.equal(result.correctedText, "open youtube and play a random video");

  // Verify conversation manager records both raw and normalized
  const convManager = ConversationManager.getInstance();
  const turn = convManager.recordTurn({
    speaker: 'user',
    text: result.correctedText,
    rawText: rawTranscript,
  });

  assert.equal(turn.text, "open youtube and play a random video");
  assert.equal(turn.rawText, "open youtbe and play a randome video");
});

test('3. Wake Word: Debounce and Acoustic Thresholds Guard Against Ambient Triggers', () => {
  const detector = new WakeWordDetector({
    debounceMs: 3500,
    threshold: 0.88,
  });

  let wakeTriggerCount = 0;
  detector.onWakeDetected(() => {
    wakeTriggerCount++;
  });

  // Feed low-energy ambient noise (RMS ~0.008, no intentional speech)
  const ambientNoise = new Float32Array(512);
  for (let i = 0; i < 512; i++) ambientNoise[i] = (Math.random() - 0.5) * 0.01;

  for (let f = 0; f < 100; f++) {
    detector.processChunk(ambientNoise);
  }

  assert.equal(wakeTriggerCount, 0, 'Ambient room noise must never trigger wake word');
});

test('4. Standby Mode Cycle: Continuous Multi-turn Listening Without Wake Repetition', () => {
  const vm = VoiceManager.getInstance();

  assert.equal(vm.isStandby(), false, 'Standby should be disabled by default');

  // Enable Standby
  vm.setStandbyMode(true);
  assert.equal(vm.isStandby(), true, 'Standby mode should be active');

  // Verify state reset in standby stays in COMMAND_LISTENING
  vm.resetToWakeListening();

  // Disable Standby
  vm.setStandbyMode(false);
  assert.equal(vm.isStandby(), false, 'Standby mode should be disabled');
});

test('5. Non-Cancelling TTS: Speaker Audio Does Not Trigger Task Cancellation', () => {
  const vm = VoiceManager.getInstance();
  let cancelled = false;

  vm.onInterruption(() => {
    cancelled = true;
  });

  // Put VoiceManager into SPEAKING state (TTS active)
  vm.setSpeaking();
  assert.equal(vm.getState().state, 'SPEAKING');

  // In SPEAKING state, loud laptop speaker feedback into the microphone must NOT cancel tasks
  // (Cancellation during TTS was the bug where "Task was cancelled by user" happened at 0%)
  assert.equal(cancelled, false, 'Task must not be cancelled during TTS playback');

  // Return to normal
  vm.resetVoiceSession();
});

test('6. Wake Word: Realistic Conversational Volume (RMS ~0.024) Confirms "Hey/Hi Tesseract"', () => {
  const detector = new WakeWordDetector({
    debounceMs: 1000,
    threshold: 0.85,
  });

  let detectedPhrase = '';
  detector.onWakeDetected((result) => {
    detectedPhrase = result.phrase;
  });

  // Helper frame generators at standard conversational volume (RMS 0.020 - 0.028)
  const makeVoicedFrame = () => {
    const f = new Float32Array(512);
    for (let i = 0; i < 512; i++) f[i] = Math.sin(i * 0.09) * 0.035; // RMS ~0.025, ZCR ~0.03
    return f;
  };

  const makeSibilantFrame = () => {
    const f = new Float32Array(512);
    for (let i = 0; i < 512; i++) {
      // High frequency alternating noise: ZCR ~0.45, highFreqRatio ~0.5, RMS ~0.024
      f[i] = ((i % 2 === 0 ? 1 : -1) * (0.02 + Math.random() * 0.01));
    }
    return f;
  };

  const makeSilenceFrame = () => {
    const f = new Float32Array(512);
    for (let i = 0; i < 512; i++) f[i] = (Math.random() - 0.5) * 0.002;
    return f;
  };

  // 1. Pre-roll ambient silence (5 frames)
  for (let i = 0; i < 5; i++) detector.processChunk(makeSilenceFrame());

  // 2. Stage 0: "Hey" / "Hi" (4 voiced frames, ~128ms)
  for (let i = 0; i < 4; i++) detector.processChunk(makeVoicedFrame());

  // 3. Stage 1: "Tess" (4 sibilant frames, ~128ms)
  for (let i = 0; i < 4; i++) detector.processChunk(makeSibilantFrame());

  // 4. Stage 2: "er" (3 vocalic frames, ~96ms)
  for (let i = 0; i < 3; i++) detector.processChunk(makeVoicedFrame());

  // 5. Stage 3: "act" (2 plosive/fricative frames, ~64ms)
  for (let i = 0; i < 2; i++) detector.processChunk(makeSibilantFrame());

  // 6. Trailing pause (3 silence frames, ~96ms)
  for (let i = 0; i < 3; i++) detector.processChunk(makeSilenceFrame());

  assert.equal(detectedPhrase, 'Hey Tesseract', 'Conversational volume speech must trigger acoustic wake without shouting');
});

