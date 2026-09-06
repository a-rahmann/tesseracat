/**
 * Authoritative Live Browser Agent Hardening Suite
 * Runs INSIDE the real Electron Renderer with real live Webview, real DOM, real network, and real Whisper.
 *
 * Scenarios:
 * 1. Compound Instagram task: wake -> STT -> NLU -> planner -> live navigation -> perception -> message lookup -> Rahul -> result
 * 2. Arbitrary real websites: Wikipedia research & verified extraction
 * 3. Multi-step tasks with live navigation & dynamic form submission (Hacker News search)
 * 4. Real AUTH_REQUIRED, CAPTCHA_REQUIRED and PAYMENT_REQUIRED handoffs
 * 5. Checkpoint persistence across application restart simulation
 * 6. Standby conversation with multiple consecutive commands
 * 7. Real microphone barge-in while TTS is speaking
 * 8. Prompt injection defense from hostile webpage content
 * 9. Credential firewall with real password/card fields in live DOM
 * 10. Recovery/replan after an action fails
 */
export interface HardeningReport {
    id: number;
    name: string;
    verdict: 'PASS' | 'FAIL' | 'BLOCKED';
    userInput: string;
    observedWebpage: string;
    toolCalls: string[];
    stateTransitions: string[];
    evidence: string;
    failureReason?: string;
}
export declare function runHardeningSuite(): Promise<HardeningReport[]>;
//# sourceMappingURL=live-browser-hardening.d.ts.map