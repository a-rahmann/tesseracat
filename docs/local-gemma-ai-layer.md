# Tesseract Local Gemma AI Layer

This document details the architecture, data flow, safety invariants, and verification protocols for Tesseract's local Gemma reasoning brain.

---

## 1. Gemma's Role

In Tesseract, Google Gemma 3 (via local Ollama at `http://127.0.0.1:11434`) serves as the **privacy-first, local reasoning brain**. Gemma performs natural language understanding and task planning without ever communicating with external servers or cloud LLMs.

### Core Responsibilities
- **Text Chat**: Direct conversational responses grounded in local knowledge and active browsing context.
- **Voice Transcript Interpretation**: Interprets push-to-talk transcribed speech (from local Whisper ONNX) into actionable user queries.
- **Intent Classification**: Evaluates input to categorize into one of 11 structured intents (`explain_current_page`, `summarize_page`, `explain_selected_text`, `research_compare`, `browser_navigation`, `file_task`, `form_task`, `communication_task`, `calendar_query`, `media_control`, `unknown`).
- **Safe Task Planning**: Decomposes user goals into read-only and navigation steps (`browser_navigate`, `web_search`, `read_page_content`, `privacy_scan`, `user_context_analyze`).
- **Page Explanation & Summaries**: Synthesizes and summarizes page contents from sanitized context.
- **Structured Final Responses**: Delivers user-facing responses with confidence scores, source citations, uncertainty notes, and safe alternative suggestions.

### Prohibited Capabilities (What Gemma CANNOT Directly Do)
Gemma is strictly a **reasoning engine**, not an execution runtime. Gemma cannot:
- Directly execute browser actions or manipulate the DOM.
- Directly execute JavaScript.
- Access system shell or terminal commands.
- Directly read or write local files.
- Access passwords, cookies, session tokens, API keys, OTPs, or payment credentials.
- Send messages or emails.
- Post publicly to social media or forums.
- Call MCP (Model Context Protocol) tools directly.
- Call cloud LLMs or fall back to remote APIs.

---

## 2. Local-Only Architecture & Data Flow

All AI reasoning is entirely air-gapped on the user's workstation.

```
User Input (Text / Push-to-Talk Transcript)
                    │
                    ▼
┌──────────────────────────────────────────────┐
│ ContextBuilder & Sensitive Data Redactor     │
│ - Strips passwords, tokens, API keys, cards │
│ - Enforces character & token truncation      │
└───────────────────┬──────────────────────────┘
                    │ (Sanitized context only)
                    ▼
┌──────────────────────────────────────────────┐
│ OllamaGemmaProvider                          │
│ - Localhost only: http://127.0.0.1:11434     │
│ - Discovers Gemma 3 model tag automatically  │
│ - Timeout & AbortSignal cancellation support │
│ - No prompt or response logging              │
└───────────────────┬──────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────┐
│ Zod Validation Layer                         │
│ - IntentSchema                               │
│ - TaskPlanSchema (Read-only tools only)      │
│ - ResponseSchema                             │
└───────────────────┬──────────────────────────┘
                    │ (Zod-validated JSON)
                    ▼
┌──────────────────────────────────────────────┐
│ Agent Orchestrator                           │
│ - Creates task records                       │
│ - Zero cloud fallback                        │
└───────────────────┬──────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────┐
│ Deterministic Policy Engine                  │
│ - Evaluates tool risk category               │
│ - Checks autonomous mission permissions      │
│ - Blocks unauthorized or write actions       │
└───────────────────┬──────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────┐
│ Browser / Action Execution Runtime           │
│ - Electron webview navigation & read-only    │
│   tools (executed outside LLM context)       │
└──────────────────────────────────────────────┘
```

---

## 3. Context Safety & Secret Redaction

