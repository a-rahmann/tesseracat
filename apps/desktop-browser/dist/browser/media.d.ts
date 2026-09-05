/**
 * Browser Media & Video Understanding Observer.
 * Inspects active video players, captions, titles, channel info, and transcript snippets.
 */
export declare const INJECTED_MEDIA_OBSERVER_SCRIPT = "\n(() => {\n  const video = document.querySelector('video');\n  if (!video) {\n    return { hasVideo: false };\n  }\n\n  // 1. YouTube specific selectors\n  const ytTitle = document.querySelector('h1.ytd-watch-metadata yt-formatted-string, #title h1 yt-formatted-string, h1.title');\n  const ytChannel = document.querySelector('ytd-channel-name a, #channel-name a, #upload-info a');\n  const ytDesc = document.querySelector('#description-inline-expander, ytd-text-inline-expander');\n\n  // 2. Active captions on screen\n  const captionSegments = Array.from(document.querySelectorAll('.ytp-caption-segment, .caption-window span'));\n  const currentCaption = captionSegments.map(s => s.textContent || '').join(' ').trim();\n\n  // 3. Transcript panel if open\n  const transcriptSegments = Array.from(document.querySelectorAll('ytd-transcript-segment-renderer .segment-text'));\n  const transcriptSnippet = transcriptSegments.slice(0, 15).map(s => s.textContent || '').join(' ').trim();\n\n  const title = (ytTitle ? ytTitle.textContent : document.title) || '';\n  const channel = ytChannel ? ytChannel.textContent : '';\n  const description = (ytDesc ? ytDesc.textContent : '').slice(0, 400);\n\n  return {\n    hasVideo: true,\n    title: title.trim(),\n    channel: channel.trim(),\n    description: description.trim(),\n    currentTime: Math.round(video.currentTime || 0),\n    duration: Math.round(video.duration || 0),\n    paused: video.paused,\n    currentCaption,\n    transcriptSnippet\n  };\n})();\n";
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
//# sourceMappingURL=media.d.ts.map