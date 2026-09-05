/**
 * Structured Browser Snapshot definitions.
 */

export interface SnapshotElement {
  id: string; // Temporary ID e.g. "e1", "e2"
  role: 'button' | 'link' | 'textbox' | 'checkbox' | 'menu' | 'dialog' | 'heading' | 'video' | 'item' | 'generic';
  name: string; // ARIA label or inner accessible name
  text: string; // Visible text snippet
  value?: string; // Input value if applicable
  disabled?: boolean;
  visible: boolean;
  selector?: string; // Selector for execution
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
  timestamp: number;
}
