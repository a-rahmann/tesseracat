/**
 * UserMemoryStore: Local, private user profile store.
 * Invariant: Never capture, store, or log passwords.
 */

import fs from 'fs';
import path from 'path';
import { getAppDataDir } from '../platform/index.js';

export interface UserAddressProfile {
  fullName: string;
  streetAddress: string;
  apartmentOrSuite?: string;
  city: string;
  stateOrProvince: string;
  postalCode: string;
  country: string;
  phoneNumber?: string;
  email?: string;
}

export interface StoredMemory {
  usernames: Record<string, string>; // domain -> username
  addressProfile?: UserAddressProfile;
  preferences: Record<string, any>;
  lastUpdated: string;
}

export class UserMemoryStore {
  private static instance: UserMemoryStore | null = null;
  private filePath: string;
  private data: StoredMemory;

  private constructor() {
    const dir = getAppDataDir('tesseract');
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    } catch {}

    this.filePath = path.join(dir, 'tesseract-memory.json');
    this.data = this.load();
  }

  public static getInstance(): UserMemoryStore {
    if (!UserMemoryStore.instance) {
      UserMemoryStore.instance = new UserMemoryStore();
    }
    return UserMemoryStore.instance;
  }

  private load(): StoredMemory {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (err) {
      console.error('[UserMemoryStore] Failed to load memory from disk:', err);
    }
    return {
      usernames: {},
      preferences: {},
      lastUpdated: new Date().toISOString(),
    };
  }

  private save(): void {
    try {
      this.data.lastUpdated = new Date().toISOString();
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[UserMemoryStore] Failed to persist memory:', err);
    }
  }

  public saveUsername(domain: string, username: string): void {
    const cleanDomain = domain.toLowerCase().replace(/^www\./, '');
    this.data.usernames[cleanDomain] = username.trim();
    this.save();
    console.log(`[UserMemoryStore] Saved username for ${cleanDomain}`);
  }

  public getUsername(domain: string): string | null {
    const cleanDomain = domain.toLowerCase().replace(/^www\./, '');
    return this.data.usernames[cleanDomain] || null;
  }

  public saveAddress(address: UserAddressProfile): void {
    this.data.addressProfile = { ...address };
    this.save();
    console.log('[UserMemoryStore] Saved address profile');
  }

  public getAddress(): UserAddressProfile | null {
    return this.data.addressProfile || null;
  }

  public clearDomain(domain: string): void {
    const cleanDomain = domain.toLowerCase().replace(/^www\./, '');
    delete this.data.usernames[cleanDomain];
    this.save();
  }
}
