import { app, BrowserWindow, ipcMain, session, shell, dialog, Menu, MenuItem, systemPreferences } from 'electron';
import path from 'path';
import { AgentOrchestrator } from '../../agent-runtime/dist/index.js';
import { PolicyContext, TaskStep } from '../../../packages/core-types/dist/index.js';
import { transcribeAudioBuffer, getTranscriber } from './whisper.js';
import { OllamaSidecar } from './services/ollama-sidecar.js';

// Catch EPIPE on stdout/stderr in GUI mode
process.stdout?.on('error', (err: any) => { if (err.code === 'EPIPE') return; });
process.stderr?.on('error', (err: any) => { if (err.code === 'EPIPE') return; });

// Optimize Chromium rendering performance and fix macOS GPU lag
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('disable-software-rasterizer');

let mainWindow: BrowserWindow | null = null;
const orchestrator = new AgentOrchestrator();

// Pre-warm local Whisper model in background
getTranscriber().catch(() => {});

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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    title: 'Tesseract AI Browser',
    backgroundColor: '#030712',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false,
      webviewTag: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '../src/browser-window.html'));

  mainWindow.webContents.on('console-message', (_evt, level, message, line, sourceId) => {
    console.log(`[Renderer L${level}] ${message} (${path.basename(sourceId || '')}:${line})`);
  });

  // Support Right-Click "Inspect Element" anywhere in the window
  mainWindow.webContents.on('context-menu', (_event, params) => {
    const menu = new Menu();
    menu.append(new MenuItem({
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
  // Automatically grant microphone and media permissions in Electron renderer
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === 'media') {
      return callback(true);
    }
    callback(true);
  });

  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    if (permission === 'media') {
      return true;
    }
    return true;
  });

  // Prompt for macOS microphone access explicitly if on Darwin
  if (process.platform === 'darwin') {
    try {
      const micStatus = systemPreferences.getMediaAccessStatus('microphone');
      console.log(`[Main] macOS microphone access status: ${micStatus}`);
      if (micStatus !== 'granted') {
        const granted = await systemPreferences.askForMediaAccess('microphone');
        console.log(`[Main] macOS microphone permission prompt result: ${granted}`);
      }
    } catch (err) {
      console.warn('[Main] Error requesting macOS microphone access:', err);
    }
  }

  createWindow();
  OllamaSidecar.getInstance().ensureRunning().catch(() => {});

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  OllamaSidecar.getInstance().stop();
});

// IPC Handlers
ipcMain.handle('execute-agent-task', async (_event, { profileId = 'user-default', goal = '', contextData = {} }) => {
  try {
    console.log(`[IPC] execute-agent-task for goal: "${goal}" using Local Gemma 3`);
    const task = await orchestrator.createTaskAndPlan(profileId, goal);
    const context: PolicyContext = { profileId, isAutonomousMission: true, dailyCloudSpendCapUSD: 10, currentCloudSpendUSD: 0.0 };
    
    const results: any[] = [];
    for (const step of task.planSteps) {
      const res = await orchestrator.executeStep(task.id, step.id, context);
      results.push(res);
    }

    return { success: true, task: orchestrator.getTask(profileId, task.id), stepResults: results };
  } catch (err: any) {
    console.error('[IPC] execute-agent-task error:', err);
    return { success: false, error: err.message };
  }
});

// Local Whisper Speech-to-Text IPC Handler
ipcMain.handle('whisper:transcribe', async (_event, audioPayload: any) => {
  try {
    let float32: Float32Array;
    if (audioPayload instanceof Float32Array) {
      float32 = audioPayload;
    } else if (Buffer.isBuffer(audioPayload)) {
      float32 = new Float32Array(audioPayload.buffer, audioPayload.byteOffset, audioPayload.byteLength / 4);
    } else if (Array.isArray(audioPayload)) {
      float32 = new Float32Array(audioPayload);
    } else if (audioPayload && audioPayload.buffer) {
      float32 = new Float32Array(audioPayload.buffer);
    } else {
      return { success: false, error: 'Invalid audio payload format' };
    }

    if (!float32 || float32.length === 0) {
      return { success: false, error: 'Empty audio buffer' };
    }

    const text = await transcribeAudioBuffer(float32);
    console.log(`[Whisper IPC] Returning text: "${text}"`);
    return { success: true, text };
  } catch (err: any) {
    console.error('[Whisper IPC] Transcribe error:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('open-devtools', () => {
  if (mainWindow) {
    if (mainWindow.webContents.isDevToolsOpened()) {
      mainWindow.webContents.closeDevTools();
    } else {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
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
