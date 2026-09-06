/**
 * Structured Browser Snapshot definitions.
 */

export interface SnapshotElement {
  id: string; // Temporary ID e.g. "e1", "e2"
  index?: number; // 1-indexed number e.g. [1], [2]
  role: 'button' | 'link' | 'textbox' | 'password' | 'dropdown' | 'checkbox' | 'menu' | 'dialog' | 'heading' | 'video' | 'item' | 'canvas' | 'generic';
  name: string; // ARIA label or inner accessible name
  text: string; // Visible text snippet
  value?: string; // Input value if applicable (masked for passwords)
  disabled?: boolean;
  visible: boolean;
  selector?: string; // Selector for execution
  scope?: string; // Shadow DOM or iframe scope e.g. "shadow", "iframe"
  spatial?: {
    isLeftHalf: boolean;
    isRightHalf: boolean;
    isTopHalf: boolean;
    isBottomHalf: boolean;
  };
  rect?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface VideoMetadata {
  title?: string;
  channel?: string;
  currentTime?: number;
  duration?: number;
  paused?: boolean;
  captions?: string;
  transcriptSnippet?: string;
}

export interface PageSnapshot {
  url: string;
  title: string;
  elements: SnapshotElement[];
  media: VideoMetadata[];
  domHash: string;
  hasLoginForm?: boolean;
  hasCaptcha?: boolean;
  captchaType?: string;
  hasPaymentForm?: boolean;
  hasCanvasControls?: boolean;
  requiresVisualFallback?: boolean;
  screenshotBase64?: string;
  isPdfDocument?: boolean;
  timestamp: number;
}
