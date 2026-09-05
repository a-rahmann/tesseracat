/**
 * MediaController: Direct in-page media control and verification layer for HTMLMediaElement.
 * Invariant: Actions are verified against real playback state (paused === false, currentTime advancing).
 */
export interface PlaybackState {
    hasMedia: boolean;
    paused: boolean;
    currentTime: number;
    duration: number;
    readyState: number;
    title?: string;
    src?: string;
    isPlaying: boolean;
}
export declare const INJECTED_MEDIA_CONTROLLER_SCRIPT = "\n(() => {\n  return {\n    getState: () => {\n      const v = document.querySelector('video') || document.querySelector('audio');\n      if (!v) return { hasMedia: false, isPlaying: false, paused: true, currentTime: 0, duration: 0, readyState: 0 };\n      const isPlaying = !v.paused && !v.ended && v.readyState > 2;\n      return {\n        hasMedia: true,\n        paused: v.paused,\n        currentTime: Math.round(v.currentTime || 0),\n        duration: Math.round(v.duration || 0),\n        readyState: v.readyState,\n        src: v.currentSrc || v.src || '',\n        title: document.title,\n        isPlaying\n      };\n    },\n\n    play: async () => {\n      const v = document.querySelector('video') || document.querySelector('audio');\n      if (!v) return { success: false, error: 'No media element found' };\n      try {\n        await v.play();\n        return { success: !v.paused, currentTime: v.currentTime };\n      } catch (e) {\n        // Many sites require user interaction or unmute\n        v.muted = true;\n        try {\n          await v.play();\n          return { success: !v.paused, currentTime: v.currentTime, muted: true };\n        } catch (e2) {\n          return { success: false, error: e2.message };\n        }\n      }\n    },\n\n    pause: () => {\n      const v = document.querySelector('video') || document.querySelector('audio');\n      if (!v) return { success: false, error: 'No media element found' };\n      v.pause();\n      return { success: v.paused, currentTime: v.currentTime };\n    },\n\n    seek: (seconds) => {\n      const v = document.querySelector('video') || document.querySelector('audio');\n      if (!v) return { success: false };\n      v.currentTime = Math.max(0, Math.min(v.duration || 999999, (v.currentTime || 0) + seconds));\n      return { success: true, currentTime: v.currentTime };\n    }\n  };\n})();\n";
export declare class MediaController {
    private static instance;
    static getInstance(): MediaController;
    private getActiveWebview;
    getPlaybackState(): Promise<PlaybackState>;
    play(): Promise<{
        success: boolean;
        error?: string;
    }>;
    pause(): Promise<{
        success: boolean;
    }>;
    seek(seconds: number): Promise<{
        success: boolean;
    }>;
    /**
     * Action Verification: Checks whether media is actually playing over a 1000ms window.
     */
    verifyPlaying(maxWaitMs?: number): Promise<boolean>;
}
//# sourceMappingURL=media-controller.d.ts.map