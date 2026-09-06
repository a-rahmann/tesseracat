import { app, BrowserWindow } from 'electron';

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
    }
  });

  win.loadURL('data:text/html,<html><body><h1>Testing Fetch</h1></body></html>');

  win.webContents.on('did-finish-load', async () => {
    try {
      const result = await win.webContents.executeJavaScript(`
        (async () => {
          const resObj = {};
          // 1. Browser fetch with webSecurity: false
          try {
            const res = await fetch('http://localhost:11434/api/tags');
            const data = await res.json();
            resObj.browserFetch = { success: true, count: data.models?.length };
          } catch (err) {
            resObj.browserFetch = { success: false, name: err?.name, message: err?.message };
          }

          // 2. Node http via require('http')
          try {
            const http = require('http');
            const nodeData = await new Promise((resolve, reject) => {
              http.get('http://127.0.0.1:11434/api/tags', (res) => {
                let d = '';
                res.on('data', c => d += c);
                res.on('end', () => resolve(JSON.parse(d)));
              }).on('error', reject);
            });
            resObj.nodeHttp = { success: true, count: nodeData.models?.length };
          } catch (err) {
            resObj.nodeHttp = { success: false, name: err?.name, message: err?.message };
          }

          return resObj;
        })()
      `);
      console.log('RENDERER TEST RESULT WITH WEBSECURITY FALSE:', JSON.stringify(result, null, 2));
    } catch (e) {
      console.error('EXECUTE JS ERROR:', e);
    } finally {
      app.quit();
    }
  });
});
