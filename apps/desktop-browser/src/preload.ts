import { ipcRenderer } from 'electron';

(window as any).tesseractNative = {
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
  refocusMainWindow: () => ipcRenderer.invoke('refocus-main-window')
};
