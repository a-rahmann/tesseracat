/**
 * Structured Browser Snapshot definitions.
 */
export interface SnapshotElement {
    id: string;
    index?: number;
    role: 'button' | 'link' | 'textbox' | 'password' | 'dropdown' | 'checkbox' | 'menu' | 'dialog' | 'heading' | 'video' | 'item' | 'canvas' | 'generic';
    name: string;
    text: string;
    value?: string;
    disabled?: boolean;
    visible: boolean;
    selector?: string;
    scope?: string;
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
//# sourceMappingURL=snapshot.d.ts.map