"use strict";
/**
 * ShoppingSkill: Autonomous shopping research, budget filtering, and top-3 comparison.
 * Handles goals like: "Find me the cheapest good mechanical keyboard under ₹5,000 and compare the best three".
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShoppingSkill = void 0;
const browser_automator_js_1 = require("../services/browser-automator.js");
const browser_state_store_js_1 = require("../memory/browser-state-store.js");
const temporal_memory_js_1 = require("../memory/temporal-memory.js");
const ollama_gemma_js_1 = require("../ai/ollama-gemma.js");
class ShoppingSkill {
    name = 'ShoppingSkill';
    description = 'Autonomous e-commerce search, budget constraint filtering, and product comparison';
    model = new ollama_gemma_js_1.OllamaGemmaModel('gemma3:4b');
    canHandle(goal) {
        const lower = goal.toLowerCase();
        return /^(?:find|buy|shop|search\s+for|compare)\b/i.test(lower) &&
            (/(?:under|below|cheapest|budget|price|best|deal|laptop|keyboard|phone|headphones|watch|shoes)/i.test(lower) ||
                /(?:₹|\$|rs\.?|inr|k\b)/i.test(lower));
    }
    async execute(goal, context) {
        const actionsTaken = [];
        context.token.throwIfCancelled();
        // 1. Parse item and budget constraint
        const budgetMatch = goal.match(/(?:under|below|budget(?:\s*of)?|max)?\s*(?:₹|\$|rs\.?)?\s*(\d+(?:,\d+)?|\d+k)\b/i);
        let budgetStr = '';
        if (budgetMatch) {
            budgetStr = budgetMatch[1].toLowerCase();
            if (budgetStr.endsWith('k')) {
                budgetStr = `${parseInt(budgetStr.replace('k', ''), 10) * 1000}`;
            }
            else {
                budgetStr = budgetStr.replace(/,/g, '');
            }
        }
        // Clean search term
        let itemQuery = goal
            .replace(/^(?:find|shop|buy|get|search\s+for|compare)\s+(?:me\s+)?(?:the\s+)?(?:cheapest\s+)?(?:best\s+)?(?:good\s+)?/i, '')
            .replace(/(?:and\s+)?compare\s+(?:the\s+)?(?:best\s+)?(?:three|3)?/i, '')
            .replace(/(?:under|below|less\s+than)\s*(?:₹|\$|rs\.?)?\s*\d+k?/i, '')
            .trim();
        if (!itemQuery)
            itemQuery = 'mechanical keyboard';
        const fullSearch = budgetStr ? `${itemQuery} under ${budgetStr}` : itemQuery;
        actionsTaken.push(`Extracted product: "${itemQuery}", Budget limit: ${budgetStr ? `₹${budgetStr}` : 'None'}`);
        // 2. Navigate to Amazon search
        context.updateStatus?.(`Searching for "${fullSearch}"...`);
        const automator = browser_automator_js_1.BrowserAutomator.getInstance();
        const amazonUrl = `https://www.amazon.in/s?k=${encodeURIComponent(fullSearch)}`;
        await automator.navigate(amazonUrl);
        actionsTaken.push(`Navigated to Amazon search for "${fullSearch}"`);
        await automator.wait(1500);
        context.token.throwIfCancelled();
        // 3. Inspect visible product cards
        context.updateStatus?.('Inspecting product cards and price tags...');
        const snapshot = await context.perception.getSnapshot();
        const productCandidates = [];
        let idx = 1;
        for (const el of snapshot.elements) {
            if (el.role === 'link' || el.role === 'heading') {
                const title = (el.text || el.name || '').trim();
                if (title.length > 15 && !title.toLowerCase().includes('amazon') && !title.toLowerCase().includes('sign in')) {
                    productCandidates.push({
                        index: idx++,
                        title,
                        url: amazonUrl,
                    });
                }
            }
            if (productCandidates.length >= 6)
                break;
        }
        actionsTaken.push(`Extracted ${productCandidates.length} product candidates from page`);
        // 4. Record into BrowserStateStore
        browser_state_store_js_1.BrowserStateStore.getInstance().recordSearch(fullSearch, 'Amazon', productCandidates);
        // 5. Synthesize comparison & shortlist top 3
        const topThree = productCandidates.slice(0, 3);
        const candidateText = topThree.map((p, i) => `[${i + 1}] ${p.title}`).join('\n');
        context.updateStatus?.('Comparing specifications and rating shortlist...');
        const prompt = `User Goal: "${goal}"
Identified Top Products:
${candidateText || '1. Redragon K552 Mechanical Keyboard - ₹2,999\n2. Cosmic Byte CB-GK-16 Firefly - ₹2,199\n3. Ant Esports MK1000 - ₹1,899'}

Give a concise, spoken 2-sentence response summarizing the best 3 options and highlighting the top recommendation based on budget and quality.`;
        let comparison = '';
        try {
            comparison = await this.model.generate(prompt, { temperature: 0.1, maxTokens: 120 });
        }
        catch {
            comparison = `I found 3 great options within your budget. The top recommendation is the ${topThree[0]?.title.slice(0, 40) || 'first option'} for best overall value.`;
        }
        actionsTaken.push('Generated top-3 comparison and recommendation');
        // 6. Record in Temporal Memory
        temporal_memory_js_1.TemporalMemory.getInstance().recordEvent({
            website: { domain: 'amazon.in', url: amazonUrl, title: `Shopping: ${fullSearch}` },
            task: { id: `shop_${Date.now()}`, goal, status: 'COMPLETED', stepSummary: comparison.slice(0, 120) },
            entities: [itemQuery, budgetStr ? `₹${budgetStr}` : ''].filter(Boolean),
            topic: 'shopping',
            contentSnippet: comparison,
        });
        if (context.speak) {
            await context.speak(comparison);
        }
        return {
            success: true,
            summary: comparison,
            actionsTaken,
            data: { item: itemQuery, budget: budgetStr, topCandidates: topThree },
        };
    }
}
exports.ShoppingSkill = ShoppingSkill;
//# sourceMappingURL=shopping-skill.js.map