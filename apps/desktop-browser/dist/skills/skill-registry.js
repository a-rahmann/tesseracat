"use strict";
/**
 * SkillRegistry: Dispatches user goals to registered autonomous skills.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SkillRegistry = void 0;
const research_skill_js_1 = require("./research-skill.js");
const shopping_skill_js_1 = require("./shopping-skill.js");
const media_skill_js_1 = require("./media-skill.js");
const forms_skill_js_1 = require("./forms-skill.js");
const navigation_skill_js_1 = require("./navigation-skill.js");
class SkillRegistry {
    static instance = null;
    skills = [];
    constructor() {
        this.register(new navigation_skill_js_1.NavigationSkill());
        this.register(new media_skill_js_1.MediaSkill());
        this.register(new shopping_skill_js_1.ShoppingSkill());
        this.register(new research_skill_js_1.ResearchSkill());
        this.register(new forms_skill_js_1.FormsSkill());
    }
    static getInstance() {
        if (!SkillRegistry.instance) {
            SkillRegistry.instance = new SkillRegistry();
        }
        return SkillRegistry.instance;
    }
    register(skill) {
        this.skills.unshift(skill); // New skills take evaluation precedence
    }
    findSkill(goal, context) {
        for (const skill of this.skills) {
            if (skill.canHandle(goal, context)) {
                return skill;
            }
        }
        return null;
    }
    async dispatch(goal, context) {
        const skill = this.findSkill(goal, context);
        if (!skill)
            return null;
        console.log(`[SkillRegistry] Dispatching goal to "${skill.name}": "${goal}"`);
        return await skill.execute(goal, context);
    }
    getAvailableSkills() {
        return this.skills.map(s => ({ name: s.name, description: s.description }));
    }
}
exports.SkillRegistry = SkillRegistry;
//# sourceMappingURL=skill-registry.js.map