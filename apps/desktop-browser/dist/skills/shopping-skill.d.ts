/**
 * ShoppingSkill: Autonomous shopping research, budget filtering, and top-3 comparison.
 * Handles goals like: "Find me the cheapest good mechanical keyboard under ₹5,000 and compare the best three".
 */
import { Skill, SkillContext, SkillResult } from './skill-base.js';
export declare class ShoppingSkill implements Skill {
    readonly name = "ShoppingSkill";
    readonly description = "Autonomous e-commerce search, budget constraint filtering, and product comparison";
    private model;
    canHandle(goal: string): boolean;
    execute(goal: string, context: SkillContext): Promise<SkillResult>;
}
//# sourceMappingURL=shopping-skill.d.ts.map