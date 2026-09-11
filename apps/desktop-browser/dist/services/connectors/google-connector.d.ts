/**
 * Google Native Service Connector for Tesseract.
 *
 * Provides OAuth 2.0 with PKCE authorization, secure token management via CredentialVault,
 * token auto-refresh, and tool routing for Gmail, Google Calendar, Google Drive, and YouTube.
 *
 * Security Invariants:
 * 1. ZERO password entry. Only OAuth 2.0 consent authorization.
 * 2. Least-privilege scopes requested per capability.
 * 3. Access & refresh tokens stored encrypted via CredentialVault.
 */
import { ServiceConnector, ConnectorCapability, AuthenticationState } from './service-connector.js';
export interface GoogleOAuthConfig {
    clientId: string;
    clientSecret?: string;
    redirectUri: string;
}
export declare class GoogleConnector implements ServiceConnector {
    id: string;
    name: string;
    authenticationState: AuthenticationState;
    capabilities: ConnectorCapability[];
    private static instance;
    private vault;
    private config;
    private currentTokens;
    private toolHandlers;
    private constructor();
    static getInstance(): GoogleConnector;
    setConfig(config: Partial<GoogleOAuthConfig>): void;
    registerToolHandler(toolName: string, handler: (params: any) => Promise<any>): void;
    private initializeCapabilities;
    getCapabilities(): ConnectorCapability[];
    getValidAccessToken(): Promise<string>;
    connect(scopes?: string[]): Promise<boolean>;
    refreshAccessToken(refreshToken: string): Promise<string>;
    disconnect(): Promise<boolean>;
    healthCheck(): Promise<{
        ok: boolean;
        status: string;
    }>;
    executeTool(toolName: string, params: any): Promise<any>;
    private listenForAuthCode;
}
//# sourceMappingURL=google-connector.d.ts.map