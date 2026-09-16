/**
 * Digital Bestie — Main Process
 * Electron main process with IPC handlers for Ollama, memory, and window management
 */

import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, dialog, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { execFile } from 'node:child_process';
import started from 'electron-squirrel-startup';

// Services (ESM imports — bundled by Vite)
import { checkOllamaStatus, streamChat } from './services/ollama.js';
import {
  loadProfile, saveProfile, updateProfileField, deleteProfileField, getProfileSummary,
  loadConversation, saveConversation, appendMessage, getMessageWindow, clearConversation,
  loadConversationsStore, getConversationsSummary, getActiveConversation, switchActiveConversation,
  createConversation, renameConversation, deleteConversation, moveConversationToFolder, clearActiveConversation,
  createFolder, renameFolder, deleteFolder,
  loadSettings, saveSettings, updateSetting,
  exportProfile, importProfile,
  loadFeedback, addFeedbackItem, deleteFeedbackItem, updateFeedbackStatus
} from './services/memory.js';
import { buildSystemPrompt, getOnboardingPrompt, getExtractionPrompt } from './services/system-prompt.js';
import {
  loadSuperbrainData,
  syncResourceTracker,
  importNeonBrainBackup,
  detectResourceTrackerPath,
  addResourceItem,
  deleteResourceItem
} from './services/superbrain.js';
import { checkForUpdates } from './services/updater.js';

// Handle creating/removing shortcuts on Windows when installing/uninstalling
if (started) {
  app.quit();
}

let mainWindow = null;
let tray = null;
let activeAbortController = null;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: -100, y: -100 },
    transparent: false,
    backgroundColor: '#0a0a12',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    },
  });

  // Secure external navigation: intercept window.open and markdown links, open in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        shell.openExternal(url);
      }
    } catch {
      // Ignore malformed URLs
    }
    return { action: 'deny' };
  });

  // Block in-app window navigation to untrusted external URLs
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const devUrl = typeof MAIN_WINDOW_VITE_DEV_SERVER_URL !== 'undefined' ? MAIN_WINDOW_VITE_DEV_SERVER_URL : null;
    if (devUrl && navigationUrl.startsWith(devUrl)) {
      return;
    }
    if (!devUrl && navigationUrl.startsWith('file://')) {
      return;
    }
    event.preventDefault();
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  // Minimize to tray instead of closing
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
};

function createTray() {
  // Create a simple 16x16 tray icon
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show Digital Bestie', click: () => mainWindow?.show() },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } }
  ]);
  
  tray.setToolTip('Digital Bestie');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => mainWindow?.show());
}

// ============================================================
// IPC HANDLERS
// ============================================================

