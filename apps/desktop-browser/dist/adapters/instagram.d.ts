/**
 * Instagram Website Adapter.
 * Semantic DM handling, sender disambiguation, drafting, and password-safe login.
 */
export interface InstagramThread {
    index: number;
    username: string;
    preview: string;
    isUnread: boolean;
}
export declare class InstagramAdapter {
    static isInstagramUrl(url: string): boolean;
    static openDirectInbox(): Promise<boolean>;
    static getMessageThreads(): Promise<InstagramThread[]>;
    static findSenders(query: string): Promise<InstagramThread[]>;
    static openThreadByIndex(index: number): Promise<boolean>;
    static readActiveConversation(): Promise<{
        sender: string;
        latestMessage: string;
    } | null>;
    static draftReply(text: string): Promise<boolean>;
    static sendReply(text: string): Promise<boolean>;
}
//# sourceMappingURL=instagram.d.ts.map