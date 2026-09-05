/**
 * AIExecutionCoordinator: Calm, autonomous background task execution engine.
 * Coordinates with BrowserAutomator, IntentEngine, and VoiceManager.
 *
 * CRITICAL UX RULE:
 * Autonomous task execution must NEVER automatically open the sidebar or drawers.
 * Status is surfaced non-intrusively via the calm floating activity pill.
 */

import { BrowserAutomator } from './browser-automator.js';
import { StructuredIntent } from './intent-engine.js';
import { VoiceManager } from './voice-manager.js';

export type AIExecutionStatus = 'idle' | 'thinking' | 'executing' | 'waiting' | 'success' | 'error';

export interface AIStep {
  id: string;
  stepNumber: number;
  description: string;
  status: 'PENDING' | 'ACTIVE' | 'SUCCESS' | 'FAILED';
  result?: any;
}

export interface AIExecutionState {
  status: AIExecutionStatus;
  taskId?: string;
  goal?: string;
  currentAction?: string;
  progress: number; // 0.0 to 1.0
  steps: AIStep[];
  requiresApproval?: boolean;
  approvalPayload?: any;
  error?: string;
}

export type AIStateListener = (state: AIExecutionState) => void;

export class AIExecutionCoordinator {
  private static instance: AIExecutionCoordinator | null = null;

  private state: AIExecutionState = {
    status: 'idle',
    progress: 0,
    steps: [],
  };

  private listeners: Set<AIStateListener> = new Set();
  private automator: BrowserAutomator;
  private collapseTimer: any = null;
  private activeUtterances: Set<any> = new Set();

  private constructor() {
    this.automator = BrowserAutomator.getInstance();
  }

  public static getInstance(): AIExecutionCoordinator {
    if (!AIExecutionCoordinator.instance) {
      AIExecutionCoordinator.instance = new AIExecutionCoordinator();
    }
    return AIExecutionCoordinator.instance;
  }

  public getState(): AIExecutionState {
    return { ...this.state };
  }

