/**
 * Accessibility Tree & Semantic DOM Extractor for Tesseract.
 * Generates compact, token-efficient representations of visible, interactive elements
 * with numbered Set-of-Marks indices [1], [2]... and spatial attributes (left, right, top, bottom).
 * Enforces non-negotiable credential masking (passwords are NEVER exposed to LLM context).
 */

export const INJECTED_DOM_SNAPSHOT_SCRIPT = `
(() => {
  const elements = [];
  let idCounter = 1;
  const winWidth = window.innerWidth || 1280;
  const winHeight = window.innerHeight || 800;

  let hasLoginForm = false;
  let hasCaptcha = false;
  let captchaType = '';
  let hasPaymentForm = false;
  let hasCanvasControls = false;

  // 1. Comprehensive Anti-Bot & CAPTCHA Fingerprinting
  // Detects Cloudflare Turnstile, PerimeterX, DataDome, Arkose Labs, AWS WAF, reCAPTCHA, hCaptcha
  const turnstileEl = document.querySelector('iframe[src*="challenges.cloudflare.com"], iframe[src*="turnstile"], .cf-turnstile, #cf-turnstile, div[class*="cf-turnstile"]');
  const recaptchaEl = document.querySelector('iframe[src*="recaptcha"], .g-recaptcha, div[class*="recaptcha"]');
  const hcaptchaEl = document.querySelector('iframe[src*="hcaptcha"], .h-captcha');
  const perimeterXEl = document.querySelector('#px-captcha, div[id*="px-block"], script[src*="perimeterx"]');
  const dataDomeEl = document.querySelector('#datadome, iframe[src*="datadome"]');
  const arkoseEl = document.querySelector('#fc-iframe-wrap, iframe[src*="arkoselabs"]');
  const awsWafEl = document.querySelector('#aws-waf-captcha, iframe[src*="awswaf"]');
  const genericChallenge = document.querySelector('#challenge-stage, #challenge-form, .challenge-form');

  if (turnstileEl) {
    hasCaptcha = true;
    captchaType = 'Cloudflare Turnstile';
  } else if (perimeterXEl) {
    hasCaptcha = true;
    captchaType = 'PerimeterX';
  } else if (dataDomeEl) {
    hasCaptcha = true;
    captchaType = 'DataDome';
  } else if (arkoseEl) {
    hasCaptcha = true;
    captchaType = 'Arkose Labs';
  } else if (awsWafEl) {
    hasCaptcha = true;
    captchaType = 'AWS WAF Captcha';
  } else if (hcaptchaEl) {
    hasCaptcha = true;
    captchaType = 'hCaptcha';
  } else if (recaptchaEl || genericChallenge) {
    hasCaptcha = true;
    captchaType = 'reCAPTCHA';
  }

  // 2. Detect Payment forms in DOM
  if (document.querySelector('form[action*="pay"], [name*="creditCard"], [name*="cardNumber"], [autocomplete*="cc-number"], input[placeholder*="CVV"], input[placeholder*="Card"]')) {
    hasPaymentForm = true;
  }

  function isVisible(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 2 && rect.height > 2 && rect.top < winHeight && rect.bottom > 0;
  }

  // Helper to detect sensitive credential / OTP / payment fields
  function isSensitiveField(tag, type, name, placeholder, autocomplete) {
    const combined = (type + ' ' + name + ' ' + placeholder + ' ' + autocomplete).toLowerCase();
    return (
      type === 'password' ||
      combined.includes('password') ||
      combined.includes('cvv') ||
      combined.includes('cvc') ||
      combined.includes('security code') ||
      combined.includes('one-time-code') ||
      combined.includes('otp') ||
      combined.includes('passcode') ||
      combined.includes('cardnumber') ||
      combined.includes('cc-number') ||
      combined.includes('token')
    );
  }

  // 3. Recursive DOM Collector: pierces open Shadow DOM and accessible iframes
  function collectNodes(root, scopePrefix = '') {
    if (!root) return [];
    const collected = [];

    // Query standard candidate interactive targets in this root scope
    const matches = root.querySelectorAll(
      'button, a[href], input, textarea, select, [role="button"], [role="link"], [role="textbox"], [role="menuitem"], [role="checkbox"], h1, h2, h3, video, canvas, [data-action]'
    );

    for (const el of matches) {
      collected.push({ node: el, scopePrefix });
    }

    // Inspect custom web components and elements with open shadowRoot
    const allEls = root.querySelectorAll('*');
    for (const el of allEls) {
      if (el.shadowRoot) {
        const shadowPrefix = scopePrefix ? scopePrefix + '>shadow' : 'shadow';
        const shadowMatches = collectNodes(el.shadowRoot, shadowPrefix);
        collected.push(...shadowMatches);
      }

      // Inspect same-origin child iframes
      if (el.tagName === 'IFRAME') {
        try {
          if (el.contentDocument && el.contentDocument.body) {
            const iframePrefix = scopePrefix ? scopePrefix + '>iframe' : 'iframe';
            const frameMatches = collectNodes(el.contentDocument.body, iframePrefix);
            collected.push(...frameMatches);
          }
        } catch (_) {
          // Cross-origin iframe security boundary; handled gracefully
        }
      }
    }

    return collected;
  }

  const allCandidates = collectNodes(document);

  for (const { node: el, scopePrefix } of allCandidates) {
    if (!isVisible(el)) continue;

    const index = idCounter++;
    const id = 'e' + index;
    try {
      el.setAttribute('data-tesseract-id', id);
    } catch (_) {}

    let role = 'generic';
    const tag = el.tagName.toLowerCase();
    const explicitRole = el.getAttribute('role');
    const inputType = (el.getAttribute('type') || '').toLowerCase();
    const nameAttr = el.getAttribute('name') || '';
    const placeholderAttr = el.getAttribute('placeholder') || '';
    const autocompleteAttr = el.getAttribute('autocomplete') || '';

    if (inputType === 'password') {
      hasLoginForm = true;
    }

    if (tag === 'canvas') {
      role = 'canvas';
      hasCanvasControls = true;
    } else if (explicitRole) {
      role = explicitRole;
    } else if (tag === 'button') {
      role = 'button';
    } else if (tag === 'a') {
      const isVideoLink = el.href && (el.href.includes('/watch') || el.href.includes('/video') || el.href.includes('youtu.be'));
      const hasThumb = Boolean(el.querySelector('img, ytd-thumbnail'));
      role = (isVideoLink || hasThumb) ? 'video' : 'link';
    } else if (tag === 'input' || tag === 'textarea') {
      role = isSensitiveField(tag, inputType, nameAttr, placeholderAttr, autocompleteAttr) ? 'password' : 'textbox';
    } else if (tag === 'select') {
      role = 'dropdown';
    } else if (tag === 'video' || el.querySelector('video')) {
      role = 'video';
    } else if (tag.startsWith('h') && tag.length === 2) {
      role = 'heading';
    }

    const name = (
      el.getAttribute('aria-label') ||
      placeholderAttr ||
      el.getAttribute('title') ||
      ''
    ).trim();

    const text = (el.innerText || el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 90);

    // SECURITY FIREWALL: Mask sensitive credential, OTP, CVV, and credit card values
    let value = (el.value || '').trim();
    if (isSensitiveField(tag, inputType, nameAttr, placeholderAttr, autocompleteAttr)) {
      value = '[MASKED_CREDENTIAL]';
    }

    const disabled = el.disabled || el.getAttribute('aria-disabled') === 'true';

    const rect = el.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const isLeftHalf = centerX < winWidth / 2;
    const isRightHalf = centerX >= winWidth / 2;
    const isTopHalf = centerY < winHeight / 2;
    const isBottomHalf = centerY >= winHeight / 2;

    elements.push({
      index,
      id,
      role,
      name,
      text: role === 'canvas' ? '(Visual Canvas Element)' : text,
      value: (role === 'textbox' || role === 'dropdown') ? value : undefined,
      disabled,
      visible: true,
      scope: scopePrefix || undefined,
      rect: {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
      spatial: {
        isLeftHalf,
        isRightHalf,
        isTopHalf,
        isBottomHalf,
      }
    });

    if (elements.length >= 100) break; // Token guard
  }

  // Video metadata extraction
  const mediaList = [];
  const videoEls = document.querySelectorAll('video');
  for (const v of videoEls) {
    mediaList.push({
      currentTime: Math.round(v.currentTime || 0),
      duration: Math.round(v.duration || 0),
      paused: v.paused,
      muted: v.muted
    });
  }

  return {
    url: window.location.href,
    title: document.title,
    hasLoginForm,
    hasCaptcha,
    captchaType: captchaType || undefined,
    hasPaymentForm,
    hasCanvasControls,
    requiresVisualFallback: hasCanvasControls && elements.filter(e => e.role !== 'canvas').length < 3,
    elements,
    media: mediaList
  };
})();
`;

