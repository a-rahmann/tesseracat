"use strict";
/**
 * YouTube Website Adapter.
 * Extracts richer video semantics, captions, transcripts, and manages playback.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.YouTubeAdapter = void 0;
const browser_perception_js_1 = require("../browser/browser-perception.js");
const browser_automator_js_1 = require("../browser/browser-automator.js");
class YouTubeAdapter {
    static isYouTubeUrl(url) {
        return /youtube\.com|youtu\.be/i.test(url);
    }
    static async getCurrentVideo() {
        const obs = await browser_perception_js_1.BrowserPerception.getInstance().observeVideo();
        return {
            title: obs.title || 'YouTube Video',
            channel: obs.channel || '',
            description: obs.description || '',
            currentTime: obs.currentTime || 0,
            duration: obs.duration || 0,
            captions: obs.currentCaption,
            transcriptSnippet: obs.transcriptSnippet,
        };
    }
    static async search(query) {
        const targetUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
        const res = await browser_automator_js_1.BrowserAutomator.getInstance().navigate(targetUrl);
        return res.success;
    }
    static async playResult(index = 1) {
        const selector = `ytd-video-renderer:nth-of-type(${index}) a#thumbnail, ytd-rich-item-renderer:nth-of-type(${index}) a#thumbnail`;
        const res = await browser_automator_js_1.BrowserAutomator.getInstance().click({ selector });
        return res.success;
    }
}
exports.YouTubeAdapter = YouTubeAdapter;
//# sourceMappingURL=youtube.js.map