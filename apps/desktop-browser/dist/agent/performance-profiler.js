"use strict";
/**
 * PerformanceProfiler: Real-time latency tracking and telemetry for Tesseract.
 * Accurately measures STT, NLU, Planning, First Action, and Total Completion times.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PerformanceProfiler = void 0;
class PerformanceProfiler {
    static instance = null;
    currentSession = null;
    listeners = new Set();
    recentBreakdowns = [];
    constructor() { }
    static getInstance() {
        if (!PerformanceProfiler.instance) {
            PerformanceProfiler.instance = new PerformanceProfiler();
        }
        return PerformanceProfiler.instance;
    }
    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
    startCommand(rawText, sttMs) {
        const now = Date.now();
        this.currentSession = {
            command: rawText,
            startTime: now,
            sttMs,
            stages: [{ name: 'Command Received', timestamp: now, elapsedSinceStartMs: 0 }],
        };
        this.notify();
    }
    markStage(stageName) {
        if (!this.currentSession)
            return;
        const now = Date.now();
        const elapsed = now - this.currentSession.startTime;
        this.currentSession.stages.push({
            name: stageName,
            timestamp: now,
            elapsedSinceStartMs: elapsed,
        });
        this.notify();
    }
    markNlu(isFastPath = false, isCompound = false) {
        if (!this.currentSession)
            return 0;
        const now = Date.now();
        this.currentSession.nluEnd = now;
        this.currentSession.isFastPath = isFastPath;
        this.currentSession.isCompound = isCompound;
        const nluMs = now - this.currentSession.startTime;
        this.markStage(isFastPath ? 'NLU (Fast Path)' : 'NLU Complete');
        return nluMs;
    }
    markPlanning() {
        if (!this.currentSession)
            return 0;
        const now = Date.now();
        this.currentSession.planningEnd = now;
        const planningMs = this.currentSession.nluEnd
            ? now - this.currentSession.nluEnd
            : 0;
        this.markStage('Planning Complete');
        return planningMs;
    }
    markFirstAction(actionDescription) {
        if (!this.currentSession)
            return 0;
        if (this.currentSession.firstActionTime)
            return this.currentSession.firstActionTime - this.currentSession.startTime;
        const now = Date.now();
        this.currentSession.firstActionTime = now;
        const elapsed = now - this.currentSession.startTime;
        this.markStage(actionDescription ? `First Action: ${actionDescription}` : 'First Browser Action');
        return elapsed;
    }
    markNavDispatch(targetUrl) {
        if (!this.currentSession)
            return 0;
        const now = Date.now();
        this.currentSession.navDispatchTime = now;
        if (!this.currentSession.firstActionTime) {
            this.currentSession.firstActionTime = now;
        }
        const elapsed = now - this.currentSession.startTime;
        this.markStage(targetUrl ? `Nav Dispatch: ${targetUrl}` : 'Nav Dispatch');
        return elapsed;
    }
    markNavigationWait(durationMs) {
        if (!this.currentSession)
            return;
        this.currentSession.navigationWaitMs = durationMs;
        this.markStage(`Navigation Loaded (${durationMs}ms)`);
    }
    markPageReady() {
        if (!this.currentSession)
            return 0;
        const now = Date.now();
        this.currentSession.pageReadyTime = now;
        const elapsed = now - this.currentSession.startTime;
        this.markStage('Page Ready (DOM/Content Usable)');
        return elapsed;
    }
    markTtsStart(text) {
        if (!this.currentSession)
            return 0;
        const now = Date.now();
        this.currentSession.ttsStartTime = now;
        const elapsed = now - this.currentSession.startTime;
        this.markStage(text ? `TTS Started: "${text.slice(0, 30)}..."` : 'TTS Started');
        return elapsed;
    }
    markTtsEnd() {
        if (!this.currentSession)
            return 0;
        const now = Date.now();
        const duration = this.currentSession.ttsStartTime ? now - this.currentSession.ttsStartTime : 0;
        this.currentSession.ttsDurationMs = duration;
        this.markStage(`TTS Finished (${duration}ms)`);
        return duration;
    }
    markTaskFinalize() {
        if (!this.currentSession)
            return 0;
        const now = Date.now();
        this.currentSession.taskFinalizeTime = now;
        const elapsed = now - this.currentSession.startTime;
        this.markStage('Task Finalized');
        return elapsed;
    }
    markComplete(success = true) {
        if (!this.currentSession)
            return null;
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
        const timings = {
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
        const breakdown = {
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
        if (this.recentBreakdowns.length > 50)
            this.recentBreakdowns.pop();
        this.notify(breakdown);
        console.log(`[PerformanceProfiler] ${this.formatSummary(breakdown)}`);
        return breakdown;
    }
    getCurrentElapsedMs() {
        if (!this.currentSession)
            return 0;
        return Date.now() - this.currentSession.startTime;
    }
    getLatestBreakdown() {
        return this.recentBreakdowns[0] || null;
    }
    formatTimingTable(timings) {
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
    formatSummary(b) {
        const stt = b.sttMs !== undefined ? `${b.sttMs}ms` : 'n/a';
        const nlu = b.nluMs !== undefined ? `${b.nluMs}ms` : 'n/a';
        const plan = b.planningMs !== undefined ? `${b.planningMs}ms` : '0ms';
        const firstAct = b.firstActionMs !== undefined ? `${b.firstActionMs}ms` : 'n/a';
        const total = b.totalCompletionMs !== undefined ? `${b.totalCompletionMs}ms` : 'n/a';
        const type = b.isFastPath ? '⚡ Fast Path' : (b.isCompound ? '🔗 Compound Agent' : '🤖 Standard Agent');
        return `[Latency Summary | ${type}] "${b.command}" => STT: ${stt} | NLU: ${nlu} | Plan: ${plan} | 1st Action: ${firstAct} | Total: ${total}`;
    }
    notify(specificBreakdown) {
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
        if (!breakdown)
            return;
        for (const listener of this.listeners) {
            try {
                listener(breakdown);
            }
            catch (err) {
                console.error('[PerformanceProfiler] Listener error:', err);
            }
        }
    }
}
exports.PerformanceProfiler = PerformanceProfiler;
//# sourceMappingURL=performance-profiler.js.map