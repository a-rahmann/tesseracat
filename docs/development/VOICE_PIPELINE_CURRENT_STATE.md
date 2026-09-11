# TESSERACT — Voice Pipeline Current State & Forensic Inspection

**Document Version:** 1.0.0-FORENSIC  
**Date:** September 11, 2026  
**Audited Target:** Tesseract Monorepo (`apps/desktop-browser/src/voice/`, `src/agent/`, `src/ai/`, `src/sidecar/`, `src/audio/`)  
**Status:** PHASE 0 COMPLETE FORENSIC REPORT (Zero Source Code Modified in this Phase)  

---

## 1. Executive Summary & Forensic Findings

A deep forensic inspection of the live Tesseract codebase and runtime benchmarks revealed the exact structural bottlenecks causing speech unreliability, false wake triggers, 0% UI freezes, and misrouted commands:

1. **Gemma 3 4B Timeout Mismatch ("Action Understanding 0%" Root Cause):**
   - Live hardware benchmarking measured Gemma 3 4B latency on local Ollama:
     - **Cold Start (model load + first prompt):** **64,593 ms (64.6 seconds)**.
     - **Warm Inference (60 tokens):** **22,893 ms (22.9 seconds)** (~2.6 tokens/sec).
   - In [`ollama-gemma.ts`](file:///Users/g.aasish/tesseract/apps/desktop-browser/src/ai/ollama-gemma.ts#L127), `timeoutMs` was hardcoded to **7,000 ms (7 seconds)**.
   - Whenever an arbitrary natural language command bypassed the fast-path and called Gemma 3 4B, the 7-second `AbortController` aborted the browser's `fetch()` request, throwing `[object DOMException]` (`AbortError`).
   - The UI state had already transitioned to `{ status: 'thinking', currentAction: 'Understanding command...', progress: 0.0 }`, leaving the user interface **permanently frozen at 0%**.

2. **Whisper STT Latency & Architecture:**
   - Primary STT: `@xenova/transformers` running quantized ONNX model `Xenova/whisper-tiny.en` on CPU.
   - Measured Latency:
     - Model Cold Load: **2,391 ms**.
     - Short synthetic audio (~1.2s): **1,320 – 2,077 ms**.
     - Natural speech buffer (~5.1s speech): **7,626 – 12,024 ms**.
   - Dual-tier failover: Node child process (`ai-sidecar-process.ts`) with fallback to Electron main process (`apps/desktop-browser/src/whisper.ts`).
   - Weakness: `whisper-tiny.en` is English-only and struggles with casual cadence, dropping or misinterpreting rapid compound phrases.

3. **Wake-Word Detector is Handcrafted DSP (Zero Neural Weights):**
   - [`wake-word.ts`](file:///Users/g.aasish/tesseract/apps/desktop-browser/src/voice/wake-word.ts) relies strictly on zero-crossing rate (ZCR), RMS energy, and high-frequency energy ratio across 4 heuristic stages:
     - Stage 0: Vowel onset ("Hey" / "Hi")
     - Stage 1: Sibilant fricative ("Tess")
     - Stage 2: Vocalic dip ("er")
     - Stage 3: Plosive release ("act")
   - It does not understand phonetics or word semantics. Any voice, video audio, or room conversation containing a vowel + sibilant + vowel + consonant sequence can trigger a false wake event.

4. **VAD Premature Command Truncation:**
   - [`vad.ts`](file:///Users/g.aasish/tesseract/apps/desktop-browser/src/voice/vad.ts) uses a single static trailing silence counter (`trailingSilenceMs: 1400ms`).
   - Natural conversational pauses inside compound sentences (e.g. *"open Instagram... [1.2s pause] ...and check whether Rahul messaged me"*) can reach silence threshold before the second clause is spoken, truncating the command.

5. **Destructive Transcript Overwrites:**
   - [`voice-manager.ts`](file:///Users/g.aasish/tesseract/apps/desktop-browser/src/voice/voice-manager.ts#L496-L516) strips wake word prefixes and runs `VoiceGrammarCorrector.correct()`.
   - It only dispatches `finalCommand` to `commandListeners`. The original unaltered `rawTranscript` from Whisper is discarded and never passed to `AgentRuntime` or telemetry.

6. **Standby Mode & Interruption:**
   - Standby mode flag exists in `voice-manager.ts` (`isStandbyMode`), but it simply re-enters `COMMAND_LISTENING` after command completion.
   - Vocal barge-in during `SPEAKING` was previously triggering on laptop speaker audio, self-cancelling running missions.

---

## 2. Actual Runtime Path

The live path from sound wave to DOM manipulation:

```
[Hardware Microphone]
       │
       ▼ (16kHz Mono Float32Array Chunks via AudioCapture / Web Audio API)
[VoiceManager.processIncomingAudio]
       │
       ├─────────────────────────────────────────┐
       ▼ (State: WAKE_LISTENING)                 ▼ (State: COMMAND_LISTENING)
[WakeWordDetector.processChunk]           [VoiceActivityDetector.processChunk]
 - Tracks RMS, ZCR, HighFreqRatio          - Accumulates 16kHz audio chunks
 - Checks 4 phonetic stages                - Measures trailing silence frames
       │                                         │
       ▼ (Acoustic Candidate Triggered)          ▼ (Trailing Silence Reached)
State -> WAKE_DETECTED                    [VoiceManager.finishCommandRecording]
       │                                         │
       ▼ (Chime & 180ms UI transition)           ▼
State -> COMMAND_LISTENING                [WhisperBridge.transcribe]
                                                 │
                                                 ├──────────────────────────────────┐
                                                 ▼ (HTTP POST /transcribe)          ▼ (IPC Fallback)
                                         [AISidecar Node Process]          [Main Proc whisper.ts]
                                         (Xenova/whisper-tiny.en)          (Xenova/whisper-tiny.en)
                                                 │                                  │
                                                 └────────────────┬─────────────────┘
                                                                  ▼
                                                       [Raw Transcript String]
                                                                  │
                                                       [VoiceGrammarCorrector]
                                                                  │
                                                       [Normalized Command Text]
                                                                  │
                                                       [AgentRuntime.handleUserCommand]
                                                                  │
                     ┌────────────────────────────────────────────┴──────────────────────────────────────┐
                     ▼ (Layer 0 & 1: Fast-Path / Macros)                                                 ▼ (Layer 2: LLM Interpretation)
        [NaturalLanguageInterpreter]                                                        [NaturalLanguageInterpreter.interpret]
        - TaskMacroCache (<1ms)                                                             - Calls Ollama Gemma 3 4B
        - Deterministic Fast-Path (0ms)                                                     - Timeout: 7000ms (CRITICAL BOTTLENECK)
                     │                                                                                   │
                     ▼                                                                                   ▼
        [AgentGoal: initialPlan]                                                            [Structured Output: AgentGoal]
                     │                                                                                   │
                     └────────────────────────────────────────────┬──────────────────────────────────────┘
                                                                  ▼
                                                      [AgentRuntime.executeAutonomousMission]
                                                                  │
                                                      [ActionLoop.run]
                                                                  │
                                      ┌───────────────────────────┴───────────────────────────┐
                                      ▼ (Pre-planned step exists)                             ▼ (Dynamic reasoning required)
                         [ToolRegistry.execute]                                  [ActionLoop Model Call]
                         - browser.navigate                                      - Prompts Gemma 3 4B for next tool
                         - youtube.playResult                                    - Set-of-Marks visual perception
                         - browser.click / type                                  - Executes tool & checks outcome
```

---

## 3. Current Models in the System

| Model | Purpose | Runtime / Provider | Memory / Disk | Measured Latency | Current Issues |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`Xenova/whisper-tiny.en`** | Speech-to-Text | ONNX Runtime via `@xenova/transformers` (v2.17.2) | ~39 MB | Cold: 2.4s<br>Warm: 1.3s - 2.1s (1.2s audio)<br>Real: 7.6s - 12.0s (5.1s audio) | High word-error rate on fast speech; English-only; misses proper nouns. |
| **`Xenova/whisper-base.en`** | Tier 2 STT (Available in sidecar code) | ONNX Runtime via `@xenova/transformers` | ~75 MB | Estimated: 2.5x tiny.en | Configured as option in `ai-sidecar-process.ts`, but not default. |
| **`gemma3:4b`** | Intent Interpretation, Planning, Action Reasoning | Local Ollama (`http://localhost:11434`) | ~3.3 GB (Q4_K_M GGUF) | Cold: **64.6s**<br>Warm: **22.9s** (60 tokens) | 7s timeout caused 100% failure rate on uncached LLM queries. |
| **None (Handcrafted DSP)** | Wake Word Detection | TypeScript ZCR / RMS heuristics | 0 MB | <5 ms per chunk | High false positive rate from background media and ambient conversation. |

---

## 4. Current Latency Sources & Failure Points

### Latency Sources
1. **Ollama Cold-Start & Generation (22s – 65s):**
   - Gemma 3 4B on CPU runs at ~2.6 tokens/second.
   - Generating 150 tokens for structured JSON takes ~30–45 seconds if invoked unnecessarily.
2. **Whisper In-Process / Sidecar Inference (7s – 12s on real 5s audio):**
   - CPU-bound ONNX transcription of a 5-second command takes 7.6s to 12.0s.
3. **Pipelined Navigation Optimization (Working well):**
   - Immediate navigation dispatch (`BrowserAutomator.navigate(targetUrl)`) runs concurrently with planning, saving 1.5s–3.0s of page load wait.

### Failure Points
1. **DOMException / AbortError on Gemma:**
   - 7s timeout in `ollama-gemma.ts` triggers abort while Ollama is generating, leaving the state in `thinking` at 0% progress.
2. **Acoustic Wake Word False Positives:**
   - Handcrafted acoustic stages in `wake-word.ts` trigger on background YouTube video audio and casual conversation.
3. **Premature VAD Silence Cutoff:**
   - 1400ms static silence cutoff cuts multi-clause compound sentences if the speaker pauses naturally between clauses.
4. **Loss of Raw Transcript:**
   - Normalization and grammar repair replace the command string before the Agent or TaskRecorder can log the raw transcript.
5. **Acoustic Speaker Feedback (Fixed in previous commit):**
   - TTS audio previously triggered vocal barge-in during `SPEAKING`, cancelling in-flight missions.

---

## 5. Subsystem-by-Subsystem Forensic Audit

### 5.1 Wake-Word Implementation (`apps/desktop-browser/src/voice/wake-word.ts`)
- **Type:** Purely heuristic DSP state machine.
- **Metrics Tracked:** RMS energy, zero-crossing rate (`zcr`), and high-frequency spectral difference ratio (`highFreqRatio = sum(diff^2) / sum(s^2)`).
- **Phonetic Stages:**
  - Stage 0: `rms >= speechThreshold * 1.2 && zcr < 0.20` for 4 frames.
  - Stage 1: `zcr >= 0.36 && highFreqRatio >= 0.36` for 5 frames.
  - Stage 2: `zcr < 0.22 && rms >= speechThreshold * 0.8` for 3 frames.
  - Stage 3: `highFreqRatio >= 0.30 || zcr >= 0.30` for 2 frames.
- **Failure Mode:** It is not a neural acoustic model. It has no phoneme classifier or mel-spectrogram embeddings.

### 5.2 VAD Implementation (`apps/desktop-browser/src/voice/vad.ts`)
- **Type:** Energy-based thresholding with trailing frame counter.
- **Parameters:**
  - `minSpeechDurationMs`: 180 ms (~6 frames).
  - `trailingSilenceMs`: 1400 ms (~44 frames).
  - `speechEnergyMultiplier`: 1.7x baseline RMS.
- **Failure Mode:** Binary state (`isSpeaking` vs `not speaking`). Does not account for phrase boundary syntax, conjunction pauses ("and", "then"), or adaptive conversational cadence.

### 5.3 STT Implementation (`apps/desktop-browser/src/whisper.ts` & `src/sidecar/ai-sidecar-process.ts`)
- **Engine:** `@xenova/transformers` with ONNX Runtime backend.
- **Model:** `Xenova/whisper-tiny.en`.
- **Sidecar Process:** Spawned via `child_process.fork('ai-sidecar-process.js')`. Communicates via IPC and HTTP port 11435.
- **Preprocessing:** DC bias subtraction, 300ms pre-roll preservation, dynamic chunk length, peak normalization.

### 5.4 Gemma Usage (`apps/desktop-browser/src/ai/ollama-gemma.ts`)
- **Integration:** Calls Ollama `/api/chat` over HTTP with streaming or non-streaming JSON formatting.
- **Concurrency:** `requestQueue` ensures sequential execution to prevent Ollama thread starvation on CPU.
- **Prompt Size:** ~400–800 tokens.
- **Failure Mode:** 7-second hard abort timeout kills valid inferences on CPU.

### 5.5 Agent Action Loop (`apps/desktop-browser/src/agent/action-loop.ts`)
- **Loop:** Observe (`BrowserPerception.observe()`) $\rightarrow$ Check pre-planned step $\rightarrow$ Reason dynamically with LLM if no pre-planned step $\rightarrow$ Policy check $\rightarrow$ Execute tool call $\rightarrow$ Verify outcome $\rightarrow$ Save checkpoint.
- **Maximum steps:** 8 steps.
- **Perceptual Fallback:** Added heuristic fallback for YouTube playback and search if LLM fails.

### 5.6 Standby Implementation
- **Current state:** `setStandbyMode(true)` in `VoiceManager`.
- **Behavior:** Transitions to `COMMAND_LISTENING` after command execution without resetting to `WAKE_LISTENING`.
- **Limitation:** Does not maintain full multi-turn conversational context across turns.

### 5.7 Interruption Implementation
- **Current state:** `triggerInterruption()` cancels active tasks via `CancellationToken`.
- **Behavior:** Handled on Escape key press, "stop" / "cancel" voice commands. Mic monitoring during `SPEAKING` is safely disabled to prevent speaker loopback.

---

## 6. Exact Files Requiring Modification in Subsequent Phases

1. [`apps/desktop-browser/src/voice/vad.ts`](file:///Users/g.aasish/tesseract/apps/desktop-browser/src/voice/vad.ts) — Implement adaptive multi-stage silence state machine for intra-command pauses.
2. [`apps/desktop-browser/src/voice/voice-manager.ts`](file:///Users/g.aasish/tesseract/apps/desktop-browser/src/voice/voice-manager.ts) — Preserve `rawTranscript`, add structured voice diagnostics, implement multi-turn conversational standby.
3. [`apps/desktop-browser/src/sidecar/ai-sidecar-process.ts`](file:///Users/g.aasish/tesseract/apps/desktop-browser/src/sidecar/ai-sidecar-process.ts) — Implement tiered model selection (LOW_RESOURCE, BALANCED, HIGH_ACCURACY) and model pre-warming.
4. [`apps/desktop-browser/src/voice/wake-word.ts`](file:///Users/g.aasish/tesseract/apps/desktop-browser/src/voice/wake-word.ts) — Multi-tier wake word architecture with lightweight neural verification.
5. [`apps/desktop-browser/src/ai/ollama-gemma.ts`](file:///Users/g.aasish/tesseract/apps/desktop-browser/src/ai/ollama-gemma.ts) — Remove brittle 7s abort timeout, implement streaming JSON parser and model keep-alive pre-warming.
6. [`apps/desktop-browser/src/agent/agent-runtime.ts`](file:///Users/g.aasish/tesseract/apps/desktop-browser/src/agent/agent-runtime.ts) — Accept structured `{ rawTranscript, normalizedTranscript }`, eliminate 0% freezes with robust fallback recovery.
7. [`apps/desktop-browser/src/agent/natural-language-interpreter.ts`](file:///Users/g.aasish/tesseract/apps/desktop-browser/src/agent/natural-language-interpreter.ts) — Preserve full compound commands without destructive regex clipping; cache intent patterns.
8. [`apps/desktop-browser/src/agent/action-loop.ts`](file:///Users/g.aasish/tesseract/apps/desktop-browser/src/agent/action-loop.ts) — Streamlined perceptual reasoning and deterministic state transition recovery.
