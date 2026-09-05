export interface AudioCaptureCallbacks {
    onPcmChunk: (chunk: Float32Array) => void;
    onRmsLevel: (rms: number) => void;
    onError?: (err: Error) => void;
}
export declare class AudioCapture {
    private mediaStream;
    private audioContext;
    private workletNode;
    private sourceNode;
    private silentGain;
    private isCapturing;
    start(callbacks: AudioCaptureCallbacks): Promise<{
        sampleRate: number;
    }>;
    private watchdogInterval;
    private startHealthWatchdog;
    resumeIfSuspended(): Promise<void>;
    stop(): Promise<void>;
    isActive(): boolean;
}
//# sourceMappingURL=audio-capture.d.ts.map