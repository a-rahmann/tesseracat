/**
 * Gmail Website Adapter.
 */
export declare class GmailAdapter {
    static isGmailUrl(url: string): boolean;
    static openInbox(): Promise<boolean>;
    static getUnreadEmails(): Promise<Array<{
        sender: string;
        subject: string;
    }>>;
}
//# sourceMappingURL=gmail.d.ts.map