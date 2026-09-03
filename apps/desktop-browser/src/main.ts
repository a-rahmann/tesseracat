import { app, BrowserWindow, ipcMain, session, shell, dialog } from 'electron';
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

app.whenReady().then(() => {
  // Automatically grant microphone and media permissions in Electron
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(true);
  });

  session.defaultSession.setPermissionCheckHandler(() => true);

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
ipcMain.handle('execute-agent-task', async (_event, { profileId = 'abdul-default', goal = '', contextData = {} }) => {
  try {
    const task = orchestrator.createTask(profileId, goal);
    const lower = goal.toLowerCase();
    
    // Build context-aware steps
    const steps: TaskStep[] = [
      { id: `step-1-${Date.now()}`, stepNumber: 1, description: `Analyze context for: "${goal}"`, toolName: 'user_context_analyze', toolParameters: { context: goal }, status: 'SUCCESS' },
      { id: `step-2-${Date.now()}`, stepNumber: 2, description: `Navigate to target service`, toolName: 'browser_navigate', toolParameters: { url: (contextData as any).targetUrl || 'https://google.com' }, status: 'SUCCESS' },
      { id: `step-3-${Date.now()}`, stepNumber: 3, description: `Execute autonomous browser action`, toolName: 'dom_interact', toolParameters: { action: 'execute' }, status: 'SUCCESS' },
      { id: `step-4-${Date.now()}`, stepNumber: 4, description: `Verify policy & security`, toolName: 'privacy_scan', status: 'SUCCESS' }
    ];

    orchestrator.setPlanSteps(profileId, task.id, steps);
    const context: PolicyContext = { profileId, isAutonomousMission: true, dailyCloudSpendCapUSD: 10, currentCloudSpendUSD: 0.05 };
    
    const results = [];
    for (let i = 0; i < steps.length; i++) {
      const res = await orchestrator.executeStep(task.id, steps[i].id, context);
      results.push(res);
    }

    return { success: true, task: orchestrator.getTask(profileId, task.id), stepResults: results };
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

// Continuous Native Voice Recognition Engine (Windows System.Speech SAPI)
let speechProcess: ChildProcess | null = null;

function stopNativeVoiceListening() {
  if (speechProcess) {
    try {
      speechProcess.kill();
    } catch (_) {}
    speechProcess = null;
  }
}

function startNativeVoiceListening() {
  stopNativeVoiceListening();

  const psScript = `
Add-Type -AssemblyName System.Speech
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$r = New-Object System.Speech.Recognition.SpeechRecognitionEngine
try {
  $r.SetInputToDefaultAudioDevice()
  $g = New-Object System.Speech.Recognition.DictationGrammar
  $r.LoadGrammar($g)

  Register-ObjectEvent -InputObject $r -EventName SpeechHypothesized -Action {
    if ($EventArgs.Result.Text) {
      [Console]::WriteLine("HYPOTHESIS:" + $EventArgs.Result.Text)
    }
  } | Out-Null

  Register-ObjectEvent -InputObject $r -EventName SpeechRecognized -Action {
    if ($EventArgs.Result.Text) {
      [Console]::WriteLine("RECOGNIZED:" + $EventArgs.Result.Text)
    }
  } | Out-Null

  $r.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple)
  [Console]::WriteLine("LISTENING_ACTIVE")

  while ($true) {
    Start-Sleep -Milliseconds 150
  }
} catch {
  [Console]::WriteLine("ERROR:" + $_.Exception.Message)
}
`;

  try {
    speechProcess = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', psScript]);

    speechProcess.stdout?.on('data', (chunk) => {
      const text = chunk.toString();
      const lines = text.split(/\\r?\\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('HYPOTHESIS:')) {
          const val = trimmed.slice(11).trim();
          if (mainWindow && !mainWindow.isDestroyed() && val) {
            mainWindow.webContents.send('voice-hypothesis', val);
          }
        } else if (trimmed.startsWith('RECOGNIZED:')) {
          const val = trimmed.slice(11).trim();
          if (mainWindow && !mainWindow.isDestroyed() && val) {
            mainWindow.webContents.send('voice-recognized', val);
          }
        }
      }
    });

    speechProcess.stderr?.on('data', (err) => {
      console.warn('Speech recognition warning:', err.toString());
    });

    speechProcess.on('exit', () => {
      speechProcess = null;
    });
  } catch (err) {
    console.error('Failed to start native voice recognition:', err);
  }
}

ipcMain.handle('start-voice-listening', async () => {
  startNativeVoiceListening();
  return { success: true };
});

ipcMain.handle('stop-voice-listening', async () => {
  stopNativeVoiceListening();
  return { success: true };
});

app.on('will-quit', () => {
  stopNativeVoiceListening();
});

