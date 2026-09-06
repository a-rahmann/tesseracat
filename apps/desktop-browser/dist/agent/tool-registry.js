"use strict";
/**
 * ToolRegistry: Comprehensive Tool Repository with Structured JSON Schemas & Safety Rules.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToolRegistry = void 0;
const browser_automator_js_1 = require("../browser/browser-automator.js");
const browser_perception_js_1 = require("../browser/browser-perception.js");
const youtube_js_1 = require("../adapters/youtube.js");
const instagram_js_1 = require("../adapters/instagram.js");
const memory_retriever_js_1 = require("../memory/memory-retriever.js");
const pdf_reader_js_1 = require("../browser/pdf-reader.js");
const comparison_engine_js_1 = require("../skills/comparison-engine.js");
class ToolRegistry {
    static instance = null;
    tools = new Map();
    constructor() {
        this.registerDefaultTools();
    }
    static getInstance() {
        if (!ToolRegistry.instance) {
            ToolRegistry.instance = new ToolRegistry();
        }
        return ToolRegistry.instance;
    }
    getTool(name) {
        if (!name)
            return undefined;
        const direct = this.tools.get(name);
        if (direct)
            return direct;
        const lower = name.toLowerCase().replace(/^(browser|tool)[\._]/, '');
        const aliasMap = {
            navigate: 'browser.navigate',
            open: 'browser.navigate',
            load_url: 'browser.navigate',
            back: 'browser.back',
            forward: 'browser.forward',
            reload: 'browser.reload',
            refresh: 'browser.reload',
            click: 'browser.click',
            type: 'browser.type',
            input: 'browser.type',
            scroll: 'browser.scroll',
            wait: 'browser.wait',
            sleep: 'browser.wait',
            observe: 'browser.observe',
            snapshot: 'browser.observe',
            screenshot: 'browser.screenshot',
            new_tab: 'browser.new_tab',
            create_tab: 'browser.new_tab',
            close_tab: 'browser.close_tab',
            switch_tab: 'browser.switch_tab',
            list_tabs: 'browser.list_tabs',
            hover: 'browser.hover',
            select: 'browser.select_option',
            press_key: 'browser.press_key',
            ask_user: 'browser.ask_user',
            read_pdf: 'document.read_pdf',
            extract_text: 'document.extract_text',
            compare: 'comparison.compare_products',
        };
        const mapped = aliasMap[lower];
        if (mapped)
            return this.tools.get(mapped);
        return undefined;
    }
    listTools() {
        return Array.from(this.tools.values());
    }
    listToolNames() {
        return Array.from(this.tools.keys());
    }
    registerTool(tool) {
        this.tools.set(tool.name, tool);
    }
    registerDefaultTools() {
        const automator = browser_automator_js_1.BrowserAutomator.getInstance();
        const perception = browser_perception_js_1.BrowserPerception.getInstance();
        const pdfReader = pdf_reader_js_1.PDFReader.getInstance();
        const compEngine = comparison_engine_js_1.ComparisonEngine.getInstance();
        // 1. Navigation Tools
        this.registerTool({
            name: 'browser.navigate',
            category: 'LOW_RISK_ACTION',
            description: 'Navigate to a target URL in the active tab',
            parametersSchema: {
                type: 'object',
                properties: { url: { type: 'string', description: 'Full URL to load' } },
                required: ['url'],
            },
            execute: async (args) => automator.navigate(args.url),
        });
        this.registerTool({
            name: 'browser.back',
            category: 'LOW_RISK_ACTION',
            description: 'Navigate back in browser tab history',
            parametersSchema: { type: 'object', properties: {} },
            execute: async () => automator.goBack(),
        });
        this.registerTool({
            name: 'browser.forward',
            category: 'LOW_RISK_ACTION',
            description: 'Navigate forward in browser tab history',
            parametersSchema: { type: 'object', properties: {} },
            execute: async () => automator.goForward(),
        });
        this.registerTool({
            name: 'browser.reload',
            category: 'LOW_RISK_ACTION',
            description: 'Reload the active page',
            parametersSchema: { type: 'object', properties: {} },
            execute: async () => automator.reload(),
        });
        // 2. Tab Management Tools
        this.registerTool({
            name: 'browser.new_tab',
            category: 'LOW_RISK_ACTION',
            description: 'Open a new browser tab with optional URL',
            parametersSchema: {
                type: 'object',
                properties: { url: { type: 'string', default: 'about:blank' } },
            },
            execute: async (args) => automator.createTab(args?.url || 'about:blank'),
        });
        this.registerTool({
            name: 'browser.close_tab',
            category: 'LOW_RISK_ACTION',
            description: 'Close active or specified tab',
            parametersSchema: { type: 'object', properties: { tabId: { type: 'string' } } },
            execute: async () => automator.closeCurrentTab(),
        });
        this.registerTool({
            name: 'browser.switch_tab',
            category: 'LOW_RISK_ACTION',
            description: 'Switch active view to another tab by tabId',
            parametersSchema: {
                type: 'object',
                properties: { tabId: { type: 'string', description: 'Target tab ID' } },
                required: ['tabId'],
            },
            execute: async (args) => automator.switchTab(args.tabId),
        });
        this.registerTool({
            name: 'browser.list_tabs',
            category: 'READ',
            description: 'List all currently open browser tabs and their URLs',
            parametersSchema: { type: 'object', properties: {} },
            execute: async () => automator.listTabs(),
        });
        // 3. Interaction Tools
        this.registerTool({
            name: 'browser.click',
            category: 'LOW_RISK_ACTION',
            description: 'Click an element by its numbered ID (e.g. e1, [1]) or CSS selector',
            parametersSchema: {
                type: 'object',
                properties: {
                    elementId: { type: 'string', description: 'Temporary element ID e.g. e1 or numeric 1' },
                    selector: { type: 'string', description: 'CSS selector fallback' },
                },
            },
            execute: async (args) => {
                let elId = args.elementId;
                if (typeof elId === 'number' || (typeof elId === 'string' && /^\d+$/.test(elId))) {
                    elId = `e${elId}`;
                }
                return automator.click({ elementId: elId, selector: args.selector });
            },
        });
        this.registerTool({
            name: 'browser.type',
            category: 'LOW_RISK_ACTION',
            description: 'Type text into an input field or contenteditable element',
            parametersSchema: {
                type: 'object',
                properties: {
                    elementId: { type: 'string' },
                    selector: { type: 'string' },
                    text: { type: 'string', description: 'Text string to type' },
                    pressEnter: { type: 'boolean', default: false },
                },
                required: ['text'],
            },
            execute: async (args) => {
                let elId = args.elementId;
                if (typeof elId === 'number' || (typeof elId === 'string' && /^\d+$/.test(elId))) {
                    elId = `e${elId}`;
                }
                return automator.type({
                    elementId: elId,
                    selector: args.selector,
                    text: args.text,
                    pressEnter: args.pressEnter,
                });
            },
        });
        this.registerTool({
            name: 'browser.hover',
            category: 'LOW_RISK_ACTION',
            description: 'Hover mouse over an interactive element',
            parametersSchema: {
                type: 'object',
                properties: { elementId: { type: 'string' }, selector: { type: 'string' } },
            },
            execute: async (args) => automator.hover(args),
        });
        this.registerTool({
            name: 'browser.select_option',
            category: 'LOW_RISK_ACTION',
            description: 'Select an option from a dropdown element',
            parametersSchema: {
                type: 'object',
                properties: {
                    elementId: { type: 'string' },
                    selector: { type: 'string' },
                    value: { type: 'string', description: 'Value to select' },
                },
                required: ['value'],
            },
            execute: async (args) => automator.selectOption(args),
        });
        this.registerTool({
            name: 'browser.press_key',
            category: 'LOW_RISK_ACTION',
            description: 'Press keyboard key with modifiers (e.g. Enter, Escape, ArrowDown)',
            parametersSchema: {
                type: 'object',
                properties: {
                    key: { type: 'string' },
                    ctrl: { type: 'boolean' },
                    shift: { type: 'boolean' },
                    alt: { type: 'boolean' },
                },
                required: ['key'],
            },
            execute: async (args) => automator.pressKey(args.key, args),
        });
        this.registerTool({
            name: 'browser.scroll',
            category: 'LOW_RISK_ACTION',
            description: 'Scroll viewport up, down, top, or bottom',
            parametersSchema: {
                type: 'object',
                properties: {
                    direction: { type: 'string', enum: ['up', 'down', 'top', 'bottom'] },
                    amount: { type: 'number', default: 450 },
                },
                required: ['direction'],
            },
            execute: async (args) => automator.scroll(args.direction, args.amount),
        });
        this.registerTool({
            name: 'browser.wait',
            category: 'READ',
            description: 'Wait for a specified number of milliseconds or element appearance',
            parametersSchema: {
                type: 'object',
                properties: { ms: { type: 'number', default: 1000 }, selector: { type: 'string' } },
            },
            execute: async (args) => {
                if (args.selector) {
                    return automator.verifyElement(args.selector, args.ms || 4000);
                }
                return automator.wait(args.ms || 1000);
            },
        });
        // 4. Perception & Observation Tools
        this.registerTool({
            name: 'browser.observe',
            category: 'READ',
            description: 'Observe active page state, numbered interactive elements [1], [2], and forms',
            parametersSchema: { type: 'object', properties: {} },
            execute: async () => perception.observe(),
        });
        this.registerTool({
            name: 'browser.read_page',
            category: 'READ',
            description: 'Extract visible text and headings from the page within token budget',
            parametersSchema: { type: 'object', properties: {} },
            execute: async () => perception.getCompactElementSummary(),
        });
        this.registerTool({
            name: 'browser.screenshot',
            category: 'READ',
            description: 'Capture screenshot of active webview',
            parametersSchema: { type: 'object', properties: {} },
            execute: async () => perception.captureScreenshot(),
        });
        // 5. Document & PDF Tools
        this.registerTool({
            name: 'document.read_pdf',
            category: 'READ',
            description: 'Extract structured text streams, headings, and pages from active PDF document',
            parametersSchema: {
                type: 'object',
                properties: { url: { type: 'string', description: 'PDF file path or URL' } },
                required: ['url'],
            },
            execute: async (args) => pdfReader.readPdf(args.url),
        });
        this.registerTool({
            name: 'document.extract_text',
            category: 'READ',
            description: 'Query extracted PDF chunks for relevant answers',
            parametersSchema: {
                type: 'object',
                properties: { query: { type: 'string' } },
                required: ['query'],
            },
            execute: async (args) => pdfReader.search(args.query),
        });
        this.registerTool({
            name: 'document.extract_table',
            category: 'READ',
            description: 'Extract structured tables from the active document',
            parametersSchema: { type: 'object', properties: {} },
            execute: async () => pdfReader.extractTable(),
        });
        // 6. Multi-Site Comparison Tool
        this.registerTool({
            name: 'comparison.compare_products',
            category: 'READ',
            description: 'Compare product prices and specs across multiple online stores',
            parametersSchema: {
                type: 'object',
                properties: { query: { type: 'string' } },
                required: ['query'],
            },
            execute: async (args) => compEngine.compareAcrossWebsites(args.query),
        });
        // 7. Human-in-the-Loop Tools
        this.registerTool({
            name: 'browser.ask_user',
            category: 'HUMAN_HANDOFF',
            description: 'Ask user a clarifying question or request manual decision',
            parametersSchema: {
                type: 'object',
                properties: { question: { type: 'string' } },
                required: ['question'],
            },
            execute: async (args) => ({ asked: args.question, status: 'WAITING_FOR_USER' }),
        });
        this.registerTool({
            name: 'browser.request_authentication',
            category: 'HUMAN_HANDOFF',
            description: 'Pause task and request user manual login/2FA completion in the browser',
            parametersSchema: {
                type: 'object',
                properties: { service: { type: 'string' }, loginUrl: { type: 'string' } },
                required: ['service'],
            },
            execute: async (args) => ({ status: 'AUTH_REQUIRED', ...args }),
        });
        this.registerTool({
            name: 'browser.request_payment_confirmation',
            category: 'PURCHASE',
            description: 'Request user confirmation before finalizing purchase or payment',
            parametersSchema: {
                type: 'object',
                properties: { amount: { type: 'string' }, item: { type: 'string' } },
                required: ['amount', 'item'],
            },
            execute: async (args) => ({ status: 'PAYMENT_REQUIRED', ...args }),
        });
        // 8. Specialized Domain Tools (Instagram & YouTube)
        this.registerTool({
            name: 'instagram.getMessages',
            category: 'READ',
            description: 'Inspect Direct Message inbox and list recent conversations',
            parametersSchema: { type: 'object', properties: {} },
            execute: async () => instagram_js_1.InstagramAdapter.getMessageThreads(),
        });
        this.registerTool({
            name: 'instagram.openThread',
            category: 'LOW_RISK_ACTION',
            description: 'Open a specific DM thread by its 1-based index',
            parametersSchema: {
                type: 'object',
                properties: { index: { type: 'number' } },
                required: ['index'],
            },
            execute: async (args) => instagram_js_1.InstagramAdapter.openThreadByIndex(args.index),
        });
        this.registerTool({
            name: 'instagram.readMessage',
            category: 'READ',
            description: 'Read the newest message in the active DM conversation',
            parametersSchema: { type: 'object', properties: {} },
            execute: async () => instagram_js_1.InstagramAdapter.readActiveConversation(),
        });
        this.registerTool({
            name: 'instagram.sendReply',
            category: 'EXTERNAL_COMMUNICATION',
            description: 'Transmit the message reply (Requires user confirmation)',
            parametersSchema: {
                type: 'object',
                properties: { text: { type: 'string' } },
                required: ['text'],
            },
            execute: async (args) => instagram_js_1.InstagramAdapter.sendReply(args.text),
        });
        this.registerTool({
            name: 'youtube.search',
            category: 'LOW_RISK_ACTION',
            description: 'Search YouTube for videos',
            parametersSchema: {
                type: 'object',
                properties: { query: { type: 'string' } },
                required: ['query'],
            },
            execute: async (args) => youtube_js_1.YouTubeAdapter.search(args.query),
        });
        this.registerTool({
            name: 'youtube.playResult',
            category: 'LOW_RISK_ACTION',
            description: 'Play a search result video by 1-based index',
            parametersSchema: {
                type: 'object',
                properties: { index: { type: 'number' } },
                required: ['index'],
            },
            execute: async (args) => youtube_js_1.YouTubeAdapter.playResult(args.index),
        });
        this.registerTool({
            name: 'memory.search',
            category: 'READ',
            description: 'Search conversational history by topic query or minutes ago',
            parametersSchema: {
                type: 'object',
                properties: { query: { type: 'string' }, minutesAgo: { type: 'number' } },
            },
            execute: async (args) => memory_retriever_js_1.MemoryRetriever.search(args),
        });
    }
}
exports.ToolRegistry = ToolRegistry;
//# sourceMappingURL=tool-registry.js.map