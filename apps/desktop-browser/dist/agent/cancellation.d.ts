/**
 * Task Cancellation Tokens.
 * Enables immediate cancellation of active browser automation when user says "Stop" or presses Esc.
 */
export declare class CancellationToken {
    private _isCancelled;
    private cancelCallbacks;
    get isCancelled(): boolean;
    cancel(): void;
    onCancel(cb: () => void): void;
    throwIfCancelled(): void;
}
//# sourceMappingURL=cancellation.d.ts.map