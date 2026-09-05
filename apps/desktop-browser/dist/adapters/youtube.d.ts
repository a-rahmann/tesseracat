/**
 * YouTube Website Adapter.
 * Extracts richer video semantics, captions, transcripts, and manages playback.
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
}
//# sourceMappingURL=youtube.d.ts.map