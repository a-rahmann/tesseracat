"use strict";
/**
 * Native YouTube Tools for Tesseract.
 *
 * Provides API & optimized playback automation with strict verification gates.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.YouTubeTools = void 0;
const youtube_js_1 = require("../../adapters/youtube.js");
const browser_automator_js_1 = require("../../browser/browser-automator.js");
const media_controller_js_1 = require("../../browser/media-controller.js");
const browser_state_store_js_1 = require("../../memory/browser-state-store.js");
class YouTubeTools {
    static register(connector) {
        connector.registerToolHandler('youtube.search', async (params) => YouTubeTools.search(connector, params?.query));
        connector.registerToolHandler('youtube.getVideo', async () => YouTubeTools.getVideo(connector));
        connector.registerToolHandler('youtube.play', async (params) => YouTubeTools.play(params));
    }
    static async search(connector, query) {
        if (!query)
            return [];
        // Check if we have authenticated YouTube Data API access
        try {
            const token = await connector.getValidAccessToken();
            const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=10&q=${encodeURIComponent(query)}`;
            const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) {
                const data = await res.json();
                return (data.items || []).map((item) => ({
                    videoId: item.id?.videoId,
                    title: item.snippet?.title,
                    channel: item.snippet?.channelTitle,
                    description: item.snippet?.description,
                    thumbnail: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.default?.url,
                }));
            }
        }
        catch {
            // Non-authenticated or API quota exhausted: Fallback to browser YouTube search
        }
        await youtube_js_1.YouTubeAdapter.search(query);
        return [{ status: 'NAVIGATED_TO_SEARCH', query }];
    }
    static async getVideo(connector) {
        return youtube_js_1.YouTubeAdapter.getCurrentVideo();
    }
    /**
     * Deterministic Play Action with Playback Verification.
     * Handles "Play a random video", "Play cats on YouTube", etc.
     */
    static async play(params) {
        const automator = browser_automator_js_1.BrowserAutomator.getInstance();
        const media = media_controller_js_1.MediaController.getInstance();
        // 1. If explicit videoId is provided, navigate directly
        if (params?.videoId) {
            await automator.navigate(`https://www.youtube.com/watch?v=${params.videoId}`);
        }
        else if (params?.query && params.query.trim().toLowerCase() !== 'a random video' && params.query.trim().toLowerCase() !== 'random video') {
            // Search for specific query
            await youtube_js_1.YouTubeAdapter.search(params.query.trim());
            await new Promise(r => setTimeout(r, 600));
            await youtube_js_1.YouTubeAdapter.playResult(params?.index || 1);
        }
        else {
            // Random video request
            const currentUrl = browser_state_store_js_1.BrowserStateStore.getInstance().getActiveTab()?.url || '';
            if (!currentUrl.includes('youtube.com')) {
                await automator.navigate('https://www.youtube.com');
            }
            const targetIndex = params?.index || (Math.floor(Math.random() * 4) + 1);
            await youtube_js_1.YouTubeAdapter.playResult(targetIndex);
        }
        // 2. Strict Verification Gate: Verify video is actually playing
        const isPlaying = await media.verifyPlaying(4500);
        const videoDetails = await youtube_js_1.YouTubeAdapter.getCurrentVideo().catch(() => ({ title: 'YouTube Video', channel: '' }));
        console.log(`[YouTubeTools] Playback verified: isPlaying=${isPlaying}, title="${videoDetails.title}"`);
        return {
            success: isPlaying,
            videoTitle: videoDetails.title,
            channel: videoDetails.channel,
            isPlaying,
            url: browser_state_store_js_1.BrowserStateStore.getInstance().getActiveTab()?.url || '',
        };
    }
}
exports.YouTubeTools = YouTubeTools;
//# sourceMappingURL=youtube-tools.js.map