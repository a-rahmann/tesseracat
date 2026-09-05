"use strict";
/**
 * Fast-Path Deterministic Command Classifier.
 * Executes simple browser and playback controls in <50ms without invoking Gemma or any LLM.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FastPathClassifier = void 0;
class FastPathClassifier {
    static classify(rawText) {
        if (!rawText)
            return null;
        const clean = rawText
            .toLowerCase()
            .replace(/^(hey|hi|hello|ok|okay)?\s*tesseract[,.]?\s*/i, '')
            .replace(/[?.!,]/g, '')
            .trim();
        // 1. Navigation
        if (/^(go\s+)?back$/i.test(clean) || clean === 'previous page') {
            return { action: 'back', spokenFeedback: 'Going back.' };
        }
        if (/^(go\s+)?forward$/i.test(clean) || clean === 'next page') {
            return { action: 'forward', spokenFeedback: 'Going forward.' };
        }
        if (/^(reload|refresh)(\s+page|\s+this\s+page)?$/i.test(clean)) {
            return { action: 'reload', spokenFeedback: 'Reloading.' };
        }
        // 2. Tabs
        if (/^(open\s+)?(a\s+)?new\s+tab$/i.test(clean) || clean === 'create tab') {
            return { action: 'new_tab', spokenFeedback: 'New tab opened.' };
        }
        if (/^(close|shut)(\s+this|\s+the)?\s+tab$/i.test(clean)) {
            return { action: 'close_tab', spokenFeedback: 'Tab closed.' };
        }
        if (/^(undo\s+tab|reopen\s+tab|restore\s+tab|undo\s+closed\s+tab)$/i.test(clean)) {
            return { action: 'undo_tab', spokenFeedback: 'Restoring tab.' };
        }
        // 3. Media
        if (/^(pause|pause\s+video|pause\s+media|pause\s+music)$/i.test(clean)) {
            return { action: 'pause', spokenFeedback: 'Paused.' };
        }
        if (/^(resume|play|resume\s+video|play\s+video|resume\s+media)$/i.test(clean)) {
            return { action: 'resume', spokenFeedback: 'Resuming.' };
        }
        // 4. Scrolling
        if (/^(scroll\s+down|down|page\s+down|scroll\s+a\s+bit\s+down)$/i.test(clean)) {
            return { action: 'scroll_down', spokenFeedback: 'Scrolling down.' };
        }
        if (/^(scroll\s+up|up|page\s+up|scroll\s+a\s+bit\s+up)$/i.test(clean)) {
            return { action: 'scroll_up', spokenFeedback: 'Scrolling up.' };
        }
        if (/^(scroll\s+to\s+)?top(\s+of\s+page)?$/i.test(clean)) {
            return { action: 'scroll_top', spokenFeedback: 'Scrolled to top.' };
        }
        if (/^(scroll\s+to\s+)?bottom(\s+of\s+page)?$/i.test(clean)) {
            return { action: 'scroll_bottom', spokenFeedback: 'Scrolled to bottom.' };
        }
        // 5. Interruption / Control
        if (/^(stop|cancel|abort|never\s+mind|shut\s+up)$/i.test(clean)) {
            return { action: 'stop', spokenFeedback: 'Stopped.' };
        }
        if (/^(focus\s+(address|url|search)\s+bar|address\s+bar)$/i.test(clean)) {
            return { action: 'focus_address_bar', spokenFeedback: 'Address bar ready.' };
        }
        return null;
    }
}
exports.FastPathClassifier = FastPathClassifier;
//# sourceMappingURL=fast-path.js.map