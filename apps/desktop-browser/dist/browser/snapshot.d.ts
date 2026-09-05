/**
 * Structured Browser Snapshot definitions.
 */
export interface SnapshotElement {
    id: string;
    role: 'button' | 'link' | 'textbox' | 'checkbox' | 'menu' | 'dialog' | 'heading' | 'video' | 'item' | 'generic';
    name: string;
    text: string;
    value?: string;
    disabled?: boolean;
    visible: boolean;
    selector?: string;
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
//# sourceMappingURL=snapshot.d.ts.map