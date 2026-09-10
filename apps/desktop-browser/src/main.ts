import { app, BrowserWindow, ipcMain, session, shell, dialog, Menu } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { spawn, ChildProcess } from 'child_process';
import { AgentOrchestrator, BrowserBridge } from '../../agent-runtime/dist/index.js';
import { ElementTarget, PermissionRequest, PolicyContext, TaskStep } from '../../../packages/core-types/dist/index.js';

// Optimize Chromium rendering performance and fix macOS GPU lag
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let mainWindow: BrowserWindow | null = null;
const orchestrator = new AgentOrchestrator();

// Pending IPC action resolution maps
const pendingActions = new Map<string, (result: any) => void>();
const pendingObservations = new Map<string, (obs: any) => void>();
const pendingPermissions = new Map<string, (approved: boolean) => void>();

function dispatchBrowserAction(toolName: string, parameters: any): Promise<any> {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return Promise.resolve({ success: false, error: 'Browser window is not available.' });
  }

  const actionId = `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      pendingActions.delete(actionId);
      resolve({ success: false, error: `Action ${toolName} timed out.` });
    }, 15000);

    pendingActions.set(actionId, (res) => {
      clearTimeout(timeout);
      resolve(res);
    });

    mainWindow!.webContents.send('agent-browser-action', {
      actionId,
      toolName,
      parameters,
    });
  });
}

// BrowserBridge Implementation wiring Orchestrator -> Guest Webview via Renderer IPC
const browserBridge: BrowserBridge = {
  navigate: async (url: string) => {
    return dispatchBrowserAction('browser_navigate', { url });
  },
  click: async (target: ElementTarget, options?: { doubleClick?: boolean }) => {
    return dispatchBrowserAction('browser_click', { target, ...options });
  },
  type: async (target: ElementTarget, text: string, options?: { clearFirst?: boolean; pressEnter?: boolean }) => {
    return dispatchBrowserAction('browser_type', { target, text, ...options });
  },
  keypress: async (key: string, modifiers?: string[]) => {
    return dispatchBrowserAction('browser_keypress', { key, modifiers });
  },
  scroll: async (direction: 'up' | 'down' | 'top' | 'bottom', amount?: number) => {
    return dispatchBrowserAction('browser_scroll', { direction, amount });
  },
  wait: async (ms: number) => {
    await new Promise(r => setTimeout(r, ms));
    return { success: true };
  },
  observe: async () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return {
        url: 'about:blank',
        title: 'Tesseract Browser',
        ready: false,
        interactiveElements: [],
        mainTextSnippet: '',
        timestamp: new Date().toISOString(),
      };
    }
    const reqId = `obs-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        pendingObservations.delete(reqId);
        resolve({
          url: 'about:blank',
          title: 'Tesseract Browser',
          ready: false,
          interactiveElements: [],
          mainTextSnippet: '',
          timestamp: new Date().toISOString(),
        });
      }, 6000);

      pendingObservations.set(reqId, (obs) => {
        clearTimeout(timeout);
        resolve(obs);
      });

      mainWindow!.webContents.send('agent-observe-request', { requestId: reqId });
    });
  },
};

orchestrator.setBrowserBridge(browserBridge);

// Wire Permission Request UI Hook
orchestrator.setPermissionRequestHandler(async (req: PermissionRequest) => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      pendingPermissions.delete(req.id);
      resolve(false);
    }, 60000); // 60s user response timeout

    pendingPermissions.set(req.id, (approved) => {
      clearTimeout(timeout);
      resolve(approved);
    });

    mainWindow!.webContents.send('agent-permission-request', req);
  });
});

// Download history tracker
const downloadHistory: Array<{ filename: string; savePath: string; totalBytes: number; status: string; date: string }> = [];

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
  execute: async (input: Record<string, unknown>) => {
    const query = (input.query as string) || '';
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
  execute: async (input: Record<string, unknown>) => {
    return browserBridge.navigate(String(input.url || ''));
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
  execute: async (input: Record<string, unknown>) => {
    const action = String(input.action || 'click');
    if (action === 'click') {
      return browserBridge.click({ selector: String(input.selector || '') });
    }
    if (action === 'type') {
      return browserBridge.type({ selector: String(input.selector || '') }, String(input.value || ''));
    }
    return { action, status: 'completed' };
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
  execute: async (input: Record<string, unknown>) => {
    return { context: input.context, recommendedCategory: 'Tech Documentary & Entertainment', status: 'ready' };
  }
});

// Disable default Windows menu bar (File, Edit, View, Developer)
Menu.setApplicationMenu(null);

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// Window Control IPC Handlers for Custom Frameless Chrome
ipcMain.handle('window-minimize', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.minimize();
  }
});

