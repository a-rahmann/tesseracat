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

export class TabSessionManager {
  private static instance: TabSessionManager | null = null;

  // Active tab sessions: tabId -> TabSession
  private sessions: Map<string, TabSession> = new Map();

  // Undo stack for recently closed tabs with their complete conversational sessions
  private closedTabsStack: ClosedTabArchive[] = [];
  private readonly maxUndoStackSize = 20;

  private constructor() {}

  public static getInstance(): TabSessionManager {
    if (!TabSessionManager.instance) {
      TabSessionManager.instance = new TabSessionManager();
    }
    return TabSessionManager.instance;
  }

  /**
   * Get or initialize a conversational session for a tab.
   */
  public getOrCreateSession(tabId: string, url = 'about:blank', title = 'New Tab'): TabSession {
    if (!this.sessions.has(tabId)) {
      const newSession: TabSession = {
        tabId,
        title,
        url,
        turns: [],
        context: {
          lastUrl: url,
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      this.sessions.set(tabId, newSession);
      console.log(`[Session] Initialized new conversational session for ${tabId} (${title})`);
    }
    const sess = this.sessions.get(tabId)!;
    if (url && url !== 'about:blank') sess.url = url;
    if (title && title !== 'New Tab') sess.title = title;
    return sess;
  }

  /**
   * Record a user prompt turn into the tab session.
   */
  public recordUserPrompt(tabId: string, text: string, intent?: any): void {
    const session = this.getOrCreateSession(tabId);
    const turn: ConversationTurn = {
      id: `turn-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      role: 'user',
      text,
      timestamp: Date.now(),
      intentType: intent?.type,
      action: intent?.action,
    };
    session.turns.push(turn);
    session.updatedAt = Date.now();

    if (intent?.query) {
      session.context.lastQuery = intent.query;
    }
    console.log(`[Session] [${tabId}] Recorded user prompt: "${text}" (Total turns: ${session.turns.length})`);
  }

  /**
   * Record an assistant action or spoken response turn into the tab session.
   */
  public recordAssistantResponse(tabId: string, text: string, resultSummary?: string, targetUrl?: string): void {
    const session = this.getOrCreateSession(tabId);
    const turn: ConversationTurn = {
      id: `turn-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      role: 'assistant',
      text,
      timestamp: Date.now(),
      resultSummary,
      targetUrl,
    };
    session.turns.push(turn);
    session.updatedAt = Date.now();

    if (targetUrl) {
      session.context.lastUrl = targetUrl;
    }
    console.log(`[Session] [${tabId}] Recorded assistant response: "${text}"`);
  }

  /**
   * Update contextual memory tokens (e.g. current video watched, sender, subject).
   */
  public updateContext(tabId: string, patch: Partial<TabSessionContext>): void {
    const session = this.getOrCreateSession(tabId);
    session.context = {
      ...session.context,
      ...patch,
    };
    session.updatedAt = Date.now();
  }

  /**
   * Retrieve conversational history turns for contextual linking (e.g. for continuous prompt understanding).
   */
  public getTurns(tabId: string, limit = 10): ConversationTurn[] {
    const session = this.sessions.get(tabId);
    if (!session) return [];
    return session.turns.slice(-limit);
  }

  /**
   * Retrieve context metadata for resolving pronouns ("it", "the video", "that") in commands.
   */
  public getContext(tabId: string): TabSessionContext | null {
    const session = this.sessions.get(tabId);
    return session ? session.context : null;
  }

  /**
   * Archive a closing tab and its entire conversational session into the undo stack.
   */
  public archiveSessionForClosedTab(
    tabSnapshot: { id: string; title: string; url: string; index: number }
  ): void {
    const session = this.sessions.get(tabSnapshot.id) || {
      tabId: tabSnapshot.id,
      title: tabSnapshot.title,
      url: tabSnapshot.url,
      turns: [],
      context: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Push deep clone of session into closed stack
    this.closedTabsStack.push({
      tabSnapshot: { ...tabSnapshot },
      session: JSON.parse(JSON.stringify(session)),
      closedAt: Date.now(),
    });

    if (this.closedTabsStack.length > this.maxUndoStackSize) {
      this.closedTabsStack.shift();
    }

    // Remove from active map
    this.sessions.delete(tabSnapshot.id);
    console.log(`[Session] Archived session for closed tab ${tabSnapshot.id} (${tabSnapshot.title}). Stack depth: ${this.closedTabsStack.length}`);
  }

  /**
   * Check if there is an undone tab in the stack.
   */
  public canUndoClosedTab(): boolean {
    return this.closedTabsStack.length > 0;
  }

  /**
   * Pop and restore the most recently closed tab and reconnect its session memory.
   */
  public undoClosedTab(): ClosedTabArchive | null {
    const archive = this.closedTabsStack.pop();
    if (!archive) return null;

    // Restore into active sessions with preserved turns and context
    this.sessions.set(archive.tabSnapshot.id, archive.session);
    console.log(`[Session] Restored session memory for undone tab ${archive.tabSnapshot.id} ("${archive.tabSnapshot.title}") with ${archive.session.turns.length} preserved turns`);
    return archive;
  }

  /**
   * Clear all sessions (e.g. app restart or cache clear).
   */
  public clearAll(): void {
    this.sessions.clear();
    this.closedTabsStack = [];
  }
}
