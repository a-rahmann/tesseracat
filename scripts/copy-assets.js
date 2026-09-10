const fs = require('fs');
const path = require('path');

const srcHtml = path.join(__dirname, '../apps/desktop-browser/src/browser-window.html');
const distDir = path.join(__dirname, '../apps/desktop-browser/dist');
const distHtml = path.join(distDir, 'browser-window.html');

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

if (fs.existsSync(srcHtml)) {
  fs.copyFileSync(srcHtml, distHtml);
  console.log(`[copy-assets] Successfully copied browser-window.html to ${distHtml}`);
} else {
  console.warn(`[copy-assets] Warning: ${srcHtml} does not exist.`);
}
