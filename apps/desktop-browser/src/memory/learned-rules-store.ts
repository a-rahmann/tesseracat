/**
 * LearnedRulesStore: Persistent memory of mistakes, workarounds, and user corrections.
 * Enables Tesseract to be truly self-taught and continuously improve from user feedback.
 */

import fs from 'fs';
import path from 'path';
import { getAppDataDir } from '../platform/index.js';

export interface LearnedRule {
  id: string;
  domain?: string; // e.g. 'youtube.com', 'amazon.com', or '*' for all sites
  triggerPattern: string; // e.g. 'music', 'search', 'video', or specific phrase
  mistakeDescription?: string; // What went wrong originally
  correction: string; // How the model should act instead
  replacementAction?: {
    action: string;
    parameters?: Record<string, any>;
  };
  source: 'user_correction' | 'self_healing_recovery';
  timestamp: number;
  successCount: number;
}

export class LearnedRulesStore {
  private static instance: LearnedRulesStore | null = null;
  private filePath: string;
  private rules: LearnedRule[] = [];
  private maxRules = 100;

  private constructor() {
    const dir = getAppDataDir('tesseract');
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    } catch {}

    this.filePath = path.join(dir, 'tesseract-learned-rules.json');
    this.rules = this.load();
  }

  public static getInstance(): LearnedRulesStore {
    if (!LearnedRulesStore.instance) {
      LearnedRulesStore.instance = new LearnedRulesStore();
    }
    return LearnedRulesStore.instance;
  }

  private load(): LearnedRule[] {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (err) {
      console.warn('[LearnedRulesStore] Failed to load learned rules from disk:', err);
    }
    return [];
  }

  private save(): void {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.rules, null, 2), 'utf-8');
    } catch (err) {
      console.error('[LearnedRulesStore] Failed to persist learned rules:', err);
    }
  }

  /**
   * Learns from an explicit user correction (e.g. "No, use YouTube Music instead of YouTube").
   */
  public recordUserCorrection(params: {
    domain?: string;
    pattern?: string;
    mistake?: string;
    correction: string;
    replacementAction?: { action: string; parameters?: Record<string, any> };
  }): LearnedRule {
    const cleanDomain = params.domain ? params.domain.toLowerCase().replace(/^www\./, '') : undefined;
    const rule: LearnedRule = {
      id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      domain: cleanDomain,
      triggerPattern: (params.pattern || params.correction).toLowerCase().trim(),
      mistakeDescription: params.mistake,
      correction: params.correction.trim(),
      replacementAction: params.replacementAction,
      source: 'user_correction',
      timestamp: Date.now(),
      successCount: 1,
    };

    // Replace existing matching rule if same pattern/domain, otherwise prepend
    const existingIdx = this.rules.findIndex(r =>
      r.domain === rule.domain &&
      (r.triggerPattern.includes(rule.triggerPattern) || rule.triggerPattern.includes(r.triggerPattern))
    );

    if (existingIdx !== -1) {
      this.rules[existingIdx] = rule;
    } else {
      this.rules.unshift(rule);
    }

    if (this.rules.length > this.maxRules) {
      this.rules = this.rules.slice(0, this.maxRules);
    }

    this.save();
    console.log(`[LearnedRulesStore] Saved user-taught rule: "${rule.correction}" (domain=${rule.domain || 'all'})`);
    return rule;
  }

  /**
   * Learns from automated self-healing recovery (e.g., selector failed, alternate click succeeded).
   */
  public recordSelfHealingWorkaround(params: {
    domain?: string;
    pattern?: string;
    failedAction: string;
    successfulWorkaround: string;
  }): LearnedRule {
    const cleanDomain = params.domain ? params.domain.toLowerCase().replace(/^www\./, '') : undefined;
    const rule: LearnedRule = {
      id: `heal-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      domain: cleanDomain,
      triggerPattern: (params.pattern || cleanDomain || 'general').toLowerCase().trim(),
      mistakeDescription: `Failed action: ${params.failedAction}`,
      correction: `Use verified workaround: ${params.successfulWorkaround}`,
      source: 'self_healing_recovery',
      timestamp: Date.now(),
      successCount: 1,
    };

    this.rules.unshift(rule);
    if (this.rules.length > this.maxRules) {
      this.rules = this.rules.slice(0, this.maxRules);
    }

    this.save();
    console.log(`[LearnedRulesStore] Saved self-taught workaround: "${params.successfulWorkaround}"`);
    return rule;
  }

  /**
   * Finds learned rules applicable to the given domain or instruction text.
   */
  public getApplicableRules(domain?: string, contextText?: string): LearnedRule[] {
    const cleanDomain = domain ? domain.toLowerCase().replace(/^www\./, '') : '';
    const cleanText = (contextText || '').toLowerCase();

    return this.rules.filter(r => {
      // Domain matching
      if (r.domain && cleanDomain && (cleanDomain.includes(r.domain) || r.domain.includes(cleanDomain))) {
        return true;
      }
      // Pattern matching
      if (r.triggerPattern && cleanText && cleanText.includes(r.triggerPattern)) {
        return true;
      }
      // Global user corrections
      if (!r.domain && r.source === 'user_correction') {
        const words = r.triggerPattern.split(/\s+/).filter(w => w.length > 3);
        if (words.some(w => cleanText.includes(w))) return true;
      }
      return false;
    });
  }

  /**
   * Formats applicable rules as a concise prompt snippet (<60 tokens) for LLM Planner/NLU.
   */
  public formatRulesPrompt(domain?: string, contextText?: string): string {
    const applicable = this.getApplicableRules(domain, contextText).slice(0, 3);
    if (applicable.length === 0) return '';

    const lines = applicable.map(r => `- Rule: ${r.correction} (Past issue: ${r.mistakeDescription || 'suboptimal action'})`);
    return `\nLearned User Rules & Past Self-Corrections:\n${lines.join('\n')}\n`;
  }

  public getAllRules(): LearnedRule[] {
    return [...this.rules];
  }

  public clearRules(): void {
    this.rules = [];
    this.save();
  }
}