export class AccessibilityTreeFormatter {
  public static toCompactString(elements: any[]): string {
    if (!elements || elements.length === 0) return 'No interactive elements observed.';

    return elements
      .map((el) => {
        const idx = el.index || el.id;
        const desc = el.name ? `"${el.name}"` : el.text ? `"${el.text}"` : '';
        const nameLower = (el.name || '').toLowerCase();
        const textLower = (el.text || '').toLowerCase();
        const typeLower = (el.type || '').toLowerCase();

        const isSensitive =
          el.role === 'password' ||
          typeLower === 'password' ||
          nameLower.includes('password') ||
          nameLower.includes('cvv') ||
          nameLower.includes('cvc') ||
          nameLower.includes('security code') ||
          nameLower.includes('otp') ||
          nameLower.includes('passcode') ||
          nameLower.includes('cardnumber') ||
          nameLower.includes('cc-number') ||
          textLower.includes('one-time code');

        const displayVal = isSensitive ? '[MASKED_CREDENTIAL]' : el.value;
        const val = displayVal ? ` (value: "${displayVal}")` : '';
        const dis = el.disabled ? ' [disabled]' : '';
        const side = el.spatial?.isRightHalf ? ' [right]' : el.spatial?.isLeftHalf ? ' [left]' : '';
        const scope = el.scope ? ` [scope: ${el.scope}]` : '';
        return `[${idx}] ${el.role}: ${desc}${val}${dis}${side}${scope}`;
      })
      .join('\n');
  }

  public static toNumberedList(elements: any[]): string {
    return this.toCompactString(elements);
  }
}

export function formatAccessibilityTree(elements: any[]): string {
  return AccessibilityTreeFormatter.toCompactString(elements);
}
