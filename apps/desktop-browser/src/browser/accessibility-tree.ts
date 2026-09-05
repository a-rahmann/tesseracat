/**
 * Accessibility Tree & Semantic DOM Extractor for Tesseract.
 * Generates compact, token-efficient representations of visible, interactive elements.
 */

export const INJECTED_DOM_SNAPSHOT_SCRIPT = `
(() => {
  const elements = [];
  let idCounter = 1;

  function isVisible(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight && rect.bottom > 0;
  }

  // Interactive query selector
  const candidates = document.querySelectorAll(
    'button, a[href], input, textarea, select, [role="button"], [role="link"], [role="textbox"], [role="menuitem"], [role="checkbox"], h1, h2, h3, video'
  );

  for (const el of candidates) {
    if (!isVisible(el)) continue;

    const id = 'e' + idCounter++;
    el.setAttribute('data-tesseract-id', id);

    let role = 'generic';
    const tag = el.tagName.toLowerCase();
    const explicitRole = el.getAttribute('role');

    if (explicitRole) {
      role = explicitRole;
    } else if (tag === 'button') {
      role = 'button';
    } else if (tag === 'a') {
      role = 'link';
    } else if (tag === 'input' || tag === 'textarea') {
      role = 'textbox';
    } else if (tag === 'video') {
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

    const text = (el.innerText || el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 80);
    const value = (el.value || '').trim();
    const disabled = el.disabled || el.getAttribute('aria-disabled') === 'true';

    elements.push({
      id,
      role,
      name,
      text,
      value: role === 'textbox' ? value : undefined,
      disabled,
      visible: true
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
      paused: v.paused
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
        const desc = el.name ? `"${el.name}"` : el.text ? `"${el.text}"` : '';
        const val = el.value ? ` (value: "${el.value}")` : '';
        const dis = el.disabled ? ' [disabled]' : '';
        return `[${el.id}] ${el.role} ${desc}${val}${dis}`;
      })
      .join('\n');
  }
}
