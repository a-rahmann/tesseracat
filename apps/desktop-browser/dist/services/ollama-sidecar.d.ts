/**
 * OllamaSidecar: Automatic local model server lifecycle manager.
 *
 * Eliminates the need for the user to open a terminal or manually run commands.
 * When Tesseract launches, OllamaSidecar:
 * 1. Checks if Ollama is already active on port 11434.
 * 2. If not, automatically locates the system binary and silently spawns `ollama serve`.
 * 3. Gracefully stops the child process on application quit.
 */
export declare class OllamaSidecar {
    private static instance;
    private process;
    private isManaged;
    private constructor();
    static getInstance(): OllamaSidecar;
    /**
     * Check if Ollama is running, and auto-spawn it in the background if available.
     */
    ensureRunning(): Promise<boolean>;
    /**
     * Health ping to Ollama HTTP API.
     */
    ping(): Promise<boolean>;
    /**
     * Look for ollama binary in common macOS and Linux install directories.
     */
    findOllamaBinary(): string | null;
    /**
     * Clean shutdown of managed daemon on app exit.
     */
    stop(): void;
}
//# sourceMappingURL=ollama-sidecar.d.ts.map