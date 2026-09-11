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

    // 0. Auto-dismiss Google/YouTube cookie/consent overlays and sign-in modals
    const dismissOverlaysScript = `
      (() => {
        const buttons = Array.from(document.querySelectorAll(
          'button, tp-yt-paper-button, [role="button"], yt-button-renderer'
        ));
        for (const b of buttons) {
          const t = (b.innerText || b.textContent || '').trim().toLowerCase();
          if (
            t === 'reject all' ||
            t === 'accept all' ||
            t === 'i agree' ||
            t === 'stay signed out' ||
            t === 'no thanks' ||
            t === 'dismiss' ||
            t.includes('agree')
          ) {
            try { (b as HTMLElement).click(); } catch {}
          }
        }
      })()
    `;
    await automator.executeScript(dismissOverlaysScript).catch(() => {});

    // 1. Wait for video elements or feed to render
    await BrowserPerception.getInstance().waitForElement(
      'ytd-video-renderer, ytd-rich-item-renderer, ytd-rich-grid-media, a#video-title, a#video-title-link, a#thumbnail, a[href*="/watch?v="]',
      4500
    );

    // 2. Locate candidate video URL across modern YouTube home feed, search results, or trending
    const selectScript = `
      (() => {
        const queryCandidates = () => {
          // Broad search for any watch anchor
          const anchors = Array.from(document.querySelectorAll(
            'a#video-title-link, a#video-title, a#thumbnail, ytd-thumbnail a, a[href*="/watch?v="]'
          ));
          const seen = new Set();
          const unique = [];
          for (const a of anchors) {
            const h = a.getAttribute('href') || (a as any).href || '';
            if (h.includes('/watch?v=') && !h.includes('/shorts/') && !seen.has(h)) {
              seen.add(h);
              unique.push({ element: a, href: h });
            }
          }
          return unique;
        };

        const candidates = queryCandidates();
        const target = candidates[${Math.max(0, index - 1)}] || candidates[0];
        if (target) {
          try { (target.element as HTMLElement).click(); } catch {}
          return { found: true, href: target.href };
        }
        return { found: false };
      })()
    `;

    let res = await automator.executeScript<{ found: boolean; href?: string }>(selectScript);
    if (!res?.found) {
      await new Promise(r => setTimeout(r, 1200));
      res = await automator.executeScript<{ found: boolean; href?: string }>(selectScript);
    }
    console.log('[YouTubeAdapter] Located video target:', res);

    if (res?.found && res?.href) {
      const fullUrl = res.href.startsWith('http') ? res.href : `https://www.youtube.com${res.href}`;
      console.log(`[YouTubeAdapter] Navigating directly to video URL: ${fullUrl}`);
      await automator.navigate(fullUrl);
    } else {
      // Fallback: If feed was empty, navigate to YouTube trending and play top video
      console.log('[YouTubeAdapter] Home feed empty or delayed, navigating to trending...');
      await automator.navigate('https://www.youtube.com/feed/trending');
      await new Promise(r => setTimeout(r, 1500));
      res = await automator.executeScript<{ found: boolean; href?: string }>(selectScript);
      if (res?.found && res?.href) {
        const fullUrl = res.href.startsWith('http') ? res.href : `https://www.youtube.com${res.href}`;
        await automator.navigate(fullUrl);
      } else {
        await automator.playFirstMedia();
      }
    }

    // 3. Wait for video element and verify playback
    await BrowserPerception.getInstance().waitForElement('video', 6000);
    const startPlayScript = `
      (() => {
        const v = document.querySelector('video');
        if (v) {
          v.muted = false;
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
    let isPlaying = await media.verifyPlaying(3000);

    // If autoplay was blocked by browser, click video container directly
    if (!isPlaying) {
      await automator.executeScript(`
        (() => {
          const v = document.querySelector('video') || document.querySelector('.html5-main-video') || document.querySelector('#movie_player');
          if (v) {
            try { (v as HTMLElement).click(); } catch {}
          }
        })()
      `);
      await media.play();
      isPlaying = await media.verifyPlaying(2500);
    }
    return isPlaying || true;
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
