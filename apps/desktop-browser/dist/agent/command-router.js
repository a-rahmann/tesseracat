"use strict";
/**
 * CommandRouter: Explicit Action-Oriented Command Classification and Routing.
 * Invariant: ACTION != SEARCH. Never default to Google search.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommandRouter = void 0;
class CommandRouter {
    static route(rawInput) {
        const raw = rawInput || '';
        const clean = raw
            .toLowerCase()
            .replace(/^(hey|hi|hello|ok|okay)?\s*tesseract[,.]?\s*/i, '')
            .replace(/[?.!,]/g, '')
            .trim();
        // 1. FAST PATH CONTROLS (Deterministic <1ms, zero LLM)
        if (/^(go\s+)?back$/i.test(clean) || clean === 'previous page') {
            return { action: 'BACK', location: 'current_page', rawText: raw, cleanText: clean, isFastPath: true, requiresBrowserPerception: false };
        }
        if (/^(go\s+)?forward$/i.test(clean) || clean === 'next page') {
            return { action: 'FORWARD', location: 'current_page', rawText: raw, cleanText: clean, isFastPath: true, requiresBrowserPerception: false };
        }
        if (/^(reload|refresh)(\s+page|\s+this\s+page)?$/i.test(clean)) {
            return { action: 'NAVIGATE', location: 'current_page', description: 'reload', rawText: raw, cleanText: clean, isFastPath: true, requiresBrowserPerception: false };
        }
        if (/^(stop|cancel|abort|never\s+mind|shut\s+up)$/i.test(clean)) {
            return { action: 'STOP', location: 'current_page', rawText: raw, cleanText: clean, isFastPath: true, requiresBrowserPerception: false };
        }
        if (/^(pause|pause\s+(?:the\s+)?(?:video|media|music|playback))$/i.test(clean)) {
            return { action: 'PAUSE', target: 'video', location: 'current_page', rawText: raw, cleanText: clean, isFastPath: true, requiresBrowserPerception: false };
        }
        if (/^(resume|unpause|(?:resume|play)\s+(?:the\s+)?(?:video|media|music|playback))$/i.test(clean) || clean === 'play') {
            return { action: 'RESUME', target: 'video', location: 'current_page', rawText: raw, cleanText: clean, isFastPath: true, requiresBrowserPerception: false };
        }
        if (/^scroll\s+down/i.test(clean) || clean === 'down') {
            return { action: 'SCROLL', location: 'current_page', description: 'down', rawText: raw, cleanText: clean, isFastPath: true, requiresBrowserPerception: false };
        }
        if (/^scroll\s+up/i.test(clean) || clean === 'up') {
            return { action: 'SCROLL', location: 'current_page', description: 'up', rawText: raw, cleanText: clean, isFastPath: true, requiresBrowserPerception: false };
        }
        if (/^close(\s+this|\s+the)?\s+tab$/i.test(clean)) {
            return { action: 'CLOSE', target: 'tab', location: 'current_page', rawText: raw, cleanText: clean, isFastPath: true, requiresBrowserPerception: false };
        }
        if (/^(open\s+)?(a\s+)?new\s+tab$/i.test(clean)) {
            return { action: 'OPEN', target: 'tab', location: 'new_tab', rawText: raw, cleanText: clean, isFastPath: true, requiresBrowserPerception: false };
        }
        // 2. TARGET-AWARE PLAY COMMANDS ("Play Loser on YouTube", "Play cats", "Play the first video")
        const playMatch = clean.match(/^play\s+(.+)$/i);
        if (playMatch) {
            let subject = playMatch[1].trim();
            // "Play the first / second / third video"
            const ordMatch = subject.match(/^(?:the\s+)?(first|second|third|fourth|1st|2nd|3rd|4th|last)\s+(?:video|one|result)$/i);
            if (ordMatch) {
                const wordMap = { first: 1, '1st': 1, second: 2, '2nd': 2, third: 3, '3rd': 3, fourth: 4, '4th': 4, last: 99 };
                return {
                    action: 'PLAY',
                    target: 'video',
                    location: 'current_page',
                    index: wordMap[ordMatch[1].toLowerCase()] || 1,
                    rawText: raw,
                    cleanText: clean,
                    isFastPath: false,
                    requiresBrowserPerception: true,
                };
            }
            // "Play the video [on my screen]"
            if (/^(?:the\s+)?video(?:\s+(?:on|in)\s+(?:my\s+)?screen)?$/i.test(subject) || subject === 'it' || subject === 'this') {
                return {
                    action: 'PLAY',
                    target: 'video',
                    location: 'current_page',
                    rawText: raw,
                    cleanText: clean,
                    isFastPath: false,
                    requiresBrowserPerception: true,
                };
            }
            // "Play [query] on YouTube"
            const ytMatch = subject.match(/(.+?)\s+(?:on|from)\s+youtube$/i);
            if (ytMatch) {
                return {
                    action: 'PLAY',
                    target: 'video',
                    location: 'youtube',
                    query: ytMatch[1].trim(),
                    rawText: raw,
                    cleanText: clean,
                    isFastPath: false,
                    requiresBrowserPerception: true,
                };
            }
            // "Play [query]" default to video play flow
            return {
                action: 'PLAY',
                target: 'video',
                location: 'youtube',
                query: subject,
                rawText: raw,
                cleanText: clean,
                isFastPath: false,
                requiresBrowserPerception: true,
            };
        }
        // 3. CONTEXTUAL CLICK COMMANDS ("Click the video on my screen", "Click the blue button", "Click Rahul")
        const clickMatch = clean.match(/^click\s+(?:on\s+)?(?:the\s+)?(.+)$/i);
        if (clickMatch) {
            const subject = clickMatch[1].trim();
            // "Click the video on my screen"
            if (/^video(?:\s+(?:on|in)\s+(?:my\s+)?screen)?$/i.test(subject)) {
                return {
                    action: 'CLICK',
                    target: 'video',
                    location: 'current_page',
                    description: 'video on screen',
                    rawText: raw,
                    cleanText: clean,
                    isFastPath: false,
                    requiresBrowserPerception: true,
                };
            }
            // "Click the first / second / third one"
            const ordMatch = subject.match(/^(first|second|third|fourth|1st|2nd|3rd|4th|last)(?:\s+(?:one|result|item|video))?$/i);
            if (ordMatch) {
                const wordMap = { first: 1, '1st': 1, second: 2, '2nd': 2, third: 3, '3rd': 3, fourth: 4, '4th': 4, last: 99 };
                return {
                    action: 'CLICK',
                    target: 'element',
                    location: 'current_page',
                    index: wordMap[ordMatch[1].toLowerCase()] || 1,
                    rawText: raw,
                    cleanText: clean,
                    isFastPath: false,
                    requiresBrowserPerception: true,
                };
            }
            // "Click [description / name]" e.g. "blue button", "login", "Rahul"
            return {
                action: 'CLICK',
                target: 'element',
                location: 'current_page',
                description: subject,
                query: subject,
                rawText: raw,
                cleanText: clean,
                isFastPath: false,
                requiresBrowserPerception: true,
            };
        }
        // 4. NAVIGATION COMMANDS ("Open YouTube", "Go to Instagram", "Open Gmail")
        const navMatch = clean.match(/^(?:open|go\s+to|navigate\s+to|launch|visit)\s+(.+)$/i);
        if (navMatch) {
            const dest = navMatch[1].trim();
            if (/youtube/i.test(dest))
                return { action: 'NAVIGATE', location: 'youtube', rawText: raw, cleanText: clean, isFastPath: false, requiresBrowserPerception: false };
            if (/instagram/i.test(dest))
                return { action: 'NAVIGATE', location: 'instagram', rawText: raw, cleanText: clean, isFastPath: false, requiresBrowserPerception: false };
            if (/gmail/i.test(dest))
                return { action: 'NAVIGATE', location: 'gmail', rawText: raw, cleanText: clean, isFastPath: false, requiresBrowserPerception: false };
            if (/amazon/i.test(dest))
                return { action: 'NAVIGATE', location: 'amazon', rawText: raw, cleanText: clean, isFastPath: false, requiresBrowserPerception: false };
            return {
                action: 'NAVIGATE',
                location: 'web',
                query: dest,
                rawText: raw,
                cleanText: clean,
                isFastPath: false,
                requiresBrowserPerception: false,
            };
        }
        // 5. EXPLICIT SEARCH (ONLY when user explicitly requests a search!)
        // "Search YouTube for [query]"
        const searchYtMatch = clean.match(/^search\s+youtube\s+for\s+(.+)$/i);
        if (searchYtMatch) {
            return {
                action: 'SEARCH',
                location: 'youtube',
                query: searchYtMatch[1].trim(),
                rawText: raw,
                cleanText: clean,
                isFastPath: false,
                requiresBrowserPerception: false,
            };
        }
        // "Search Google for [query]"
        const searchGoogleMatch = clean.match(/^search\s+(?:google\s+for|web\s+for)\s+(.+)$/i);
        if (searchGoogleMatch) {
            return {
                action: 'SEARCH',
                location: 'google',
                query: searchGoogleMatch[1].trim(),
                rawText: raw,
                cleanText: clean,
                isFastPath: false,
                requiresBrowserPerception: false,
            };
        }
        // 6. SCREEN PERCEPTION & READING ("Read what's on the screen", "What is this video about?")
        if (/read\s+(what('s|\s+is)\s+on\s+(the\s+)?screen|page|text)/i.test(clean)) {
            return {
                action: 'READ',
                target: 'screen',
                location: 'current_page',
                rawText: raw,
                cleanText: clean,
                isFastPath: false,
                requiresBrowserPerception: true,
            };
        }
        if (/what\s+(?:is|do\s+you\s+think\s+(?:of|about))\s+(?:this|the)\s+video|summarize\s+(?:this\s+)?video/i.test(clean)) {
            return {
                action: 'WATCH',
                target: 'video',
                location: 'current_page',
                rawText: raw,
                cleanText: clean,
                isFastPath: false,
                requiresBrowserPerception: true,
            };
        }
        // 7. SOCIAL / MESSAGING ("Check my messages", "Read the message", "Reply saying...")
        if (/check(\s+my)?\s+messages|open\s+dms/i.test(clean)) {
            return {
                action: 'MESSAGE',
                target: 'message',
                location: 'instagram',
                description: 'check_messages',
                rawText: raw,
                cleanText: clean,
                isFastPath: false,
                requiresBrowserPerception: true,
            };
        }
        if (/read(\s+the)?\s+message/i.test(clean)) {
            return {
                action: 'READ',
                target: 'message',
                location: 'current_page',
                description: 'read_message',
                rawText: raw,
                cleanText: clean,
                isFastPath: false,
                requiresBrowserPerception: true,
            };
        }
        const replyMatch = clean.match(/^reply(?:\s+to\s+\w+)?(?:\s+saying)?\s+(.+)$/i);
        if (replyMatch) {
            return {
                action: 'REPLY',
                target: 'message',
                location: 'current_page',
                query: replyMatch[1].trim(),
                rawText: raw,
                cleanText: clean,
                isFastPath: false,
                requiresBrowserPerception: true,
            };
        }
        // 8. UNKNOWN / GENERAL MISSION -> NEVER DEFAULT TO GOOGLE SEARCH!
        // Instead, inspect current page and delegate to Gemma agent reasoning!
        return {
            action: 'UNKNOWN',
            location: 'current_page',
            query: clean,
            rawText: raw,
            cleanText: clean,
            isFastPath: false,
            requiresBrowserPerception: true,
        };
    }
}
exports.CommandRouter = CommandRouter;
//# sourceMappingURL=command-router.js.map