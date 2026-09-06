/**
 * SkillRegistry: Dispatches user goals to registered autonomous skills.
 */
import { Skill, SkillContext, SkillResult } from './skill-base.js';
export declare class SkillRegistry {
    private static instance;
    private skills;
    private constructor();
    static getInstance(): SkillRegistry;
    register(skill: Skill): void;
    findSkill(goal: string, context: SkillContext): Skill | null;
    dispatch(goal: string, context: SkillContext): Promise<SkillResult | null>;
    getAvailableSkills(): Array<{
        name: string;
        description: string;
    }>;
}
//# sourceMappingURL=skill-registry.d.ts.map