/**
 * Accessibility Tree & Semantic DOM Extractor for Tesseract.
 * Generates compact, token-efficient representations of visible, interactive elements
 * with numbered indices [1], [2]... and spatial attributes (left, right, top, bottom).
 */

export const INJECTED_DOM_SNAPSHOT_SCRIPT = `
(() => {
  const elements = [];
  let idCounter = 1;
  const winWidth = window.innerWidth || 1280;
  const winHeight = window.innerHeight || 800;

  function isVisible(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 2 && rect.height > 2 && rect.top < winHeight && rect.bottom > 0;
  }

  // Interactive query selector
  const candidates = document.querySelectorAll(
    'button, a[href], input, textarea, select, [role="button"], [role="link"], [role="textbox"], [role="menuitem"], [role="checkbox"], h1, h2, h3, video, [data-action]'
  );

  for (const el of candidates) {
    if (!isVisible(el)) continue;

    const index = idCounter++;
    const id = 'e' + index;
    el.setAttribute('data-tesseract-id', id);

    let role = 'generic';
    const tag = el.tagName.toLowerCase();
    const explicitRole = el.getAttribute('role');

    if (explicitRole) {
      role = explicitRole;
    } else if (tag === 'button') {
      role = 'button';
    } else if (tag === 'a') {
      const isVideoLink = el.href && (el.href.includes('/watch') || el.href.includes('/video') || el.href.includes('youtu.be'));
      const hasThumb = Boolean(el.querySelector('img, ytd-thumbnail'));
      role = (isVideoLink || hasThumb) ? 'video' : 'link';
    } else if (tag === 'input' || tag === 'textarea') {
      role = 'textbox';
    } else if (tag === 'video' || el.querySelector('video')) {
      role = 'video';
    } else if (tag.startsWith('h') && tag.length === 2) {
      role = 'heading';
    }

    const name = (
      el.getAttribute('aria-label') ||
      el.getAttribute('placeholder') ||
      el.getAttribute('title') ||
      ''
    ).trim();

    const text = (el.innerText || el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 90);
    const value = (el.value || '').trim();
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
      text,
      value: role === 'textbox' ? value : undefined,
      disabled,
      visible: true,
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

    if (elements.length >= 80) break; // Token guard
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
        const val = el.value ? ` (value: "${el.value}")` : '';
        const dis = el.disabled ? ' [disabled]' : '';
        const side = el.spatial?.isRightHalf ? ' [right]' : el.spatial?.isLeftHalf ? ' [left]' : '';
        return `[${idx}] ${el.role}: ${desc}${val}${dis}${side}`;
      })
      .join('\n');
  }

  public static toNumberedList(elements: any[]): string {
    return this.toCompactString(elements);
  }
}
