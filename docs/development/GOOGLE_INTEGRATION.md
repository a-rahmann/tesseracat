# Google Workspace Integration Guide

## 1. Overview
The Google Native Service Connector (`google-connector.ts`) brings enterprise-grade, deterministic access to Google Workspace services (Gmail, Calendar, Drive, and YouTube) directly into Tesseract.

---

## 2. Security & Credential Model

### Strict Security Invariants
1. **Zero Password Storage**: Tesseract NEVER prompts for, inspects, or stores Google passwords.
2. **OAuth 2.0 with PKCE**: Uses standard Authorization Code flow with Proof Key for Code Exchange (`code_verifier` and `code_challenge_method = S256`).
3. **Encrypted Token Vault**: Tokens (access and refresh) are encrypted using Electron's `safeStorage` (macOS Keychain).
4. **Auto-Refresh Lifecycle**: Access tokens are refreshed automatically 60 seconds prior to expiration using the refresh token.

---

## 3. Supported Scopes & Tool Capabilities

### Gmail (`gmail-tools.ts`)
| Tool | Scope | Risk / Gate | Description |
| :--- | :--- | :--- | :--- |
| `gmail.search` | `.../gmail.readonly` | READ | Search emails with standard Gmail query operators (`is:unread`, `from:`, `subject:`) |
| `gmail.getMessage` | `.../gmail.readonly` | READ | Retrieve email body snippet, subject, sender, and timestamp |
| `gmail.listThreads` | `.../gmail.readonly` | READ | List conversation threads |
| `gmail.createDraft` | `.../gmail.compose` | LOW_RISK | Create draft message without sending |
| `gmail.send` | `.../gmail.send` | EXTERNAL_COMMUNICATION | Transmit email message (**Requires explicit user confirmation**) |

### Google Calendar (`calendar-tools.ts`)
| Tool | Scope | Risk / Gate | Description |
| :--- | :--- | :--- | :--- |
| `calendar.today` | `.../calendar.readonly` | READ | Fetch all events scheduled for today |
| `calendar.upcoming` | `.../calendar.readonly` | READ | Fetch schedule for next N days |
| `calendar.search` | `.../calendar.readonly` | READ | Search calendar events by keyword |
| `calendar.createEvent` | `.../calendar.events` | LOW_RISK | Create new calendar event |
| `calendar.deleteEvent` | `.../calendar.events` | DESTRUCTIVE | Remove event (**Requires user confirmation**) |

### Google Drive (`drive-tools.ts`)
| Tool | Scope | Risk / Gate | Description |
| :--- | :--- | :--- | :--- |
| `drive.search` | `.../drive.readonly` | READ | Search files and documents |
| `drive.getFile` | `.../drive.readonly` | READ | Retrieve metadata and download link |
| `drive.upload` | `.../drive.file` | LOW_RISK | Upload content to Drive |
| `drive.delete` | `.../drive.file` | DESTRUCTIVE | Delete/trash file (**Requires user confirmation**) |

### YouTube (`youtube-tools.ts`)
| Tool | Scope | Description |
| :--- | :--- | :--- |
| `youtube.search` | `.../youtube.readonly` or Browser | Search video database |
| `youtube.getVideo` | `.../youtube.readonly` or Browser | Retrieve active video metadata and caption snippet |
| `youtube.play` | None (Optimized Browser Automation) | Direct navigation, cookie dismissal, playback trigger, and strict audio/video verification |