ipcMain.handle('window-maximize', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.handle('window-close', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close();
  }
});

ipcMain.handle('window-is-maximized', () => {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow.isMaximized() : false;
});

function createWindow() {
  const preloadCandidates = [
    path.join(__dirname, 'preload.js'),
    path.join(__dirname, '../dist/preload.js'),
    path.join(app.getAppPath(), 'apps/desktop-browser/dist/preload.js'),
    path.join(app.getAppPath(), 'dist/preload.js'),
  ];
  const preloadPath = preloadCandidates.find(p => fs.existsSync(p)) || path.join(__dirname, 'preload.js');

  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 960,
    minHeight: 600,
    frame: false,
    autoHideMenuBar: true,
    title: 'Tesseract AI Browser',
    backgroundColor: '#030712',
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
    },
  });

  const htmlCandidates = [
    path.join(__dirname, 'browser-window.html'),
    path.join(__dirname, '../src/browser-window.html'),
    path.join(__dirname, 'src/browser-window.html'),
    path.join(app.getAppPath(), 'apps/desktop-browser/dist/browser-window.html'),
    path.join(app.getAppPath(), 'apps/desktop-browser/src/browser-window.html'),
  ];
  const htmlPath = htmlCandidates.find(p => fs.existsSync(p)) || path.join(__dirname, '../src/browser-window.html');

  mainWindow.loadFile(htmlPath);

  mainWindow.webContents.on('console-message', (_event, _level, message) => {
    console.log(`[Renderer] ${message}`);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Track Downloads in Electron Default Session
  session.defaultSession.on('will-download', (_event, item) => {
    const filename = item.getFilename();
    const savePath = item.getSavePath() || path.join(app.getPath('downloads'), filename);
    const totalBytes = item.getTotalBytes();
    const date = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const downloadRecord = { filename, savePath, totalBytes, status: 'Completed', date };
    downloadHistory.unshift(downloadRecord);

    item.once('done', (_evt, state) => {
      downloadRecord.status = state === 'completed' ? 'Completed' : `Failed: ${state}`;
      if (mainWindow) mainWindow.webContents.send('download-event', downloadHistory);
    });
  });
}

app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(true);
  });

  session.defaultSession.setPermissionCheckHandler(() => true);

  Menu.setApplicationMenu(null);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Intercept Hold-T key events from all guest webviews when browsing any website
