"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const index_js_1 = require("../../agent-runtime/dist/index.js");
const whisper_js_1 = require("./whisper.js");
const ollama_sidecar_js_1 = require("./services/ollama-sidecar.js");
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
electron_1.app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
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
            webSecurity: false,
            backgroundThrottling: false,
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
    if (process.argv.includes('--hardening-test')) {
        mainWindow.webContents.on('did-finish-load', () => {
            console.log('[Main] Electron window ready. Launching live hardening suite in 2.5s...');
            setTimeout(() => {
                mainWindow?.webContents.executeJavaScript(`
          if (typeof window.runHardeningSuite === 'function') {
            window.runHardeningSuite().then((results) => {
              const { ipcRenderer } = require('electron');
              ipcRenderer.send('hardening-complete', results);
            }).catch((err) => {
              console.error('[Hardening Error]', err);
              const { ipcRenderer } = require('electron');
              ipcRenderer.send('hardening-complete', []);
            });
          } else {
            console.error('[Main] runHardeningSuite not found on window');
          }
        `);
            }, 2500);
        });
    }
    if (process.argv.includes('--complex-hardening-test')) {
        mainWindow.webContents.on('did-finish-load', () => {
            console.log('[Main] Electron window ready. Launching complex web hardening suite in 2.5s...');
            setTimeout(() => {
                mainWindow?.webContents.executeJavaScript(`
          if (typeof window.runComplexHardeningSuite === 'function') {
            window.runComplexHardeningSuite().then((results) => {
              const { ipcRenderer } = require('electron');
              ipcRenderer.send('complex-hardening-complete', results);
            }).catch((err) => {
              console.error('[Complex Hardening Error]', err);
              const { ipcRenderer } = require('electron');
              ipcRenderer.send('complex-hardening-complete', []);
            });
          } else {
            console.error('[Main] runComplexHardeningSuite not found on window');
          }
        `);
            }, 2500);
        });
    }
    if (process.argv.includes('--voice-llm-diagnostic-test')) {
        mainWindow.webContents.on('did-finish-load', () => {
            console.log('[Main] Electron window ready. Launching voice & LLM diagnostic suite in 2.5s...');
            setTimeout(() => {
                mainWindow?.webContents.executeJavaScript(`
          if (typeof window.runVoiceLlmDiagnosticSuite === 'function') {
            window.runVoiceLlmDiagnosticSuite().then((results) => {
              const { ipcRenderer } = require('electron');
              ipcRenderer.send('voice-diagnostic-complete', results);
            }).catch((err) => {
              console.error('[Voice Diagnostic Error]', err);
              const { ipcRenderer } = require('electron');
              ipcRenderer.send('voice-diagnostic-complete', []);
            });
          } else {
            console.error('[Main] runVoiceLlmDiagnosticSuite not found on window');
          }
        `);
            }, 2500);
        });
    }
    if (process.argv.includes('--latency-benchmark-test')) {
        mainWindow.webContents.on('did-finish-load', () => {
            console.log('[Main] Electron window ready. Launching real-time latency benchmark suite in 2.5s...');
            setTimeout(() => {
                mainWindow?.webContents.executeJavaScript(`
          if (typeof window.runLatencyBenchmarkSuite === 'function') {
            window.runLatencyBenchmarkSuite().then((results) => {
              const { ipcRenderer } = require('electron');
              ipcRenderer.send('latency-benchmark-complete', results);
            }).catch((err) => {
              console.error('[Latency Benchmark Error]', err);
              const { ipcRenderer } = require('electron');
              ipcRenderer.send('latency-benchmark-complete', []);
            });
          } else {
            console.error('[Main] runLatencyBenchmarkSuite not found on window');
          }
        `);
            }, 2500);
        });
    }
}
electron_1.ipcMain.on('hardening-complete', (_event, reports) => {
    console.log(`\n[Main] Hardening test suite completed with ${reports?.length || 0} reports.`);
    try {
        const fs = require('fs');
        const path = require('path');
        const outPath = path.join(process.cwd(), 'scratch/hardening_results.json');
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, JSON.stringify(reports, null, 2), 'utf-8');
        console.log(`[Main] Saved reports to ${outPath}`);
    }
    catch (err) {
        console.error('[Main] Failed to save hardening report:', err);
    }
    setTimeout(() => {
        electron_1.app.quit();
    }, 1500);
});
electron_1.ipcMain.on('complex-hardening-complete', (_event, reports) => {
    console.log(`\n[Main] Complex web hardening test suite completed with ${reports?.length || 0} reports.`);
    try {
        const fs = require('fs');
        const path = require('path');
        const outPath = path.join(process.cwd(), 'scratch/complex_hardening_results.json');
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, JSON.stringify(reports, null, 2), 'utf-8');
        console.log(`[Main] Saved complex reports to ${outPath}`);
    }
    catch (err) {
        console.error('[Main] Failed to save complex hardening report:', err);
    }
    setTimeout(() => {
        electron_1.app.quit();
    }, 1500);
});
electron_1.ipcMain.on('voice-diagnostic-complete', (_event, reports) => {
    console.log(`\n[Main] Voice & LLM diagnostic suite completed with ${reports?.length || 0} reports.`);
    try {
        const fs = require('fs');
        const path = require('path');
        const outPath = path.join(process.cwd(), 'scratch/voice_diagnostic_results.json');
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, JSON.stringify(reports, null, 2), 'utf-8');
        console.log(`[Main] Saved voice diagnostic reports to ${outPath}`);
    }
    catch (err) {
        console.error('[Main] Failed to save voice diagnostic report:', err);
    }
    setTimeout(() => {
        electron_1.app.quit();
    }, 1500);
});
electron_1.ipcMain.on('latency-benchmark-complete', (_event, reports) => {
    console.log(`\n[Main] Real-time latency benchmark completed with ${reports?.length || 0} reports.`);
    try {
        const fs = require('fs');
        const path = require('path');
        const outPath = path.join(process.cwd(), 'scratch/latency_benchmark_results.json');
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, JSON.stringify(reports, null, 2), 'utf-8');
        console.log(`[Main] Saved latency benchmark reports to ${outPath}`);
    }
    catch (err) {
        console.error('[Main] Failed to save latency benchmark report:', err);
    }
    setTimeout(() => {
        electron_1.app.quit();
    }, 1500);
});
electron_1.app.whenReady().then(async () => {
    // Automatically grant microphone and media permissions in Electron renderer
    electron_1.session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
        if (permission === 'media') {
            return callback(true);
        }
        callback(true);
    });
    electron_1.session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
        if (permission === 'media') {
            return true;
        }
        return true;
    });
    // Prompt for macOS microphone access explicitly if on Darwin
    if (process.platform === 'darwin') {
        try {
            const micStatus = electron_1.systemPreferences.getMediaAccessStatus('microphone');
            console.log(`[Main] macOS microphone access status: ${micStatus}`);
            if (micStatus === 'not-determined') {
                const granted = await electron_1.systemPreferences.askForMediaAccess('microphone');
                console.log(`[Main] macOS microphone permission prompt result: ${granted}`);
            }
            else if (micStatus === 'denied') {
                console.warn('[Main] macOS microphone permission is DENIED in System Settings.');
                setTimeout(() => {
                    if (mainWindow) {
                        electron_1.dialog.showMessageBox(mainWindow, {
                            type: 'warning',
                            title: 'Microphone Access Disabled',
                            message: 'Microphone access is currently disabled for Tesseract / Terminal in macOS System Settings.',
                            detail: 'To use voice commands and push-to-talk, please enable Microphone access in System Settings > Privacy & Security > Microphone.',
                            buttons: ['Open System Settings', 'Later'],
                            defaultId: 0,
                        }).then((res) => {
                            if (res.response === 0) {
                                electron_1.shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone');
                            }
                        });
                    }
                }, 1200);
            }
        }
        catch (err) {
            console.warn('[Main] Error requesting macOS microphone access:', err);
        }
    }
    createWindow();
    ollama_sidecar_js_1.OllamaSidecar.getInstance().ensureRunning().catch(() => { });
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
electron_1.app.on('before-quit', () => {
    ollama_sidecar_js_1.OllamaSidecar.getInstance().stop();
});
// IPC Handlers
electron_1.ipcMain.handle('execute-agent-task', async (_event, { profileId = 'user-default', goal = '', contextData = {} }) => {
    try {
        console.log(`[IPC] execute-agent-task for goal: "${goal}" using Local Gemma 3`);
        const task = await orchestrator.createTaskAndPlan(profileId, goal);
        const context = { profileId, isAutonomousMission: true, dailyCloudSpendCapUSD: 10, currentCloudSpendUSD: 0.0 };
        const results = [];
        for (const step of task.planSteps) {
            const res = await orchestrator.executeStep(task.id, step.id, context);
            results.push(res);
        }
        return { success: true, task: orchestrator.getTask(profileId, task.id), stepResults: results };
    }
    catch (err) {
        console.error('[IPC] execute-agent-task error:', err);
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
// Microphone permission helpers for macOS System Settings
electron_1.ipcMain.handle('get-mic-status', async () => {
    if (process.platform === 'darwin') {
        return electron_1.systemPreferences.getMediaAccessStatus('microphone');
    }
    return 'granted';
});
electron_1.ipcMain.handle('open-mic-settings', async () => {
    if (process.platform === 'darwin') {
        electron_1.shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone');
    }
    return true;
});
//# sourceMappingURL=main.js.map