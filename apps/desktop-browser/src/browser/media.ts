/**
 * Browser Media & Video Understanding Observer.
 * Inspects active video players, captions, titles, channel info, and transcript snippets.
 */

export const INJECTED_MEDIA_OBSERVER_SCRIPT = `
(() => {
  const video = document.querySelector('video');
  if (!video) {
    return { hasVideo: false };
  }

  // 1. YouTube specific selectors
  const ytTitle = document.querySelector('h1.ytd-watch-metadata yt-formatted-string, #title h1 yt-formatted-string, h1.title');
  const ytChannel = document.querySelector('ytd-channel-name a, #channel-name a, #upload-info a');
  const ytDesc = document.querySelector('#description-inline-expander, ytd-text-inline-expander');

  // 2. Active captions on screen
  const captionSegments = Array.from(document.querySelectorAll('.ytp-caption-segment, .caption-window span'));
  const currentCaption = captionSegments.map(s => s.textContent || '').join(' ').trim();

  // 3. Transcript panel if open
  const transcriptSegments = Array.from(document.querySelectorAll('ytd-transcript-segment-renderer .segment-text'));
  const transcriptSnippet = transcriptSegments.slice(0, 15).map(s => s.textContent || '').join(' ').trim();

  const title = (ytTitle ? ytTitle.textContent : document.title) || '';
  const channel = ytChannel ? ytChannel.textContent : '';
  const description = (ytDesc ? ytDesc.textContent : '').slice(0, 400);

  return {
    hasVideo: true,
    title: title.trim(),
    channel: channel.trim(),
    description: description.trim(),
    currentTime: Math.round(video.currentTime || 0),
    duration: Math.round(video.duration || 0),
    paused: video.paused,
    currentCaption,
    transcriptSnippet
  };
})();
`;

export interface VideoStateObservation {
  hasVideo: boolean;
  title?: string;
  channel?: string;
  description?: string;
  currentTime?: number;
  duration?: number;
  paused?: boolean;
  currentCaption?: string;
  transcriptSnippet?: string;
}
