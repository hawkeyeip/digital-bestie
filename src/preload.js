/**
 * Digital Bestie — Preload Script
 * Secure context bridge exposing the bestie API to the renderer
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bestie', {
  // --- Window Controls ---
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
  },

  // --- Ollama ---
  ollama: {
    checkStatus: () => ipcRenderer.invoke('ollama:status'),
    getHealth: () => ipcRenderer.invoke('ollama:health'),
    pull: (modelName) => ipcRenderer.invoke('ollama:pull', modelName),
    restoreModel: (variant) => ipcRenderer.invoke('ollama:restoreModel', variant),
    infuseModel: (payload) => ipcRenderer.invoke('ollama:infuseModel', payload),
    getCatalog: () => ipcRenderer.invoke('ollama:getCatalog'),
    upgradeModel: (targetTag) => ipcRenderer.invoke('ollama:upgradeModel', targetTag),
    resolveSpecialist: () => ipcRenderer.invoke('ollama:resolveSpecialist'),
    chat: (message, activeModule = null) => ipcRenderer.invoke('ollama:chat', { message, activeModule }),
    abort: () => ipcRenderer.send('ollama:abort'),
    onToken: (callback) => {
      const handler = (_event, token) => callback(token);
      ipcRenderer.on('ollama:token', handler);
      return () => ipcRenderer.removeListener('ollama:token', handler);
    },
    onDone: (callback) => {
      const handler = (_event, result) => callback(result);
      ipcRenderer.on('ollama:done', handler);
      return () => ipcRenderer.removeListener('ollama:done', handler);
    },
    onError: (callback) => {
      const handler = (_event, error) => callback(error);
      ipcRenderer.on('ollama:error', handler);
      return () => ipcRenderer.removeListener('ollama:error', handler);
    },
    extract: (phase, userResponse) => ipcRenderer.invoke('ollama:extract', { phase, userResponse }),
  },

  // --- Memory ---
  memory: {
    getProfile: () => ipcRenderer.invoke('memory:getProfile'),
    saveProfile: (profile) => ipcRenderer.invoke('memory:saveProfile', profile),
    updateField: (path, value, action = 'set') => ipcRenderer.invoke('memory:updateField', { path, value, action }),
    deleteField: (path) => ipcRenderer.invoke('memory:deleteField', { path }),
    getProfileSummary: () => ipcRenderer.invoke('memory:getProfileSummary'),
  },

  // --- Conversation ---
  conversation: {
    load: () => ipcRenderer.invoke('conversation:load'),
    list: () => ipcRenderer.invoke('conversation:list'),
    getActive: () => ipcRenderer.invoke('conversation:getActive'),
    switch: (id) => ipcRenderer.invoke('conversation:switch', id),
    create: (payload) => ipcRenderer.invoke('conversation:create', payload),
    rename: (id, title) => ipcRenderer.invoke('conversation:rename', { id, title }),
    delete: (id) => ipcRenderer.invoke('conversation:delete', id),
    moveToFolder: (id, folderId) => ipcRenderer.invoke('conversation:moveToFolder', { id, folderId }),
    clear: () => ipcRenderer.invoke('conversation:clear'),
  },

  // --- Folders ---
  folder: {
    create: (payload) => ipcRenderer.invoke('folder:create', payload),
    rename: (id, name, icon) => ipcRenderer.invoke('folder:rename', { id, name, icon }),
    delete: (id) => ipcRenderer.invoke('folder:delete', id),
  },

  // --- Settings ---
  settings: {
    load: () => ipcRenderer.invoke('settings:load'),
    save: (settings) => ipcRenderer.invoke('settings:save', settings),
    update: (key, value) => ipcRenderer.invoke('settings:update', { key, value }),
  },

  // --- Data Export/Import ---
  data: {
    export: () => ipcRenderer.invoke('data:export'),
    import: () => ipcRenderer.invoke('data:import'),
  },

  // --- Onboarding ---
  onboarding: {
    getPrompt: (phase) => ipcRenderer.invoke('onboarding:getPrompt', phase),
  },

  // --- Feedback & Bug Logging ---
  feedback: {
    load: () => ipcRenderer.invoke('feedback:load'),
    add: (item) => ipcRenderer.invoke('feedback:add', item),
    delete: (id) => ipcRenderer.invoke('feedback:delete', id),
    updateStatus: (id, status) => ipcRenderer.invoke('feedback:updateStatus', { id, status }),
    getDiagnostics: () => ipcRenderer.invoke('feedback:getDiagnostics'),
    createGithubIssue: (payload) => ipcRenderer.invoke('feedback:createGithubIssue', payload),
  },

  // --- Superbrain Bridge (Resource Tracker & Neon Brain) ---
  superbrain: {
    getData: () => ipcRenderer.invoke('superbrain:getData'),
    detectPath: () => ipcRenderer.invoke('superbrain:detectPath'),
    syncResourceTracker: (pathOrUrl) => ipcRenderer.invoke('superbrain:syncResourceTracker', pathOrUrl),
    addResource: (item) => ipcRenderer.invoke('superbrain:addResource', item),
    deleteResource: (id) => ipcRenderer.invoke('superbrain:deleteResource', id),
    importNeonBrainDialog: () => ipcRenderer.invoke('superbrain:importNeonBrainDialog'),
    exportToNeonBrainDialog: (payload) => ipcRenderer.invoke('superbrain:exportToNeonBrainDialog', payload),
    addNeonBrainItem: (itemType, itemData) => ipcRenderer.invoke('superbrain:addNeonBrainItem', { itemType, itemData }),
    deleteNeonBrainItem: (itemType, itemId) => ipcRenderer.invoke('superbrain:deleteNeonBrainItem', { itemType, itemId }),
    toggleNeonBrainTask: (taskId) => ipcRenderer.invoke('superbrain:toggleNeonBrainTask', taskId),
  },

  // --- Auto-Updater ---
  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    getVersion: () => ipcRenderer.invoke('updater:getVersion'),
    openRelease: (url) => ipcRenderer.invoke('updater:openRelease', url),
    onUpdateAvailable: (callback) => {
      const handler = (_event, info) => callback(info);
      ipcRenderer.on('updater:available', handler);
      return () => ipcRenderer.removeListener('updater:available', handler);
    },
  },

  // --- Prompts Vault & Directives ---
  prompts: {
    load: () => ipcRenderer.invoke('prompts:load'),
    save: (prompts) => ipcRenderer.invoke('prompts:save', prompts),
    add: (prompt) => ipcRenderer.invoke('prompts:add', prompt),
    update: (id, updates) => ipcRenderer.invoke('prompts:update', { id, updates }),
    delete: (id) => ipcRenderer.invoke('prompts:delete', id),
    toggleFavorite: (id, favorite, reason) => ipcRenderer.invoke('prompts:toggleFavorite', { id, favorite, reason }),
  },

  // --- Credentials, Certificates & Merit Vault ---
  credentials: {
    load: () => ipcRenderer.invoke('credentials:load'),
    save: (creds) => ipcRenderer.invoke('credentials:save', creds),
    add: (cred) => ipcRenderer.invoke('credentials:add', cred),
    update: (id, updates) => ipcRenderer.invoke('credentials:update', { id, updates }),
    delete: (id) => ipcRenderer.invoke('credentials:delete', id),
    toggleHighlight: (id) => ipcRenderer.invoke('credentials:toggleHighlight', id),
  },

  // --- TaskFlow Kanban Task Manager ---
  taskflow: {
    loadTasks: (filters) => ipcRenderer.invoke('taskflow:loadTasks', filters),
    getTaskById: (id) => ipcRenderer.invoke('taskflow:getTaskById', id),
    createTask: (data) => ipcRenderer.invoke('taskflow:createTask', data),
    updateTask: (id, updates) => ipcRenderer.invoke('taskflow:updateTask', { id, updates }),
    deleteTask: (id) => ipcRenderer.invoke('taskflow:deleteTask', id),
    getTaskStats: () => ipcRenderer.invoke('taskflow:getTaskStats'),
    reorderTasks: (orders) => ipcRenderer.invoke('taskflow:reorderTasks', orders),
    syncToNeonBrain: () => ipcRenderer.invoke('taskflow:syncToNeonBrain'),
    getWearTasks: () => ipcRenderer.invoke('taskflow:getWearTasks'),
    toggleWearTask: (id) => ipcRenderer.invoke('taskflow:toggleWearTask', id),
    quickAddWearTask: (data) => ipcRenderer.invoke('taskflow:quickAddWearTask', data),
    getWearTileData: () => ipcRenderer.invoke('taskflow:getWearTileData'),
  },

  // --- System Telemetry & Memory Optimization ---
  system: {
    getMemoryUsage: () => ipcRenderer.invoke('system:getMemoryUsage'),
    clearMemoryCache: () => ipcRenderer.invoke('system:clearMemoryCache'),
    onBackgroundState: (callback) => {
      const handler = (_event, state) => callback(state);
      ipcRenderer.on('app:background-state', handler);
      return () => ipcRenderer.removeListener('app:background-state', handler);
    }
  },

  // --- Knowledge Retrieval & Vector Store (RAG) ---
  rag: {
    search: (query, options) => ipcRenderer.invoke('rag:search', { query, options }),
    index: (item) => ipcRenderer.invoke('rag:index', item),
    getStats: () => ipcRenderer.invoke('rag:getStats'),
  },

  // --- Ingestion & Data Capture Engine ---
  ingestion: {
    process: (payload) => ipcRenderer.invoke('ingestion:process', payload),
    getStats: () => ipcRenderer.invoke('ingestion:getStats'),
  },

  // --- Telemetry & Observability Engine ---
  telemetry: {
    getSummary: () => ipcRenderer.invoke('telemetry:getSummary'),
    clear: () => ipcRenderer.invoke('telemetry:clear'),
  },

  // --- Outbound Execution & Human-in-the-Loop Gateway ---
  execution: {
    request: (data) => ipcRenderer.invoke('execution:request', data),
    getPending: () => ipcRenderer.invoke('execution:getPending'),
    approve: (requestId, comment) => ipcRenderer.invoke('execution:approve', { requestId, comment }),
    reject: (requestId, reason) => ipcRenderer.invoke('execution:reject', { requestId, reason }),
    getAuditLog: (limit) => ipcRenderer.invoke('execution:getAuditLog', limit),
    onNewPending: (callback) => {
      const handler = (_event, req) => callback(req);
      ipcRenderer.on('hitl:newPending', handler);
      return () => ipcRenderer.removeListener('hitl:newPending', handler);
    }
  },

  // --- Time Defense & Dynamic Proactivity Engine ---
  timeDefense: {
    getSchedule: (date) => ipcRenderer.invoke('timeDefense:getSchedule', date),
    autoScheduleBacklog: (tasks, targetDate) => ipcRenderer.invoke('timeDefense:autoScheduleBacklog', { tasks, targetDate }),
    shiftUnfinishedTasks: (tasks, asOfTime) => ipcRenderer.invoke('timeDefense:shiftUnfinishedTasks', { tasks, asOfTime }),
    checkInterruptionThreats: (event) => ipcRenderer.invoke('timeDefense:checkInterruptionThreats', event),
    getStatus: () => ipcRenderer.invoke('timeDefense:getStatus'),
  },

  // --- Layered Memory Architecture & Drift Detection ---
  layeredMemory: {
    getContext: () => ipcRenderer.invoke('layeredMemory:getContext'),
    addSprint: (item) => ipcRenderer.invoke('layeredMemory:addSprint', item),
    addWorking: (content) => ipcRenderer.invoke('layeredMemory:addWorking', content),
    clearWorking: () => ipcRenderer.invoke('layeredMemory:clearWorking'),
    getDrift: () => ipcRenderer.invoke('layeredMemory:getDrift'),
  },

  // --- Output Governance & Zero Data Retention ---
  governance: {
    evaluate: (data) => ipcRenderer.invoke('governance:evaluate', data),
    sanitize: (payload, options) => ipcRenderer.invoke('governance:sanitize', { payload, options }),
    encrypt: (data) => ipcRenderer.invoke('governance:encrypt', data),
    decrypt: (data) => ipcRenderer.invoke('governance:decrypt', data),
  },

  // --- Metaprompt Architecture & Efficacy Engine ---
  metaprompt: {
    synthesize: (params) => ipcRenderer.invoke('metaprompt:synthesize', params),
    evaluate: (promptText) => ipcRenderer.invoke('metaprompt:evaluate', promptText),
    getMetadata: () => ipcRenderer.invoke('metaprompt:getMetadata'),
  },
});


