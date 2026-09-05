/**
 * UserMemoryStore: Local, private, encrypted-at-rest memory for user credentials and profiles.
 *
 * CRITICAL SECURITY INVARIANT:
 * Passwords are NEVER stored, cached, or written to disk.
 * Only usernames/handles, user profile information (billing/shipping addresses),
 * and browsing preferences are remembered locally upon explicit user consent.
 */
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
    usernames: Record<string, string>;
    addressProfile?: UserAddressProfile;
    preferences: Record<string, any>;
    updatedAt: string;
}
export declare class UserMemoryStore {
    private static instance;
    private filePath;
    private data;
    private constructor();
    static getInstance(): UserMemoryStore;
    private resolveMemoryFilePath;
    private loadMemory;
    private saveMemory;
    /**
     * Save username for a domain (e.g. instagram.com, github.com).
     * Strict invariant: Passwords are NEVER accepted or stored.
     */
    saveUsername(domain: string, username: string): void;
    /**
     * Retrieve remembered username for a domain.
     */
    getUsername(domain: string): string | null;
    /**
     * Remove remembered username for a domain.
     */
    removeUsername(domain: string): void;
    /**
     * Save user's billing/shipping address profile.
     */
    saveAddressProfile(profile: UserAddressProfile): void;
    /**
     * Retrieve user's billing/shipping address profile.
     */
    getAddressProfile(): UserAddressProfile | null;
    /**
     * Clean and normalize domain name (stripping protocols, port, www).
     */
    private normalizeDomain;
}
//# sourceMappingURL=user-memory.d.ts.map