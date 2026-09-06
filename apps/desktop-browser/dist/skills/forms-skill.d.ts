/**
 * FormsSkill: Detects visible form inputs and safely autofills personal address/profile
 * data from local UserMemoryStore without exposing secrets or passwords.
 */
import { Skill, SkillContext, SkillResult } from './skill-base.js';
export declare class FormsSkill implements Skill {
    readonly name = "FormsSkill";
    readonly description = "Autonomous form input detection and local privacy-preserving autofill";
    canHandle(goal: string): boolean;
    execute(goal: string, context: SkillContext): Promise<SkillResult>;
}
//# sourceMappingURL=forms-skill.d.ts.map