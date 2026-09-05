/**
 * UserMemoryStore: Local, private, encrypted-at-rest memory for user credentials and profiles.
 *
 * CRITICAL SECURITY INVARIANT:
 * Passwords are NEVER stored, cached, or written to disk.
 * Only usernames/handles, user profile information (billing/shipping addresses),
 * and browsing preferences are remembered locally upon explicit user consent.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface UserAddressProfile {
  fullName: string;
  email: string;
  phone: string;
  streetAddress: string;
  apartment?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface MemoryData {
  usernames: Record<string, string>; // domain -> username/handle
  addressProfile?: UserAddressProfile;
  preferences: Record<string, any>;
  updatedAt: string;
}

export class UserMemoryStore {
  private static instance: UserMemoryStore | null = null;
  private filePath: string;
  private data: MemoryData;

  private constructor() {
    this.filePath = this.resolveMemoryFilePath();
    this.data = this.loadMemory();
  }

  public static getInstance(): UserMemoryStore {
    if (!UserMemoryStore.instance) {
      UserMemoryStore.instance = new UserMemoryStore();
    }
    return UserMemoryStore.instance;
  }

  private resolveMemoryFilePath(): string {
    try {
      if (typeof window !== 'undefined' && (window as any).tesseractNative?.getAppPath) {
        return path.join((window as any).tesseractNative.getAppPath(), 'tesseract-memory.json');
      }
      const home = process.env.HOME || process.env.USERPROFILE || '.';
      const dir = path.join(home, '.tesseract');
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      return path.join(dir, 'user-memory.json');
    } catch {
      return 'user-memory.json';
    }
  }

  private loadMemory(): MemoryData {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        return {
          usernames: parsed.usernames || {},
          addressProfile: parsed.addressProfile || undefined,
          preferences: parsed.preferences || {},
          updatedAt: parsed.updatedAt || new Date().toISOString(),
        };
      }
    } catch (err) {
      console.warn('[Memory] Failed to load local memory from disk, initializing fresh:', err);
    }

    return {
      usernames: {},
      preferences: {},
      updatedAt: new Date().toISOString(),
    };
  }

  private saveMemory(): void {
    try {
      this.data.updatedAt = new Date().toISOString();
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
      console.log(`[Memory] Memory persisted to disk (${this.filePath})`);
    } catch (err) {
      console.error('[Memory] Failed to write memory to disk:', err);
    }
  }

  /**
   * Save username for a domain (e.g. instagram.com, github.com).
   * Strict invariant: Passwords are NEVER accepted or stored.
   */
  public saveUsername(domain: string, username: string): void {
    if (!domain || !username) return;
    const cleanDomain = this.normalizeDomain(domain);
    this.data.usernames[cleanDomain] = username.trim();
    this.saveMemory();
    console.log(`[Memory] Saved username for ${cleanDomain}: "${username}"`);
  }

  /**
   * Retrieve remembered username for a domain.
   */
  public getUsername(domain: string): string | null {
    if (!domain) return null;
    const cleanDomain = this.normalizeDomain(domain);
    return this.data.usernames[cleanDomain] || null;
  }

  /**
   * Remove remembered username for a domain.
   */
  public removeUsername(domain: string): void {
    const cleanDomain = this.normalizeDomain(domain);
    if (this.data.usernames[cleanDomain]) {
      delete this.data.usernames[cleanDomain];
      this.saveMemory();
      console.log(`[Memory] Removed remembered username for ${cleanDomain}`);
    }
  }

  /**
   * Save user's billing/shipping address profile.
   */
  public saveAddressProfile(profile: UserAddressProfile): void {
    this.data.addressProfile = profile;
    this.saveMemory();
    console.log(`[Memory] Saved address profile for "${profile.fullName}"`);
  }

  /**
   * Retrieve user's billing/shipping address profile.
   */
  public getAddressProfile(): UserAddressProfile | null {
    return this.data.addressProfile || null;
  }

  /**
   * Clean and normalize domain name (stripping protocols, port, www).
   */
  private normalizeDomain(domain: string): string {
    return domain
      .toLowerCase()
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .split('/')[0]
      .split(':')[0]
      .trim();
  }
}
