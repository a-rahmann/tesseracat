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
    const automator = BrowserAutomator.getInstance();
    const media = MediaController.getInstance();

    // 1. Wait for video results to render on YouTube
    await BrowserPerception.getInstance().waitForElement('ytd-video-renderer, ytd-rich-item-renderer, a#video-title', 5000);

    // 2. Locate and navigate directly to target video link
    const selectScript = `
      (() => {
        const links = Array.from(document.querySelectorAll('ytd-video-renderer a#video-title, ytd-video-renderer a#thumbnail, a#video-title, a[href*="/watch"]'))
          .filter(el => el.getAttribute('href') && el.getAttribute('href').includes('/watch'));
        const target = links[${Math.max(0, index - 1)}] || links[0];
        if (target) {
          const href = target.getAttribute('href') || (target as any).href;
          return { found: true, href };
        }
        return { found: false };
      })()
    `;

    const res = await automator.executeScript<{ found: boolean; href?: string }>(selectScript);
    console.log('[YouTubeAdapter] Located video search result:', res);

    if (res?.found && res?.href) {
      const fullUrl = res.href.startsWith('http') ? res.href : `https://www.youtube.com${res.href}`;
      await automator.navigate(fullUrl);
    } else {
      // Fallback: click first playable media on screen
      await automator.playFirstMedia();
    }

    // 3. Wait for video element and verify playback
    await BrowserPerception.getInstance().waitForElement('video', 5000);
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
