/**
 * Complex Web Hardening Suite for Tesseract.
 * Executes live inside the Electron browser window with real Chromium webviews.
 * Validates:
 * 1. Dynamic SPA perception & infinite scroll
 * 2. Deep Shadow DOM recursive piercing
 * 3. Nested Iframe DOM piercing
 * 4. Anti-Bot / Cloudflare Turnstile handoff (without deceptive human-imitation typing)
 * 5. 7-Stage Intelligent Recovery with Outcome Verification
 * 6. Credential & OTP Firewall (passwords, CVV, OTP suppressed)
 */
export interface ComplexHardeningReport {
    id: number;
    name: string;
    verdict: 'PASS' | 'FAIL' | 'BLOCKED';
    userInput: string;
    observedWebpage: string;
    observedState: string;
    toolCalls: string[];
    stateTransitions: string[];
    verificationResult: string;
    recoveryTrace?: string;
    failureReason?: string;
}
export declare function runComplexHardeningSuite(): Promise<ComplexHardeningReport[]>;
//# sourceMappingURL=complex-web-hardening.d.ts.map