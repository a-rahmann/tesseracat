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
export declare class DriveTools {
    static register(connector: GoogleConnector): void;
    static search(connector: GoogleConnector, query?: string, pageSize?: number): Promise<DriveFile[]>;
    static getFile(connector: GoogleConnector, fileId: string): Promise<DriveFile>;
    static upload(connector: GoogleConnector, params: {
        name: string;
        content: string;
        mimeType?: string;
    }): Promise<DriveFile>;
    static deleteFile(connector: GoogleConnector, params: {
        fileId: string;
        confirmed?: boolean;
    }): Promise<{
        success: boolean;
        fileId: string;
    }>;
}
//# sourceMappingURL=drive-tools.d.ts.map