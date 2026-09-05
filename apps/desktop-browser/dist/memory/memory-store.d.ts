/**
 * UserMemoryStore: Local, private user profile store.
 * Invariant: Never capture, store, or log passwords.
 */
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
    usernames: Record<string, string>;
    addressProfile?: UserAddressProfile;
    preferences: Record<string, any>;
    lastUpdated: string;
}
export declare class UserMemoryStore {
    private static instance;
    private filePath;
    private data;
    private constructor();
    static getInstance(): UserMemoryStore;
    private load;
    private save;
    saveUsername(domain: string, username: string): void;
    getUsername(domain: string): string | null;
    saveAddress(address: UserAddressProfile): void;
    getAddress(): UserAddressProfile | null;
    clearDomain(domain: string): void;
}
//# sourceMappingURL=memory-store.d.ts.map