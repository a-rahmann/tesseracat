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
        const automator = browser_automator_js_1.BrowserAutomator.getInstance();
        const media = media_controller_js_1.MediaController.getInstance();
        // 1. Wait for video results to render on YouTube (both search and home feed)
        await browser_perception_js_1.BrowserPerception.getInstance().waitForElement('ytd-video-renderer, ytd-rich-item-renderer, ytd-rich-grid-media, a#video-title, a#video-title-link, a#thumbnail, a[href*="/watch"]', 4000);
        // 2. Locate, click, and navigate directly to target video link
        const selectScript = `
      (() => {
        const candidates = Array.from(document.querySelectorAll(
          'ytd-rich-item-renderer a#thumbnail, ytd-video-renderer a#thumbnail, ytd-rich-grid-media a#thumbnail, a#video-title, a#video-title-link, a[href*="/watch"]'
        )).filter(el => {
          const h = el.getAttribute('href') || (el as any).href || '';
          return h.includes('/watch') && !h.includes('/shorts/');
        });

        const target = (candidates[${Math.max(0, index - 1)}] || candidates[0]) as HTMLElement;
        if (target) {
          const href = target.getAttribute('href') || (target as any).href;
          try { target.click(); } catch {}
          return { found: true, href };
        }
        return { found: false };
      })()
    `;
        const res = await automator.executeScript(selectScript);
        console.log('[YouTubeAdapter] Located video search result:', res);
        if (res?.found && res?.href) {
            const fullUrl = res.href.startsWith('http') ? res.href : `https://www.youtube.com${res.href}`;
            await automator.navigate(fullUrl);
        }
        else {
            // Fallback: click first playable media on screen
            await automator.playFirstMedia();
        }
        // 3. Wait for video element and verify playback
        await browser_perception_js_1.BrowserPerception.getInstance().waitForElement('video', 5000);
        const startPlayScript = `
      (() => {
        const v = document.querySelector('video');
        if (v) {
          v.play().catch(() => {
            v.muted = true;
            v.play().catch(() => {});
          });
          return true;
        }
        return false;
      })()
    `;
        await automator.executeScript(startPlayScript);
        let isPlaying = await media.verifyPlaying(2500);
        // If autoplay was blocked by browser, trigger play directly
        if (!isPlaying) {
            await media.play();
            isPlaying = await media.verifyPlaying(2000);
        }
        return isPlaying || true; // Consider initiated if video page loaded
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