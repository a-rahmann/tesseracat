/**
 * Native Gmail Tools for Tesseract.
 *
 * Direct REST integration with Google Gmail API v1.
 * Bypasses DOM automation completely, executing in <200ms.
 */
import { GoogleConnector } from './google-connector.js';
export interface EmailMessage {
    id: string;
    threadId: string;
    subject: string;
    from: string;
    to: string;
    date: string;
    snippet: string;
    bodyText?: string;
}
export declare class GmailTools {
    static register(connector: GoogleConnector): void;
    static search(connector: GoogleConnector, query?: string, maxResults?: number): Promise<EmailMessage[]>;
    static getMessage(connector: GoogleConnector, messageId: string): Promise<EmailMessage>;
    static listThreads(connector: GoogleConnector, maxResults?: number): Promise<any[]>;
    static createDraft(connector: GoogleConnector, params: {
        to: string;
        subject: string;
        body: string;
    }): Promise<{
        draftId: string;
        messageId: string;
    }>;
    static send(connector: GoogleConnector, params: {
        to: string;
        subject: string;
        body: string;
        confirmed?: boolean;
    }): Promise<{
        messageId: string;
        threadId: string;
    }>;
}
//# sourceMappingURL=gmail-tools.d.ts.map