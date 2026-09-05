/**
 * YouTube Website Adapter.
 * Extracts richer video semantics, captions, transcripts, and manages playback.
 */

import { BrowserPerception } from '../browser/browser-perception.js';
import { BrowserAutomator } from '../browser/browser-automator.js';

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
    return res.success;
  }

  public static async playResult(index = 1): Promise<boolean> {
    const selector = `ytd-video-renderer:nth-of-type(${index}) a#thumbnail, ytd-rich-item-renderer:nth-of-type(${index}) a#thumbnail`;
    const res = await BrowserAutomator.getInstance().click({ selector });
    return res.success;
  }
}
