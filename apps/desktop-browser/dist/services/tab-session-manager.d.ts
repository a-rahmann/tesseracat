/**
 * TabSessionManager: Manages per-tab conversational sessions and continuous prompt memory,
 * mirroring ChatGPT / Gemini session threads.
 *
 * Capabilities:
 * 1. Each browser tab maintains an independent, continuous conversational memory thread.
 * 2. Prompts and assistant actions link to each other within the same tab for contextual resolution.
 * 3. When a tab closes, its session is safely archived to an undo stack.
 * 4. When the closed tab is undone/re-opened (Cmd+Shift+T or restore), its exact conversational
 *    session memory is restored seamlessly to before it was closed.
 */
export interface ConversationTurn {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    timestamp: number;
    intentType?: string;
    action?: string;
    targetUrl?: string;
    resultSummary?: string;
}
export interface TabSessionContext {
    lastQuery?: string;
    lastUrl?: string;
    lastVideoTitle?: string;
    lastSender?: string;
    lastSubject?: string;
    metadata?: Record<string, any>;
}
export interface TabSession {
    tabId: string;
    title: string;
    url: string;
    turns: ConversationTurn[];
    context: TabSessionContext;
    createdAt: number;
    updatedAt: number;
}
export interface ClosedTabArchive {
    tabSnapshot: {
        id: string;
        title: string;
        url: string;
        index: number;
    };
    session: TabSession;
    closedAt: number;
}
export declare class TabSessionManager {
    private static instance;
    private sessions;
    private closedTabsStack;
    private readonly maxUndoStackSize;
    private constructor();
    static getInstance(): TabSessionManager;
    /**
     * Get or initialize a conversational session for a tab.
     */
    getOrCreateSession(tabId: string, url?: string, title?: string): TabSession;
    /**
     * Record a user prompt turn into the tab session.
     */
    recordUserPrompt(tabId: string, text: string, intent?: any): void;
    /**
     * Record an assistant action or spoken response turn into the tab session.
     */
    recordAssistantResponse(tabId: string, text: string, resultSummary?: string, targetUrl?: string): void;
    /**
     * Update contextual memory tokens (e.g. current video watched, sender, subject).
     */
    updateContext(tabId: string, patch: Partial<TabSessionContext>): void;
    /**
     * Retrieve conversational history turns for contextual linking (e.g. for continuous prompt understanding).
     */
    getTurns(tabId: string, limit?: number): ConversationTurn[];
    /**
     * Retrieve context metadata for resolving pronouns ("it", "the video", "that") in commands.
     */
    getContext(tabId: string): TabSessionContext | null;
    /**
     * Archive a closing tab and its entire conversational session into the undo stack.
     */
    archiveSessionForClosedTab(tabSnapshot: {
        id: string;
        title: string;
        url: string;
        index: number;
    }): void;
    /**
     * Check if there is an undone tab in the stack.
     */
    canUndoClosedTab(): boolean;
    /**
     * Pop and restore the most recently closed tab and reconnect its session memory.
     */
    undoClosedTab(): ClosedTabArchive | null;
    /**
     * Clear all sessions (e.g. app restart or cache clear).
     */
    clearAll(): void;
}
//# sourceMappingURL=tab-session-manager.d.ts.map