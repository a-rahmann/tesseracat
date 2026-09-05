"use strict";
/**
 * UserMemoryStore: Local, private user profile store.
 * Invariant: Never capture, store, or log passwords.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserMemoryStore = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const index_js_1 = require("../platform/index.js");
class UserMemoryStore {
    static instance = null;
    filePath;
    data;
    constructor() {
        const dir = (0, index_js_1.getAppDataDir)('tesseract');
        try {
            if (!fs_1.default.existsSync(dir))
                fs_1.default.mkdirSync(dir, { recursive: true });
        }
        catch { }
        this.filePath = path_1.default.join(dir, 'tesseract-memory.json');
        this.data = this.load();
    }
    static getInstance() {
        if (!UserMemoryStore.instance) {
            UserMemoryStore.instance = new UserMemoryStore();
        }
        return UserMemoryStore.instance;
    }
    load() {
        try {
            if (fs_1.default.existsSync(this.filePath)) {
                const raw = fs_1.default.readFileSync(this.filePath, 'utf-8');
                return JSON.parse(raw);
            }
        }
        catch (err) {
            console.error('[UserMemoryStore] Failed to load memory from disk:', err);
        }
        return {
            usernames: {},
            preferences: {},
            lastUpdated: new Date().toISOString(),
        };
    }
    save() {
        try {
            this.data.lastUpdated = new Date().toISOString();
            fs_1.default.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
        }
        catch (err) {
            console.error('[UserMemoryStore] Failed to persist memory:', err);
        }
    }
    saveUsername(domain, username) {
        const cleanDomain = domain.toLowerCase().replace(/^www\./, '');
        this.data.usernames[cleanDomain] = username.trim();
        this.save();
        console.log(`[UserMemoryStore] Saved username for ${cleanDomain}`);
    }
    getUsername(domain) {
        const cleanDomain = domain.toLowerCase().replace(/^www\./, '');
        return this.data.usernames[cleanDomain] || null;
    }
    saveAddress(address) {
        this.data.addressProfile = { ...address };
        this.save();
        console.log('[UserMemoryStore] Saved address profile');
    }
    getAddress() {
        return this.data.addressProfile || null;
    }
    clearDomain(domain) {
        const cleanDomain = domain.toLowerCase().replace(/^www\./, '');
        delete this.data.usernames[cleanDomain];
        this.save();
    }
}
exports.UserMemoryStore = UserMemoryStore;
//# sourceMappingURL=memory-store.js.map