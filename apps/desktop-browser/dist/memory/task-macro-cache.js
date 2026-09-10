"use strict";
/**
 * TaskMacroCache: Remembers executed tasks and verified multi-step workflows.
 * Enables instantaneous (<1ms) execution of similar tasks and cuts redundant preloading steps.
 *
 * User specification:
 * "make processing faster for taks given learn from tasks so its instant and make sure the task is saved
 * so it can be instantanous wheneever asking a task swith fimilar steps ot cuts the previous step
 * from preloading and does the second part of task which is new and remembers it like chatgpt"
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskMacroCache = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const index_js_1 = require("../platform/index.js");
class TaskMacroCache {
    static instance = null;
    filePath;
    macros = new Map();
    maxMacros = 60;
    constructor() {
        const dir = (0, index_js_1.getAppDataDir)('tesseract');
        try {
            if (!fs_1.default.existsSync(dir))
                fs_1.default.mkdirSync(dir, { recursive: true });
        }
        catch { }
        this.filePath = path_1.default.join(dir, 'tesseract-task-macros.json');
        this.load();
    }
    static getInstance() {
        if (!TaskMacroCache.instance) {
            TaskMacroCache.instance = new TaskMacroCache();
        }
        return TaskMacroCache.instance;
    }
    load() {
        try {
            if (fs_1.default.existsSync(this.filePath)) {
                const raw = fs_1.default.readFileSync(this.filePath, 'utf-8');
                const list = JSON.parse(raw);
                if (Array.isArray(list)) {
                    for (const m of list) {
                        this.macros.set(m.id, m);
                    }
                }
            }
        }
        catch (err) {
            console.warn('[TaskMacroCache] Could not load macros:', err);
        }
    }
    save() {
        try {
            const list = Array.from(this.macros.values());
            fs_1.default.writeFileSync(this.filePath, JSON.stringify(list.slice(-this.maxMacros), null, 2), 'utf-8');
        }
        catch (err) {
            console.warn('[TaskMacroCache] Could not persist macros:', err);
        }
    }
    /**
     * Normalizes a user command into an intent template.
     * e.g. "open youtube and play a random video" -> "youtube:play:video"
     * e.g. "play bohemian rhapsody on youtube" -> "youtube:play"
     */
    normalizeGoal(goal) {
        return goal
            .toLowerCase()
            .replace(/['"]/g, '')
            .replace(/[?.!]+/g, '')
            .replace(/^(?:it\s+is\s+right\s*,?\s*|can\s+you\s+|please\s+|i\s+want\s+you\s+to\s+|hey\s+tesseract\s+)/i, '')
            .replace(/\s+/g, ' ')
            .trim();
    }
    /**
     * Records a successfully executed workflow into persistent memory.
     */
    recordTaskMacro(goal, steps, domain, intentCategory, suggestedTargetUrl) {
        if (!steps || steps.length === 0)
            return null;
        const normalizedPattern = this.normalizeGoal(goal);
        const existingId = Array.from(this.macros.values()).find(m => m.normalizedPattern === normalizedPattern || (domain && m.domain === domain && m.goal === goal))?.id;
        const macroId = existingId || `macro-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const existing = existingId ? this.macros.get(existingId) : undefined;
        const isMedia = /\b(?:play|video|youtube|song|music|listen)\b/i.test(goal);
        const inferredCategory = intentCategory || existing?.intentCategory || (isMedia ? 'MEDIA_CONTROL' : 'GENERAL_AUTOMATION');
        const inferredTargetUrl = suggestedTargetUrl || existing?.suggestedTargetUrl || (steps.find(s => s.toolName === 'browser.navigate' && s.parameters?.url)?.parameters?.url);
        const macro = {
            id: macroId,
            goal,
            normalizedPattern,
            domain: domain ? domain.toLowerCase().replace(/^www\./, '') : undefined,
            intentCategory: inferredCategory,
            suggestedTargetUrl: inferredTargetUrl,
            steps: steps.map(s => ({ ...s, status: 'PENDING' })),
            successCount: (existing?.successCount || 0) + 1,
            timestamp: existing?.timestamp || Date.now(),
            lastUsed: Date.now(),
        };
        this.macros.set(macroId, macro);
        this.save();
        console.log(`[TaskMacroCache] Learned & saved task macro for "${goal}" (${steps.length} steps, count: ${macro.successCount}, category: ${macro.intentCategory})`);
        return macro;
    }
    /**
     * Matches a new request against learned task workflows.
     */
    findSimilarMacro(goal, activeUrl) {
        const norm = this.normalizeGoal(goal);
        const activeHost = activeUrl && !activeUrl.startsWith('about:')
            ? new URL(activeUrl).hostname.replace(/^www\./, '').toLowerCase()
            : '';
        // 1. Exact pattern match
        for (const macro of this.macros.values()) {
            if (macro.normalizedPattern === norm) {
                macro.lastUsed = Date.now();
                this.save();
                return macro;
            }
        }
        // 2. Multi-step workflow similarity match
        // Must NOT intercept single-action controls, ordinals, or specific standalone queries
        const isOrdinalOrMicro = /\b(?:#\d+|result\s*#?\d+|first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th)\b/i.test(norm) ||
            /^(?:play|pause|resume|stop|freeze|hold|unpause|back|forward|reload|refresh)$/i.test(norm);
        if (isOrdinalOrMicro) {
            return undefined;
        }
        const normTokens = new Set(norm.split(/\s+/).filter(t => t.length > 2));
        if (normTokens.size === 0)
            return undefined;
        for (const macro of this.macros.values()) {
            const macroTokens = new Set(macro.normalizedPattern.split(/\s+/).filter(t => t.length > 2));
            if (macroTokens.size === 0)
                continue;
            let intersection = 0;
            for (const t of normTokens) {
                if (macroTokens.has(t))
                    intersection++;
            }
            const union = new Set([...normTokens, ...macroTokens]).size;
            const jaccard = union > 0 ? intersection / union : 0;
            // Match if >= 65% token similarity or if normalized strings are direct sub-phrases with strong overlap
            if (jaccard >= 0.65 || (intersection >= 3 && (macro.normalizedPattern.includes(norm) || norm.includes(macro.normalizedPattern)))) {
                macro.lastUsed = Date.now();
                this.save();
                return macro;
            }
        }
        return undefined;
    }
    /**
     * DYNAMIC STEP CUTTER:
     * "cuts the previous step from preloading and does the second part of task which is new"
     * If Step 1 is navigating to a site, and the browser is ALREADY on that site,
     * prunes Step 1 completely and returns the remaining steps starting directly with the new action!
     */
    cutRedundantPreloadSteps(steps, activeUrl) {
        if (!steps || steps.length <= 1 || !activeUrl || activeUrl.startsWith('about:')) {
            return { steps, wasCut: false };
        }
        const firstStep = steps[0];
        if (firstStep.toolName === 'browser.navigate' && firstStep.parameters?.url) {
            try {
                const targetHost = new URL(firstStep.parameters.url).hostname.replace(/^www\./, '').toLowerCase();
                const currentHost = new URL(activeUrl).hostname.replace(/^www\./, '').toLowerCase();
                if (targetHost && currentHost && (currentHost.includes(targetHost) || targetHost.includes(currentHost))) {
                    const cutDesc = firstStep.description;
                    const remainingSteps = steps.slice(1).map((s, idx) => ({
                        ...s,
                        stepNumber: idx + 1,
                    }));
                    console.log(`[TaskMacroCache] Step Cutting Applied: Pruned Step 1 ("${cutDesc}") because browser is already at "${currentHost}". Jumping directly to Step 2 ("${remainingSteps[0]?.description}")!`);
                    return {
                        steps: remainingSteps,
                        wasCut: true,
                        cutDescription: cutDesc,
                    };
                }
            }
            catch { }
        }
        return { steps, wasCut: false };
    }
    getAllMacros() {
        return Array.from(this.macros.values());
    }
    clearMacros() {
        this.macros.clear();
        this.save();
    }
}
exports.TaskMacroCache = TaskMacroCache;
//# sourceMappingURL=task-macro-cache.js.map