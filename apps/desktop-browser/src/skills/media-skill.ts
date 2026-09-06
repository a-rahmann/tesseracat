/**
 * MediaSkill: Controls media playback, verifies HTML5 audio/video states,
 * and extracts transcripts for video comprehension.
 */

import { Skill, SkillContext, SkillResult } from './skill-base.js';
import { YouTubeAdapter } from '../adapters/youtube.js';
import { MediaController } from '../browser/media-controller.js';
import { BrowserStateStore } from '../memory/browser-state-store.js';
import { OllamaGemmaModel } from '../ai/ollama-gemma.js';
import { TemporalMemory } from '../memory/temporal-memory.js';

export class MediaSkill implements Skill {
  public readonly name = 'MediaSkill';
  public readonly description = 'Media playback, playback verification, and video comprehension';
  private model = new OllamaGemmaModel('gemma3:4b');

  public canHandle(goal: string): boolean {
    const lower = goal.toLowerCase();
    return /^(?:play|pause|resume|stop\s+video|what\s+is\s+this\s+video|summarize\s+this\s+video|what\s+do\s+you\s+think\s+about\s+this\s+video)\b/i.test(lower) ||
           (lower.includes('video') && (lower.includes('about') || lower.includes('think')));
  }

  public async execute(goal: string, context: SkillContext): Promise<SkillResult> {
    const actionsTaken: string[] = [];
    const lower = goal.toLowerCase();
    context.token.throwIfCancelled();

    // 1. Playback Control: PAUSE
    if (/\b(pause|freeze|hold)\b/i.test(lower)) {
      context.updateStatus?.('Pausing video...');
      const res = await MediaController.getInstance().pause();
      const ok = res.success;
      actionsTaken.push(`Paused media element (success: ${ok})`);
      if (context.speak) await context.speak('Paused.');
      return { success: ok, summary: 'Paused media playback.', actionsTaken };
    }

    // 2. Playback Control: RESUME
    if (/\b(resume|continue\s+playing|unpause)\b/i.test(lower)) {
      context.updateStatus?.('Resuming video playback...');
      const res = await MediaController.getInstance().play();
      const ok = res.success;
      actionsTaken.push(`Resumed media element (success: ${ok})`);
      if (context.speak) await context.speak('Resumed playback.');
      return { success: ok, summary: 'Resumed media playback.', actionsTaken };
    }

    // 3. Video Understanding / Q&A: "What do you think about this video?"
    if (/what\s+(?:is|do\s+you\s+think\s+about)\s+this\s+video/i.test(lower) || lower.includes('summarize')) {
      context.updateStatus?.('Reading video title and captions...');
      const videoData = await YouTubeAdapter.getCurrentVideo();

      if (!videoData.title) {
        if (context.speak) await context.speak("I don't see an active video playing on this page.");
        return { success: false, summary: 'No active video found on page.', actionsTaken };
      }

      actionsTaken.push(`Extracted video metadata: "${videoData.title}" by ${videoData.channel}`);
      BrowserStateStore.getInstance().recordActiveVideo({
        title: videoData.title,
        channel: videoData.channel,
        url: context.activeUrl,
      });

      const prompt = `User asks: "${goal}".
Video Title: "${videoData.title}"
Channel: "${videoData.channel}"
Description: "${videoData.description.slice(0, 250)}"
Captions Snippet: "${videoData.transcriptSnippet || videoData.captions || 'None'}"

Give a concise, spoken 2-sentence response answering their question based on actual video information.`;

      context.updateStatus?.('Generating video analysis with Gemma 3...');
      let analysis = '';
      try {
        analysis = await this.model.generate(prompt, { temperature: 0.2, maxTokens: 120 });
      } catch {
        analysis = `This video is titled "${videoData.title}" by ${videoData.channel}.`;
      }

      actionsTaken.push('Generated video comprehension response');

      TemporalMemory.getInstance().recordEvent({
        website: { domain: 'youtube.com', url: context.activeUrl, title: videoData.title },
        topic: 'media',
        entities: [videoData.title, videoData.channel].filter(Boolean),
        contentSnippet: analysis,
      });

      if (context.speak) await context.speak(analysis.trim());
      return { success: true, summary: analysis.trim(), actionsTaken };
    }

    // 4. Play Action: "Play [X] on YouTube"
    const songQuery = goal
      .replace(/^(?:play|listen\s+to|watch)\s+/i, '')
      .replace(/\s+(?:on|in)\s+youtube\b/i, '')
      .trim();

    context.updateStatus?.(`Searching YouTube for "${songQuery}"...`);
    actionsTaken.push(`Searching YouTube for "${songQuery}"`);

    const playRes = await YouTubeAdapter.searchAndPlay(songQuery);
    const ok = playRes.success;
    actionsTaken.push(`Navigated to YouTube, selected result, and verified playback (success: ${ok})`);

    BrowserStateStore.getInstance().recordActiveVideo({
      title: songQuery,
      url: 'https://www.youtube.com',
    });

    const summary = ok ? `Playing ${songQuery} on YouTube.` : `Searched YouTube for ${songQuery}.`;
    if (context.speak) await context.speak(summary);

    return {
      success: ok,
      summary,
      actionsTaken,
      data: { query: songQuery },
    };
  }
}
