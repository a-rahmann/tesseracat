/**
 * NavigationSkill: Handles spatial element clicks, tab navigation,
 * ordinal resolution ("open the second one"), and page scrolling.
 */
import { Skill, SkillContext, SkillResult } from './skill-base.js';
export declare class NavigationSkill implements Skill {
    readonly name = "NavigationSkill";
    readonly description = "Browser navigation, spatial clicking, ordinal element selection, and scrolling";
    canHandle(goal: string): boolean;
    execute(goal: string, context: SkillContext): Promise<SkillResult>;
}
//# sourceMappingURL=navigation-skill.d.ts.map