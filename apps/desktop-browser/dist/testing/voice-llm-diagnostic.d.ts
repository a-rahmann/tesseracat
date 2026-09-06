/**
 * Voice & LLM Diagnostic Suite for Tesseract.
 * Executes live inside the Electron browser window with real Chromium webviews,
 * real Ollama Gemma 3 4B local LLM, and real Whisper transcription pipeline.
 *
 * Verifies:
 * 1. Low-Confidence / Incoherent Transcription Gate ("And you open and surround.")
 *    -> Safely rejected, apologizes, resets to WAKE_LISTENING, 0 rogue tasks launched.
 * 2. Root Cause DOMException Fix & Live Ollama Gemma 3 4B Structured Output
 *    -> No AbortError/DOMException, detailed diagnostics logged, valid JSON produced.
 * 3. Natural Language Understanding (NLU) structured interpretation
 * 4. Planner structured plan generation
 * 5. ActionLoop Reasoning & Live Webview Execution
 * 6. Whisper Transcription Engine verification
 */
export interface DiagnosticReport {
    id: number;
    name: string;
    verdict: 'PASS' | 'FAIL';
    userInput: string;
    observedWebpage?: string;
    observedState?: string;
    toolCalls: string[];
    stateTransitions: string[];
    evidence: string;
    diagnostics?: any;
}
export declare function runVoiceLlmDiagnosticSuite(): Promise<DiagnosticReport[]>;
//# sourceMappingURL=voice-llm-diagnostic.d.ts.map