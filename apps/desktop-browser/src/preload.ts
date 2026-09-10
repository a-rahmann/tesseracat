import { contextBridge, ipcRenderer } from 'electron';

const tesseractApi = {
  executeTask: (profileId: string, goal: string, contextData?: any) =>
    ipcRenderer.invoke('execute-agent-task', { profileId, goal, contextData }),
  getSystemStats: () => ipcRenderer.invoke('get-system-stats'),
  getDownloadHistory: () => ipcRenderer.invoke('get-download-history'),
  openFilePath: (filePath: string) => ipcRenderer.invoke('open-file-path', filePath),
  downloadUrlResource: (url: string) => ipcRenderer.invoke('download-url-resource', url),
  onDownload: (callback: (data: any) => void) => {
    ipcRenderer.on('download-event', (_evt, data) => callback(data));
  },
  onWebviewTEvent: (callback: (data: any) => void) => {
    ipcRenderer.on('webview-t-event', (_evt, data) => callback(data));
  },
  startVoiceListening: () => ipcRenderer.invoke('start-voice-listening'),
  stopVoiceListening: () => ipcRenderer.invoke('stop-voice-listening'),
  onVoiceHypothesis: (callback: (text: string) => void) => {
    ipcRenderer.on('voice-hypothesis', (_evt, text) => callback(text));
  },
  onVoiceRecognized: (callback: (text: string) => void) => {
    ipcRenderer.on('voice-recognized', (_evt, text) => callback(text));
  },
  transcribeAudio: (audioData: number[]) => ipcRenderer.invoke('transcribe-audio', audioData),
  refocusMainWindow: () => ipcRenderer.invoke('refocus-main-window'),
  setApiKey: (key: string) => ipcRenderer.invoke('set-api-key', key),
  setLlmConfig: (config: any) => ipcRenderer.invoke('set-llm-config', config),
  checkGemmaHealth: () => ipcRenderer.invoke('gemma-health-check'),
  getLocalModels: () => ipcRenderer.invoke('get-local-models'),
  selectLocalModel: (modelId: string) => ipcRenderer.invoke('select-local-model', modelId),
  unloadLocalModel: (modelId?: string) => ipcRenderer.invoke('unload-local-model', modelId),
  classifyIntent: (input: string, contextData?: any) => ipcRenderer.invoke('classify-intent', { input, contextData }),
  generateAiResponse: (query: string, contextData?: any) => ipcRenderer.invoke('generate-ai-response', { query, contextData }),

  // ── Agentic Browser Automation Bridge ──
  onBrowserAction: (callback: (data: { actionId: string; toolName: string; parameters: any }) => void) => {
    ipcRenderer.on('agent-browser-action', (_evt, data) => callback(data));
  },
  sendBrowserActionResult: (data: { actionId: string; success: boolean; data?: any; error?: string }) => {
    ipcRenderer.send('agent-browser-action-result', data);
  },
  onPageObservationRequest: (callback: (data: { requestId: string }) => void) => {
    ipcRenderer.on('agent-observe-request', (_evt, data) => callback(data));
  },
  sendPageObservation: (data: { requestId: string; observation: any }) => {
    ipcRenderer.send('agent-observe-result', data);
  },
  onAgentPermissionRequest: (callback: (request: any) => void) => {
    ipcRenderer.on('agent-permission-request', (_evt, req) => callback(req));
  },
  respondAgentPermission: (response: { requestId: string; approved: boolean; rememberChoice?: boolean }) => {
    ipcRenderer.send('agent-permission-response', response);
  },
  setAgentAutonomousPermission: (granted: boolean) =>
    ipcRenderer.invoke('set-agent-autonomous-permission', granted),
  getAgentAutonomousPermission: () =>
    ipcRenderer.invoke('get-agent-autonomous-permission'),
  abortTask: (taskId?: string) =>
    ipcRenderer.invoke('abort-agent-task', { taskId }),
  selectFiles: () =>
    ipcRenderer.invoke('select-files-dialog'),
  onAgentProgress: (callback: (data: any) => void) => {
    ipcRenderer.on('agent-progress-event', (_evt, data) => callback(data));
  },
  minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window-maximize'),
  closeWindow: () => ipcRenderer.invoke('window-close'),
  isWindowMaximized: () => ipcRenderer.invoke('window-is-maximized'),
};

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('tesseractNative', tesseractApi);
  contextBridge.exposeInMainWorld('tesseract', tesseractApi);
} else {
  (window as any).tesseractNative = tesseractApi;
  (window as any).tesseract = tesseractApi;
}
