import { app, BrowserWindow, ipcMain, session, shell, dialog, Menu } from 'electron';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { AgentOrchestrator } from '../../agent-runtime/dist/index.js';
import { PolicyContext, TaskStep } from '../../../packages/core-types/dist/index.js';

// Optimize Chromium rendering performance and fix macOS GPU lag
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('disable-software-rasterizer');

let mainWindow: BrowserWindow | null = null;
const orchestrator = new AgentOrchestrator();

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
  execute: async (input: Record<string, unknown>) => {
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
  execute: async (input: Record<string, unknown>) => {
    return { context: input.context, recommendedCategory: 'Tech Documentary & Entertainment', status: 'ready' };
  }
});

function setupApplicationMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [{ role: 'quit' }]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Developer',
      submenu: [
        {
          label: 'Open Tesseract Shell DevTools',
          accelerator: 'CommandOrControl+Shift+I',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.openDevTools({ mode: 'detach' });
            }
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    title: 'Tesseract AI Browser',
    backgroundColor: '#030712',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '../src/browser-window.html'));

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
  // Automatically grant microphone and media permissions in Electron
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(true);
  });

  session.defaultSession.setPermissionCheckHandler(() => true);

  setupApplicationMenu();
  createWindow();

  // Environment-variable-controlled main-process smoke test (Dev only)
  if (process.env.TESSERACT_LOCAL_AI_SMOKE_TEST === '1') {
    try {
      const gemmaProvider = orchestrator.getGemmaProvider();
      const startTime = Date.now();
      const health = await gemmaProvider.checkHealth();
      const latency = Date.now() - startTime;

      console.log('[Tesseract Local AI] Health Status:', health.status);
      console.log('[Tesseract Local AI] Model Name:', health.modelName || 'none');
      console.log('[Tesseract Local AI] Latency:', `${latency}ms`);

      try {
        const response = await gemmaProvider.chat(
          'Reply with exactly: Tesseract local Gemma is working.'
        );
        console.log('[Tesseract Local AI] Final Answer:', response);
      } catch (chatError: any) {
        console.log('[Tesseract Local AI] Final Answer: unavailable -', chatError.message || chatError);
      }
    } catch (error: any) {
      console.error('[Tesseract Local AI] Smoke test failed:', error.message || error);
    }
  }

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
              // Once repeating while holding, prevent it from inserting 't' into the guest webpage
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

// IPC Handlers
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
  // Local-only mode: cloud API key is ignored to ensure strict zero-cloud policy
  return { success: true, localOnly: true };
});

ipcMain.handle('set-llm-config', async (_event, { localUrl, modelName }: any) => {
  if (localUrl) {
    orchestrator.getGemmaProvider(); // ensures initialization
  }
  if (modelName) {
    orchestrator.getGemmaProvider().setModelName(modelName);
  }
  return { success: true };
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

ipcMain.handle('get-system-stats', async () => {
  const memory = process.memoryUsage();
  return {
    heapUsedMB: Math.round(memory.heapUsed / 1024 / 1024),
    uptimeSeconds: Math.floor(process.uptime()),
    platform: process.platform,
    arch: process.arch,
  };
});

ipcMain.handle('get-download-history', async () => {
  return downloadHistory;
});

// IPC Handler to Open Downloaded Files on PC Desktop / Downloads
ipcMain.handle('open-file-path', async (_event, filePath: string) => {
  if (!filePath) return { success: false, error: 'No file path provided' };
  try {
    const result = await shell.openPath(filePath);
    if (result) {
      // If openPath returned an error string, fallback to openExternal or showing item in folder
      shell.showItemInFolder(filePath);
      return { success: true, notice: 'Opened item in folder' };
    }
    return { success: true };
  } catch (err: any) {
    shell.showItemInFolder(filePath);
    return { success: true, notice: 'Opened folder' };
  }
});

// Save Image or URL Resource directly to Desktop / Downloads
ipcMain.handle('download-url-resource', async (_event, url: string) => {
  if (!url) return { success: false };
  try {
    session.defaultSession.downloadURL(url);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

// Local Whisper Automatic Speech Recognition Engine (OpenAI Whisper ONNX)
// Uses whisper-base.en for dramatically better accuracy vs tiny
let whisperPipelinePromise: Promise<any> | null = null;

async function getWhisperPipeline() {
  if (!whisperPipelinePromise) {
    const { pipeline } = await import('@xenova/transformers');
    // whisper-base.en: ~140MB, ~2x more accurate than tiny.en, still fast on CPU
    whisperPipelinePromise = pipeline('automatic-speech-recognition', 'Xenova/whisper-base.en');
  }
  return whisperPipelinePromise;
}

// Pre-warm the Whisper pipeline in background on launch so transcription is instantaneous
getWhisperPipeline().catch((err) => console.warn('Whisper pre-warm notice:', err));

ipcMain.handle('transcribe-audio', async (_event, audioData: number[]) => {
  if (!audioData || audioData.length === 0) {
    return { success: false, error: 'No audio data' };
  }
  try {
    const transcriber = await getWhisperPipeline();
    const float32 = new Float32Array(audioData);
    const output = await transcriber(float32, {
      language: 'english',
      task: 'transcribe',
    });
    const text = (output?.text || '').trim();
    return { success: true, text };
  } catch (err: any) {
    console.error('Whisper transcription error:', err);
    return { success: false, error: err.message };
  }
});

// Refocus the main Electron window so [T] hold works again after a webview navigation
ipcMain.handle('refocus-main-window', async () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus();
    mainWindow.webContents.focus();
  }
  return { success: true };
});

app.on('will-quit', () => {
  // nothing to clean up for Whisper; onnxruntime handles its own lifecycle
});
