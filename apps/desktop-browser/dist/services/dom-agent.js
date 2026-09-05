"use strict";
/**
 * DOMAgent: Intelligent in-page observer and autonomous actuator.
 * Injected into <webview> to handle:
 * 1. Form & Credential Assistance:
 *    - Auto-filling remembered usernames
 *    - 5-second password inactivity watcher & auto-submit
 *    - Emitting prompt to save new usernames
 * 2. Form & Billing Autofill:
 *    - Detecting and populating shipping/billing addresses
 * 3. Direct Message & Chat Observation:
 *    - Inspecting unread/active threads and sending replies
 * 4. Co-Browsing:
 *    - Observing YouTube videos, Shorts, and article content
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DOMAgent = void 0;
class DOMAgent {
    /**
     * Generates the client-side JavaScript script to inject into the webview for login assistance.
     * Auto-fills remembered username and monitors password typing for 5s inactivity auto-submit.
     */
    static getLoginWatcherScript(rememberedUsername = null) {
        return `
      (() => {
        if (window.__tesseractLoginWatcherInjected) return 'already_injected';
        window.__tesseractLoginWatcherInjected = true;

        const rememberedUsername = ${JSON.stringify(rememberedUsername)};
        let passwordInactivityTimer = null;
        let lastKnownUsername = '';

        function setInputValue(el, value) {
          if (!el || !value) return;
          el.focus();
          const proto = Object.getPrototypeOf(el);
          const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
          if (setter) {
            setter.call(el, value);
          } else {
            el.value = value;
          }
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }

        function findUsernameField() {
          return document.querySelector(
            'input[type="text"][name*="user" i], input[type="text"][name*="email" i], input[type="email"], input[autocomplete="username"], input[autocomplete="email"], input[name="username"], input[name="email"], input[id*="username" i], input[id*="email" i], input[type="text"]'
          );
        }

        function findPasswordField() {
          return document.querySelector('input[type="password"], input[autocomplete="current-password"]');
        }

        function findSubmitButton(form) {
          if (form) {
            const btn = form.querySelector('button[type="submit"], input[type="submit"], button');
            if (btn) return btn;
          }
          const allButtons = Array.from(document.querySelectorAll('button, input[type="submit"], div[role="button"]'));
          const loginBtn = allButtons.find(b => {
            const txt = (b.textContent || b.value || '').trim().toLowerCase();
            return /^(log\\s*in|sign\\s*in|continue|submit|enter)$/i.test(txt);
          });
          return loginBtn || document.querySelector('button[type="submit"]');
        }

        function triggerLogin(passwordInput) {
          console.log('[Tesseract DOM] ⚡ 5s inactivity detected on password. Auto-submitting login...');
          const form = passwordInput.closest('form');
          const submitBtn = findSubmitButton(form);

          if (submitBtn) {
            submitBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
            submitBtn.focus();
            const prev = submitBtn.style.outline;
            submitBtn.style.outline = '3px solid #38bdf8';
            setTimeout(() => { submitBtn.style.outline = prev; }, 1000);

            submitBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
            submitBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
            submitBtn.click();
          } else if (form) {
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            if (typeof form.requestSubmit === 'function') form.requestSubmit();
          } else {
            // Enter key fallback
            passwordInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
            passwordInput.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
            passwordInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
          }
        }

        function initWatcher() {
          const userInput = findUsernameField();
          const passInput = findPasswordField();

          // 1. Auto-fill remembered username if field is empty
          if (userInput && rememberedUsername && !userInput.value) {
            console.log('[Tesseract DOM] Auto-filling remembered username:', rememberedUsername);
            setInputValue(userInput, rememberedUsername);
          }

          // 2. Track username input to prompt for memory save on new accounts
          if (userInput) {
            userInput.addEventListener('blur', () => {
              if (userInput.value && userInput.value.trim().length >= 2) {
                lastKnownUsername = userInput.value.trim();
                console.log('[Tesseract DOM] USERNAME_TYPED:' + JSON.stringify({ domain: window.location.hostname, username: lastKnownUsername }));
                try {
                  if (typeof require !== 'undefined') {
                    const { ipcRenderer } = require('electron');
                    ipcRenderer.sendToHost('TESSERACT_NEW_USERNAME_TYPED', { domain: window.location.hostname, username: lastKnownUsername });
                  }
                } catch (_) {}
              }
            });
          }

          // 3. Attach 5-second typing inactivity watcher on password field
          if (passInput) {
            console.log('[Tesseract DOM] Password field found, armed 5-second inactivity watcher.');

            const onTyping = () => {
              if (passwordInactivityTimer) {
                clearTimeout(passwordInactivityTimer);
                passwordInactivityTimer = null;
              }

              const val = passInput.value;
              if (val && val.length > 0) {
                // If user hasn't typed for 5000ms (5 seconds), automatically trigger login
                passwordInactivityTimer = setTimeout(() => {
                  if (passInput.value && passInput.value.length > 0) {
                    triggerLogin(passInput);
                  }
                }, 5000);
              }
            };

            passInput.addEventListener('input', onTyping);
            passInput.addEventListener('keydown', onTyping);
          }
        }

        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', initWatcher);
        } else {
          initWatcher();
        }

        return 'login_watcher_initialized';
      })()
    `;
    }
    /**
     * Generates script to autofill shipping/billing address fields on checkout pages.
     */
    static getAutofillAddressScript(profile) {
        return `
      (() => {
        const p = ${JSON.stringify(profile)};
        let filledCount = 0;

        function setVal(el, val) {
          if (!el || !val) return;
          el.focus();
          const proto = Object.getPrototypeOf(el);
          const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
          if (setter) setter.call(el, val);
          else el.value = val;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          filledCount++;
        }

        const inputs = Array.from(document.querySelectorAll('input, select, textarea'));
        for (const el of inputs) {
          const auto = (el.getAttribute('autocomplete') || '').toLowerCase();
          const idName = ((el.id || '') + ' ' + (el.name || '') + ' ' + (el.placeholder || '')).toLowerCase();

          if (auto.includes('name') || idName.includes('full name') || idName.includes('fullname')) {
            setVal(el, p.fullName);
          } else if (auto.includes('email') || idName.includes('email')) {
            setVal(el, p.email);
          } else if (auto.includes('tel') || idName.includes('phone') || idName.includes('mobile')) {
            setVal(el, p.phone);
          } else if (auto.includes('address-line1') || auto.includes('street-address') || idName.includes('street') || idName.includes('address1')) {
            setVal(el, p.streetAddress);
          } else if (auto.includes('address-line2') || idName.includes('apt') || idName.includes('suite') || idName.includes('apartment')) {
            if (p.apartment) setVal(el, p.apartment);
          } else if (auto.includes('address-level2') || idName.includes('city')) {
            setVal(el, p.city);
          } else if (auto.includes('address-level1') || idName.includes('state') || idName.includes('province')) {
            setVal(el, p.state);
          } else if (auto.includes('postal-code') || idName.includes('zip') || idName.includes('postal')) {
            setVal(el, p.postalCode);
          } else if (auto.includes('country') || idName.includes('country')) {
            setVal(el, p.country);
          }
        }

        return filledCount > 0 ? 'Filled ' + filledCount + ' address field(s)' : 'No matching address form fields found';
      })()
    `;
    }
    /**
     * Generates script to inspect social DMs (Instagram, Twitter, etc.).
     */
    static getDMInspectionScript() {
        return `
      (() => {
        // 1. Instagram Web Direct Messages
        const igRows = Array.from(document.querySelectorAll('div[role="listitem"], div[role="button"][tabindex="0"]'));
        const igThreads = igRows.map(r => {
          const text = r.innerText || '';
          const lines = text.split('\\n').map(l => l.trim()).filter(Boolean);
          if (lines.length >= 2) {
            return { sender: lines[0], preview: lines[1] };
          }
          return null;
        }).filter(Boolean);

        if (igThreads.length > 0) {
          const latest = igThreads[0];
          return JSON.stringify({
            platform: 'Instagram',
            sender: latest.sender,
            preview: latest.preview,
            unreadCount: igThreads.length,
          });
        }

        // 2. Generic chat / messaging container
        const messages = Array.from(document.querySelectorAll('div[data-testid="message-container"], div[role="row"]'));
        if (messages.length > 0) {
          const last = messages[messages.length - 1];
          return JSON.stringify({
            platform: 'Chat',
            sender: 'Active Conversation',
            preview: last.innerText?.trim() || '',
          });
        }

        return JSON.stringify({ error: 'No active direct messages found on this page' });
      })()
    `;
    }
    /**
     * Generates script to compose and send a DM response.
     */
    static getDMSendReplyScript(replyText) {
        return `
      (() => {
        const text = ${JSON.stringify(replyText)};
        // Locate active message composition input
        const chatInput = document.querySelector(
          'div[contenteditable="true"][role="textbox"], textarea[placeholder*="Message" i], textarea[aria-label*="Message" i], input[placeholder*="Message" i], div[data-lexical-editor="true"]'
        );

        if (!chatInput) return 'Message input field not found';

        chatInput.focus();
        if (chatInput.tagName === 'TEXTAREA' || chatInput.tagName === 'INPUT') {
          chatInput.value = text;
          chatInput.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          chatInput.innerText = text;
          chatInput.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
        }

        // Send via Enter or Send button
        setTimeout(() => {
          const sendBtn = document.querySelector('button[type="submit"], div[role="button"]:has(svg)');
          if (sendBtn) {
            sendBtn.click();
          } else {
            chatInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
          }
        }, 300);

        return 'Reply typed and sent';
      })()
    `;
    }
    /**
     * Generates script to observe current YouTube / Shorts or article content for co-browsing.
     */
    static getCoBrowsingObservationScript() {
        return `
      (() => {
        // 1. YouTube Video & Shorts
        const ytTitle = document.querySelector('h1.ytd-watch-metadata, ytd-reel-player-header-renderer h2, h2.title, h1.title')?.textContent?.trim();
        const ytChannel = document.querySelector('ytd-channel-name a, #channel-name a, ytd-reel-player-header-renderer .channel-name')?.textContent?.trim();
        const ytDesc = document.querySelector('#description-inline-expander, ytd-text-inline-expander')?.textContent?.trim();

        if (ytTitle) {
          // Also scrape 3 recommended video suggestions
          const recs = Array.from(document.querySelectorAll('ytd-compact-video-renderer #video-title, ytd-rich-item-renderer #video-title'))
            .slice(0, 3)
            .map(el => el.textContent?.trim())
            .filter(Boolean);

          return JSON.stringify({
            contentType: 'youtube_video',
            title: ytTitle,
            channel: ytChannel || 'Creator',
            description: (ytDesc || '').slice(0, 300),
            recommendations: recs,
          });
        }

        // 2. General Article / Webpage
        const pageTitle = document.title;
        const mainHeading = document.querySelector('h1')?.textContent?.trim();
        const firstPara = document.querySelector('article p, main p, p')?.textContent?.trim();

        return JSON.stringify({
          contentType: 'webpage',
          title: pageTitle,
          mainHeading: mainHeading || pageTitle,
          snippet: (firstPara || '').slice(0, 250),
        });
      })()
    `;
    }
}
exports.DOMAgent = DOMAgent;
//# sourceMappingURL=dom-agent.js.map