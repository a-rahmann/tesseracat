/**
 * SkillBase: Standard interface for reusable autonomous browser skills.
 */
import { BrowserPerception } from '../browser/browser-perception.js';
import { CancellationToken } from '../agent/cancellation.js';
export interface SkillContext {
    activeUrl: string;
    activeTitle: string;
    perception: BrowserPerception;
    token: CancellationToken;
    speak?: (text: string) => Promise<void>;
    updateStatus?: (status: string) => void;
}
export interface SkillResult {
    success: boolean;
    summary: string;
    actionsTaken: string[];
    data?: any;
}
export interface Skill {
    readonly name: string;
    readonly description: string;
    canHandle(goal: string, context: SkillContext): boolean;
    execute(goal: string, context: SkillContext): Promise<SkillResult>;
}
//# sourceMappingURL=skill-base.d.ts.map