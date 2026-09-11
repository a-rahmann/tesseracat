/**
 * Capability Router for Tesseract.
 *
 * Implements the 5-tier Tool Priority Hierarchy:
 * 1. Fast-Path Deterministic Execution (<2ms)
 * 2. Native Service API Connectors (Gmail, Calendar, Drive, YouTube)
 * 3. Structured LLM Tool Calling (Gemma 3 4B Orchestrator)
 * 4. Autonomous Browser Perception & Action Loop (Arbitrary Websites)
 * 5. Human Handoff (Auth, Payments, Captchas)
 */
import { FastPathMatch } from './fast-path.js';
export type RoutingTier = 'FAST_PATH' | 'NATIVE_SERVICE_CONNECTOR' | 'STRUCTURED_TOOL_CALLING' | 'BROWSER_AGENT' | 'HUMAN_HANDOFF';
export interface RouteResolution {
    tier: RoutingTier;
    targetTool?: string;
    serviceId?: string;
    parameters?: Record<string, any>;
    fastPathMatch?: FastPathMatch;
    spokenResponse?: string;
    reason: string;
}
export declare class CapabilityRouter {
    private static instance;
    private connectorRegistry;
    private constructor();
    static getInstance(): CapabilityRouter;
    /**
     * Evaluates raw voice/text input and determines the optimal execution tier.
     */
    route(input: string): RouteResolution;
}
//# sourceMappingURL=capability-router.d.ts.map