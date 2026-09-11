/**
 * OS-Secure Credential Vault for Tesseract.
 *
 * Employs Electron's safeStorage (macOS Keychain / DPAPI / libsecret) to encrypt
 * OAuth tokens and credentials at rest. When safeStorage is unavailable
 * (e.g. in headless unit tests or standalone node environments), falls back to
 * AES-256-GCM encryption with a machine-derived key.
 *
 * Strict Security Invariants:
 * 1. Plain passwords and unencrypted OAuth tokens are NEVER written to disk or SQLite.
 * 2. Only OAuth 2.0 access & refresh tokens are stored.
 */
export interface OAuthTokens {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: number;
    tokenType?: string;
    scope?: string;
    email?: string;
    updatedAt?: number;
}
export declare class CredentialVault {
    private static instance;
    private storagePath;
    private memoryCache;
    private testMode;
    private constructor();
    static getInstance(): CredentialVault;
    /**
     * Enables in-memory mock mode for isolated unit testing.
     */
    setTestMode(enabled: boolean): void;
    /**
     * Stores OAuth tokens for a given service securely encrypted at rest.
     */
    storeTokens(service: string, tokens: OAuthTokens): Promise<void>;
    /**
     * Retrieves OAuth tokens for a service, decrypting them from secure storage.
     */
    getTokens(service: string): Promise<OAuthTokens | null>;
    /**
     * Removes tokens for a service.
     */
    removeTokens(service: string): Promise<boolean>;
    /**
     * Lists all service identifiers that currently have credentials stored.
     */
    listConnectedServices(): Promise<string[]>;
    /**
     * Encrypts and persists the payload dictionary.
     */
    private writeAllEncrypted;
    /**
     * Reads and decrypts stored tokens.
     */
    private readAllEncrypted;
    /**
     * Encryption engine with native safeStorage preference and AES-256-GCM fallback.
     */
    private encrypt;
    /**
     * Decryption engine handling both safeStorage and AES-256-GCM formats.
     */
    private decrypt;
    /**
     * Derives a machine-unique 32-byte key for AES-256-GCM.
     */
    private getMachineDerivedKey;
}
//# sourceMappingURL=credential-vault.d.ts.map