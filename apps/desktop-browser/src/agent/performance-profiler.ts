/**
 * PerformanceProfiler: Real-time latency tracking and telemetry for Tesseract.
 * Accurately measures STT, NLU, Planning, First Action, and Total Completion times.
 */

export interface StageTimings {
  sttMs: number;
  nluMs: number;
  planningMs: number;
  firstActionMs: number;
  navDispatchMs: number;
  navigationWaitMs: number;
  pageReadyMs: number;
  ttsMs: number;
  taskFinalizeMs: number;
  totalMs: number;
}

export interface LatencyBreakdown {
  command: string;
  sttMs?: number;
  nluMs?: number;
  planningMs?: number;
  firstActionMs?: number;
  navDispatchMs?: number;
  navigationWaitMs?: number;
  pageReadyMs?: number;
  ttsMs?: number;
  taskFinalizeMs?: number;
  totalCompletionMs?: number;
  isFastPath?: boolean;
  isCompound?: boolean;
  tokensPerSec?: number;
  timings?: StageTimings;
  stages: { name: string; timestamp: number; elapsedSinceStartMs: number }[];
}

export type LatencyListener = (breakdown: LatencyBreakdown) => void;

export class PerformanceProfiler {
  private static instance: PerformanceProfiler | null = null;
  private currentSession: {
    command: string;
    startTime: number;
    sttMs?: number;
    nluEnd?: number;
    planningEnd?: number;
    firstActionTime?: number;
    navDispatchTime?: number;
    navigationWaitMs?: number;
    pageReadyTime?: number;
    ttsStartTime?: number;
    ttsDurationMs?: number;
    taskFinalizeTime?: number;
    endTime?: number;
    isFastPath?: boolean;
    isCompound?: boolean;
    stages: { name: string; timestamp: number; elapsedSinceStartMs: number }[];
  } | null = null;

  private listeners: Set<LatencyListener> = new Set();
  private recentBreakdowns: LatencyBreakdown[] = [];

  private constructor() {}

  public static getInstance(): PerformanceProfiler {
    if (!PerformanceProfiler.instance) {
      PerformanceProfiler.instance = new PerformanceProfiler();
    }
    return PerformanceProfiler.instance;
  }

