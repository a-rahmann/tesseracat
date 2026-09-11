/**
 * Native YouTube Tools for Tesseract.
 *
 * Provides API & optimized playback automation with strict verification gates.
 */
import { GoogleConnector } from './google-connector.js';
export interface YouTubePlayResult {
    success: boolean;
    videoTitle?: string;
    channel?: string;
    isPlaying: boolean;
    url?: string;
}
export declare class YouTubeTools {
    static register(connector: GoogleConnector): void;
    static search(connector: GoogleConnector, query?: string): Promise<any[]>;
    static getVideo(connector?: GoogleConnector): Promise<any>;
    /**
     * Deterministic Play Action with Playback Verification.
     * Handles "Play a random video", "Play cats on YouTube", etc.
     */
    static play(params: {
        query?: string;
        videoId?: string;
        index?: number;
        isRandom?: boolean;
    }): Promise<YouTubePlayResult>;
}
//# sourceMappingURL=youtube-tools.d.ts.map