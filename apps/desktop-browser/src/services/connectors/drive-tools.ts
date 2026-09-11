/**
 * Native Google Drive Tools for Tesseract.
 *
 * Direct REST integration with Google Drive API v3.
 */

import { GoogleConnector } from './google-connector.js';

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  webViewLink?: string;
}

export class DriveTools {
  public static register(connector: GoogleConnector): void {
    connector.registerToolHandler('drive.search', async (params) => DriveTools.search(connector, params?.query, params?.pageSize));
    connector.registerToolHandler('drive.getFile', async (params) => DriveTools.getFile(connector, params?.fileId));
    connector.registerToolHandler('drive.upload', async (params) => DriveTools.upload(connector, params));
    connector.registerToolHandler('drive.delete', async (params) => DriveTools.deleteFile(connector, params));
  }

  public static async search(connector: GoogleConnector, query?: string, pageSize: number = 10): Promise<DriveFile[]> {
    const token = await connector.getValidAccessToken();
    let q = "trashed = false";
    if (query) {
      q += ` and name contains '${query.replace(/'/g, "\\'")}'`;
    }

    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&pageSize=${pageSize}&fields=files(id,name,mimeType,size,modifiedTime,webViewLink)`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Drive search failed: ${await res.text()}`);
    const data = await res.json();
    return data.files || [];
  }

  public static async getFile(connector: GoogleConnector, fileId: string): Promise<DriveFile> {
    if (!fileId) throw new Error('fileId is required for drive.getFile');
    const token = await connector.getValidAccessToken();
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,size,modifiedTime,webViewLink`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Drive getFile failed: ${await res.text()}`);
    return res.json();
  }

  public static async upload(
    connector: GoogleConnector,
    params: { name: string; content: string; mimeType?: string }
  ): Promise<DriveFile> {
    const token = await connector.getValidAccessToken();
    const boundary = '-------TesseractDriveBoundary' + Date.now();
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const metadata = {
      name: params.name,
      mimeType: params.mimeType || 'text/plain',
    };

    const multipartRequestBody =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      `Content-Type: ${params.mimeType || 'text/plain'}\r\n\r\n` +
      params.content +
      closeDelimiter;

    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartRequestBody,
    });

    if (!res.ok) throw new Error(`Drive upload failed: ${await res.text()}`);
    return res.json();
  }

  public static async deleteFile(
    connector: GoogleConnector,
    params: { fileId: string; confirmed?: boolean }
  ): Promise<{ success: boolean; fileId: string }> {
    if (!params.confirmed) {
      throw new Error('CONFIRMATION_REQUIRED: Deleting a Drive file requires user confirmation.');
    }

    const token = await connector.getValidAccessToken();
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${params.fileId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) throw new Error(`Drive delete failed: ${await res.text()}`);
    return { success: true, fileId: params.fileId };
  }
}
