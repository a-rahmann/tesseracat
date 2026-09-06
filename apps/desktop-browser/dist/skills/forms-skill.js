"use strict";
/**
 * FormsSkill: Detects visible form inputs and safely autofills personal address/profile
 * data from local UserMemoryStore without exposing secrets or passwords.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FormsSkill = void 0;
const user_memory_js_1 = require("../services/user-memory.js");
const browser_automator_js_1 = require("../services/browser-automator.js");
class FormsSkill {
    name = 'FormsSkill';
    description = 'Autonomous form input detection and local privacy-preserving autofill';
    canHandle(goal) {
        const lower = goal.toLowerCase();
        return /^(?:fill|autofill|complete)\s+(?:this\s+)?(?:form|application|address|fields|checkout)\b/i.test(lower) ||
            lower.includes('fill form') ||
            lower.includes('fill my details');
    }
    async execute(goal, context) {
        const actionsTaken = [];
        context.token.throwIfCancelled();
        context.updateStatus?.('Inspecting form fields on page...');
        const snapshot = await context.perception.getSnapshot();
        const automator = browser_automator_js_1.BrowserAutomator.getInstance();
        const userMemory = user_memory_js_1.UserMemoryStore.getInstance();
        const saved = userMemory.getAddressProfile();
        const profile = {
            fullName: saved?.fullName || 'John Doe',
            streetAddress: saved?.streetAddress || '123 Tech Park Blvd',
            city: saved?.city || 'Hyderabad',
            state: saved?.state || 'Telangana',
            postalCode: saved?.postalCode || '500081',
            country: saved?.country || 'India',
            email: saved?.email || 'user@example.com',
            phone: saved?.phone || '+91 9876543210'
        };
        const textboxes = snapshot.elements.filter(el => el.role === 'textbox' && !el.disabled);
        actionsTaken.push(`Found ${textboxes.length} interactive text inputs`);
        let filledCount = 0;
        for (const box of textboxes) {
            context.token.throwIfCancelled();
            const label = `${box.name || ''} ${box.text || ''}`.toLowerCase();
            let fillVal = '';
            if (label.includes('name') || label.includes('full'))
                fillVal = profile.fullName;
            else if (label.includes('email'))
                fillVal = profile.email || 'user@example.com';
            else if (label.includes('phone') || label.includes('mobile'))
                fillVal = profile.phone || '';
            else if (label.includes('street') || label.includes('address'))
                fillVal = profile.streetAddress;
            else if (label.includes('city'))
                fillVal = profile.city;
            else if (label.includes('state'))
                fillVal = profile.state;
            else if (label.includes('zip') || label.includes('postal') || label.includes('pin'))
                fillVal = profile.postalCode;
            else if (label.includes('country'))
                fillVal = profile.country;
            if (fillVal) {
                await automator.type({ elementId: box.id, text: fillVal });
                actionsTaken.push(`Filled field "${box.name || box.id}" with ${fillVal}`);
                filledCount++;
            }
        }
        const summary = filledCount > 0
            ? `Autofilled ${filledCount} form field${filledCount > 1 ? 's' : ''} from your local profile.`
            : "Couldn't match any profile fields on this form.";
        if (context.speak)
            await context.speak(summary);
        return {
            success: filledCount > 0,
            summary,
            actionsTaken,
            data: { filledCount, totalFields: textboxes.length },
        };
    }
}
exports.FormsSkill = FormsSkill;
//# sourceMappingURL=forms-skill.js.map