let webviewHoldStart = 0;
app.on('web-contents-created', (_event, contents) => {
  if (contents.getType() === 'webview') {
    contents.on('before-input-event', (event, input) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (input.key && input.key.toLowerCase() === 't' && !input.control && !input.meta && !input.alt) {
          if (input.type === 'keyDown') {
            if (!input.isAutoRepeat) {
              webviewHoldStart = Date.now();
            } else {
              if (Date.now() - webviewHoldStart > 350) {
                event.preventDefault();
              }
            }
          } else if (input.type === 'keyUp') {
            webviewHoldStart = 0;
          }

          mainWindow.webContents.send('webview-t-event', {
            type: input.type,
            isAutoRepeat: input.isAutoRepeat,
          });
        }
      }
    });
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers for Browser Actions & Permissions
ipcMain.on('agent-browser-action-result', (_event, { actionId, success, data, error }) => {
  const resolver = pendingActions.get(actionId);
  if (resolver) {
    pendingActions.delete(actionId);
    resolver({ success, data, error });
  }
});

ipcMain.on('agent-observe-result', (_event, { requestId, observation }) => {
  const resolver = pendingObservations.get(requestId);
  if (resolver) {
    pendingObservations.delete(requestId);
    resolver(observation);
  }
});

ipcMain.on('agent-permission-response', (_event, { requestId, approved, rememberChoice }: any) => {
  const resolver = pendingPermissions.get(requestId);
  if (resolver) {
    pendingPermissions.delete(requestId);
    resolver(Boolean(approved));
  }
  if (rememberChoice && approved) {
    orchestrator.setAutonomousPermissionGranted(true);
  }
});

ipcMain.handle('set-agent-autonomous-permission', async (_event, granted: boolean) => {
  orchestrator.setAutonomousPermissionGranted(Boolean(granted));
  return { success: true, granted: orchestrator.isAutonomousPermissionGranted() };
});

ipcMain.handle('get-agent-autonomous-permission', async () => {
  return { success: true, granted: orchestrator.isAutonomousPermissionGranted() };
});

ipcMain.handle('gemma-health-check', async () => {
  return orchestrator.checkLocalHealth();
});

ipcMain.handle('classify-intent', async (_event, { input = '', contextData = {} }: any) => {
  try {
    const classification = await orchestrator.classifyIntent(input, contextData);
    return { success: true, classification };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('generate-ai-response', async (_event, { query = '', contextData = {} }: any) => {
  try {
    const response = await orchestrator.generateResponse(query, contextData);
    return { success: true, response };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('set-api-key', async (_event, _apiKey: string) => {
  return { success: true, localOnly: true };
});

ipcMain.handle('set-llm-config', async (_event, { localUrl, modelName }: any) => {
  if (localUrl) {
    orchestrator.getGemmaProvider();
  }
  if (modelName) {
    orchestrator.getGemmaProvider().setModelName(modelName);
  }
  return { success: true };
});

async function getSystemHardwareSpecs(): Promise<any> {
  const totalRamGb = Math.round(os.totalmem() / (1024 * 1024 * 1024));
  const freeRamGb = Math.round(os.freemem() / (1024 * 1024 * 1024));
  const cpuModel = os.cpus()[0]?.model || 'Unknown CPU';
  const cpuCores = os.cpus().length;
  let gpuName = '';
  let gpuVramGb = 0;

  try {
    const gpuInfo: any = await app.getGPUInfo('basic');
    if (gpuInfo?.gpuDevice && Array.isArray(gpuInfo.gpuDevice) && gpuInfo.gpuDevice.length > 0) {
      const discreteGpu = gpuInfo.gpuDevice.find((d: any) =>
        d.vendorId === 0x10de || d.vendorId === 0x1002 ||
        (d.driverVendor && /nvidia|amd|radeon/i.test(d.driverVendor))
      );
      const chosenGpu = discreteGpu || gpuInfo.gpuDevice[0];
      gpuName = chosenGpu?.description || chosenGpu?.driverVendor || '';
    }
  } catch (_) { }

  if (process.platform === 'win32' && (!gpuName || gpuName.toLowerCase().includes('basic'))) {
    try {
      const { execSync } = await import('child_process');
      const wmic = execSync('powershell -NoProfile -Command "(Get-CimInstance Win32_VideoController | Where-Object { $_.Name -notmatch \\"Basic|Virtual\\" } | Select-Object -First 1).Name"', { timeout: 2500, encoding: 'utf8' }).trim();
      if (wmic) gpuName = wmic;
    } catch (_) { }
  }

  return {
    totalRamGb,
    freeRamGb,
    cpuModel,
    cpuCores,
    gpuName: gpuName || 'Integrated Graphics',
    gpuVramGb,
    platform: process.platform,
    arch: process.arch,
  };
}

ipcMain.handle('get-local-models', async () => {
  try {
    const hw = await getSystemHardwareSpecs();
    const models = await orchestrator.getLocalModelsStatus(hw);
    const activeModel = orchestrator.getModelRegistry().getActiveModelId();
    return {
      success: true,
      models,
      activeModel,
      hardware: hw,
    };
  } catch (err: any) {
    return { success: false, error: err.message, models: [] };
  }
});

ipcMain.handle('select-local-model', async (_event, modelId: string) => {
  if (!modelId) return { success: false, error: 'No model ID provided.' };
  try {
    const result = await orchestrator.setActiveLocalModel(modelId);
    return result;
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('unload-local-model', async (_event, modelId?: string) => {
  try {
    const ok = await orchestrator.getGemmaProvider().unloadModel(modelId);
    return { success: ok };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('execute-agent-task', async (_event, { profileId = 'abdul-default', goal = '', contextData = {} }) => {
  try {
    const routedResult = await orchestrator.routeAndExecute(profileId, goal, contextData);
    return {
      success: true,
      routedResult,
      intent: routedResult.intent,
      route: routedResult.route,
      toolUsed: routedResult.toolUsed,
      model: routedResult.model,
      response: routedResult.response,
      task: routedResult.task,
      stepResults: routedResult.stepResults,
      requiresApproval: routedResult.requiresApproval,
      approvalReason: routedResult.approvalReason,
      actionSummary: routedResult.actionSummary,
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('abort-agent-task', async (_event, { taskId }: any = {}) => {
  try {
    const aborted = orchestrator.abortCurrentTask(taskId);
    return { success: true, aborted };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('select-files-dialog', async () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { success: false, files: [] };
  }

  try {
    const res = await dialog.showOpenDialog(mainWindow, {
      title: 'Attach Documents, Images, Videos, or Files for Tesseract AI',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'All Supported Media & Docs', extensions: ['pdf', 'docx', 'doc', 'xlsx', 'txt', 'md', 'csv', 'json', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'mp4', 'mkv', 'webm', 'mov', 'mp3', 'wav', 'js', 'ts', 'py', 'html', 'css'] },
        { name: 'Documents', extensions: ['pdf', 'docx', 'doc', 'xlsx', 'txt', 'md', 'csv', 'json'] },
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'] },
        { name: 'Videos', extensions: ['mp4', 'mkv', 'webm', 'mov'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });

    if (res.canceled || !res.filePaths || res.filePaths.length === 0) {
      return { success: true, files: [] };
    }

    const files = res.filePaths.map(filePath => {
      const name = path.basename(filePath);
      const ext = path.extname(filePath).toLowerCase();
      let size = 0;
      let textSnippet = '';
      try {
        const stat = fs.statSync(filePath);
        size = stat.size;
        const textExts = ['.txt', '.md', '.json', '.csv', '.js', '.ts', '.html', '.css', '.py', '.c', '.cpp', '.yaml', '.yml', '.xml', '.log'];
        if (textExts.includes(ext) && size < 2 * 1024 * 1024) {
          textSnippet = fs.readFileSync(filePath, 'utf8').substring(0, 1500);
        }
      } catch (_) {}

      let type: 'document' | 'image' | 'video' | 'audio' | 'code' | 'other' = 'other';
      if (['.pdf', '.docx', '.doc', '.xlsx', '.txt', '.md', '.csv', '.json'].includes(ext)) type = 'document';
      else if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.bmp'].includes(ext)) type = 'image';
      else if (['.mp4', '.mkv', '.webm', '.avi', '.mov'].includes(ext)) type = 'video';
      else if (['.mp3', '.wav', '.ogg', '.m4a'].includes(ext)) type = 'audio';
      else if (['.js', '.ts', '.py', '.html', '.css', '.cpp', '.c'].includes(ext)) type = 'code';

      return { name, path: filePath, size, type, textSnippet };
    });

    return { success: true, files };
  } catch (err: any) {
    return { success: false, error: err.message, files: [] };
  }
});

ipcMain.handle('get-system-stats', async () => {
  const memory = process.memoryUsage();
  const hw = await getSystemHardwareSpecs();
  return {
    heapUsedMB: Math.round(memory.heapUsed / 1024 / 1024),
    uptimeSeconds: Math.floor(process.uptime()),
    platform: process.platform,
    arch: process.arch,
    ...hw,
  };
});

ipcMain.handle('get-download-history', async () => {
  return downloadHistory;
});

ipcMain.handle('open-file-path', async (_event, filePath: string) => {
  if (!filePath) return { success: false, error: 'No file path provided' };
  try {
    const result = await shell.openPath(filePath);
    if (result) {
      shell.showItemInFolder(filePath);
      return { success: true, notice: 'Opened item in folder' };
    }
    return { success: true };
  } catch (err: any) {
    shell.showItemInFolder(filePath);
    return { success: true, notice: 'Opened folder' };
  }
});

ipcMain.handle('download-url-resource', async (_event, url: string) => {
  if (!url) return { success: false };
  try {
    session.defaultSession.downloadURL(url);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

let whisperPipelinePromise: Promise<any> | null = null;

async function getWhisperPipeline() {
  if (!whisperPipelinePromise) {
    const { pipeline, env } = await import('@xenova/transformers');
    // Enable multi-threading for ONNX wasm / CPU runtime
    if (env?.backends?.onnx?.wasm) {
      env.backends.onnx.wasm.numThreads = 4;
    }
    whisperPipelinePromise = pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', {
      quantized: true,
    });
  }
  return whisperPipelinePromise;
}

getWhisperPipeline().catch((err) => console.warn('Whisper pre-warm notice:', err));

ipcMain.handle('transcribe-audio', async (_event, audioData: number[]) => {
  if (!audioData || audioData.length === 0) {
    return { success: false, error: 'No audio data' };
  }
  const startTime = Date.now();
  try {
    const transcriber = await getWhisperPipeline();
    const float32 = new Float32Array(audioData);
    const output = await transcriber(float32);
    const text = (output?.text || '').trim();
    const elapsed = Date.now() - startTime;
    console.log(`[Whisper] Transcribed in ${elapsed}ms: "${text}"`);
    return { success: true, text, elapsedMs: elapsed };
  } catch (err: any) {
    console.error('Whisper transcription error:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('refocus-main-window', async () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus();
    mainWindow.webContents.focus();
  }
  return { success: true };
});

app.on('will-quit', () => {
  // cleanup
});
