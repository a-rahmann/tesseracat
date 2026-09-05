"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
window.tesseractNative = {
    executeTask: (profileId, goal, contextData) => electron_1.ipcRenderer.invoke('execute-agent-task', { profileId, goal, contextData }),
    getSystemStats: () => electron_1.ipcRenderer.invoke('get-system-stats'),
    getDownloadHistory: () => electron_1.ipcRenderer.invoke('get-download-history'),
    openFilePath: (filePath) => electron_1.ipcRenderer.invoke('open-file-path', filePath),
    downloadUrlResource: (url) => electron_1.ipcRenderer.invoke('download-url-resource', url),
    whisperTranscribe: (audioData) => electron_1.ipcRenderer.invoke('whisper:transcribe', audioData),
    openDevTools: () => electron_1.ipcRenderer.invoke('open-devtools'),
    onDownload: (callback) => {
        electron_1.ipcRenderer.on('download-event', (_evt, data) => callback(data));
    }
};
//# sourceMappingURL=preload.js.map