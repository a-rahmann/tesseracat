/**
 * Fast-Path Deterministic Command Classifier.
 * Executes simple browser and playback controls in <50ms without invoking Gemma or any LLM.
 */
export type FastPathAction = 'back' | 'forward' | 'reload' | 'new_tab' | 'close_tab' | 'undo_tab' | 'pause' | 'resume' | 'scroll_down' | 'scroll_up' | 'scroll_top' | 'scroll_bottom' | 'stop' | 'focus_address_bar';
export interface FastPathMatch {
    action: FastPathAction;
    spokenFeedback: string;
}
export declare class FastPathClassifier {
    static classify(rawText: string): FastPathMatch | null;
}
//# sourceMappingURL=fast-path.d.ts.map