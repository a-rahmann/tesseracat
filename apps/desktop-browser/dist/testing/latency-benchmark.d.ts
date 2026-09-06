/**
 * LatencyBenchmarkSuite: Comprehensive end-to-end latency and performance verification.
 * Measures real execution timings across simple, compound, and complex agent scenarios.
 * Verifies strict non-truncation guarantees and safety boundaries on Dual-Core CPU.
 */
export interface BenchmarkReport {
    scenarioId: string;
    scenarioName: string;
    command: string;
    expectedType: 'FAST_PATH' | 'COMPOUND_PIPELINED' | 'AGENT_MISSION' | 'COHERENCE_REJECTION';
    sttTargetMs: number;
    firstActionTargetMs: number;
    measuredNluMs: number;
    measuredPlanningMs: number;
    measuredFirstActionMs: number;
    measuredTotalMs: number;
    timings: {
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
    };
    passed: boolean;
    notes: string[];
}
export declare function runLatencyBenchmarkSuite(): Promise<BenchmarkReport[]>;
//# sourceMappingURL=latency-benchmark.d.ts.map