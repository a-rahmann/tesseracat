"use strict";
/**
 * TemporalMemory: Multi-dimensional episodic memory engine for Tesseract.
 * Indexes activity across:
 * 1. Timestamp (relative time: "4 minutes ago", "yesterday")
 * 2. Website (domain, title, URL)
 * 3. Task (goal, completed actions, checkpoints)
 * 4. Entities (people, products, models, prices)
 * 5. Topic (research, shopping, entertainment, communications)
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TemporalMemory = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const index_js_1 = require("../platform/index.js");
class TemporalMemory {
    static instance = null;
    filePath;
    records = [];
    maxRecords = 300;
    constructor() {
        const dir = (0, index_js_1.getAppDataDir)('tesseract');
        try {
            if (!fs_1.default.existsSync(dir))
                fs_1.default.mkdirSync(dir, { recursive: true });
        }
        catch { }
        this.filePath = path_1.default.join(dir, 'tesseract-temporal-memory.json');
        this.records = this.load();
    }
    static getInstance() {
        if (!TemporalMemory.instance) {
            TemporalMemory.instance = new TemporalMemory();
        }
        return TemporalMemory.instance;
    }
    load() {
        try {
            if (fs_1.default.existsSync(this.filePath)) {
                const raw = fs_1.default.readFileSync(this.filePath, 'utf-8');
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed))
                    return parsed;
            }
        }
        catch (err) {
            console.warn('[TemporalMemory] Could not load stored temporal memory:', err);
        }
        return [];
    }
    save() {
        try {
            fs_1.default.writeFileSync(this.filePath, JSON.stringify(this.records.slice(0, this.maxRecords), null, 2), 'utf-8');
        }
        catch (err) {
            console.warn('[TemporalMemory] Could not persist temporal memory:', err);
        }
    }
    recordEvent(data) {
        const now = Date.now();
        const cleanEntities = (data.entities || []).map(e => e.trim().toLowerCase()).filter(Boolean);
        const record = {
            id: `m_${now}_${Math.random().toString(36).slice(2, 6)}`,
            timestamp: now,
            timeString: new Date(now).toLocaleString(),
            website: data.website,
            task: data.task,
            entities: cleanEntities,
            topic: data.topic || 'general',
            contentSnippet: data.contentSnippet.slice(0, 300),
        };
        this.records.unshift(record);
        if (this.records.length > this.maxRecords) {
            this.records.pop();
        }
        this.save();
        return record;
    }
    recordVisit(data) {
        try {
            const domain = new URL(data.url).hostname;
            return this.recordEvent({
                website: { domain, url: data.url, title: data.title },
                topic: 'browsing',
                contentSnippet: `Visited ${data.title} (${domain})`,
            });
        }
        catch {
            return null;
        }
    }
    /**
     * Multi-dimensional search across time, entities, website, topic, and content.
     */
    search(filter) {
        const now = Date.now();
        return this.records.filter((rec) => {
            // 1. Time range check
            if (filter.timeRangeMs && now - rec.timestamp > filter.timeRangeMs) {
                return false;
            }
            // 2. Domain match
            if (filter.domain && (!rec.website || !rec.website.domain.toLowerCase().includes(filter.domain.toLowerCase()))) {
                return false;
            }
            // 3. Entity match
            if (filter.entity) {
                const entLower = filter.entity.toLowerCase();
                const hasEnt = (rec.entities || []).some(e => (e || '').toLowerCase().includes(entLower)) ||
                    ((rec.contentSnippet || '').toLowerCase().includes(entLower));
                if (!hasEnt)
                    return false;
            }
            // 4. Topic match
            if (filter.topic) {
                const recTopic = (rec.topic || '').toLowerCase();
                if (recTopic !== filter.topic.toLowerCase())
                    return false;
            }
            // 5. Keyword match
            if (filter.keyword) {
                const kw = filter.keyword.toLowerCase();
                const inContent = (rec.contentSnippet || '').toLowerCase().includes(kw);
                const inTitle = (rec.website?.title || '').toLowerCase().includes(kw);
                const inGoal = (rec.task?.goal || '').toLowerCase().includes(kw);
                if (!inContent && !inTitle && !inGoal)
                    return false;
            }
            return true;
        });
    }
    /**
     * Natural query interpreter for temporal memory:
     * e.g. "What did we talk about four minutes ago?", "What did Rahul say?", "Continue what we were doing"
     */
    parseAndQuery(naturalQuery) {
        const lower = naturalQuery.toLowerCase();
        const filter = {};
        // Relative Time parsing
        const minMatch = lower.match(/(\d+|one|two|three|four|five|ten|fifteen|twenty|thirty)\s+min(?:ute)?s?\s+ago/);
        if (minMatch) {
            const wordMap = { one: 1, two: 2, three: 3, four: 4, five: 5, ten: 10, fifteen: 15, twenty: 20, thirty: 30 };
            const minutes = wordMap[minMatch[1]] || parseInt(minMatch[1], 10) || 5;
            filter.timeRangeMs = (minutes + 3) * 60 * 1000;
        }
        else if (lower.includes('earlier') || lower.includes('recently')) {
            filter.timeRangeMs = 30 * 60 * 1000;
        }
        else if (lower.includes('yesterday')) {
            filter.timeRangeMs = 48 * 60 * 60 * 1000;
        }
        // Entity parsing (people or products)
        const personMatch = lower.match(/(?:did|about|from|to)\s+([a-zA-Z]{3,15})/);
        if (personMatch && !['what', 'that', 'this', 'have', 'been', 'some', 'site', 'more'].includes(personMatch[1].toLowerCase())) {
            filter.entity = personMatch[1].toLowerCase();
        }
        // Task keywords
        if (lower.includes('laptop') || lower.includes('computer'))
            filter.keyword = 'laptop';
        if (lower.includes('keyboard'))
            filter.keyword = 'keyboard';
        if (lower.includes('video'))
            filter.keyword = 'video';
        if (lower.includes('website') || lower.includes('page'))
            filter.keyword = 'http';
        const results = this.search(filter);
        let explanation = '';
        if (results.length > 0) {
            const top = results[0];
            const timeDiffMin = Math.max(1, Math.round((Date.now() - top.timestamp) / 60000));
            explanation = `About ${timeDiffMin} minute${timeDiffMin > 1 ? 's' : ''} ago: "${top.contentSnippet}" (${top.website?.title || top.task?.goal || 'Session activity'})`;
        }
        else {
            explanation = "I couldn't find any relevant memory matching that query.";
        }
        return { records: results, explanation };
    }
    getLastActiveTask() {
        return this.records.find(r => r.task && r.task.status === 'ACTIVE') ||
            this.records.find(r => r.task !== undefined) || null;
    }
    searchNaturalLanguage(naturalQuery) {
        return this.parseAndQuery(naturalQuery).records;
    }
}
exports.TemporalMemory = TemporalMemory;
//# sourceMappingURL=temporal-memory.js.map