  public subscribe(listener: AIStateListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  private updateState(patch: Partial<AIExecutionState>): void {
    this.state = { ...this.state, ...patch };
    const snap = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(snap);
      } catch (err) {
        console.error('[AI Coordinator] Listener error:', err);
      }
    }
  }

  /**
   * Speak aloud using TTS while coordinating with VoiceManager to prevent self-triggering.
   * Defends against Chromium Web Speech garbage collection bugs by retaining utterance refs.
   */
  public speak(text: string): Promise<void> {
    return new Promise((resolve) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window) || !text) {
        resolve();
        return;
      }

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.pitch = 1.0;

      this.activeUtterances.add(utterance);
      VoiceManager.getInstance().setSpeakingTTS(true);

      let finished = false;
      const cleanup = () => {
        if (!finished) {
          finished = true;
          this.activeUtterances.delete(utterance);
          VoiceManager.getInstance().setSpeakingTTS(false);
          resolve();
        }
      };

      utterance.onend = cleanup;
      utterance.onerror = cleanup;

      // Chrome GC failsafe timeout
      const safetyMs = Math.max(2500, text.length * 90);
      setTimeout(cleanup, safetyMs);

      window.speechSynthesis.speak(utterance);
    });
  }

  /**
   * Execute an autonomous task directly from a StructuredIntent without UI intervention.
   */
  public async executeIntent(intent: StructuredIntent): Promise<void> {
    if (!intent) return;

    const taskId = `task-${Date.now()}`;
    console.log(`[AI] task created (ID: ${taskId}, Type: ${intent.type}, Raw: "${intent.rawText}")`);

    if (this.collapseTimer) {
      clearTimeout(this.collapseTimer);
      this.collapseTimer = null;
    }

    // Clarification-only intents (e.g. standalone "Hey Tesseract")
    if (intent.type === 'clarification') {
      if (intent.spokenIntro) {
        await this.speak(intent.spokenIntro);
      }
      VoiceManager.getInstance().resetVoiceSession();
      return;
    }

    const steps: AIStep[] = [
      { id: 's1', stepNumber: 1, description: `Analyze request: ${intent.type}`, status: 'SUCCESS' },
      { id: 's2', stepNumber: 2, description: intent.spokenIntro || `Executing ${intent.action || intent.type}`, status: 'ACTIVE' },
      { id: 's3', stepNumber: 3, description: 'Verify page state', status: 'PENDING' },
    ];

    this.updateState({
      status: 'executing',
      taskId,
      goal: intent.cleanText || intent.rawText,
      currentAction: intent.spokenIntro || 'Working...',
      progress: 0.3,
      steps,
      error: undefined,
    });

    // 1. Brief spoken announcement (run concurrently in background with zero navigation lag)
    if (intent.spokenIntro) {
      this.speak(intent.spokenIntro).catch(() => {});
    }

    try {
      // 2. Dispatch to BrowserAutomator based on structured intent type
      let success = false;
      let actionResult: any = null;

      switch (intent.type) {
        case 'browser_control': {
          console.log(`[AI] action: browser_control (${intent.action})`);
          if (intent.action === 'back') {
            const res = await this.automator.goBack();
            success = res.success;
          } else if (intent.action === 'forward') {
            const res = await this.automator.goForward();
            success = res.success;
          } else if (intent.action === 'reload') {
            const res = await this.automator.reload();
            success = res.success;
          } else if (intent.action === 'new_tab') {
            const res = await this.automator.createTab('about:blank');
            success = res.success;
          } else if (intent.action === 'close_tab') {
            const res = await this.automator.closeCurrentTab();
            success = res.success;
          } else if (intent.action === 'pause') {
            const res = await this.automator.pauseMedia();
            success = res.success;
          } else if (intent.action === 'resume') {
            const res = await this.automator.resumeMedia();
            success = res.success;
          } else if (intent.action === 'scroll_down') {
            const res = await this.automator.scrollDown();
            success = res.success;
          } else if (intent.action === 'scroll_up') {
            const res = await this.automator.scrollUp();
            success = res.success;
          }
          break;
        }

        case 'navigation':
        case 'search':
        case 'shopping': {
          if (!intent.targetUrl) throw new Error('No target URL in navigation intent');
          console.log(`[AI] action: navigate (Target: ${intent.targetUrl}, NewTab: ${Boolean(intent.inNewTab)})`);
          this.updateState({ progress: 0.6, currentAction: `Navigating to ${intent.siteContext || 'page'}` });

          let navRes: any;
          if (intent.inNewTab) {
            navRes = await this.automator.createTab(intent.targetUrl);
          } else {
            navRes = await this.automator.navigate(intent.targetUrl, (msg) => {
              this.updateState({ currentAction: msg });
            });
          }
          success = navRes.success;
          actionResult = navRes.result;
          break;
        }

        case 'media_playback': {
          if (!intent.targetUrl) throw new Error('No target URL in media intent');
          console.log(`[AI] action: media_playback (Target: ${intent.targetUrl}, NewTab: ${Boolean(intent.inNewTab)})`);
          this.updateState({ progress: 0.5, currentAction: 'Loading media page...' });

          let navRes: any;
          if (intent.inNewTab) {
            navRes = await this.automator.createTab(intent.targetUrl);
          } else {
            navRes = await this.automator.navigate(intent.targetUrl);
          }

          if (navRes.success && intent.autoPlayMedia) {
            this.updateState({ progress: 0.8, currentAction: 'Starting playback...' });
            await new Promise((r) => setTimeout(r, 1800));
            const mediaRes = await this.automator.playFirstMedia();
            success = mediaRes.success;
            actionResult = mediaRes.result;
          } else {
            success = navRes.success;
          }
          break;
        }

        case 'page_action': {
          console.log(`[AI] action: page_action (Action: ${intent.action}, Referent: ${intent.referent})`);
          if (intent.action === 'click') {
            const index = intent.parameters?.index ?? 0;
            const res = await this.automator.playOrdinalMedia(index);
            success = res.success;
            actionResult = res.result;
          }
          break;
        }

        case 'check_messages': {
          console.log('[AI] action: check_messages');
          this.updateState({ progress: 0.4, currentAction: 'Checking messages...' });
          if (intent.targetUrl) {
            if (intent.inNewTab) await this.automator.createTab(intent.targetUrl);
            else await this.automator.navigate(intent.targetUrl);
            await new Promise(r => setTimeout(r, 2000));
          }

          const dmRes = await this.automator.inspectSocialDMs();
          if (dmRes.success && dmRes.result?.sender) {
            const announcement = `${dmRes.result.sender} messaged: "${dmRes.result.preview}".`;
            this.updateState({ progress: 1.0, currentAction: announcement });
            await this.speak(announcement);
            success = true;
            actionResult = dmRes.result;
          } else {
            const notice = "I checked the messages, but no unread messages are visible right now.";
            this.updateState({ progress: 1.0, currentAction: notice });
            await this.speak(notice);
            success = true;
          }
          break;
        }

        case 'reply_message': {
          const replyText = intent.query || intent.cleanText;
          console.log(`[AI] action: reply_message ("${replyText}")`);
          this.updateState({ progress: 0.6, currentAction: `Sending reply: "${replyText}"` });
          const replyRes = await this.automator.sendDirectMessage(replyText);
          if (replyRes.success) {
            await this.speak(`Sent reply: "${replyText}".`);
            success = true;
            actionResult = replyRes.result;
          } else {
            await this.speak("I couldn't find the message input field to send a reply.");
            success = false;
          }
          break;
        }

        case 'autofill_form': {
          console.log('[AI] action: autofill_form');
          this.updateState({ progress: 0.6, currentAction: 'Filling address from local memory...' });
          const fillRes = await this.automator.autofillAddress();
          if (fillRes.success) {
            await this.speak("I've populated your saved address details into the form.");
            success = true;
            actionResult = fillRes.result;
          } else {
            await this.speak(fillRes.error || "No matching address fields found on this page.");
            success = false;
          }
          break;
        }

        case 'co_browse': {
          console.log(`[AI] action: co_browse (${intent.action})`);
          this.updateState({ progress: 0.6, currentAction: 'Observing content...' });
          const obsRes = await this.automator.observeCoBrowsingContent();
          if (obsRes.success && obsRes.result) {
            const data = obsRes.result;
            if (intent.action === 'suggest_media' && data.recommendations && data.recommendations.length > 0) {
              const suggestions = data.recommendations.slice(0, 2).join(' or ');
              await this.speak(`You might like watching: ${suggestions}. Want me to play one?`);
            } else if (data.title) {
              const creator = data.channel ? ` by ${data.channel}` : '';
              await this.speak(`We are viewing "${data.title}"${creator}.`);
            } else {
              await this.speak("I am watching this page with you.");
            }
            success = true;
            actionResult = data;
          } else {
            await this.speak("I'm observing the screen with you.");
            success = true;
          }
          break;
        }

        case 'comparison': {
          console.log(`[AI] action: comparison (${intent.query})`);
          if (intent.targetUrl) {
            await this.automator.navigate(intent.targetUrl);
          }
          success = true;
          break;
        }

        default:
          success = true;
          break;
      }

      steps[1].status = success ? 'SUCCESS' : 'FAILED';
      steps[2].status = success ? 'SUCCESS' : 'FAILED';

      if (success) {
        console.log(`[AI] task completed: "${intent.cleanText || intent.rawText}"`);
        this.updateState({
          status: 'success',
          currentAction: 'Done',
          progress: 1.0,
          steps,
        });
      } else {
        console.error(`[AI] task action failed: "${intent.cleanText || intent.rawText}"`);
        this.updateState({
          status: 'error',
          currentAction: 'Action could not be completed',
          error: 'Action failed',
          progress: 1.0,
          steps,
        });
        await this.speak("I couldn't complete that action.");
      }
    } catch (err: any) {
      console.error('[AI] task execution error:', err);
      steps[1].status = 'FAILED';
      this.updateState({
        status: 'error',
        currentAction: 'Error occurred',
        error: err.message,
        progress: 1.0,
        steps,
      });
      await this.speak("I encountered an issue opening that page.");
    } finally {
      this.scheduleAutoCollapse();
      // CRITICAL PIPELINE RETURN: explicitly reset voice session and resume wake listening!
      VoiceManager.getInstance().resetVoiceSession();
    }
  }

  private scheduleAutoCollapse(): void {
    if (this.collapseTimer) clearTimeout(this.collapseTimer);
    this.collapseTimer = setTimeout(() => {
      if (this.state.status === 'success' || this.state.status === 'error') {
        this.updateState({
          status: 'idle',
          currentAction: undefined,
          progress: 0,
        });
      }
    }, 3200);
  }
}
