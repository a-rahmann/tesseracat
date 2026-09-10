/**
 * AISidecarClient: Electron Main Process Client for Tesseract AI Engine Sidecar
 *
 * Spawns and supervises the out-of-process AI Engine Sidecar process (`ai-sidecar-process.ts`).
 * Ensures Electron never blocks its main event loop during speech recognition or heavy AI compute.
 */
export interface SidecarTranscribeResult {
    text: string;
    elapsedMs: number;
    confidence: number;
    model: string;
}
export declare class AISidecarClient {
    private static instance;
    private child;
    private isSpawning;
    private requestCounter;
    private pendingRequests;
    private constructor();
    static getInstance(): AISidecarClient;
    /**
     * Spawns the AI Engine sidecar process if not already running.
     */
    ensureRunning(): Promise<boolean>;
    /**
     * Pings the sidecar process to verify IPC readiness.
     */
    ping(timeoutMs?: number): Promise<boolean>;
    /**
     * Transcribe audio buffer through the isolated sidecar process.
     * Runs in <500ms on CPU without blocking the Electron main thread.
     */
    transcribe(audioData: Float32Array | Buffer, modelTier?: string): Promise<SidecarTranscribeResult>;
    /**
     * Fallback HTTP transcription directly to the sidecar's diagnostic port.
     */
    private transcribeViaHttp;
    /**
     * Graceful shutdown on application exit.
     */
    shutdown(): void;
}
//# sourceMappingURL=ai-sidecar-client.d.ts.map