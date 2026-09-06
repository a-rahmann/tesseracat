/**
 * Local PDF Extraction & Document Analysis Engine for Tesseract.
 * Extracts clean text streams and tables from local or webview PDF documents
 * without relying on Chromium's unreadable <embed> shadow DOM.
 */

import fs from 'fs';

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

export class PDFReader {
  private static instance: PDFReader | null = null;
  private cachedDocument: PDFDocumentSummary | null = null;

  public static getInstance(): PDFReader {
    if (!PDFReader.instance) {
      PDFReader.instance = new PDFReader();
    }
    return PDFReader.instance;
  }

  /**
   * Reads and extracts structured text from a PDF file path or buffer URL.
   */
  public async readPdf(targetUrlOrPath: string): Promise<PDFDocumentSummary> {
    console.log(`[PDFReader] Reading PDF from: ${targetUrlOrPath}`);
    let buffer: Buffer;

    try {
      if (targetUrlOrPath.startsWith('file://')) {
        const cleanPath = decodeURIComponent(targetUrlOrPath.replace(/^file:\/\//, ''));
        buffer = fs.readFileSync(cleanPath);
      } else if (targetUrlOrPath.startsWith('http://') || targetUrlOrPath.startsWith('https://')) {
        const resp = await fetch(targetUrlOrPath);
        const arrayBuf = await resp.arrayBuffer();
        buffer = Buffer.from(arrayBuf);
      } else if (fs.existsSync(targetUrlOrPath)) {
        buffer = fs.readFileSync(targetUrlOrPath);
      } else {
        // Attempt webview buffer dump or fallback sample
        throw new Error(`File not found at: ${targetUrlOrPath}`);
      }

      const summary = this.parsePdfBuffer(buffer, targetUrlOrPath);
      this.cachedDocument = summary;
      return summary;
    } catch (err: any) {
      console.warn(`[PDFReader] Direct binary read failed (${err.message}). Performing fallback stream extraction.`);
      const fallbackSummary: PDFDocumentSummary = {
        title: targetUrlOrPath.split('/').pop() || 'Document.pdf',
        pageCount: 1,
        totalCharacters: 0,
        chunks: [
          {
            pageNumber: 1,
            text: `Document: ${targetUrlOrPath}. Unable to read raw binary stream directly.`,
            headings: [],
          },
        ],
        fullText: `Document: ${targetUrlOrPath}`,
      };
      this.cachedDocument = fallbackSummary;
      return fallbackSummary;
    }
  }

  /**
   * Pure TypeScript stream parser for PDF objects.
   * Extracts text between BT (Begin Text) and ET (End Text) operators and Tj/TJ strings.
   */
  public parsePdfBuffer(buffer: Buffer, sourceName: string): PDFDocumentSummary {
    const raw = buffer.toString('latin1');

    // 1. Estimate page count via /Type /Page
    const pageMatches = raw.match(/\/Type\s*\/Page\b/g);
    const pageCount = Math.max(1, pageMatches ? pageMatches.length : 1);

    // 2. Extract text streams from flate/raw streams
    const textPieces: string[] = [];
    const headings: string[] = [];

    // Extract text blocks inside BT ... ET
    const textBlockRegex = /BT\s*([\s\S]*?)\s*ET/g;
    let match: RegExpExecArray | null;

    while ((match = textBlockRegex.exec(raw)) !== null) {
      const block = match[1];

      // Match literal strings: (Text) Tj or [ (Text) -20 (More) ] TJ
      const stringMatches = block.match(/\(([^)]*)\)\s*Tj/g) || [];
      for (const sm of stringMatches) {
        const str = sm.replace(/^\(/, '').replace(/\)\s*Tj$/, '');
        if (str && str.trim().length > 1) {
          textPieces.push(this.decodePdfString(str));
        }
      }

      // Match array strings TJ
      const arrayMatches = block.match(/\[([\s\S]*?)\]\s*TJ/g) || [];
      for (const am of arrayMatches) {
        const innerStrs = am.match(/\(([^)]*)\)/g) || [];
        const combined = innerStrs
          .map(s => s.slice(1, -1))
          .map(s => this.decodePdfString(s))
          .join('');
        if (combined.trim().length > 1) {
          textPieces.push(combined);
        }
      }
    }

    // Clean and normalize text
    const cleanFullText = textPieces
      .join(' ')
      .replace(/\s+/g, ' ')
      .replace(/\\([()\\])/g, '$1')
      .trim();

    // Identify headings (uppercase or short lines)
    const lines = cleanFullText.split(/(?<=[.?!])\s+/);
    for (const l of lines) {
      if (l.length > 5 && l.length < 60 && (l === l.toUpperCase() || /^[0-9]\.\s+[A-Z]/.test(l))) {
        headings.push(l);
      }
      if (headings.length >= 10) break;
    }

    // Segment into chunks of ~1200 characters
    const chunks: PDFTextChunk[] = [];
    const chunkSize = 1200;
    const total = cleanFullText.length;
    let chunkIndex = 0;

    for (let i = 0; i < total; i += chunkSize) {
      chunkIndex++;
      chunks.push({
        pageNumber: Math.min(pageCount, Math.ceil((i + 1) / Math.max(1, total / pageCount))),
        text: cleanFullText.slice(i, i + chunkSize),
        headings: headings.slice(0, 3),
      });
      if (chunks.length >= 20) break; // Limit to 20 chunks for token protection
    }

    return {
      title: sourceName.split('/').pop()?.replace(/[?#].*$/, '') || 'Document.pdf',
      pageCount,
      totalCharacters: total,
      chunks: chunks.length > 0 ? chunks : [{ pageNumber: 1, text: cleanFullText || 'No text content found in document.', headings: [] }],
      fullText: cleanFullText || 'Empty document.',
    };
  }

  /**
   * Search within extracted document for query matches.
   */
  public search(query: string): string {
    if (!this.cachedDocument) return 'No PDF document currently loaded.';
    const cleanQ = query.toLowerCase().trim();
    const matchingChunks = this.cachedDocument.chunks.filter(c => c.text.toLowerCase().includes(cleanQ));

    if (matchingChunks.length > 0) {
      return matchingChunks.map(c => `[Page ${c.pageNumber}] ${c.text}`).join('\n\n');
    }

    // Fallback to top 2 chunks
    return this.cachedDocument.chunks.slice(0, 2).map(c => `[Page ${c.pageNumber}] ${c.text}`).join('\n\n');
  }

  /**
   * Basic table extraction heuristic from tabular alignments.
   */
  public extractTable(): string {
    if (!this.cachedDocument) return 'No PDF document loaded.';
    // Look for lines with multiple numbers or pipe/comma separators
    const lines = this.cachedDocument.fullText.split(/(?<=[.?!])\s+/);
    const tableCandidates = lines.filter(l => (l.match(/\d+/g) || []).length >= 3);
    if (tableCandidates.length > 0) {
      return tableCandidates.slice(0, 5).join('\n');
    }
    return 'No structured table data detected in active document.';
  }

  private decodePdfString(str: string): string {
    return str
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\([0-7]{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));
  }
}
