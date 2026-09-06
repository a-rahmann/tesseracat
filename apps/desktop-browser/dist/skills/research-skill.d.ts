/**
 * ResearchSkill: Autonomous deep research across sources, claims cross-checking, and synthesis.
 * Handles goals like: "Research whether OLED or Mini-LED is better for gaming", "Research quantum computing breakthroughs".
 */
import { Skill, SkillContext, SkillResult } from './skill-base.js';
export declare class ResearchSkill implements Skill {
    readonly name = "ResearchSkill";
    readonly description = "Multi-source research, claims cross-checking, and consensus summarization";
    private model;
    canHandle(goal: string): boolean;
    execute(goal: string, context: SkillContext): Promise<SkillResult>;
}
//# sourceMappingURL=research-skill.d.ts.map