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
    updateField: (path, value) => ipcRenderer.invoke('memory:updateField', { path, value }),
    deleteField: (path) => ipcRenderer.invoke('memory:deleteField', { path }),
    getProfileSummary: () => ipcRenderer.invoke('memory:getProfileSummary'),
  },

  // --- Conversation ---
  conversation: {
    load: () => ipcRenderer.invoke('conversation:load'),
    clear: () => ipcRenderer.invoke('conversation:clear'),
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
});

