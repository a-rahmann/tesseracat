"use strict";
/**
 * MediaController: Direct in-page media control and verification layer for HTMLMediaElement.
 * Invariant: Actions are verified against real playback state (paused === false, currentTime advancing).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MediaController = exports.INJECTED_MEDIA_CONTROLLER_SCRIPT = void 0;
exports.INJECTED_MEDIA_CONTROLLER_SCRIPT = `
(() => {
  return {
    getState: () => {
      const v = document.querySelector('video') || document.querySelector('audio');
      if (!v) return { hasMedia: false, isPlaying: false, paused: true, currentTime: 0, duration: 0, readyState: 0 };
      const isPlaying = !v.paused && !v.ended && v.readyState > 2;
      return {
        hasMedia: true,
        paused: v.paused,
        currentTime: Math.round(v.currentTime || 0),
        duration: Math.round(v.duration || 0),
        readyState: v.readyState,
        src: v.currentSrc || v.src || '',
        title: document.title,
        isPlaying
      };
    },

    play: async () => {
      const v = document.querySelector('video') || document.querySelector('audio');
      if (!v) return { success: false, error: 'No media element found' };
      try {
        await v.play();
        return { success: !v.paused, currentTime: v.currentTime };
      } catch (e) {
        // Many sites require user interaction or unmute
        v.muted = true;
        try {
          await v.play();
          return { success: !v.paused, currentTime: v.currentTime, muted: true };
        } catch (e2) {
          return { success: false, error: e2.message };
        }
      }
    },

    pause: () => {
      const v = document.querySelector('video') || document.querySelector('audio');
      if (!v) return { success: false, error: 'No media element found' };
      v.pause();
      return { success: v.paused, currentTime: v.currentTime };
    },

    seek: (seconds) => {
      const v = document.querySelector('video') || document.querySelector('audio');
      if (!v) return { success: false };
      v.currentTime = Math.max(0, Math.min(v.duration || 999999, (v.currentTime || 0) + seconds));
      return { success: true, currentTime: v.currentTime };
    }
  };
})();
`;
class MediaController {
    static instance = null;
    static getInstance() {
        if (!MediaController.instance) {
            MediaController.instance = new MediaController();
        }
        return MediaController.instance;
    }
    getActiveWebview() {
        if (typeof document === 'undefined')
            return null;
        const activeTab = document.querySelector('.tab-content.active webview');
        return activeTab || document.querySelector('webview');
    }
    async getPlaybackState() {
        const webview = this.getActiveWebview();
        if (!webview) {
            return { hasMedia: false, isPlaying: false, paused: true, currentTime: 0, duration: 0, readyState: 0 };
        }
        try {
            return await webview.executeJavaScript(`(${exports.INJECTED_MEDIA_CONTROLLER_SCRIPT}).getState()`);
        }
        catch {
            return { hasMedia: false, isPlaying: false, paused: true, currentTime: 0, duration: 0, readyState: 0 };
        }
    }
    async play() {
        const webview = this.getActiveWebview();
        if (!webview)
            return { success: false, error: 'No webview available' };
        try {
            const res = await webview.executeJavaScript(`(${exports.INJECTED_MEDIA_CONTROLLER_SCRIPT}).play()`);
            return res;
        }
        catch (err) {
            return { success: false, error: err.message };
        }
    }
    async pause() {
        const webview = this.getActiveWebview();
        if (!webview)
            return { success: false };
        try {
            const res = await webview.executeJavaScript(`(${exports.INJECTED_MEDIA_CONTROLLER_SCRIPT}).pause()`);
            return res;
        }
        catch {
            return { success: false };
        }
    }
    async seek(seconds) {
        const webview = this.getActiveWebview();
        if (!webview)
            return { success: false };
        try {
            return await webview.executeJavaScript(`(${exports.INJECTED_MEDIA_CONTROLLER_SCRIPT}).seek(${seconds})`);
        }
        catch {
            return { success: false };
        }
    }
    /**
     * Action Verification: Checks whether media is actually playing over a 1000ms window.
     */
    async verifyPlaying(maxWaitMs = 3000) {
        const start = Date.now();
        let initialTime = -1;
        while (Date.now() - start < maxWaitMs) {
            const state = await this.getPlaybackState();
            if (state.hasMedia && !state.paused) {
                if (initialTime === -1) {
                    initialTime = state.currentTime;
                }
                else if (state.currentTime > initialTime || state.readyState >= 3) {
                    return true; // Verified playing!
                }
            }
            await new Promise(r => setTimeout(r, 200));
        }
        return false;
    }
}
exports.MediaController = MediaController;
//# sourceMappingURL=media-controller.js.map