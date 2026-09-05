/**
 * BrowserAutomator: Safe, robust webview automation engine.
 * Eliminates "The WebView must be attached to the DOM and the dom-ready event emitted" errors
 * using the executeWhenReady abstraction.
 */

export interface AutomatorResult<T = any> {
  success: boolean;
  result?: T;
  error?: string;
}

export class BrowserAutomator {
  private static instance: BrowserAutomator | null = null;

  public static getInstance(): BrowserAutomator {
    if (!BrowserAutomator.instance) {
      BrowserAutomator.instance = new BrowserAutomator();
    }
    return BrowserAutomator.instance;
  }

  public getWebview(): any {
    return document.getElementById('webview');
  }

  /**
   * Execute JavaScript inside a webview only after verifying it is attached,
   * not destroyed, and ready to receive commands.
   */
  public async executeWhenReady<T = any>(script: string, timeoutMs = 6000): Promise<T | null> {
    const wv = this.getWebview();
    if (!wv) {
      console.warn('[Automator] Webview element not found in DOM');
      return null;
    }

    if (!document.contains(wv)) {
      console.warn('[Automator] Webview is detached from document body');
      return null;
    }

    // Await dom-ready if webview is currently loading or uninitialized
    if (typeof wv.isLoading === 'function' && wv.isLoading()) {
      await new Promise<void>((resolve) => {
        let timer: any = null;
        const onDomReady = () => {
          if (timer) clearTimeout(timer);
          wv.removeEventListener('dom-ready', onDomReady);
          resolve();
        };
        timer = setTimeout(() => {
          wv.removeEventListener('dom-ready', onDomReady);
          resolve();
        }, timeoutMs);
        wv.addEventListener('dom-ready', onDomReady, { once: true });
      });
    }

    try {
      if (typeof wv.executeJavaScript === 'function') {
        return await wv.executeJavaScript(script);
      }
    } catch (err: any) {
      console.warn('[Automator] executeJavaScript caught:', err.message);
    }
    return null;
  }

  public async navigate(url: string, onProgress?: (status: string) => void): Promise<AutomatorResult> {
    console.log(`[Browser] navigate started: "${url}"`);
    const wv = this.getWebview();
    if (!wv) {
      console.error('[Browser] navigate failed: no webview');
      return { success: false, error: 'Webview not found' };
    }

    if (onProgress) onProgress(`Navigating to ${url}...`);

    return new Promise((resolve) => {
      let resolved = false;
      const onDone = () => {
        if (!resolved) {
          resolved = true;
          wv.removeEventListener('did-finish-load', onDone);
          wv.removeEventListener('dom-ready', onDone);
          console.log(`[Browser] navigate completed: "${url}"`);
          resolve({ success: true, result: url });
        }
      };

      wv.addEventListener('dom-ready', onDone, { once: true });
      wv.addEventListener('did-finish-load', onDone, { once: true });
      setTimeout(onDone, 4000); // Fast safety fallback

      try {
        if (typeof (window as any).navigateToUrl === 'function') {
          (window as any).navigateToUrl(url);
        } else {
          wv.src = url;
        }
      } catch (err: any) {
        console.error('[Browser] navigate error:', err);
        resolve({ success: false, error: err.message });
      }
    });
  }

