/**
 * Local PDF Extraction & Document Analysis Engine for Tesseract.
 * Extracts clean text streams and tables from local or webview PDF documents
 * without relying on Chromium's unreadable <embed> shadow DOM.
 */
export interface PDFTextChunk {
    pageNumber: number;
    text: string;
    headings: string[];
}
export interface PDFDocumentSummary {
    title: string;
    pageCount: number;
    totalCharacters: number;
    chunks: PDFTextChunk[];
    fullText: string;
}
export declare class PDFReader {
    private static instance;
    private cachedDocument;
    static getInstance(): PDFReader;
    /**
     * Reads and extracts structured text from a PDF file path or buffer URL.
     */
    readPdf(targetUrlOrPath: string): Promise<PDFDocumentSummary>;
    /**
     * Pure TypeScript stream parser for PDF objects.
     * Extracts text between BT (Begin Text) and ET (End Text) operators and Tj/TJ strings.
     */
    parsePdfBuffer(buffer: Buffer, sourceName: string): PDFDocumentSummary;
    /**
     * Search within extracted document for query matches.
     */
    search(query: string): string;
    /**
     * Basic table extraction heuristic from tabular alignments.
     */
    extractTable(): string;
    private decodePdfString;
}
//# sourceMappingURL=pdf-reader.d.ts.map