function registerIPC() {
  // --- Window Controls ---
  ipcMain.on('window:minimize', () => mainWindow?.minimize());
  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });
  ipcMain.on('window:close', () => mainWindow?.close());

  // --- Ollama ---
  ipcMain.handle('ollama:status', async () => {
    const settings = loadSettings();
    return checkOllamaStatus(settings.model_name || 'bestie-light');
  });

  ipcMain.handle('ollama:chat', async (event, { message, activeModule }) => {
    // Cancel any in-progress generation
    if (activeAbortController) {
      activeAbortController.abort();
    }
    activeAbortController = new AbortController();

    // Save user message
    appendMessage('user', message);

    // Build system prompt with current profile state
    const systemPrompt = buildSystemPrompt(activeModule);

    // Get windowed message history and model settings
    const settings = loadSettings();
    const messages = getMessageWindow(settings.context_window || 50);
    const modelToUse = settings.model_name || 'bestie-light';
    const numCtxToUse = settings.num_ctx || 8192;

    return new Promise((resolve, reject) => {
      streamChat(
        systemPrompt,
        messages,
        // onToken
        (token) => {
          mainWindow?.webContents.send('ollama:token', token);
        },
        // onDone
        (result) => {
          activeAbortController = null;
          if (!result.aborted && result.fullResponse) {
            appendMessage('assistant', result.fullResponse);
          }
          mainWindow?.webContents.send('ollama:done', result);
          resolve(result);
        },
        // onError
        (error) => {
          activeAbortController = null;
          mainWindow?.webContents.send('ollama:error', error.message);
          reject(error);
        },
        activeAbortController.signal,
        {
          model: modelToUse,
          num_ctx: numCtxToUse
        }
      );
    });
  });

  ipcMain.on('ollama:abort', () => {
    if (activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
    }
  });

  // --- Onboarding Extraction ---
  ipcMain.handle('ollama:extract', async (event, { phase, userResponse }) => {
    const extractionPrompt = getExtractionPrompt(phase, userResponse);
    const abortCtrl = new AbortController();
    const timeout = setTimeout(() => abortCtrl.abort(), 15000); // 15s max for extraction
    const settings = loadSettings();
    const modelToUse = settings.model_name || 'bestie-light';
    
    return new Promise((resolve) => {
      streamChat(
        'You are a JSON extraction assistant. Return ONLY valid JSON with no markdown formatting or commentary.',
        [{ role: 'user', content: extractionPrompt }],
        () => {}, // ignore tokens
        (result) => {
          clearTimeout(timeout);
          try {
            const cleaned = (result.fullResponse || '').replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const data = JSON.parse(cleaned);
            resolve(data);
          } catch (e) {
            resolve({ raw: result.fullResponse, parseError: true });
          }
        },
        (error) => {
          clearTimeout(timeout);
          console.warn('Extraction fallback:', error?.message || error);
          resolve({ error: error?.message || 'timeout', raw: userResponse });
        },
        abortCtrl.signal,
        {
          model: modelToUse,
          num_ctx: 2048
        }
      );
    });
  });

  // --- Memory ---
  ipcMain.handle('memory:getProfile', () => loadProfile());
  ipcMain.handle('memory:saveProfile', (event, profile) => {
    saveProfile(profile);
    return true;
  });
  ipcMain.handle('memory:updateField', (event, { path: dotPath, value, action = 'set' }) => {
    return updateProfileField(dotPath, value, action);
  });
  ipcMain.handle('memory:deleteField', (event, { path: dotPath }) => {
    return deleteProfileField(dotPath);
  });
  ipcMain.handle('memory:getProfileSummary', () => getProfileSummary());

  // --- Multi-Conversation & Folders ---
  ipcMain.handle('conversation:load', () => getActiveConversation());
  ipcMain.handle('conversation:list', () => getConversationsSummary());
  ipcMain.handle('conversation:getActive', () => getActiveConversation());
  ipcMain.handle('conversation:switch', (event, id) => switchActiveConversation(id));
  ipcMain.handle('conversation:create', (event, payload) => createConversation(payload || {}));
  ipcMain.handle('conversation:rename', (event, { id, title }) => renameConversation(id, title));
  ipcMain.handle('conversation:delete', (event, id) => deleteConversation(id));
  ipcMain.handle('conversation:moveToFolder', (event, { id, folderId }) => moveConversationToFolder(id, folderId));
  ipcMain.handle('conversation:clear', () => {
    clearActiveConversation();
    return true;
  });

  // --- Folder Management ---
  ipcMain.handle('folder:create', (event, payload) => createFolder(payload || {}));
  ipcMain.handle('folder:rename', (event, { id, name, icon }) => renameFolder(id, name, icon));
  ipcMain.handle('folder:delete', (event, id) => deleteFolder(id));

  // --- Settings ---
  ipcMain.handle('settings:load', () => loadSettings());
  ipcMain.handle('settings:save', (event, settings) => {
    saveSettings(settings);
    return true;
  });
  ipcMain.handle('settings:update', (event, { key, value }) => {
    return updateSetting(key, value);
  });

  // --- Export / Import ---
  ipcMain.handle('data:export', async () => {
    const data = exportProfile();
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Digital Bestie Data',
      defaultPath: `digital-bestie-backup-${new Date().toISOString().split('T')[0]}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (!result.canceled && result.filePath) {
      fs.writeFileSync(result.filePath, JSON.stringify(data, null, 2));
      return { success: true, path: result.filePath };
    }
    return { success: false };
  });

  ipcMain.handle('data:import', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Import Digital Bestie Data',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile']
    });
    if (!result.canceled && result.filePaths.length) {
      const raw = fs.readFileSync(result.filePaths[0], 'utf-8');
      const data = JSON.parse(raw);
      importProfile(data);
      return { success: true };
    }
    return { success: false };
  });

  // --- Onboarding Prompts ---
  ipcMain.handle('onboarding:getPrompt', (event, phase) => {
    return getOnboardingPrompt(phase);
  });

  // --- Feedback & Bug Logging ---
  ipcMain.handle('feedback:load', () => loadFeedback());
  ipcMain.handle('feedback:add', (event, item) => addFeedbackItem(item));
  ipcMain.handle('feedback:delete', (event, id) => deleteFeedbackItem(id));
  ipcMain.handle('feedback:updateStatus', (event, { id, status }) => updateFeedbackStatus(id, status));

  ipcMain.handle('feedback:getDiagnostics', async () => {
    const ollamaStatus = await checkOllamaStatus();
    return {
      appName: 'Digital Bestie',
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome,
      nodeVersion: process.versions.node,
      os: `${os.type()} ${os.release()} (${os.arch()})`,
      totalMemory: `${Math.round(os.totalmem() / (1024 * 1024 * 1024))} GB`,
      freeMemory: `${Math.round(os.freemem() / (1024 * 1024 * 1024))} GB`,
      uptime: `${Math.round(os.uptime() / 3600)} hours`,
      ollama: ollamaStatus,
      timestamp: new Date().toISOString()
    };
  });

  ipcMain.handle('feedback:createGithubIssue', async (event, { title, body, labels }) => {
    return new Promise((resolve) => {
      // First try using GitHub CLI
      const args = ['issue', 'create', '--repo', 'hawkeyeip/digital-bestie', '--title', title, '--body', body];
      if (labels && labels.length) {
        args.push('--label', labels.join(','));
      }

      execFile('gh', args, (err, stdout, stderr) => {
        if (!err && stdout) {
          resolve({ success: true, url: stdout.trim() });
        } else {
          // Fallback: open GitHub new issue URL in user default browser
          const encodedTitle = encodeURIComponent(title);
          const encodedBody = encodeURIComponent(body);
          const issueUrl = `https://github.com/hawkeyeip/digital-bestie/issues/new?title=${encodedTitle}&body=${encodedBody}`;
          shell.openExternal(issueUrl);
          resolve({ success: true, url: issueUrl, fallbackBrowser: true });
        }
      });
    });
  });

  // --- Superbrain Bridge (Resource Tracker & Neon Brain) ---
  ipcMain.handle('superbrain:getData', () => loadSuperbrainData());
  ipcMain.handle('superbrain:detectPath', () => detectResourceTrackerPath());
  ipcMain.handle('superbrain:syncResourceTracker', async (event, customPathOrUrl) => {
    return syncResourceTracker(customPathOrUrl);
  });
  ipcMain.handle('superbrain:addResource', async (event, item) => {
    return addResourceItem(item);
  });
  ipcMain.handle('superbrain:deleteResource', async (event, id) => {
    return deleteResourceItem(id);
  });

  ipcMain.handle('superbrain:importNeonBrainDialog', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Import Neon Brain Backup',
      filters: [{ name: 'JSON Backup', extensions: ['json'] }],
      properties: ['openFile']
    });
    if (!result.canceled && result.filePaths.length) {
      const filePath = result.filePaths[0];
      return importNeonBrainBackup(filePath);
    }
    return { canceled: true };
  });

  ipcMain.handle('superbrain:exportToNeonBrainDialog', async (event, payload) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export for Neon Brain Import',
      defaultPath: `neon-brain-sync-${new Date().toISOString().split('T')[0]}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (!result.canceled && result.filePath) {
      fs.writeFileSync(result.filePath, JSON.stringify(payload, null, 2));
      return { success: true, path: result.filePath };
    }
    return { canceled: true };
  });

  // --- Auto-Updater ---
  ipcMain.handle('updater:check', async () => {
    return checkForUpdates(app.getVersion());
  });

  ipcMain.handle('updater:getVersion', () => {
    return app.getVersion();
  });

  ipcMain.handle('updater:openRelease', async (event, releaseUrl) => {
    if (releaseUrl) {
      try {
        const parsed = new URL(releaseUrl);
        if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
          shell.openExternal(releaseUrl);
          return { success: true };
        }
      } catch {
        // invalid url
      }
    }
    return { success: false, error: 'Invalid URL' };
  });
}

// ============================================================
// APP LIFECYCLE
// ============================================================

app.whenReady().then(() => {
  registerIPC();
  createWindow();
  createTray();

  // Background update check after app initialization
  setTimeout(async () => {
    try {
      const update = await checkForUpdates(app.getVersion());
      if (update && update.updateAvailable && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('updater:available', update);
      }
    } catch {
      // Silent catch for background update check
    }
  }, 5000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      mainWindow?.show();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
});
