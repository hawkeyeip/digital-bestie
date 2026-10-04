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
import {
  checkOllamaStatus,
  streamChat,
  pullOllamaModel,
  createOllamaModel,
  restoreBestieModel,
  infuseBaseModel,
  getCuratedCatalogWithStatus,
  upgradeAndInfuseModel,
  resolveSpecialistModel
} from './services/ollama.js';
import {
  loadProfile, saveProfile, updateProfileField, deleteProfileField, getProfileSummary,
  loadConversation, saveConversation, appendMessage, getMessageWindow, clearConversation,
  loadConversationsStore, getConversationsSummary, getActiveConversation, switchActiveConversation,
  createConversation, renameConversation, deleteConversation, moveConversationToFolder, clearActiveConversation,
  createFolder, renameFolder, deleteFolder,
  loadSettings, saveSettings, updateSetting,
  exportProfile, importProfile,
  loadFeedback, addFeedbackItem, deleteFeedbackItem, updateFeedbackStatus,
  loadPromptsVault, savePromptsVault, addPrompt, updatePrompt, deletePrompt, togglePromptFavorite,
  loadCredentialsVault, saveCredentialsVault, addCredential, updateCredential, deleteCredential, toggleCredentialHighlight
} from './services/memory.js';
import { buildSystemPrompt, getOnboardingPrompt, getExtractionPrompt } from './services/system-prompt.js';
import {
  loadSuperbrainData,
  syncResourceTracker,
  importNeonBrainBackup,
  detectResourceTrackerPath,
  addResourceItem,
  deleteResourceItem,
  addNeonBrainItem,
  deleteNeonBrainItem,
  toggleNeonBrainTask
} from './services/superbrain.js';
import { checkForUpdates } from './services/updater.js';
import {
  searchMemory,
  indexMemoryItem,
  getMemoryStats,
  getRagPromptSnippet
} from './services/rag.js';
import {
  processIngestionPayload,
  getIngestionStats,
  startWebhookServer
} from './services/ingestion.js';
import {
  getTelemetrySummary,
  clearTelemetry
} from './services/telemetry.js';
import {
  requestExecution,
  getPendingApprovals,
  approveExecution,
  rejectExecution,
  getExecutionAuditLog
} from './services/execution-node.js';
import {
  getSchedule,
  autoScheduleBacklog,
  shiftUnfinishedTasks,
  checkInterruptionThreats,
  getActiveDefenseStatus
} from './services/time-defense.js';
import {
  getTieredPromptContext,
  addSprintItem,
  addWorkingMemoryItem,
  clearWorkingMemory,
  recordAndEvaluateDrift,
  getDriftSummary
} from './services/layered-memory.js';
import {
  evaluateOutput,
  repairOutput,
  sanitizePayloadForExternalAPI,
  encryptZDRLocal,
  decryptZDRLocal
} from './services/output-governance.js';
import {
  synthesizeMetaprompt,
  evaluatePromptEfficacy,
  CURATED_METAPROMPT_TEMPLATES,
  TARGET_MODELS,
  EXECUTION_ARCHETYPES
} from './services/metaprompt.js';
import {
  loadTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
  getTaskStats,
  reorderTasks,
  syncTaskflowToNeonBrain,
  getWearTasks,
  toggleWearTask,
  quickAddWearTask,
  getWearTileData
} from './services/taskflow.js';

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
      sandbox: true,
      backgroundThrottling: true
    },
  });

  // Power efficiency: notify renderer when window is backgrounded/restored to pause heavy animations and polling
  mainWindow.on('minimize', () => {
    mainWindow?.webContents.send('app:background-state', { isBackground: true });
  });
  mainWindow.on('restore', () => {
    mainWindow?.webContents.send('app:background-state', { isBackground: false });
  });
  mainWindow.on('hide', () => {
    mainWindow?.webContents.send('app:background-state', { isBackground: true });
  });
  mainWindow.on('show', () => {
    mainWindow?.webContents.send('app:background-state', { isBackground: false });
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

function updateTrayGlanceable() {
  if (!tray) return;
  try {
    const defense = getActiveDefenseStatus();
    const drift = getDriftSummary();
    const pending = getPendingApprovals();
    
    let statusText = '🟢 Bestie Idle';
    if (pending && pending.length > 0) {
      statusText = `🟡 ${pending.length} HITL Pending`;
    } else if (defense.isInFocusBlock) {
      statusText = `⚡ Focus (${defense.remainingMinutes}m)`;
    } else if (defense.isInBuffer) {
      statusText = `🛡️ Buffer (${defense.remainingMinutes}m)`;
    }

    if (process.platform === 'darwin') {
      tray.setTitle(` ${statusText}`);
    }
    tray.setToolTip(`Digital Bestie | Status: ${statusText} | Drift: ${drift.current_drift_score.toFixed(2)}`);

    const contextMenu = Menu.buildFromTemplate([
      { label: `Status: ${statusText}`, enabled: false },
      { label: `Focus: ${defense.activeBlockTitle}`, enabled: false },
      { label: `Drift Score: ${drift.current_drift_score.toFixed(2)} (${drift.status})`, enabled: false },
      { label: `Pending HITL: ${pending.length} item(s)`, enabled: false },
      { type: 'separator' },
      {
        label: '🎙️ Quick Voice / Thought Dictation...',
        click: () => {
          mainWindow?.show();
          mainWindow?.webContents.send('ambient:quickCapture');
        }
      },
      {
        label: '🛡️ Defend Current Focus Block',
        click: () => {
          autoScheduleBacklog();
          updateTrayGlanceable();
        }
      },
      { type: 'separator' },
      { label: 'Open Digital Bestie', click: () => mainWindow?.show() },
      { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } }
    ]);
    tray.setContextMenu(contextMenu);
  } catch (err) {
    console.warn('[Tray] Glanceable update error:', err.message);
  }
}

function createTray() {
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('Digital Bestie — Initializing');
  tray.on('click', () => mainWindow?.show());
  updateTrayGlanceable();

  // Periodic glanceable status refresh every 60 seconds
  setInterval(updateTrayGlanceable, 60000);
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

  ipcMain.handle('ollama:health', async () => {
    const settings = loadSettings();
    return checkOllamaStatus(settings.model_name || 'bestie-light');
  });

  ipcMain.handle('ollama:pull', async (_event, modelName) => {
    return pullOllamaModel(modelName);
  });

  ipcMain.handle('ollama:restoreModel', async (_event, variant) => {
    return restoreBestieModel(variant);
  });

  ipcMain.handle('ollama:infuseModel', async (_event, { baseModel, targetName, options }) => {
    return infuseBaseModel(baseModel, targetName, options);
  });

  ipcMain.handle('ollama:getCatalog', async () => {
    const settings = loadSettings();
    return getCuratedCatalogWithStatus(settings.model_name || 'bestie-abliterated');
  });

  ipcMain.handle('ollama:upgradeModel', async (_event, targetTag) => {
    try {
      const res = await upgradeAndInfuseModel(targetTag);
      const settings = loadSettings();
      settings.model_name = 'bestie';
      saveSettings(settings);
      return { success: true, model: 'bestie', targetBase: targetTag, infuseResult: res };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('ollama:chat', async (event, { message, activeModule }) => {
    // Cancel any in-progress generation
    if (activeAbortController) {
      activeAbortController.abort();
    }
    activeAbortController = new AbortController();

    // Save user message
    appendMessage('user', message);

    // Build system prompt with current profile state & autonomous RAG retrieval
    let systemPrompt = buildSystemPrompt(activeModule);
    try {
      const ragSnippet = await getRagPromptSnippet(message);
      if (ragSnippet) {
        systemPrompt += ragSnippet;
      }
    } catch (ragErr) {
      console.warn('[RAG] Pre-flight context injection skipped:', ragErr.message);
    }

    // Inject Layered Memory Architecture (Tier 1 Durable, Tier 2 Sprint, Tier 3 Working)
    try {
      const layeredSnippet = getTieredPromptContext();
      if (layeredSnippet) {
        systemPrompt += '\n\n' + layeredSnippet;
      }
    } catch (layerErr) {
      console.warn('[LayeredMemory] Context injection skipped:', layerErr.message);
    }

    // Get windowed message history and model settings
    const settings = loadSettings();
    const messages = getMessageWindow(settings.context_window || 50);

    // Self-healing model resolution: verify model is present or fallback to active installed alternative
    const status = await checkOllamaStatus(settings.model_name || 'bestie-light');
    const modelToUse = status.activeModel || settings.model_name || 'bestie-light';
    const numCtxToUse = settings.power_saver ? Math.min(settings.num_ctx || 4096, 4096) : (settings.num_ctx || 8192);
    const keepAliveToUse = settings.power_saver ? '1m' : (settings.ollama_keep_alive || '5m');

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
            // Output Governance: Evaluate output against quality matrix & policy
            let finalResponse = result.fullResponse;
            try {
              const evalRes = evaluateOutput({ candidateOutput: result.fullResponse, userPrompt: message });
              if (!evalRes.passed) {
                finalResponse = repairOutput(result.fullResponse);
              }
            } catch (govErr) {
              console.warn('[Governance] Evaluation error:', govErr.message);
            }

            appendMessage('assistant', finalResponse);

            // Telemetry: Continuous persona and drift evaluation
            try {
              recordAndEvaluateDrift({ responseText: finalResponse });
              updateTrayGlanceable();
            } catch (_) {}
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
          num_ctx: numCtxToUse,
          keep_alive: keepAliveToUse
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

  // --- Specialist Model Resolution (Bicameral Scaffold) ---
  ipcMain.handle('ollama:resolveSpecialist', async () => {
    const settings = loadSettings();
    let modelsList = [];
    try {
      const status = await checkOllamaStatus(settings.model_name || 'bestie-abliterated');
      modelsList = status.models || [];
    } catch (_) {}
    return resolveSpecialistModel(
      settings.specialist_model_name || 'auto',
      modelsList,
      settings.model_name || 'bestie-abliterated',
      settings.bicameral_routing_enabled !== false
    );
  });

  // --- Onboarding Extraction ---
  ipcMain.handle('ollama:extract', async (event, { phase, userResponse }) => {
    const extractionPrompt = getExtractionPrompt(phase, userResponse);
    const abortCtrl = new AbortController();
    const timeout = setTimeout(() => abortCtrl.abort(), 15000); // 15s max for extraction
    const settings = loadSettings();

    let modelsList = [];
    try {
      const status = await checkOllamaStatus(settings.model_name || 'bestie-abliterated');
      modelsList = status.models || [];
    } catch (_) {}

    const specialistInfo = resolveSpecialistModel(
      settings.specialist_model_name || 'auto',
      modelsList,
      settings.model_name || 'bestie-light',
      settings.bicameral_routing_enabled !== false
    );
    const modelToUse = specialistInfo.modelName;
    console.log(`[Bicameral Scaffold] Extraction routed to specialist: ${modelToUse} (${specialistInfo.reason})`);
    
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

  // --- Prompts Vault & Directives ---
  ipcMain.handle('prompts:load', () => loadPromptsVault());
  ipcMain.handle('prompts:save', (event, data) => savePromptsVault(data));
  ipcMain.handle('prompts:add', (event, prompt) => addPrompt(prompt));
  ipcMain.handle('prompts:update', (event, { id, updates }) => updatePrompt(id, updates));
  ipcMain.handle('prompts:delete', (event, id) => deletePrompt(id));
  ipcMain.handle('prompts:toggleFavorite', (event, { id, favorite, reason }) => togglePromptFavorite(id, favorite, reason));

  // --- Credentials, Certificates & Merit Vault ---
  ipcMain.handle('credentials:load', () => loadCredentialsVault());
  ipcMain.handle('credentials:save', (event, data) => saveCredentialsVault(data));
  ipcMain.handle('credentials:add', (event, cred) => addCredential(cred));
  ipcMain.handle('credentials:update', (event, { id, updates }) => updateCredential(id, updates));
  ipcMain.handle('credentials:delete', (event, id) => deleteCredential(id));
  ipcMain.handle('credentials:toggleHighlight', (event, id) => toggleCredentialHighlight(id));

  // --- Neon Brain Direct Bank Management ---
  ipcMain.handle('superbrain:addNeonBrainItem', async (event, { itemType, itemData }) => {
    return addNeonBrainItem(itemType, itemData);
  });
  ipcMain.handle('superbrain:deleteNeonBrainItem', async (event, { itemType, itemId }) => {
    return deleteNeonBrainItem(itemType, itemId);
  });
  ipcMain.handle('superbrain:toggleNeonBrainTask', async (event, taskId) => {
    return toggleNeonBrainTask(taskId);
  });

  // --- System Diagnostics & Memory Efficiency ---
  ipcMain.handle('system:getMemoryUsage', () => {
    const mem = process.memoryUsage();
    return {
      heapUsedMB: Math.round((mem.heapUsed / 1024 / 1024) * 10) / 10,
      heapTotalMB: Math.round((mem.heapTotal / 1024 / 1024) * 10) / 10,
      rssMB: Math.round((mem.rss / 1024 / 1024) * 10) / 10,
      externalMB: Math.round((mem.external / 1024 / 1024) * 10) / 10,
      systemFreeMB: Math.round((os.freemem() / 1024 / 1024) * 10) / 10,
      systemTotalMB: Math.round((os.totalmem() / 1024 / 1024) * 10) / 10
    };
  });

  ipcMain.handle('system:clearMemoryCache', async () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.clearHistory();
      await mainWindow.webContents.session.clearCache();
    }
    if (typeof global.gc === 'function') {
      global.gc();
    }
    return true;
  });

  // --- TaskFlow Kanban Task Manager ---
  ipcMain.handle('taskflow:loadTasks', async (_event, filters) => {
    return loadTasks(filters);
  });
  ipcMain.handle('taskflow:getTaskById', async (_event, id) => {
    return getTaskById(id);
  });
  ipcMain.handle('taskflow:createTask', async (_event, data) => {
    return createTask(data);
  });
  ipcMain.handle('taskflow:updateTask', async (_event, { id, updates }) => {
    return updateTask(id, updates);
  });
  ipcMain.handle('taskflow:deleteTask', async (_event, id) => {
    return deleteTask(id);
  });
  ipcMain.handle('taskflow:getTaskStats', async () => {
    return getTaskStats();
  });
  ipcMain.handle('taskflow:reorderTasks', async (_event, orders) => {
    return reorderTasks(orders);
  });
  ipcMain.handle('taskflow:syncToNeonBrain', async () => {
    return syncTaskflowToNeonBrain();
  });
  ipcMain.handle('taskflow:getWearTasks', async () => {
    return getWearTasks();
  });
  ipcMain.handle('taskflow:toggleWearTask', async (_event, id) => {
    return toggleWearTask(id);
  });
  ipcMain.handle('taskflow:quickAddWearTask', async (_event, data) => {
    return quickAddWearTask(data);
  });
  ipcMain.handle('taskflow:getWearTileData', async () => {
    return getWearTileData();
  });

  // ============================================================
  // RAG & KNOWLEDGE RETRIEVAL IPC HANDLERS
  // ============================================================
  ipcMain.handle('rag:search', async (_event, { query, options }) => {
    return searchMemory(query, options || {});
  });
  ipcMain.handle('rag:index', async (_event, item) => {
    return indexMemoryItem(item);
  });
  ipcMain.handle('rag:getStats', async () => {
    return getMemoryStats();
  });

  // ============================================================
  // INGESTION & DATA CAPTURE ENGINE IPC HANDLERS
  // ============================================================
  ipcMain.handle('ingestion:process', async (_event, payload) => {
    return processIngestionPayload(payload);
  });
  ipcMain.handle('ingestion:getStats', async () => {
    return getIngestionStats();
  });

  // ============================================================
  // TELEMETRY & OBSERVABILITY IPC HANDLERS
  // ============================================================
  ipcMain.handle('telemetry:getSummary', async () => {
    return getTelemetrySummary();
  });
  ipcMain.handle('telemetry:clear', async () => {
    return clearTelemetry();
  });

  // ============================================================
  // EXTERNAL EXECUTION & HITL GATEWAY IPC HANDLERS
  // ============================================================
  ipcMain.handle('execution:request', async (_event, data) => {
    const req = requestExecution(data);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('hitl:newPending', req);
    }
    return req;
  });
  ipcMain.handle('execution:getPending', async () => {
    return getPendingApprovals();
  });
  ipcMain.handle('execution:approve', async (_event, { requestId, comment }) => {
    return approveExecution(requestId, comment);
  });
  ipcMain.handle('execution:reject', async (_event, { requestId, reason }) => {
    return rejectExecution(requestId, reason);
  });
  ipcMain.handle('execution:getAuditLog', async (_event, limit) => {
    return getExecutionAuditLog(limit || 50);
  });

  // --- Time Defense & Dynamic Proactivity Engine ---
  ipcMain.handle('timeDefense:getSchedule', async (_event, date) => {
    return getSchedule(date);
  });
  ipcMain.handle('timeDefense:autoScheduleBacklog', async (_event, { tasks, targetDate } = {}) => {
    const result = autoScheduleBacklog(tasks, targetDate);
    updateTrayGlanceable();
    return result;
  });
  ipcMain.handle('timeDefense:shiftUnfinishedTasks', async (_event, { tasks, asOfTime } = {}) => {
    const result = shiftUnfinishedTasks(tasks, asOfTime);
    updateTrayGlanceable();
    return result;
  });
  ipcMain.handle('timeDefense:checkInterruptionThreats', async (_event, event) => {
    return checkInterruptionThreats(event);
  });
  ipcMain.handle('timeDefense:getStatus', async () => {
    return getActiveDefenseStatus();
  });

  // --- Layered Memory Architecture & Drift Detection ---
  ipcMain.handle('layeredMemory:getContext', async () => {
    return getTieredPromptContext();
  });
  ipcMain.handle('layeredMemory:addSprint', async (_event, item) => {
    return addSprintItem(item);
  });
  ipcMain.handle('layeredMemory:addWorking', async (_event, content) => {
    return addWorkingMemoryItem(content);
  });
  ipcMain.handle('layeredMemory:clearWorking', async () => {
    return clearWorkingMemory();
  });
  ipcMain.handle('layeredMemory:getDrift', async () => {
    return getDriftSummary();
  });

  // --- Output Governance & Zero Data Retention ---
  ipcMain.handle('governance:evaluate', async (_event, data) => {
    return evaluateOutput(data);
  });
  ipcMain.handle('governance:sanitize', async (_event, { payload, options } = {}) => {
    return sanitizePayloadForExternalAPI(payload, options);
  });
  ipcMain.handle('governance:encrypt', async (_event, data) => {
    return encryptZDRLocal(data);
  });
  ipcMain.handle('governance:decrypt', async (_event, data) => {
    return decryptZDRLocal(data);
  });

  // --- Metaprompt Architecture & Efficacy Engine ---
  ipcMain.handle('metaprompt:synthesize', async (_event, params) => {
    return synthesizeMetaprompt(params);
  });
  ipcMain.handle('metaprompt:evaluate', async (_event, promptText) => {
    return evaluatePromptEfficacy(promptText);
  });
  ipcMain.handle('metaprompt:getMetadata', async () => {
    return {
      models: TARGET_MODELS,
      archetypes: EXECUTION_ARCHETYPES,
      templates: CURATED_METAPROMPT_TEMPLATES
    };
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
