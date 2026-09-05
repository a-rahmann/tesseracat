/**
 * YouTube Website Adapter.
 * Extracts video semantics, manages search, result selection, and verifies actual video playback.
 */
export declare class YouTubeAdapter {
    static isYouTubeUrl(url: string): boolean;
    static getCurrentVideo(): Promise<{
        title: string;
        channel: string;
        description: string;
        currentTime: number;
        duration: number;
        captions?: string;
        transcriptSnippet?: string;
    }>;
    static search(query: string): Promise<boolean>;
    static playResult(index?: number): Promise<boolean>;
    /**
     * Complete multi-step play action:
     * 1. Search YouTube -> 2. Select Result -> 3. Verify Playback
     */
    static searchAndPlay(query: string, index?: number): Promise<{
        success: boolean;
        title?: string;
    }>;
}
//# sourceMappingURL=youtube.d.ts.map