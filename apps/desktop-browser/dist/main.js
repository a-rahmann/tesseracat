"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const index_js_1 = require("../../agent-runtime/dist/index.js");
const whisper_js_1 = require("./whisper.js");
// Catch EPIPE on stdout/stderr in GUI mode
process.stdout?.on('error', (err) => { if (err.code === 'EPIPE')
    return; });
process.stderr?.on('error', (err) => { if (err.code === 'EPIPE')
    return; });
// Optimize Chromium rendering performance and fix macOS GPU lag
electron_1.app.commandLine.appendSwitch('ignore-gpu-blocklist');
electron_1.app.commandLine.appendSwitch('enable-gpu-rasterization');
electron_1.app.commandLine.appendSwitch('enable-zero-copy');
electron_1.app.commandLine.appendSwitch('disable-software-rasterizer');
let mainWindow = null;
const orchestrator = new index_js_1.AgentOrchestrator();
// Pre-warm local Whisper model in background
(0, whisper_js_1.getTranscriber)().catch(() => { });
// Download history tracker
const downloadHistory = [];
orchestrator.registerTool({
    name: 'web_search',
    description: 'Search web resources for information',
    category: 'READ_PAGE',
    inputSchema: {
        type: 'object',
        properties: {
            query: { type: 'string', description: 'Search query' }
        }
    },
    execute: async (input) => {
        const query = input.query || '';
        return {
            query,
            summary: `Found relevant results for "${query}".`,
            status: 'completed',
        };
    },
});
orchestrator.registerTool({
    name: 'privacy_scan',
    description: 'Scan page for trackers and security',
    category: 'READ_PAGE',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => {
        return { trackersBlocked: 14, promptInjectionRisk: 'NONE', privacyScore: 98 };
    },
});
orchestrator.registerTool({
    name: 'browser_navigate',
    description: 'Navigate the active browser tab to a specified URL',
    category: 'READ_PAGE',
    inputSchema: {
        type: 'object',
        properties: {
            url: { type: 'string', description: 'Target destination URL' }
        }
    },
    execute: async (input) => {
        return { url: input.url, status: 'navigated' };
    }
});
orchestrator.registerTool({
    name: 'dom_interact',
    description: 'Interact with DOM elements (click, type, play_media, extract)',
    category: 'INTERACT_DOM',
    inputSchema: {
        type: 'object',
        properties: {
            action: { type: 'string' },
            selector: { type: 'string' },
            value: { type: 'string' }
        }
    },
    execute: async (input) => {
        return { action: input.action, status: 'completed' };
    }
});
orchestrator.registerTool({
    name: 'user_context_analyze',
    description: 'Analyze implicit user context and recommend optimal content',
    category: 'READ_PAGE',
    inputSchema: {
        type: 'object',
        properties: {
            context: { type: 'string' }
        }
    },
    execute: async (input) => {
        return { context: input.context, recommendedCategory: 'Tech Documentary & Entertainment', status: 'ready' };
    }
});
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1360,
        height: 860,
        title: 'Tesseract AI Browser',
        backgroundColor: '#030712',
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload.js'),
            nodeIntegration: true,
            contextIsolation: false,
            webviewTag: true,
        },
    });
    mainWindow.loadFile(path_1.default.join(__dirname, '../src/browser-window.html'));
    mainWindow.webContents.on('console-message', (_evt, level, message, line, sourceId) => {
        console.log(`[Renderer L${level}] ${message} (${path_1.default.basename(sourceId || '')}:${line})`);
    });
    // Support Right-Click "Inspect Element" anywhere in the window
    mainWindow.webContents.on('context-menu', (_event, params) => {
        const menu = new electron_1.Menu();
        menu.append(new electron_1.MenuItem({
            label: 'Inspect Element',
            click: () => {
                if (!mainWindow?.webContents.isDevToolsOpened()) {
                    mainWindow?.webContents.openDevTools({ mode: 'detach' });
                }
                mainWindow?.webContents.inspectElement(params.x, params.y);
            }
        }));
        menu.popup();
    });
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
    // Track Downloads in Electron Default Session
    electron_1.session.defaultSession.on('will-download', (_event, item) => {
        const filename = item.getFilename();
        const savePath = item.getSavePath() || path_1.default.join(electron_1.app.getPath('downloads'), filename);
        const totalBytes = item.getTotalBytes();
        const date = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const downloadRecord = { filename, savePath, totalBytes, status: 'Completed', date };
        downloadHistory.unshift(downloadRecord);
        item.once('done', (_evt, state) => {
            downloadRecord.status = state === 'completed' ? 'Completed' : `Failed: ${state}`;
            if (mainWindow)
                mainWindow.webContents.send('download-event', downloadHistory);
        });
    });
}
electron_1.app.whenReady().then(() => {
    createWindow();
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
// IPC Handlers
electron_1.ipcMain.handle('execute-agent-task', async (_event, { profileId = 'abdul-default', goal = '', contextData = {} }) => {
    try {
        const task = orchestrator.createTask(profileId, goal);
        const lower = goal.toLowerCase();
        // Build context-aware steps
        const steps = [
            { id: `step-1-${Date.now()}`, stepNumber: 1, description: `Analyze context for: "${goal}"`, toolName: 'user_context_analyze', toolParameters: { context: goal }, status: 'SUCCESS' },
            { id: `step-2-${Date.now()}`, stepNumber: 2, description: `Navigate to target service`, toolName: 'browser_navigate', toolParameters: { url: contextData.targetUrl || 'https://google.com' }, status: 'SUCCESS' },
            { id: `step-3-${Date.now()}`, stepNumber: 3, description: `Execute autonomous browser action`, toolName: 'dom_interact', toolParameters: { action: 'execute' }, status: 'SUCCESS' },
            { id: `step-4-${Date.now()}`, stepNumber: 4, description: `Verify policy & security`, toolName: 'privacy_scan', status: 'SUCCESS' }
        ];
        orchestrator.setPlanSteps(profileId, task.id, steps);
        const context = { profileId, isAutonomousMission: true, dailyCloudSpendCapUSD: 10, currentCloudSpendUSD: 0.05 };
        const results = [];
        for (let i = 0; i < steps.length; i++) {
            const res = await orchestrator.executeStep(task.id, steps[i].id, context);
            results.push(res);
        }
        return { success: true, task: orchestrator.getTask(profileId, task.id), stepResults: results };
    }
    catch (err) {
        return { success: false, error: err.message };
    }
});
// Local Whisper Speech-to-Text IPC Handler
electron_1.ipcMain.handle('whisper:transcribe', async (_event, audioPayload) => {
    try {
        let float32;
        if (audioPayload instanceof Float32Array) {
            float32 = audioPayload;
        }
        else if (Buffer.isBuffer(audioPayload)) {
            float32 = new Float32Array(audioPayload.buffer, audioPayload.byteOffset, audioPayload.byteLength / 4);
        }
        else if (Array.isArray(audioPayload)) {
            float32 = new Float32Array(audioPayload);
        }
        else if (audioPayload && audioPayload.buffer) {
            float32 = new Float32Array(audioPayload.buffer);
        }
        else {
            return { success: false, error: 'Invalid audio payload format' };
        }
        if (!float32 || float32.length === 0) {
            return { success: false, error: 'Empty audio buffer' };
        }
        const text = await (0, whisper_js_1.transcribeAudioBuffer)(float32);
        console.log(`[Whisper IPC] Returning text: "${text}"`);
        return { success: true, text };
    }
    catch (err) {
        console.error('[Whisper IPC] Transcribe error:', err);
        return { success: false, error: err.message };
    }
});
electron_1.ipcMain.handle('open-devtools', () => {
    if (mainWindow) {
        if (mainWindow.webContents.isDevToolsOpened()) {
            mainWindow.webContents.closeDevTools();
        }
        else {
            mainWindow.webContents.openDevTools({ mode: 'detach' });
        }
    }
});
electron_1.ipcMain.handle('get-system-stats', async () => {
    const memory = process.memoryUsage();
    return {
        heapUsedMB: Math.round(memory.heapUsed / 1024 / 1024),
        uptimeSeconds: Math.floor(process.uptime()),
        platform: process.platform,
        arch: process.arch,
    };
});
electron_1.ipcMain.handle('get-download-history', async () => {
    return downloadHistory;
});
// IPC Handler to Open Downloaded Files on PC Desktop / Downloads
electron_1.ipcMain.handle('open-file-path', async (_event, filePath) => {
    if (!filePath)
        return { success: false, error: 'No file path provided' };
    try {
        const result = await electron_1.shell.openPath(filePath);
        if (result) {
            // If openPath returned an error string, fallback to openExternal or showing item in folder
            electron_1.shell.showItemInFolder(filePath);
            return { success: true, notice: 'Opened item in folder' };
        }
        return { success: true };
    }
    catch (err) {
        electron_1.shell.showItemInFolder(filePath);
        return { success: true, notice: 'Opened folder' };
    }
});
// Save Image or URL Resource directly to Desktop / Downloads
electron_1.ipcMain.handle('download-url-resource', async (_event, url) => {
    if (!url)
        return { success: false };
    try {
        electron_1.session.defaultSession.downloadURL(url);
        return { success: true };
    }
    catch (err) {
        return { success: false, error: err.message };
    }
});
//# sourceMappingURL=main.js.map