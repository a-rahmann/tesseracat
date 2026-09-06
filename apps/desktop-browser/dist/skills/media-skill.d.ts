/**
 * MediaSkill: Controls media playback, verifies HTML5 audio/video states,
 * and extracts transcripts for video comprehension.
 */
import { Skill, SkillContext, SkillResult } from './skill-base.js';
export declare class MediaSkill implements Skill {
    readonly name = "MediaSkill";
    readonly description = "Media playback, playback verification, and video comprehension";
    private model;
    canHandle(goal: string): boolean;
    execute(goal: string, context: SkillContext): Promise<SkillResult>;
}
//# sourceMappingURL=media-skill.d.ts.map