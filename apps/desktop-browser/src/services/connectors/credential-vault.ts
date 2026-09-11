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

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as os from 'os';

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  tokenType?: string;
  scope?: string;
  email?: string;
  updatedAt?: number;
}

export class CredentialVault {
  private static instance: CredentialVault | null = null;
  private storagePath: string;
  private memoryCache: Map<string, OAuthTokens> = new Map();
  private testMode: boolean = false;

  private constructor() {
    const configDir = process.env.TESSERACT_CONFIG_DIR || path.join(os.homedir(), '.tesseract');
    try {
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
    } catch {
      // Ignored if cannot create immediately
    }
    this.storagePath = path.join(configDir, 'credentials.enc.json');
  }

  public static getInstance(): CredentialVault {
    if (!CredentialVault.instance) {
      CredentialVault.instance = new CredentialVault();
    }
    return CredentialVault.instance;
  }

  /**
   * Enables in-memory mock mode for isolated unit testing.
   */
  public setTestMode(enabled: boolean): void {
    this.testMode = enabled;
  }

  /**
   * Stores OAuth tokens for a given service securely encrypted at rest.
   */
  public async storeTokens(service: string, tokens: OAuthTokens): Promise<void> {
    const serviceKey = service.toLowerCase().trim();
    const enriched: OAuthTokens = {
      ...tokens,
      updatedAt: Date.now(),
    };

    this.memoryCache.set(serviceKey, enriched);

    if (this.testMode) {
      return;
    }

    const allStored = await this.readAllEncrypted();
    allStored[serviceKey] = enriched;
    await this.writeAllEncrypted(allStored);
  }

  /**
   * Retrieves OAuth tokens for a service, decrypting them from secure storage.
   */
  public async getTokens(service: string): Promise<OAuthTokens | null> {
    const serviceKey = service.toLowerCase().trim();

    if (this.memoryCache.has(serviceKey)) {
      return this.memoryCache.get(serviceKey)!;
    }

    if (this.testMode) {
      return null;
    }

    const allStored = await this.readAllEncrypted();
    const tokens = allStored[serviceKey] || null;
    if (tokens) {
      this.memoryCache.set(serviceKey, tokens);
    }
    return tokens;
  }

  /**
   * Removes tokens for a service.
   */
  public async removeTokens(service: string): Promise<boolean> {
    const serviceKey = service.toLowerCase().trim();
    this.memoryCache.delete(serviceKey);

    if (this.testMode) {
      return true;
    }

    const allStored = await this.readAllEncrypted();
    if (allStored[serviceKey]) {
      delete allStored[serviceKey];
      await this.writeAllEncrypted(allStored);
      return true;
    }
    return false;
  }

  /**
   * Lists all service identifiers that currently have credentials stored.
   */
  public async listConnectedServices(): Promise<string[]> {
    if (this.testMode) {
      return Array.from(this.memoryCache.keys());
    }

    const allStored = await this.readAllEncrypted();
    return Object.keys(allStored);
  }

  /**
   * Encrypts and persists the payload dictionary.
   */
  private async writeAllEncrypted(data: Record<string, OAuthTokens>): Promise<void> {
    try {
      const plaintext = JSON.stringify(data);
      const encryptedHex = await this.encrypt(plaintext);
      fs.writeFileSync(this.storagePath, JSON.stringify({ version: 1, payload: encryptedHex }), 'utf8');
    } catch (err) {
      console.error('[CredentialVault] Failed to persist encrypted credentials:', err);
    }
  }

  /**
   * Reads and decrypts stored tokens.
   */
  private async readAllEncrypted(): Promise<Record<string, OAuthTokens>> {
    try {
      if (!fs.existsSync(this.storagePath)) {
        return {};
      }

      const raw = fs.readFileSync(this.storagePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (!parsed.payload) return {};

      const decrypted = await this.decrypt(parsed.payload);
      return JSON.parse(decrypted);
    } catch (err) {
      console.warn('[CredentialVault] Could not read encrypted credentials (may be empty/new):', err);
      return {};
    }
  }

  /**
   * Encryption engine with native safeStorage preference and AES-256-GCM fallback.
   */
  private async encrypt(plaintext: string): Promise<string> {
    try {
      // Dynamic import electron to check safeStorage
      const electron = await import('electron');
      if (electron?.safeStorage?.isEncryptionAvailable()) {
        const buffer = electron.safeStorage.encryptString(plaintext);
        return 'ss:' + buffer.toString('hex');
      }
    } catch {
      // Electron safeStorage not available (CLI, test, or non-GUI runner)
    }

    // AES-256-GCM fallback
    const key = this.getMachineDerivedKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let enc = cipher.update(plaintext, 'utf8', 'hex');
    enc += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `gcm:${iv.toString('hex')}:${authTag}:${enc}`;
  }

  /**
   * Decryption engine handling both safeStorage and AES-256-GCM formats.
   */
  private async decrypt(ciphertext: string): Promise<string> {
    if (ciphertext.startsWith('ss:')) {
      const hex = ciphertext.slice(3);
      const buffer = Buffer.from(hex, 'hex');
      const electron = await import('electron');
      if (electron?.safeStorage?.isEncryptionAvailable()) {
        return electron.safeStorage.decryptString(buffer);
      }
      throw new Error('safeStorage encryption used, but safeStorage is unavailable');
    }

    if (ciphertext.startsWith('gcm:')) {
      const [, ivHex, authTagHex, encHex] = ciphertext.split(':');
      const key = this.getMachineDerivedKey();
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(encHex, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    }

    throw new Error('Unrecognized credential format');
  }

  /**
   * Derives a machine-unique 32-byte key for AES-256-GCM.
   */
  private getMachineDerivedKey(): Buffer {
    const machineSeed = `${os.hostname()}-${os.userInfo().username}-${process.arch}`;
    return crypto.createHash('sha256').update(machineSeed).digest();
  }
}
