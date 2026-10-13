/**
 * Build Script: build-guide.mjs
 *
 * Compiles docs/user-guide/guide.html into docs/USER_GUIDE.pdf
 * using Electron's native printToPDF engine. Zero external dependencies.
 */

import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '..');
const htmlPath = path.join(rootDir, 'docs', 'user-guide', 'guide.html');
const outputPdfPath = path.join(rootDir, 'docs', 'USER_GUIDE.pdf');

app.whenReady().then(async () => {
  try {
    console.log('[UserGuide] Launching headless print engine...');
    const win = new BrowserWindow({
      show: false,
      width: 1200,
      height: 1600,
      webPreferences: {
        offscreen: true
      }
    });

    await win.loadFile(htmlPath);

    console.log('[UserGuide] Rendering pages to PDF...');
    const pdfBuffer = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'Letter',
      margins: {
        top: 0.4,
        bottom: 0.4,
        left: 0.4,
        right: 0.4
      },
      preferCSSPageSize: true
    });

    fs.mkdirSync(path.dirname(outputPdfPath), { recursive: true });
    fs.writeFileSync(outputPdfPath, pdfBuffer);

    const stats = fs.statSync(outputPdfPath);
    console.log(`[UserGuide] ✓ Successfully generated ${outputPdfPath} (${Math.round(stats.size / 1024)} KB)`);
    app.exit(0);
  } catch (err) {
    console.error('[UserGuide] ✕ PDF compilation failed:', err);
    app.exit(1);
  }
});