The [`ContextBuilder`](file:///c:/Users/abdul/Downloads/Tesseract/apps/agent-runtime/src/gemma/context-builder.ts) guarantees that user credentials, financial data, and session tokens never reach the LLM prompt:

1. **Secret Redaction Engine**:
   - **Bearer & Auth Tokens**: Replaced with `Bearer [REDACTED_AUTH_TOKEN]`.
   - **JWT Tokens**: Pattern `eyJ...` replaced with `[REDACTED_JWT_TOKEN]`.
   - **API Keys**: OpenAI (`sk-`, `sk-proj-`), GitHub (`ghp_`), AWS (`AKIA`), Google (`AIza`) replaced with `[REDACTED_API_KEY]`.
   - **Passwords**: Fields matching `password`, `passwd`, `secret`, `credential` followed by `:`, `=`, or `is` replaced with `[REDACTED_PASSWORD]`.
   - **Payment Cards & CVV**: Card numbers (13–19 digits) and CVV/CVC codes replaced with `[REDACTED_PAYMENT_CARD]` and `[REDACTED_CVV]`.
   - **OTP / 2FA**: 4–8 digit verification codes replaced with `[REDACTED_OTP]`.
   - **Cookies**: Session cookies and `Set-Cookie` headers replaced with `[REDACTED_COOKIE]`.
   - **URL Secrets**: Query parameters such as `?token=...`, `&key=...` replaced with `[REDACTED_URL_SECRET]`.

2. **Compression & Budgeting**:
   - URL: Capped at 250 characters.
   - Page Title: Capped at 150 characters.
   - Headings: Capped at 10 items, 120 characters each.
   - Main Visible Text: Capped at 2,500 characters.
   - Tables: Capped at 3 tables, 500 characters each.
   - Selected Text: Capped at 1,000 characters.

---

## 4. Structured Output via Zod

All model completions are enforced via TypeScript Zod schemas:

| Schema | File | Description |
|---|---|---|
| `IntentSchema` | `apps/agent-runtime/src/gemma/schemas.ts` | Validates intent category, confidence score (0.0–1.0), target, parameters, and reasoning. Falls back to `unknown` on parse error. |
| `TaskPlanSchema` | `apps/agent-runtime/src/gemma/schemas.ts` | Validates task plan. Strictly limits tools to: `browser_navigate`, `web_search`, `read_page_content`, `privacy_scan`, `user_context_analyze`. Rejects write tools (`payment`, `submit`, `upload`, `delete`). |
| `ResponseSchema` | `apps/agent-runtime/src/gemma/schemas.ts` | Validates final user response: answer, confidence, sources, uncertainty, next suggestions, and safe alternatives. |
| `OllamaHealthSchema` | `apps/agent-runtime/src/gemma/schemas.ts` | Validates Ollama `/api/tags` response and health telemetry. |

---

## 5. Policy Engine Governance of Tool Requests

When Gemma generates a `TaskPlan`:
1. The planner outputs **structured step proposals** (e.g. `{ toolName: 'web_search', toolParameters: { query: '...' } }`).
2. The `AgentOrchestrator` receives these steps and creates a `TaskRecord` in `WAITING_FOR_APPROVAL` or `PENDING` state.
3. Each step is evaluated by `DeterministicPolicyEngine.evaluateAction(category, toolName, parameters, context)`:
   - Evaluates whether the tool is read-only or mutative.
   - Enforces approval gates for high-risk operations.
   - Enforces cloud spend limits ($0 cap for local tasks).
4. Only registered, approved tools are executed by the runtime. Gemma itself has zero execution authority.

---

## 6. What Is Intentionally Not Implemented Yet

To preserve security, stability, and prototype focus, the following capabilities are deferred:
- **Write Actions & Form Submission**: Automated form filling, login automation, or submitting user credentials.
- **Financial Transactions**: Automatic checkout, cart purchases, or payment card input.
- **Direct File Modification**: Local disk file creation, modification, or deletion.
- **Model Context Protocol (MCP)**: Dynamic tool servers or external tool bridges.
- **Cloud LLM Fallback**: Remote Gemini/Claude escalation is strictly disabled.
- **Cross-Domain Session Sharing**: Passing browser cookies or authentication state between tabs.

---

## 7. Manual Ollama Commands to Verify Local Model Health

To verify your local Ollama setup and model health:

### Check Ollama Server Status
```bash
curl http://127.0.0.1:11434/api/tags
```
Expected response: JSON listing installed models including `Gemma3:4b` or `gemma3`.

### List Models via Ollama CLI
```bash
ollama list
```

### Pull Gemma 3 Model (if not already installed)
```bash
ollama pull gemma3:4b
```

### Test Direct Chat via CLI
```bash
ollama run gemma3:4b "Explain how web browsers work in 2 sentences"
```

### Test Local Inference API via curl
```bash
curl http://127.0.0.1:11434/api/chat -d '{
  "model": "gemma3:4b",
  "messages": [{"role": "user", "content": "Hello"}],
  "stream": false
}'
```
