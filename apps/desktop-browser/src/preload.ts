import { ipcRenderer } from 'electron';

(window as any).tesseractNative = {
  executeTask: (profileId: string, goal: string, contextData?: any) =>
    ipcRenderer.invoke('execute-agent-task', { profileId, goal, contextData }),
  getSystemStats: () => ipcRenderer.invoke('get-system-stats'),
  getDownloadHistory: () => ipcRenderer.invoke('get-download-history'),
  openFilePath: (filePath: string) => ipcRenderer.invoke('open-file-path', filePath),
  downloadUrlResource: (url: string) => ipcRenderer.invoke('download-url-resource', url),
  whisperTranscribe: (audioData: Float32Array | number[] | ArrayBuffer) => ipcRenderer.invoke('whisper:transcribe', audioData),
  openDevTools: () => ipcRenderer.invoke('open-devtools'),
  onDownload: (callback: (data: any) => void) => {
    ipcRenderer.on('download-event', (_evt, data) => callback(data));
  }
};
