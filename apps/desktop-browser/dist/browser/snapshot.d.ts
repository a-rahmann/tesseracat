/**
 * Structured Browser Snapshot definitions.
 */
export interface SnapshotElement {
    id: string;
    index?: number;
    role: 'button' | 'link' | 'textbox' | 'checkbox' | 'menu' | 'dialog' | 'heading' | 'video' | 'item' | 'generic';
    name: string;
    text: string;
    value?: string;
    disabled?: boolean;
    visible: boolean;
    selector?: string;
    spatial?: {
        isLeftHalf: boolean;
        isRightHalf: boolean;
        isTopHalf: boolean;
        isBottomHalf: boolean;
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
    timestamp: number;
}
//# sourceMappingURL=snapshot.d.ts.map