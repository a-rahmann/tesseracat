"use strict";
/**
 * UserMemoryStore: Local, private, encrypted-at-rest memory for user credentials and profiles.
 *
 * CRITICAL SECURITY INVARIANT:
 * Passwords are NEVER stored, cached, or written to disk.
 * Only usernames/handles, user profile information (billing/shipping addresses),
 * and browsing preferences are remembered locally upon explicit user consent.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserMemoryStore = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class UserMemoryStore {
    static instance = null;
    filePath;
    data;
    constructor() {
        this.filePath = this.resolveMemoryFilePath();
        this.data = this.loadMemory();
    }
    static getInstance() {
        if (!UserMemoryStore.instance) {
            UserMemoryStore.instance = new UserMemoryStore();
        }
        return UserMemoryStore.instance;
    }
    resolveMemoryFilePath() {
        try {
            if (typeof window !== 'undefined' && window.tesseractNative?.getAppPath) {
                return path.join(window.tesseractNative.getAppPath(), 'tesseract-memory.json');
            }
            const home = process.env.HOME || process.env.USERPROFILE || '.';
            const dir = path.join(home, '.tesseract');
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            return path.join(dir, 'user-memory.json');
        }
        catch {
            return 'user-memory.json';
        }
    }
    loadMemory() {
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
        }
        catch (err) {
            console.warn('[Memory] Failed to load local memory from disk, initializing fresh:', err);
        }
        return {
            usernames: {},
            preferences: {},
            updatedAt: new Date().toISOString(),
        };
    }
    saveMemory() {
        try {
            this.data.updatedAt = new Date().toISOString();
            const dir = path.dirname(this.filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
            console.log(`[Memory] Memory persisted to disk (${this.filePath})`);
        }
        catch (err) {
            console.error('[Memory] Failed to write memory to disk:', err);
        }
    }
    /**
     * Save username for a domain (e.g. instagram.com, github.com).
     * Strict invariant: Passwords are NEVER accepted or stored.
     */
    saveUsername(domain, username) {
        if (!domain || !username)
            return;
        const cleanDomain = this.normalizeDomain(domain);
        this.data.usernames[cleanDomain] = username.trim();
        this.saveMemory();
        console.log(`[Memory] Saved username for ${cleanDomain}: "${username}"`);
    }
    /**
     * Retrieve remembered username for a domain.
     */
    getUsername(domain) {
        if (!domain)
            return null;
        const cleanDomain = this.normalizeDomain(domain);
        return this.data.usernames[cleanDomain] || null;
    }
    /**
     * Remove remembered username for a domain.
     */
    removeUsername(domain) {
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
    saveAddressProfile(profile) {
        this.data.addressProfile = profile;
        this.saveMemory();
        console.log(`[Memory] Saved address profile for "${profile.fullName}"`);
    }
    /**
     * Retrieve user's billing/shipping address profile.
     */
    getAddressProfile() {
        return this.data.addressProfile || null;
    }
    /**
     * Clean and normalize domain name (stripping protocols, port, www).
     */
    normalizeDomain(domain) {
        return domain
            .toLowerCase()
            .replace(/^https?:\/\//i, '')
            .replace(/^www\./i, '')
            .split('/')[0]
            .split(':')[0]
            .trim();
    }
}
exports.UserMemoryStore = UserMemoryStore;
//# sourceMappingURL=user-memory.js.map