  public async goBack(): Promise<AutomatorResult> {
    console.log('[Browser] action started: goBack');
    const wv = this.getWebview();
    if (!wv) return { success: false, error: 'Webview not found' };

    try {
      if (typeof wv.canGoBack === 'function' && wv.canGoBack()) {
        wv.goBack();
        console.log('[Browser] action completed: goBack');
        return { success: true, result: 'Navigated back' };
      }
      return { success: false, error: 'Cannot go back (history start)' };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async goForward(): Promise<AutomatorResult> {
    console.log('[Browser] action started: goForward');
    const wv = this.getWebview();
    if (!wv) return { success: false, error: 'Webview not found' };

    try {
      if (typeof wv.canGoForward === 'function' && wv.canGoForward()) {
        wv.goForward();
        console.log('[Browser] action completed: goForward');
        return { success: true, result: 'Navigated forward' };
      }
      return { success: false, error: 'Cannot go forward (history end)' };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async reload(): Promise<AutomatorResult> {
    console.log('[Browser] action started: reload');
    const wv = this.getWebview();
    if (!wv) return { success: false, error: 'Webview not found' };

    try {
      wv.reload();
      console.log('[Browser] action completed: reload');
      return { success: true, result: 'Reloaded' };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async clickElement(selector: string): Promise<AutomatorResult> {
    console.log(`[Browser] clickElement started: "${selector}"`);
    const script = `
      (() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return false;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const prevOutline = el.style.outline;
        el.style.outline = '2px solid #38bdf8';
        el.style.boxShadow = '0 0 12px rgba(56, 189, 248, 0.4)';
        setTimeout(() => {
          el.style.outline = prevOutline;
          el.style.boxShadow = '';
        }, 1200);

        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        el.click();
        return true;
      })()
    `;
    const result = await this.executeWhenReady<boolean>(script);
    console.log(`[Browser] clickElement completed: ${Boolean(result)}`);
    return { success: Boolean(result), result };
  }

  public async playFirstMedia(): Promise<AutomatorResult<string>> {
    return this.playOrdinalMedia(0);
  }

  public async playOrdinalMedia(index = 0): Promise<AutomatorResult<string>> {
    console.log(`[Browser] playOrdinalMedia started (index: ${index})`);
    const script = `
      (() => {
        // 1. YouTube video links
        const ytItems = Array.from(document.querySelectorAll('ytd-video-renderer a#thumbnail, ytd-rich-item-renderer a#thumbnail, a#video-title'));
        if (ytItems.length > 0) {
          const target = ytItems[${index}] || ytItems[0];
          target.click();
          return 'Started YouTube video playback';
        }

        // 2. Generic video elements
        const videos = Array.from(document.querySelectorAll('video'));
        if (videos.length > 0) {
          const v = videos[${index}] || videos[0];
          v.play().catch(() => {});
          return 'Playing HTML5 video';
        }

        // 3. Search result links (Google, etc.)
        const searchResults = Array.from(document.querySelectorAll('.g a, [data-component-type="s-search-result"] h2 a, .result__url'));
        if (searchResults.length > 0) {
          const target = searchResults[${index}] || searchResults[0];
          target.click();
          return 'Opened search result';
        }

        return 'No actionable media or result elements found';
      })()
    `;
    const result = await this.executeWhenReady<string>(script);
    console.log(`[Browser] playOrdinalMedia completed: "${result}"`);
    return { success: Boolean(result && !result.includes('No actionable')), result: result || undefined };
  }

  public async createTab(url = 'about:blank'): Promise<AutomatorResult> {
    console.log(`[Browser] createTab requested: "${url}"`);
    try {
      if (typeof (window as any).createNewTab === 'function') {
        (window as any).createNewTab(url);
        return { success: true, result: url };
      }
      return { success: false, error: 'createNewTab not available on window' };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async closeCurrentTab(): Promise<AutomatorResult> {
    console.log('[Browser] closeCurrentTab requested');
    try {
      if (typeof (window as any).closeCurrentTab === 'function') {
        (window as any).closeCurrentTab();
        return { success: true };
      }
      return { success: false, error: 'closeCurrentTab not available on window' };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async pauseMedia(): Promise<AutomatorResult> {
    console.log('[Browser] pauseMedia started');
    const script = `
      (() => {
        const videos = Array.from(document.querySelectorAll('video'));
        let count = 0;
        videos.forEach(v => {
          if (!v.paused) {
            v.pause();
            count++;
          }
        });
        return count > 0 ? 'Paused ' + count + ' video(s)' : 'No active playing video found';
      })()
    `;
    const result = await this.executeWhenReady<string>(script);
    return { success: true, result };
  }

  public async resumeMedia(): Promise<AutomatorResult> {
    console.log('[Browser] resumeMedia started');
    const script = `
      (() => {
        const videos = Array.from(document.querySelectorAll('video'));
        let count = 0;
        videos.forEach(v => {
          if (v.paused) {
            v.play().catch(() => {});
            count++;
          }
        });
        return count > 0 ? 'Resumed ' + count + ' video(s)' : 'No paused video found';
      })()
    `;
    const result = await this.executeWhenReady<string>(script);
    return { success: true, result };
  }

  public async extractDirectMessage(contactName = ''): Promise<string> {
    const script = `
      (() => {
        const msgs = Array.from(document.querySelectorAll('div[role="row"], div[data-testid="message-container"]'));
        if (msgs.length === 0) return 'No active message thread visible';
        const lastMsg = msgs[msgs.length - 1];
        return lastMsg.textContent?.trim() || 'Found incoming message';
      })()
    `;
    const result = await this.executeWhenReady<string>(script);
    return result || 'Messages inspected';
  }
}

