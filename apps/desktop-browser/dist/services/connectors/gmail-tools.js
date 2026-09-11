"use strict";
/**
 * Native Gmail Tools for Tesseract.
 *
 * Direct REST integration with Google Gmail API v1.
 * Bypasses DOM automation completely, executing in <200ms.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GmailTools = void 0;
class GmailTools {
    static register(connector) {
        connector.registerToolHandler('gmail.search', async (params) => GmailTools.search(connector, params?.query, params?.maxResults));
        connector.registerToolHandler('gmail.getMessage', async (params) => GmailTools.getMessage(connector, params?.messageId));
        connector.registerToolHandler('gmail.listThreads', async (params) => GmailTools.listThreads(connector, params?.maxResults));
        connector.registerToolHandler('gmail.createDraft', async (params) => GmailTools.createDraft(connector, params));
        connector.registerToolHandler('gmail.send', async (params) => GmailTools.send(connector, params));
    }
    static async search(connector, query, maxResults = 10) {
        const token = await connector.getValidAccessToken();
        const qParam = encodeURIComponent(query || 'is:inbox');
        const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${qParam}&maxResults=${maxResults}`;
        const res = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
            throw new Error(`Gmail search failed: ${await res.text()}`);
        }
        const data = await res.json();
        const messageStubs = data.messages || [];
        // Fetch message summaries in parallel
        const details = await Promise.all(messageStubs.slice(0, 5).map((stub) => GmailTools.getMessage(connector, stub.id).catch(() => null)));
        return details.filter((m) => m !== null);
    }
    static async getMessage(connector, messageId) {
        if (!messageId)
            throw new Error('messageId is required for gmail.getMessage');
        const token = await connector.getValidAccessToken();
        const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`;
        const res = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
            throw new Error(`Gmail getMessage failed: ${await res.text()}`);
        }
        const data = await res.json();
        const headers = data.payload?.headers || [];
        const getHeader = (name) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
        return {
            id: data.id,
            threadId: data.threadId,
            subject: getHeader('Subject'),
            from: getHeader('From'),
            to: getHeader('To'),
            date: getHeader('Date'),
            snippet: data.snippet || '',
            bodyText: data.snippet,
        };
    }
    static async listThreads(connector, maxResults = 10) {
        const token = await connector.getValidAccessToken();
        const url = `https://gmail.googleapis.com/gmail/v1/users/me/threads?maxResults=${maxResults}`;
        const res = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok)
            throw new Error(`Gmail listThreads failed: ${await res.text()}`);
        const data = await res.json();
        return data.threads || [];
    }
    static async createDraft(connector, params) {
        const token = await connector.getValidAccessToken();
        const rfcMessage = [
            `To: ${params.to}`,
            `Subject: ${params.subject}`,
            'Content-Type: text/plain; charset=utf-8',
            '',
            params.body,
        ].join('\r\n');
        const encoded = Buffer.from(rfcMessage).toString('base64url');
        const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message: { raw: encoded } }),
        });
        if (!res.ok)
            throw new Error(`Gmail createDraft failed: ${await res.text()}`);
        const data = await res.json();
        return { draftId: data.id, messageId: data.message?.id };
    }
    static async send(connector, params) {
        if (!params.confirmed) {
            throw new Error('CONFIRMATION_REQUIRED: Sending an external email requires explicit user confirmation.');
        }
        const token = await connector.getValidAccessToken();
        const rfcMessage = [
            `To: ${params.to}`,
            `Subject: ${params.subject}`,
            'Content-Type: text/plain; charset=utf-8',
            '',
            params.body,
        ].join('\r\n');
        const encoded = Buffer.from(rfcMessage).toString('base64url');
        const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ raw: encoded }),
        });
        if (!res.ok)
            throw new Error(`Gmail send failed: ${await res.text()}`);
        const data = await res.json();
        return { messageId: data.id, threadId: data.threadId };
    }
}
exports.GmailTools = GmailTools;
//# sourceMappingURL=gmail-tools.js.map