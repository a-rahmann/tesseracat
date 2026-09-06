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
    stages: {
        name: string;
        timestamp: number;
        elapsedSinceStartMs: number;
    }[];
}
export type LatencyListener = (breakdown: LatencyBreakdown) => void;
export declare class PerformanceProfiler {
    private static instance;
    private currentSession;
    private listeners;
    private recentBreakdowns;
    private constructor();
    static getInstance(): PerformanceProfiler;
    subscribe(listener: LatencyListener): () => void;
    startCommand(rawText: string, sttMs?: number): void;
    markStage(stageName: string): void;
    markNlu(isFastPath?: boolean, isCompound?: boolean): number;
    markPlanning(): number;
    markFirstAction(actionDescription?: string): number;
    markNavDispatch(targetUrl?: string): number;
    markNavigationWait(durationMs: number): void;
    markPageReady(): number;
    markTtsStart(text?: string): number;
    markTtsEnd(): number;
    markTaskFinalize(): number;
    markComplete(success?: boolean): LatencyBreakdown | null;
    getCurrentElapsedMs(): number;
    getLatestBreakdown(): LatencyBreakdown | null;
    formatTimingTable(timings: StageTimings): string;
    formatSummary(b: LatencyBreakdown): string;
    private notify;
}
//# sourceMappingURL=performance-profiler.d.ts.map