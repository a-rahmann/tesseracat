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

export class GmailTools {
  public static register(connector: GoogleConnector): void {
    connector.registerToolHandler('gmail.search', async (params) => GmailTools.search(connector, params?.query, params?.maxResults));
    connector.registerToolHandler('gmail.getMessage', async (params) => GmailTools.getMessage(connector, params?.messageId));
    connector.registerToolHandler('gmail.listThreads', async (params) => GmailTools.listThreads(connector, params?.maxResults));
    connector.registerToolHandler('gmail.createDraft', async (params) => GmailTools.createDraft(connector, params));
    connector.registerToolHandler('gmail.send', async (params) => GmailTools.send(connector, params));
  }

  public static async search(connector: GoogleConnector, query?: string, maxResults: number = 10): Promise<EmailMessage[]> {
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
    const details = await Promise.all(
      messageStubs.slice(0, 5).map((stub: any) => GmailTools.getMessage(connector, stub.id).catch(() => null))
    );

    return details.filter((m): m is EmailMessage => m !== null);
  }

  public static async getMessage(connector: GoogleConnector, messageId: string): Promise<EmailMessage> {
    if (!messageId) throw new Error('messageId is required for gmail.getMessage');
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
    const getHeader = (name: string) => headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

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

  public static async listThreads(connector: GoogleConnector, maxResults: number = 10): Promise<any[]> {
    const token = await connector.getValidAccessToken();
    const url = `https://gmail.googleapis.com/gmail/v1/users/me/threads?maxResults=${maxResults}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) throw new Error(`Gmail listThreads failed: ${await res.text()}`);
    const data = await res.json();
    return data.threads || [];
  }

  public static async createDraft(
    connector: GoogleConnector,
    params: { to: string; subject: string; body: string }
  ): Promise<{ draftId: string; messageId: string }> {
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

    if (!res.ok) throw new Error(`Gmail createDraft failed: ${await res.text()}`);
    const data = await res.json();
    return { draftId: data.id, messageId: data.message?.id };
  }

  public static async send(
    connector: GoogleConnector,
    params: { to: string; subject: string; body: string; confirmed?: boolean }
  ): Promise<{ messageId: string; threadId: string }> {
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

    if (!res.ok) throw new Error(`Gmail send failed: ${await res.text()}`);
    const data = await res.json();
    return { messageId: data.id, threadId: data.threadId };
  }
}
