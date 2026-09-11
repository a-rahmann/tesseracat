/**
 * Native YouTube Tools for Tesseract.
 *
 * Provides API & optimized playback automation with strict verification gates.
 */

import { GoogleConnector } from './google-connector.js';
import { YouTubeAdapter } from '../../adapters/youtube.js';
import { BrowserAutomator } from '../../browser/browser-automator.js';
import { MediaController } from '../../browser/media-controller.js';
import { BrowserStateStore } from '../../memory/browser-state-store.js';

export interface YouTubePlayResult {
  success: boolean;
  videoTitle?: string;
  channel?: string;
  isPlaying: boolean;
  url?: string;
}

export class YouTubeTools {
  public static register(connector: GoogleConnector): void {
    connector.registerToolHandler('youtube.search', async (params) => YouTubeTools.search(connector, params?.query));
    connector.registerToolHandler('youtube.getVideo', async () => YouTubeTools.getVideo(connector));
    connector.registerToolHandler('youtube.play', async (params) => YouTubeTools.play(params));
  }

  public static async search(connector: GoogleConnector, query?: string): Promise<any[]> {
    if (!query) return [];

    // Check if we have authenticated YouTube Data API access
    try {
      const token = await connector.getValidAccessToken();
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=10&q=${encodeURIComponent(query)}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        return (data.items || []).map((item: any) => ({
          videoId: item.id?.videoId,
          title: item.snippet?.title,
          channel: item.snippet?.channelTitle,
          description: item.snippet?.description,
          thumbnail: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.default?.url,
        }));
      }
    } catch {
      // Non-authenticated or API quota exhausted: Fallback to browser YouTube search
    }

    await YouTubeAdapter.search(query);
    return [{ status: 'NAVIGATED_TO_SEARCH', query }];
  }

  public static async getVideo(connector?: GoogleConnector): Promise<any> {
    return YouTubeAdapter.getCurrentVideo();
  }

  /**
   * Deterministic Play Action with Playback Verification.
   * Handles "Play a random video", "Play cats on YouTube", etc.
   */
  public static async play(params: {
    query?: string;
    videoId?: string;
    index?: number;
    isRandom?: boolean;
  }): Promise<YouTubePlayResult> {
    const automator = BrowserAutomator.getInstance();
    const media = MediaController.getInstance();

    // 1. If explicit videoId is provided, navigate directly
    if (params?.videoId) {
      await automator.navigate(`https://www.youtube.com/watch?v=${params.videoId}`);
    } else if (params?.query && params.query.trim().toLowerCase() !== 'a random video' && params.query.trim().toLowerCase() !== 'random video') {
      // Search for specific query
      await YouTubeAdapter.search(params.query.trim());
      await new Promise(r => setTimeout(r, 600));
      await YouTubeAdapter.playResult(params?.index || 1);
    } else {
      // Random video request
      const currentUrl = BrowserStateStore.getInstance().getActiveTab()?.url || '';
      if (!currentUrl.includes('youtube.com')) {
        await automator.navigate('https://www.youtube.com');
      }
      const targetIndex = params?.index || (Math.floor(Math.random() * 4) + 1);
      await YouTubeAdapter.playResult(targetIndex);
    }

    // 2. Strict Verification Gate: Verify video is actually playing
    const isPlaying = await media.verifyPlaying(4500);
    const videoDetails = await YouTubeAdapter.getCurrentVideo().catch(() => ({ title: 'YouTube Video', channel: '' }));

    console.log(`[YouTubeTools] Playback verified: isPlaying=${isPlaying}, title="${videoDetails.title}"`);

    return {
      success: isPlaying,
      videoTitle: videoDetails.title,
      channel: videoDetails.channel,
      isPlaying,
      url: BrowserStateStore.getInstance().getActiveTab()?.url || '',
    };
  }
}
