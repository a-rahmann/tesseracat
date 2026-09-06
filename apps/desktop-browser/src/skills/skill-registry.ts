/**
 * SkillRegistry: Dispatches user goals to registered autonomous skills.
 */

import { Skill, SkillContext, SkillResult } from './skill-base.js';
import { ResearchSkill } from './research-skill.js';
import { ShoppingSkill } from './shopping-skill.js';
import { MediaSkill } from './media-skill.js';
import { FormsSkill } from './forms-skill.js';
import { NavigationSkill } from './navigation-skill.js';

export class SkillRegistry {
  private static instance: SkillRegistry | null = null;
  private skills: Skill[] = [];

  private constructor() {
    this.register(new NavigationSkill());
    this.register(new MediaSkill());
    this.register(new ShoppingSkill());
    this.register(new ResearchSkill());
    this.register(new FormsSkill());
  }

  public static getInstance(): SkillRegistry {
    if (!SkillRegistry.instance) {
      SkillRegistry.instance = new SkillRegistry();
    }
    return SkillRegistry.instance;
  }

  public register(skill: Skill): void {
    this.skills.unshift(skill); // New skills take evaluation precedence
  }

  public findSkill(goal: string, context: SkillContext): Skill | null {
    for (const skill of this.skills) {
      if (skill.canHandle(goal, context)) {
        return skill;
      }
    }
    return null;
  }

  public async dispatch(goal: string, context: SkillContext): Promise<SkillResult | null> {
    const skill = this.findSkill(goal, context);
    if (!skill) return null;
    console.log(`[SkillRegistry] Dispatching goal to "${skill.name}": "${goal}"`);
    return await skill.execute(goal, context);
  }

  public getAvailableSkills(): Array<{ name: string; description: string }> {
    return this.skills.map(s => ({ name: s.name, description: s.description }));
  }
}
