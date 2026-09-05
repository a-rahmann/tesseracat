/**
 * YouTube Website Adapter.
 * Extracts video semantics, manages search, result selection, and verifies actual video playback.
 */

import { BrowserPerception } from '../browser/browser-perception.js';
import { BrowserAutomator } from '../browser/browser-automator.js';
import { MediaController } from '../browser/media-controller.js';

export class YouTubeAdapter {
  public static isYouTubeUrl(url: string): boolean {
    return /youtube\.com|youtu\.be/i.test(url);
  }

  public static async getCurrentVideo(): Promise<{
    title: string;
    channel: string;
    description: string;
    currentTime: number;
    duration: number;
    captions?: string;
    transcriptSnippet?: string;
  }> {
    const obs = await BrowserPerception.getInstance().observeVideo();
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

  public static async search(query: string): Promise<boolean> {
    const targetUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    const res = await BrowserAutomator.getInstance().navigate(targetUrl);
    await BrowserPerception.getInstance().waitForElement('ytd-video-renderer, #contents ytd-rich-item-renderer', 5000);
    return res.success;
  }

  public static async playResult(index = 1): Promise<boolean> {
    const selector = `ytd-video-renderer:nth-of-type(${index}) a#thumbnail, ytd-rich-item-renderer:nth-of-type(${index}) a#thumbnail, a[href*="/watch"]:nth-of-type(${index})`;
    const res = await BrowserAutomator.getInstance().click({ selector });
    if (!res.success) return false;

    // Wait for /watch page and verify video playback
    await BrowserPerception.getInstance().waitForElement('video', 5000);
    const media = MediaController.getInstance();
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
  public static async searchAndPlay(query: string, index = 1): Promise<{ success: boolean; title?: string }> {
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