  public subscribe(listener: LatencyListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public startCommand(rawText: string, sttMs?: number): void {
    const now = Date.now();
    this.currentSession = {
      command: rawText,
      startTime: now,
      sttMs,
      stages: [{ name: 'Command Received', timestamp: now, elapsedSinceStartMs: 0 }],
    };
    this.notify();
  }

  public markStage(stageName: string): void {
    if (!this.currentSession) return;
    const now = Date.now();
    const elapsed = now - this.currentSession.startTime;
    this.currentSession.stages.push({
      name: stageName,
      timestamp: now,
      elapsedSinceStartMs: elapsed,
    });
    this.notify();
  }

  public markNlu(isFastPath: boolean = false, isCompound: boolean = false): number {
    if (!this.currentSession) return 0;
    const now = Date.now();
    this.currentSession.nluEnd = now;
    this.currentSession.isFastPath = isFastPath;
    this.currentSession.isCompound = isCompound;
    const nluMs = now - this.currentSession.startTime;
    this.markStage(isFastPath ? 'NLU (Fast Path)' : 'NLU Complete');
    return nluMs;
  }

  public markPlanning(): number {
    if (!this.currentSession) return 0;
    const now = Date.now();
    this.currentSession.planningEnd = now;
    const planningMs = this.currentSession.nluEnd
      ? now - this.currentSession.nluEnd
      : 0;
    this.markStage('Planning Complete');
    return planningMs;
  }

  public markFirstAction(actionDescription?: string): number {
    if (!this.currentSession) return 0;
    if (this.currentSession.firstActionTime) return this.currentSession.firstActionTime - this.currentSession.startTime;
    const now = Date.now();
    this.currentSession.firstActionTime = now;
    const elapsed = now - this.currentSession.startTime;
    this.markStage(actionDescription ? `First Action: ${actionDescription}` : 'First Browser Action');
    return elapsed;
  }

  public markNavDispatch(targetUrl?: string): number {
    if (!this.currentSession) return 0;
    const now = Date.now();
    this.currentSession.navDispatchTime = now;
    if (!this.currentSession.firstActionTime) {
      this.currentSession.firstActionTime = now;
    }
    const elapsed = now - this.currentSession.startTime;
    this.markStage(targetUrl ? `Nav Dispatch: ${targetUrl}` : 'Nav Dispatch');
    return elapsed;
  }

  public markNavigationWait(durationMs: number): void {
    if (!this.currentSession) return;
    this.currentSession.navigationWaitMs = durationMs;
    this.markStage(`Navigation Loaded (${durationMs}ms)`);
  }

  public markPageReady(): number {
    if (!this.currentSession) return 0;
    const now = Date.now();
    this.currentSession.pageReadyTime = now;
    const elapsed = now - this.currentSession.startTime;
    this.markStage('Page Ready (DOM/Content Usable)');
    return elapsed;
  }

  public markTtsStart(text?: string): number {
    if (!this.currentSession) return 0;
    const now = Date.now();
    this.currentSession.ttsStartTime = now;
    const elapsed = now - this.currentSession.startTime;
    this.markStage(text ? `TTS Started: "${text.slice(0, 30)}..."` : 'TTS Started');
    return elapsed;
  }

  public markTtsEnd(): number {
    if (!this.currentSession) return 0;
    const now = Date.now();
    const duration = this.currentSession.ttsStartTime ? now - this.currentSession.ttsStartTime : 0;
    this.currentSession.ttsDurationMs = duration;
    this.markStage(`TTS Finished (${duration}ms)`);
    return duration;
  }

  public markTaskFinalize(): number {
    if (!this.currentSession) return 0;
    const now = Date.now();
    this.currentSession.taskFinalizeTime = now;
    const elapsed = now - this.currentSession.startTime;
    this.markStage('Task Finalized');
    return elapsed;
  }

  public markComplete(success: boolean = true): LatencyBreakdown | null {
    if (!this.currentSession) return null;
    const now = Date.now();
    this.currentSession.endTime = now;
    this.markStage(success ? 'Task Completed' : 'Task Failed');

    const stt = this.currentSession.sttMs ?? 0;
    const nlu = this.currentSession.nluEnd ? Math.max(0, this.currentSession.nluEnd - this.currentSession.startTime) : 1;
    const plan = this.currentSession.planningEnd && this.currentSession.nluEnd
      ? Math.max(0, this.currentSession.planningEnd - this.currentSession.nluEnd)
      : 0;
    const firstAct = this.currentSession.firstActionTime
      ? Math.max(0, this.currentSession.firstActionTime - this.currentSession.startTime)
      : (this.currentSession.navDispatchTime ? Math.max(0, this.currentSession.navDispatchTime - this.currentSession.startTime) : 1);
    const navDispatch = this.currentSession.navDispatchTime
      ? Math.max(0, this.currentSession.navDispatchTime - this.currentSession.startTime)
      : firstAct;
    const navWait = this.currentSession.navigationWaitMs ?? 0;
    const pageReady = this.currentSession.pageReadyTime
      ? Math.max(0, this.currentSession.pageReadyTime - this.currentSession.startTime)
      : 0;
    const tts = this.currentSession.ttsDurationMs ?? 0;
    const total = Math.max(0, now - this.currentSession.startTime);
    const finalize = Math.max(0, total - Math.max(navDispatch, firstAct));

    const timings: StageTimings = {
      sttMs: stt,
      nluMs: nlu,
      planningMs: plan,
      firstActionMs: firstAct,
      navDispatchMs: navDispatch,
      navigationWaitMs: navWait,
      pageReadyMs: pageReady,
      ttsMs: tts,
      taskFinalizeMs: finalize,
      totalMs: total,
    };

    const breakdown: LatencyBreakdown = {
      command: this.currentSession.command,
      sttMs: this.currentSession.sttMs,
      nluMs: this.currentSession.nluEnd ? this.currentSession.nluEnd - this.currentSession.startTime : undefined,
      planningMs: this.currentSession.planningEnd && this.currentSession.nluEnd ? this.currentSession.planningEnd - this.currentSession.nluEnd : (this.currentSession.isFastPath ? 0 : undefined),
      firstActionMs: this.currentSession.firstActionTime ? this.currentSession.firstActionTime - this.currentSession.startTime : undefined,
      navDispatchMs: navDispatch,
      navigationWaitMs: navWait,
      pageReadyMs: pageReady,
      ttsMs: tts,
      taskFinalizeMs: finalize,
      totalCompletionMs: total,
      isFastPath: this.currentSession.isFastPath,
      isCompound: this.currentSession.isCompound,
      timings,
      stages: [...this.currentSession.stages],
    };

    this.recentBreakdowns.unshift(breakdown);
    if (this.recentBreakdowns.length > 50) this.recentBreakdowns.pop();

    this.notify(breakdown);
    console.log(`[PerformanceProfiler] ${this.formatSummary(breakdown)}`);
    return breakdown;
  }

  public getCurrentElapsedMs(): number {
    if (!this.currentSession) return 0;
    return Date.now() - this.currentSession.startTime;
  }

  public getLatestBreakdown(): LatencyBreakdown | null {
    return this.recentBreakdowns[0] || null;
  }

  public formatTimingTable(timings: StageTimings): string {
    const lines = [
      '----------------------------------------',
      `[TIMING BREAKDOWN]`,
      `STT:             ${String(timings.sttMs).padStart(6)} ms`,
      `NLU:             ${String(timings.nluMs).padStart(6)} ms`,
      `Planning:        ${String(timings.planningMs).padStart(6)} ms`,
      `First Action:    ${String(timings.firstActionMs).padStart(6)} ms`,
      `Nav Dispatch:    ${String(timings.navDispatchMs).padStart(6)} ms`,
      `Navigation Wait: ${String(timings.navigationWaitMs).padStart(6)} ms`,
      `Page Ready:      ${String(timings.pageReadyMs).padStart(6)} ms`,
      `TTS:             ${String(timings.ttsMs).padStart(6)} ms`,
      `Task Finalize:   ${String(timings.taskFinalizeMs).padStart(6)} ms`,
      '----------------------------------------',
      `TOTAL:           ${String(timings.totalMs).padStart(6)} ms`,
      '----------------------------------------',
    ];
    return lines.join('\n');
  }

  public formatSummary(b: LatencyBreakdown): string {
    const stt = b.sttMs !== undefined ? `${b.sttMs}ms` : 'n/a';
    const nlu = b.nluMs !== undefined ? `${b.nluMs}ms` : 'n/a';
    const plan = b.planningMs !== undefined ? `${b.planningMs}ms` : '0ms';
    const firstAct = b.firstActionMs !== undefined ? `${b.firstActionMs}ms` : 'n/a';
    const total = b.totalCompletionMs !== undefined ? `${b.totalCompletionMs}ms` : 'n/a';
    const type = b.isFastPath ? '⚡ Fast Path' : (b.isCompound ? '🔗 Compound Agent' : '🤖 Standard Agent');

    return `[Latency Summary | ${type}] "${b.command}" => STT: ${stt} | NLU: ${nlu} | Plan: ${plan} | 1st Action: ${firstAct} | Total: ${total}`;
  }

  private notify(specificBreakdown?: LatencyBreakdown): void {
    const breakdown = specificBreakdown || (this.currentSession ? {
      command: this.currentSession.command,
      sttMs: this.currentSession.sttMs,
      nluMs: this.currentSession.nluEnd ? this.currentSession.nluEnd - this.currentSession.startTime : undefined,
      planningMs: this.currentSession.planningEnd && this.currentSession.nluEnd ? this.currentSession.planningEnd - this.currentSession.nluEnd : undefined,
      firstActionMs: this.currentSession.firstActionTime ? this.currentSession.firstActionTime - this.currentSession.startTime : undefined,
      totalCompletionMs: Date.now() - this.currentSession.startTime,
      isFastPath: this.currentSession.isFastPath,
      isCompound: this.currentSession.isCompound,
      stages: [...this.currentSession.stages],
    } : null);

    if (!breakdown) return;
    for (const listener of this.listeners) {
      try {
        listener(breakdown);
      } catch (err) {
        console.error('[PerformanceProfiler] Listener error:', err);
      }
    }
  }
}
