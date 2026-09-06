"use strict";
/**
 * NavigationSkill: Handles spatial element clicks, tab navigation,
 * ordinal resolution ("open the second one"), and page scrolling.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.NavigationSkill = void 0;
const browser_automator_js_1 = require("../services/browser-automator.js");
const browser_state_store_js_1 = require("../memory/browser-state-store.js");
class NavigationSkill {
    name = 'NavigationSkill';
    description = 'Browser navigation, spatial clicking, ordinal element selection, and scrolling';
    canHandle(goal) {
        const lower = goal.toLowerCase();
        return /^(?:go\s+back|go\s+forward|reload|refresh|scroll|click|open|switch\s+to)\b/i.test(lower) ||
            lower.includes('click the') ||
            lower.includes('open the second') ||
            lower.includes('on my screen');
    }
    async execute(goal, context) {
        const actionsTaken = [];
        const lower = goal.toLowerCase();
        const automator = browser_automator_js_1.BrowserAutomator.getInstance();
        context.token.throwIfCancelled();
        // 1. Back / Forward / Reload
        if (/\b(back|previous\s+page)\b/i.test(lower)) {
            context.updateStatus?.('Going back...');
            await automator.goBack();
            actionsTaken.push('Navigated back');
            return { success: true, summary: 'Navigated back.', actionsTaken };
        }
        if (/\b(forward|next\s+page)\b/i.test(lower)) {
            context.updateStatus?.('Going forward...');
            await automator.goForward();
            actionsTaken.push('Navigated forward');
            return { success: true, summary: 'Navigated forward.', actionsTaken };
        }
        if (/\b(reload|refresh)\b/i.test(lower)) {
            context.updateStatus?.('Reloading page...');
            await automator.reload();
            actionsTaken.push('Reloaded current tab');
            return { success: true, summary: 'Reloaded page.', actionsTaken };
        }
        // 2. Scroll
        if (/\bscroll\b/i.test(lower)) {
            const isUp = lower.includes('up');
            context.updateStatus?.(`Scrolling ${isUp ? 'up' : 'down'}...`);
            await automator.scroll(isUp ? 'up' : 'down', 600);
            actionsTaken.push(`Scrolled page ${isUp ? 'up' : 'down'}`);
            return { success: true, summary: `Scrolled ${isUp ? 'up' : 'down'}.`, actionsTaken };
        }
        // 3. Ordinal Click ("Open the second one", "Click the 2nd result")
        const ordinalMatch = lower.match(/\b(?:the\s+)?(first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th|\d+)\s*(?:one|video|item|result|link)?\b/);
        if (ordinalMatch && (lower.includes('click') || lower.includes('open'))) {
            const wordMap = { first: 1, '1st': 1, second: 2, '2nd': 2, third: 3, '3rd': 3, fourth: 4, '4th': 4, fifth: 5, '5th': 5 };
            const targetIdx = wordMap[ordinalMatch[1]] || parseInt(ordinalMatch[1], 10) || 1;
            context.updateStatus?.(`Locating result #${targetIdx}...`);
            // Check BrowserStateStore first
            const stored = browser_state_store_js_1.BrowserStateStore.getInstance().resolveOrdinalResult(targetIdx);
            if (stored && stored.url) {
                await automator.navigate(stored.url);
                actionsTaken.push(`Navigated to stored result #${targetIdx}: "${stored.title}"`);
                if (context.speak)
                    await context.speak(`Opened ${stored.title}.`);
                return { success: true, summary: `Opened ${stored.title}.`, actionsTaken };
            }
            // Check on-screen visible perception
            const targetEl = await context.perception.findMatchingElement(undefined, 'video', targetIdx) ||
                await context.perception.findMatchingElement(undefined, 'link', targetIdx);
            if (targetEl) {
                await automator.click({ elementId: targetEl.id });
                actionsTaken.push(`Clicked on-screen element [${targetEl.index || targetEl.id}]: "${targetEl.name || targetEl.text}"`);
                if (context.speak)
                    await context.speak(`Clicked ${targetEl.name || targetEl.text || 'item'}.`);
                return { success: true, summary: `Clicked item #${targetIdx}.`, actionsTaken };
            }
        }
        // 4. Spatial Click ("Click the button on the right")
        if (lower.includes('on the right') || lower.includes('on the left')) {
            const spatialHint = lower.includes('on the right') ? 'right' : 'left';
            context.updateStatus?.(`Finding element on the ${spatialHint}...`);
            const matched = await context.perception.findMatchingElement(undefined, undefined, 1, spatialHint);
            if (matched) {
                await automator.click({ elementId: matched.id });
                actionsTaken.push(`Clicked ${spatialHint} element [${matched.index || matched.id}]: "${matched.name || matched.text}"`);
                if (context.speak)
                    await context.speak(`Clicked the ${matched.name || matched.role} on the ${spatialHint}.`);
                return { success: true, summary: `Clicked element on the ${spatialHint}.`, actionsTaken };
            }
        }
        // 5. Direct Named Click ("Click the video on my screen", "Click Subscribe")
        const cleanClickTarget = goal
            .replace(/^(?:click|open|press|select)\s+(?:the\s+)?/i, '')
            .replace(/\s+(?:on\s+my\s+screen|button|link)\b/gi, '')
            .trim();
        if (cleanClickTarget) {
            const matched = await context.perception.findMatchingElement(cleanClickTarget);
            if (matched) {
                await automator.click({ elementId: matched.id });
                actionsTaken.push(`Clicked matching element [${matched.index || matched.id}]: "${matched.name || matched.text}"`);
                if (context.speak)
                    await context.speak(`Clicked ${matched.name || cleanClickTarget}.`);
                return { success: true, summary: `Clicked ${cleanClickTarget}.`, actionsTaken };
            }
        }
        // 6. Direct Site Navigation ("Open Instagram", "Go to GitHub")
        const siteMatch = lower.match(/(?:open|go\s+to)\s+([a-zA-Z0-9_-]+)/);
        if (siteMatch) {
            const site = siteMatch[1].toLowerCase();
            const siteMap = {
                youtube: 'https://www.youtube.com',
                instagram: 'https://www.instagram.com',
                gmail: 'https://mail.google.com',
                amazon: 'https://www.amazon.in',
                github: 'https://github.com',
                google: 'https://www.google.com',
            };
            const url = siteMap[site] || `https://www.${site}.com`;
            await automator.navigate(url);
            actionsTaken.push(`Navigated directly to ${url}`);
            if (context.speak)
                await context.speak(`Opened ${site}.`);
            return { success: true, summary: `Opened ${site}.`, actionsTaken };
        }
        return { success: false, summary: 'Could not resolve navigation target.', actionsTaken };
    }
}
exports.NavigationSkill = NavigationSkill;
//# sourceMappingURL=navigation-skill.js.map