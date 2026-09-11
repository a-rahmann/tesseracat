# Native Service Connector Hub Architecture

## 1. Motivation & Paradigm Shift

Historically, browser agents interact with web services (Gmail, YouTube, Google Calendar) exclusively through visual or DOM perception:
```
Voice Command -> Whisper STT -> Gemma LLM -> DOM Tree -> Click/Type Actions -> DOM Observation Loop
```

While DOM manipulation is necessary for arbitrary un-instrumented websites, utilizing it for major productivity and media services introduces severe friction:
1. **High Latency**: 4-15 seconds spent parsing DOM trees, waiting for hydration, and querying selectors.
2. **Brittle Execution**: A button class change, modal change, or layout experiment immediately breaks DOM selectors.
3. **Premature Task Termination**: The agent often concludes a compound task early (e.g. Navigating to `youtube.com` and declaring "Done" without selecting a video or confirming playback).

Tesseract's **Native Service Connector Hub** fundamentally rearchitects this with a Tool-First paradigm:
```
Voice Command -> Whisper STT -> Capability Router -> Native API / Dedicated Adapter -> Explicit Goal Verification
```

---

## 2. Core Architecture Components

### `ServiceConnector` Interface (`service-connector.ts`)
Defines the standard contract for any integrated platform:
- `id`: Unique identifier (e.g. `'google'`, `'microsoft'`)
- `name`: Human-readable name
- `authenticationState`: `'CONNECTED' | 'DISCONNECTED' | 'EXPIRED' | 'REQUIRES_SETUP'`
- `capabilities`: Granular list of capabilities with required OAuth scopes
- `connect(scopes?)`: Initiates secure OAuth 2.0 flow
- `disconnect()`: Revokes and clears stored tokens
- `executeTool(toolName, params)`: Dispatches tool request
- `healthCheck()`: Validates token validity and connectivity

### `ConnectorRegistry` (`service-connector.ts`)
A central singleton registry that:
- Maintains all registered service connectors.
- Automatically maps tool invocations (`calendar.today`, `gmail.search`, `drive.search`, `youtube.play`) to the appropriate connector.
- Enforces authentication checks before tool dispatch.

### `CredentialVault` (`credential-vault.ts`)
Ensures OS-level cryptographic security:
- Uses Electron's native `safeStorage` (backed by **macOS Keychain** on macOS and DPAPI/libsecret on Windows/Linux).
- In headless test or CLI environments, gracefully falls back to AES-256-GCM encryption using a machine-derived key.
- **Strict Security Invariant**: Plain passwords and unencrypted OAuth tokens are NEVER written to disk or SQLite databases.

---

## 3. Tool Priority Hierarchy

When a user speaks or submits a command, Tesseract evaluates it through a 5-tier priority hierarchy:

1. **Tier 1: Fast-Path Deterministic Execution (<2ms)**: Immediate browser controls (`back`, `forward`, `reload`, `pause`, `resume`, `scroll`).
2. **Tier 2: Native Service API Connectors (<200ms)**: Direct REST queries for Calendar, Gmail, Drive, or YouTube playback.
3. **Tier 3: Structured LLM Tool Calling (Gemma 3 4B Orchestrator)**: For multi-tool combinations and ambiguity resolution.
4. **Tier 4: Autonomous Browser Perception Agent**: Fallback for arbitrary websites, web scraping, checkout flows, and form-fills.
5. **Tier 5: Human Handoff**: Captchas, 2FA prompts, and sensitive destructive confirmation gates.
