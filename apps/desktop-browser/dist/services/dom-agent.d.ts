/**
 * DOMAgent: Intelligent in-page observer and autonomous actuator.
 * Injected into <webview> to handle:
 * 1. Form & Credential Assistance:
 *    - Auto-filling remembered usernames
 *    - 5-second password inactivity watcher & auto-submit
 *    - Emitting prompt to save new usernames
 * 2. Form & Billing Autofill:
 *    - Detecting and populating shipping/billing addresses
 * 3. Direct Message & Chat Observation:
 *    - Inspecting unread/active threads and sending replies
 * 4. Co-Browsing:
 *    - Observing YouTube videos, Shorts, and article content
 */
import { UserAddressProfile } from './user-memory.js';
export declare class DOMAgent {
    /**
     * Generates the client-side JavaScript script to inject into the webview for login assistance.
     * Auto-fills remembered username and monitors password typing for 5s inactivity auto-submit.
     */
    static getLoginWatcherScript(rememberedUsername?: string | null): string;
    /**
     * Generates script to autofill shipping/billing address fields on checkout pages.
     */
    static getAutofillAddressScript(profile: UserAddressProfile): string;
    /**
     * Generates script to inspect social DMs (Instagram, Twitter, etc.).
     */
    static getDMInspectionScript(): string;
    /**
     * Generates script to compose and send a DM response.
     */
    static getDMSendReplyScript(replyText: string): string;
    /**
     * Generates script to observe current YouTube / Shorts or article content for co-browsing.
     */
    static getCoBrowsingObservationScript(): string;
}
//# sourceMappingURL=dom-agent.d.ts.map