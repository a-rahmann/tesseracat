# TESSERACT — Cross-Platform Windows 11 Compatibility & Hardening Guide

This document establishes the architecture parity, platform-specific differences, and verification checklist for running TESSERACT on **Windows 11**.

> [!IMPORTANT]
> In accordance with our engineering invariants, **Windows support is not claimed as verified until physically executed on a Windows 11 runner**. This document defines the readiness implementation and test matrix.

---

## 1. Platform Parity Architecture

| Subsystem | macOS (Darwin arm64/x64) | Windows 11 (win32 x64/arm64) | TESSERACT Implementation Status |
| :--- | :--- | :--- | :--- |
| **Chromium Core** | Chromium 152 / Electron 44 | Chromium 152 / Electron 44 | **Parity**: Identical engine & WebPreferences |
| **Audio Input (Mic)** | CoreAudio (`getUserMedia`) | WASAPI / MediaFoundation (`getUserMedia`) | **Parity**: Standard W3C MediaDevices with 16kHz resampler |
| **Microphone Permissions** | macOS System Privacy (`TCC`) | Windows Settings Privacy (`ConsentStore`) | **Parity**: Handled via `session.setPermissionRequestHandler` in `main.ts` |
| **Speech-to-Text** | Local CPU ONNX (`whisper-tiny.en`) | Local CPU ONNX (`whisper-tiny.en`) | **Parity**: Transformers.js runs identically via Node.js / ONNX Runtime |
| **Text-to-Speech** | `WebSpeech` / macOS voices | `WebSpeech` / SAPI5 / Windows OneCore | **Parity**: WebSpeech API natively supported |
| **Keyboard Accelerators** | `Cmd` (`metaKey`) | `Ctrl` (`ctrlKey`) | **Parity**: Handled via `process.platform === 'darwin'` check |
| **File Persistence** | POSIX paths (`/Users/...`) | Win32 paths (`C:\Users\...`) | **Parity**: All paths resolved via `path.join()` |
| **Browser Viewport** | `<webview>` (Chromium render widget) | `<webview>` (DirectComposition render widget) | **Parity**: Both use Electron 44 webviewTag |

---

## 2. Windows 11 Specific Considerations

### 2.1 Audio Subsystem (WASAPI / MediaFoundation)
On Windows 11, background application audio throttling or exclusive-mode mic capture can cause dropped frames:
- In `main.ts`, `backgroundThrottling: false` is enabled on `mainWindow` to prevent audio capture drops when the browser window loses focus.
- In `audio-capture.ts`, `AudioContext` is instantiated with explicit sample rate:
  ```ts
  const ctx = new AudioContext({ sampleRate: 16000 });
  ```
- If running headless in Windows CI, a virtual audio driver (such as VB-Audio Cable or standard Windows Audio Service dummy sink) is required.

### 2.2 Native Keyboard Shortcuts
In `browser-window.html`:
- Shortcuts are dynamically mapped:
  ```ts
  const isMac = process.platform === 'darwin';
  const isCmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;
  ```
- AI drawer toggle: `Cmd+Shift+A` (macOS) / `Ctrl+Shift+A` (Windows).
- New tab: `Cmd+T` (macOS) / `Ctrl+T` (Windows).
- Close tab: `Cmd+W` (macOS) / `Ctrl+W` (Windows).

### 2.3 File System & Checkpointing
- Checkpoint database stored in `scratch/checkpoints/` is constructed using `path.join(process.cwd(), 'scratch', 'checkpoints')`.
- Safe against Windows reserved characters (`:`, `*`, `?`, `"`, `<`, `>`, `|`) in goal and thread names.

---

## 3. Windows 11 Verification Harness

To execute live validation on a Windows 11 machine or CI runner:

```cmd
:: 1. Install dependencies
npm install

:: 2. Compile TypeScript
npm run build:browser

:: 3. Launch Electron with complex hardening test flag
npx electron apps/desktop-browser --complex-hardening-test
```
