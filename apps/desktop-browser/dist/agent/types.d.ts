/**
 * Unified Agent & Task Architecture Types for Tesseract.
 * Non-negotiable schemas for NLU, dynamic planning, autonomous loops, and policy boundaries.
 */
export type TaskState = 'CREATED' | 'PLANNING' | 'EXECUTING' | 'WAITING' | 'AUTH_REQUIRED' | 'PERMISSION_REQUIRED' | 'PAYMENT_REQUIRED' | 'CAPTCHA_REQUIRED' | 'PAUSED' | 'INTERRUPTED' | 'RECOVERING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type IntentCategory = 'NAVIGATION' | 'RESEARCH' | 'SHOPPING_COMPARISON' | 'SOCIAL_COMMUNICATION' | 'MEDIA_CONTROL' | 'FORM_AUTOFILL' | 'DOCUMENT_ANALYSIS' | 'GENERAL_AUTOMATION' | 'CONVERSATIONAL' | 'BROWSER_CONTROL';
export interface AgentGoal {
    rawUserText: string;
    goal: string;
    intentCategory: IntentCategory;
    entities: Record<string, any>;
    requiresBrowser: boolean;
    requiresPerception: boolean;
    isCompound: boolean;
    subTasks?: string[];
    fastPathAction?: string;
    spokenAcknowledgment?: string;
    confidence: number;
    isCoherent?: boolean;
    isUncertain?: boolean;
    initialPlan?: PlanStep[];
    suggestedTargetUrl?: string;
    isFastPath?: boolean;
}
export interface PlanStep {
    stepNumber: number;
    description: string;
    toolName: string;
    parameters: Record<string, any>;
    expectedOutcome?: string;
    requiresHumanReview?: boolean;
    status: 'PENDING' | 'ACTIVE' | 'SUCCESS' | 'FAILED' | 'SKIPPED';
    result?: any;
    error?: string;
}
export interface AgentPlan {
    id: string;
    goal: string;
    steps: PlanStep[];
    currentStepIndex: number;
    createdAt: number;
}
export interface AgentDecision {
    type: 'tool_call' | 'complete' | 'ask_user' | 'wait' | 'replan' | 'auth_handoff' | 'captcha_handoff' | 'payment_handoff';
    tool?: string;
    arguments?: Record<string, any>;
    reason?: string;
    confidence?: number;
    userPrompt?: string;
    isFinalStep?: boolean;
}
export interface ToolCall {
    id: string;
    toolName: string;
    arguments: Record<string, any>;
}
export interface ToolResult {
    toolName: string;
    success: boolean;
    result?: any;
    error?: string;
    timestamp: number;
}
export interface Observation {
    url: string;
    title: string;
    activeTabId?: string;
    openTabsCount?: number;
    compactElementsView: string;
    interactiveElementsCount: number;
    hasLoginForm: boolean;
    hasCaptcha: boolean;
    hasPaymentForm: boolean;
    hasVideo: boolean;
    isPdfDocument: boolean;
    timestamp: number;
}
export interface TaskCheckpoint {
    taskId: string;
    goal: string;
    currentStepIndex: number;
    completedSteps: string[];
    remainingSteps: string[];
    currentUrl: string;
    activeTabId?: string;
    openTabIds: string[];
    pageStateHash: string;
    pendingHumanAction?: {
        type: 'AUTH' | 'CAPTCHA' | 'PAYMENT' | 'PERMISSION' | 'CLARIFICATION';
        prompt: string;
    };
    contextData: Record<string, any>;
    timestamp: number;
}
export interface PermissionRequest {
    id: string;
    toolName: string;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    description: string;
    proposedParameters: Record<string, any>;
}
export interface HumanHandoff {
    type: 'AUTH' | 'CAPTCHA' | 'PAYMENT' | 'PERMISSION' | 'CLARIFICATION';
    message: string;
    targetUrl?: string;
    elementSelector?: string;
    resumptionCondition: 'URL_CHANGE' | 'ELEMENT_APPEAR' | 'USER_BUTTON' | 'DOM_SETTLED';
}
//# sourceMappingURL=types.d.ts.map