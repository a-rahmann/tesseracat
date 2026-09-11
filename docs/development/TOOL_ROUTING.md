# Capability Router & Tool Priority Hierarchy

## 1. Overview
The `CapabilityRouter` (`src/agent/capability-router.ts`) is Tesseract's deterministic gateway for incoming natural language and voice requests. It prevents the system from defaulting routine queries to expensive DOM perception loops or generic Google web searches.

---

## 2. The 5-Tier Tool Hierarchy

```mermaid
graph TD
    UserQuery["Voice / Text Query"] --> Tier1["Tier 1: Fast-Path (<2ms)"]
    Tier1 -- Matched --> FastPathAction["Instant Browser Control (back, pause, reload)"]
    Tier1 -- Unmatched --> Tier2["Tier 2: Native Service Connectors (<200ms)"]
    
    Tier2 -- Matched --> NativeTool["Direct API / GoalGraph (Calendar, Gmail, YouTube)"]
    Tier2 -- Unmatched --> Tier3["Tier 3: Structured LLM Tool Calling (Gemma 3 4B)"]
    
    Tier3 -- Tool Identified --> ToolExec["ToolRegistry Execution"]
    Tier3 -- Arbitrary Web Task --> Tier4["Tier 4: Autonomous Browser Perception Agent"]
    
    Tier4 --> ActionLoop["ActionLoop (Observe -> Reason -> Act -> Verify)"]
    ActionLoop -- 2FA/Auth/Payment --> Tier5["Tier 5: Human Handoff"]
```

---

## 3. Fast-Path Rules vs Native Service Routing

| User Utterance | Selected Tier | Target Action / Tool | Verification Mechanism |
| :--- | :--- | :--- | :--- |
| "Go back" | Tier 1 | `back` | Instant |
| "Pause the video" | Tier 1 | `pause` | MediaController |
| "What's my next meeting?" | Tier 2 | `calendar.today` | API response length |
| "Show my unread emails" | Tier 2 | `gmail.search` | API message array |
| "Search drive for pitch deck" | Tier 2 | `drive.search` | API file list |
| "Open YouTube and play a random video" | Tier 2 | `youtube.play` | GoalGraph with `verifyPlaying(4000)` |
| "Go to bestbuy.com and find the cheapest OLED TV" | Tier 4 | `BrowserAgent` | Live DOM tree & ActionLoop |
