"use strict";
/**
 * YouTube Website Adapter.
 * Extracts video semantics, manages search, result selection, and verifies actual video playback.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.YouTubeAdapter = void 0;
const browser_perception_js_1 = require("../browser/browser-perception.js");
const browser_automator_js_1 = require("../browser/browser-automator.js");
const media_controller_js_1 = require("../browser/media-controller.js");
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
        await browser_perception_js_1.BrowserPerception.getInstance().waitForElement('ytd-video-renderer, #contents ytd-rich-item-renderer', 5000);
        return res.success;
    }
    static async playResult(index = 1) {
        const selector = `ytd-video-renderer:nth-of-type(${index}) a#thumbnail, ytd-rich-item-renderer:nth-of-type(${index}) a#thumbnail, a[href*="/watch"]:nth-of-type(${index})`;
        const res = await browser_automator_js_1.BrowserAutomator.getInstance().click({ selector });
        if (!res.success)
            return false;
        // Wait for /watch page and verify video playback
        await browser_perception_js_1.BrowserPerception.getInstance().waitForElement('video', 5000);
        const media = media_controller_js_1.MediaController.getInstance();
        let isPlaying = await media.verifyPlaying(3000);
        // If autoplay was blocked by browser, trigger play directly
        if (!isPlaying) {
            await media.play();
            isPlaying = await media.verifyPlaying(2000);
        }
        return isPlaying;
    }
    /**
     * Complete multi-step play action:
     * 1. Search YouTube -> 2. Select Result -> 3. Verify Playback
     */
    static async searchAndPlay(query, index = 1) {
        console.log(`[YouTubeAdapter] Executing multi-step search & play for "${query}" (result #${index})...`);
        await this.search(query);
        const played = await this.playResult(index);
        const video = await this.getCurrentVideo();
        return {
            success: played,
            title: video.title,
        };
    }
}
exports.YouTubeAdapter = YouTubeAdapter;
//# sourceMappingURL=youtube.js.map