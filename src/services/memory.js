/**
 * Living Dossier — Persistent Memory System
 * File-based JSON store for the user's profile, preferences, and state
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { safeStorage } from 'electron';

import { DEFAULT_OPERATOR_PROMPTS } from './prompts-data.js';

const DATA_DIR = path.join(os.homedir(), '.digital-bestie');
const PROFILE_PATH = path.join(DATA_DIR, 'user_profile.json');
const SETTINGS_PATH = path.join(DATA_DIR, 'settings.json');
const CONVERSATION_PATH = path.join(DATA_DIR, 'conversation.json');
const CONVERSATIONS_PATH = path.join(DATA_DIR, 'conversations.json');
const FEEDBACK_PATH = path.join(DATA_DIR, 'feedback_and_bugs.json');
const PROMPTS_PATH = path.join(DATA_DIR, 'prompts_vault.json');
const CREDENTIALS_PATH = path.join(DATA_DIR, 'credentials_vault.json');

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const DEFAULT_FOLDERS = [
  { id: 'folder_finances', name: 'Finances & Burn Rate', icon: '💰' },
  { id: 'folder_diary', name: 'Diary & Mindset', icon: '📓' },
  { id: 'folder_ventures', name: 'Ventures & Strategy', icon: '🚀' },
  { id: 'folder_general', name: 'General Real Talk', icon: '💬' }
];

/** Default empty profile matching the Living Dossier schema */
const DEFAULT_PROFILE = {
  user_profile: {
    identity_and_baseline: {
      current_living_situation: '',
      liquid_cash_reserve: null,
      hard_cash_floor: null,
      burn_rate_weekly: null,
      primary_acute_stressor: '',
      active_location: ''
    },
    cognitive_and_behavioral_profile: {
      decision_bias: '',
      primary_avoidance_triggers: [],
      escape_mechanisms: [],
      tone_preference: 'digital_bestie',
      execution_style: 'execution_first'
    },
    goal_and_boundary_matrix: {
      north_star_90_day: '',
      anti_goals: [],
      rate_floor: '',
      deposit_policy: '',
      client_red_flags: []
    },
    scout_index: {
      verified_third_places: []
    },
    secret_venture_incubator: {
      active_project_name: '',
      core_skills_leveraged: [],
      backlog_micro_tasks: []
    },
    high_leverage_methods_vault: {
      active_frameworks: [],
      custom_prompt_templates: []
    }
  },
  onboarding_state: {
    completed: false,
    current_phase: 0,
    phase_responses: {}
  }
};

const DEFAULT_SETTINGS = {
  ollama_url: 'http://localhost:11434',
  model_name: 'bestie-abliterated',
  context_window: 50,
  theme: 'neon-dark',
  num_ctx: 16384,
  ollama_keep_alive: '5m',
  power_saver: false
};

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  } else {
    try {
      fs.chmodSync(DATA_DIR, 0o700);
    } catch {
      // Ignore if chmod not supported on filesystem
    }
  }
}

export function loadJSON(filePath, defaults) {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw);

      // Check if this is an encrypted safeStorage envelope
      if (parsed && parsed._security && parsed._security.encrypted && parsed.payload) {
        if (safeStorage && typeof safeStorage.isEncryptionAvailable === 'function' && safeStorage.isEncryptionAvailable()) {
          const buffer = Buffer.from(parsed.payload, 'base64');
          const decrypted = safeStorage.decryptString(buffer);
          return JSON.parse(decrypted);
        } else {
          console.error(`[Security] Cannot decrypt ${filePath}: safeStorage encryption is unavailable.`);
          return JSON.parse(JSON.stringify(defaults));
        }
      }

      // Legacy unencrypted JSON: return directly (will be transparently encrypted on next save)
      return parsed;
    }
  } catch (err) {
    console.error(`Error loading ${filePath}:`, err.message);
  }
  return JSON.parse(JSON.stringify(defaults));
}

export function saveJSON(filePath, data) {
  ensureDataDir();
  const rawString = JSON.stringify(data, null, 2);

  // Use OS hardware / Keychain backed safeStorage if available
  if (safeStorage && typeof safeStorage.isEncryptionAvailable === 'function' && safeStorage.isEncryptionAvailable()) {
    try {
      const encryptedBuffer = safeStorage.encryptString(rawString);
      const envelope = {
        _security: {
          encrypted: true,
          version: 1,
          algorithm: 'electron-safe-storage'
        },
        payload: encryptedBuffer.toString('base64')
      };
      fs.writeFileSync(filePath, JSON.stringify(envelope, null, 2), { encoding: 'utf-8', mode: 0o600 });
      return;
    } catch (err) {
      console.warn(`[Security] safeStorage encryption failed for ${filePath}, falling back:`, err.message);
    }
  }

  // Fallback if encryption unavailable (written with strict user-only permissions)
  fs.writeFileSync(filePath, rawString, { encoding: 'utf-8', mode: 0o600 });
}

// --- Profile ---

export function loadProfile() {
  ensureDataDir();
  return loadJSON(PROFILE_PATH, DEFAULT_PROFILE);
}

export function saveProfile(profile) {
  saveJSON(PROFILE_PATH, profile);
}

/**
 * Update a nested field using dot notation with prototype pollution defense
 */
export function updateProfileField(dotPath, value, action = 'set') {
  if (typeof dotPath !== 'string') return loadProfile();
  const keys = dotPath.split('.');
  if (keys.some(k => DANGEROUS_KEYS.has(k))) {
    console.warn(`[Security] Blocked attempt to modify dangerous property: ${dotPath}`);
    return loadProfile();
  }

  const profile = loadProfile();
  let obj = profile;
  for (let i = 0; i < keys.length - 1; i++) {
    if (obj[keys[i]] === undefined) obj[keys[i]] = {};
    obj = obj[keys[i]];
  }
  const lastKey = keys[keys.length - 1];
  if (action === 'append') {
    if (!Array.isArray(obj[lastKey])) {
      obj[lastKey] = obj[lastKey] ? [obj[lastKey]] : [];
    }
    if (Array.isArray(value)) {
      value.forEach(v => {
        if (!obj[lastKey].includes(v)) obj[lastKey].push(v);
      });
    } else if (value && !obj[lastKey].includes(value)) {
      obj[lastKey].push(value);
    }
  } else {
    obj[lastKey] = value;
  }
  saveProfile(profile);
  return profile;
}

export function deleteProfileField(dotPath) {
  if (typeof dotPath !== 'string') return loadProfile();
  const keys = dotPath.split('.');
  if (keys.some(k => DANGEROUS_KEYS.has(k))) {
    console.warn(`[Security] Blocked attempt to delete dangerous property: ${dotPath}`);
    return loadProfile();
  }

  const profile = loadProfile();
  let obj = profile;
  for (let i = 0; i < keys.length - 1; i++) {
    if (obj[keys[i]] === undefined) return profile;
    obj = obj[keys[i]];
  }
  delete obj[keys[keys.length - 1]];
  saveProfile(profile);
  return profile;
}

/**
 * Generate a human-readable summary of the current profile
 */
export function getProfileSummary() {
  const profile = loadProfile();
  const p = profile.user_profile;
  const sections = [];

  if (p.identity_and_baseline) {
    const b = p.identity_and_baseline;
    const items = [];
    if (b.current_living_situation) items.push(`Living situation: ${b.current_living_situation}`);
    if (b.liquid_cash_reserve !== null) items.push(`Cash reserve: $${b.liquid_cash_reserve}`);
    if (b.hard_cash_floor !== null) items.push(`Cash floor: $${b.hard_cash_floor}`);
    if (b.burn_rate_weekly !== null) items.push(`Weekly burn rate: $${b.burn_rate_weekly}`);
    if (b.primary_acute_stressor) items.push(`Main stressor: ${b.primary_acute_stressor}`);
    if (b.active_location) items.push(`Location: ${b.active_location}`);
    if (items.length) sections.push(`**Baseline**: ${items.join(' | ')}`);
  }

  if (p.cognitive_and_behavioral_profile) {
    const c = p.cognitive_and_behavioral_profile;
    const items = [];
    if (c.decision_bias) items.push(`Decision style: ${c.decision_bias}`);
    if (c.primary_avoidance_triggers?.length) items.push(`Avoidance triggers: ${c.primary_avoidance_triggers.join(', ')}`);
    if (c.escape_mechanisms?.length) items.push(`Escape patterns: ${c.escape_mechanisms.join(', ')}`);
    if (c.tone_preference) items.push(`Tone: ${c.tone_preference}`);
    if (items.length) sections.push(`**Psychology**: ${items.join(' | ')}`);
  }

  if (p.goal_and_boundary_matrix) {
    const g = p.goal_and_boundary_matrix;
    const items = [];
    if (g.north_star_90_day) items.push(`90-day goal: ${g.north_star_90_day}`);
    if (g.anti_goals?.length) items.push(`Anti-goals: ${g.anti_goals.join(', ')}`);
    if (g.rate_floor) items.push(`Rate floor: ${g.rate_floor}`);
    if (items.length) sections.push(`**Goals**: ${items.join(' | ')}`);
  }

  if (p.secret_venture_incubator?.active_project_name) {
    sections.push(`**Side venture**: ${p.secret_venture_incubator.active_project_name}`);
  }

  return sections.length
    ? sections.join('\n')
    : 'No profile data stored yet.';
}

// --- Multi-Conversation & Folder Store ---

export function loadConversationsStore() {
  ensureDataDir();
  let store = loadJSON(CONVERSATIONS_PATH, null);

  // If conversations.json does not exist yet, migrate from legacy conversation.json
  if (!store || !Array.isArray(store.conversations)) {
    const legacy = loadJSON(CONVERSATION_PATH, { messages: [] });
    const initialId = `conv_${Date.now()}`;
    const initialMessages = Array.isArray(legacy?.messages) ? legacy.messages : [];
    
    let initialTitle = 'New Conversation';
    if (initialMessages.length > 0) {
      const firstUserMsg = initialMessages.find(m => m.role === 'user');
      if (firstUserMsg && firstUserMsg.content) {
        initialTitle = firstUserMsg.content.slice(0, 35).trim() || 'Previous Conversation';
      } else {
        initialTitle = 'Previous Conversation';
      }
    }

    store = {
      activeId: initialId,
      folders: JSON.parse(JSON.stringify(DEFAULT_FOLDERS)),
      conversations: [
        {
          id: initialId,
          title: initialTitle,
          folderId: 'folder_general',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messages: initialMessages
        }
      ]
    };
    saveConversationsStore(store);
  }

  // Ensure folders list exists
  if (!Array.isArray(store.folders) || store.folders.length === 0) {
    store.folders = JSON.parse(JSON.stringify(DEFAULT_FOLDERS));
  }

  // Ensure activeId is valid
  if (!store.activeId || !store.conversations.some(c => c.id === store.activeId)) {
    if (store.conversations.length > 0) {
      store.activeId = store.conversations[0].id;
    } else {
      const newId = `conv_${Date.now()}`;
      store.conversations.push({
        id: newId,
        title: 'New Conversation',
        folderId: 'folder_general',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: []
      });
      store.activeId = newId;
    }
  }

  return store;
}

export function saveConversationsStore(store) {
  saveJSON(CONVERSATIONS_PATH, store);
  // Keep legacy conversation.json synced with active conversation for backward compatibility
  const active = store.conversations.find(c => c.id === store.activeId);
  if (active) {
    saveJSON(CONVERSATION_PATH, { messages: active.messages });
  }
}

export function getConversationsSummary() {
  const store = loadConversationsStore();
  const list = store.conversations.map(c => {
    const lastMsg = c.messages && c.messages.length > 0 ? c.messages[c.messages.length - 1] : null;
    return {
      id: c.id,
      title: c.title,
      folderId: c.folderId || null,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      messageCount: c.messages?.length || 0,
      preview: lastMsg ? (lastMsg.content || '').slice(0, 80) : 'No messages yet'
    };
  });

  list.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  return {
    activeId: store.activeId,
    folders: store.folders,
    conversations: list
  };
}

export function getActiveConversation() {
  const store = loadConversationsStore();
  const active = store.conversations.find(c => c.id === store.activeId);
  if (active) return active;
  return store.conversations[0] || null;
}

export function switchActiveConversation(id) {
  const store = loadConversationsStore();
  const target = store.conversations.find(c => c.id === id);
  if (target) {
    store.activeId = target.id;
    saveConversationsStore(store);
    return target;
  }
  return getActiveConversation();
}

export function createConversation({ title = 'New Conversation', folderId = null } = {}) {
  const store = loadConversationsStore();
  const newId = `conv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const newConv = {
    id: newId,
    title: (title || '').trim() || 'New Conversation',
    folderId: folderId || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: []
  };
  store.conversations.unshift(newConv);
  store.activeId = newId;
  saveConversationsStore(store);
  return newConv;
}

export function renameConversation(id, newTitle) {
  const store = loadConversationsStore();
  const target = store.conversations.find(c => c.id === id);
  if (target && newTitle && typeof newTitle === 'string') {
    target.title = newTitle.trim() || target.title;
    target.updatedAt = new Date().toISOString();
    saveConversationsStore(store);
    return target;
  }
  return null;
}

export function deleteConversation(id) {
  const store = loadConversationsStore();
  store.conversations = store.conversations.filter(c => c.id !== id);
  if (store.conversations.length === 0) {
    const freshId = `conv_${Date.now()}`;
    const fresh = {
      id: freshId,
      title: 'New Conversation',
      folderId: 'folder_general',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: []
    };
    store.conversations.push(fresh);
    store.activeId = freshId;
  } else if (store.activeId === id) {
    store.activeId = store.conversations[0].id;
  }
  saveConversationsStore(store);
  return getConversationsSummary();
}

export function moveConversationToFolder(id, folderId) {
  const store = loadConversationsStore();
  const target = store.conversations.find(c => c.id === id);
  if (target) {
    target.folderId = folderId || null;
    target.updatedAt = new Date().toISOString();
    saveConversationsStore(store);
    return target;
  }
  return null;
}

export function clearActiveConversation() {
  const store = loadConversationsStore();
  const active = store.conversations.find(c => c.id === store.activeId);
  if (active) {
    active.messages = [];
    active.updatedAt = new Date().toISOString();
    saveConversationsStore(store);
    return active;
  }
  return null;
}

// --- Folder Management ---

export function createFolder({ name, icon = '📁' }) {
  if (!name || typeof name !== 'string') return null;
  const store = loadConversationsStore();
  const newFolder = {
    id: `folder_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    name: name.trim(),
    icon: icon || '📁',
    createdAt: new Date().toISOString()
  };
  store.folders.push(newFolder);
  saveConversationsStore(store);
  return newFolder;
}

export function renameFolder(id, name, icon) {
  const store = loadConversationsStore();
  const target = store.folders.find(f => f.id === id);
  if (target) {
    if (name && typeof name === 'string') target.name = name.trim();
    if (icon) target.icon = icon;
    saveConversationsStore(store);
    return target;
  }
  return null;
}

export function deleteFolder(id) {
  const store = loadConversationsStore();
  store.folders = store.folders.filter(f => f.id !== id);
  store.conversations.forEach(c => {
    if (c.folderId === id) c.folderId = null;
  });
  saveConversationsStore(store);
  return store.folders;
}

// --- Legacy & Bridge Conversation Functions ---

export function loadConversation() {
  return getActiveConversation();
}

export function saveConversation(conversation) {
  const store = loadConversationsStore();
  const active = store.conversations.find(c => c.id === store.activeId);
  if (active) {
    active.messages = conversation.messages || [];
    active.updatedAt = new Date().toISOString();
    saveConversationsStore(store);
  }
}

export function appendMessage(role, content) {
  const store = loadConversationsStore();
  let active = store.conversations.find(c => c.id === store.activeId);
  if (!active) {
    active = store.conversations[0];
    store.activeId = active ? active.id : null;
  }
  if (!active) {
    const newId = `conv_${Date.now()}`;
    active = {
      id: newId,
      title: 'New Conversation',
      folderId: 'folder_general',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: []
    };
    store.conversations.push(active);
    store.activeId = newId;
  }

  active.messages.push({
    role,
    content,
    timestamp: new Date().toISOString()
  });
  active.updatedAt = new Date().toISOString();

  // Smart auto-title generation if this is the first user message and title is default
  if (role === 'user' && (active.title === 'New Conversation' || !active.title)) {
    const cleanSnippet = content.trim().replace(/^#+\s*/, '').slice(0, 32).trim();
    if (cleanSnippet) {
      active.title = cleanSnippet + (content.trim().length > 32 ? '...' : '');
    }
  }

  saveConversationsStore(store);
  return active;
}

export function getMessageWindow(windowSize = 50) {
  const active = getActiveConversation();
  const messages = active?.messages || [];
  const windowed = messages.slice(-windowSize);
  return windowed.map(m => ({ role: m.role, content: m.content }));
}

export function clearConversation() {
  return clearActiveConversation();
}

// --- Settings ---

export function loadSettings() {
  ensureDataDir();
  return loadJSON(SETTINGS_PATH, DEFAULT_SETTINGS);
}

export function saveSettings(settings) {
  saveJSON(SETTINGS_PATH, settings);
}

export function updateSetting(key, value) {
  const settings = loadSettings();
  settings[key] = value;
  saveSettings(settings);
  return settings;
}

// --- Export / Import ---

export function exportProfile() {
  return {
    profile: loadProfile(),
    settings: loadSettings(),
    conversation: loadConversation(),
    conversationsStore: loadConversationsStore(),
    promptsVault: loadPromptsVault(),
    credentialsVault: loadCredentialsVault(),
    exportedAt: new Date().toISOString()
  };
}

export function importProfile(data) {
  if (data.profile) saveProfile(data.profile);
  if (data.settings) saveSettings(data.settings);
  if (data.conversationsStore) saveConversationsStore(data.conversationsStore);
  else if (data.conversation) saveConversation(data.conversation);
  if (data.promptsVault) savePromptsVault(data.promptsVault);
  if (data.credentialsVault) saveCredentialsVault(data.credentialsVault);
}

// --- Feedback & Bug Logging ---

export function loadFeedback() {
  return loadJSON(FEEDBACK_PATH, []);
}

export function saveFeedback(items) {
  saveJSON(FEEDBACK_PATH, items);
}

export function addFeedbackItem(item) {
  const items = loadFeedback();
  const newItem = {
    id: `fb_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    type: item.type || 'bug', // 'bug' | 'feature'
    title: item.title || 'Untitled',
    description: item.description || '',
    severity: item.severity || 'medium', // 'low' | 'medium' | 'high' | 'critical'
    diagnostics: item.diagnostics || null,
    status: 'open',
    createdAt: new Date().toISOString()
  };
  items.unshift(newItem);
  saveFeedback(items);
  return newItem;
}

export function deleteFeedbackItem(id) {
  const items = loadFeedback();
  const filtered = items.filter(it => it.id !== id);
  saveFeedback(filtered);
  return filtered;
}

export function updateFeedbackStatus(id, status) {
  const items = loadFeedback();
  const target = items.find(it => it.id === id);
  if (target) {
    target.status = status;
    saveFeedback(items);
  }
  return items;
}

// ============================================================
// PROMPTS VAULT & OPERATOR DIRECTIVES
// ============================================================

export function loadPromptsVault() {
  const stored = loadJSON(PROMPTS_PATH, []);
  if (!Array.isArray(stored) || stored.length === 0) {
    saveJSON(PROMPTS_PATH, DEFAULT_OPERATOR_PROMPTS);
    return JSON.parse(JSON.stringify(DEFAULT_OPERATOR_PROMPTS));
  }

  // Merge any system defaults that may not exist in the stored list
  const storedIds = new Set(stored.map(p => p.id));
  let modified = false;
  const merged = [...stored];

  for (const def of DEFAULT_OPERATOR_PROMPTS) {
    if (!storedIds.has(def.id)) {
      merged.push(def);
      modified = true;
    }
  }

  if (modified) {
    saveJSON(PROMPTS_PATH, merged);
  }

  return merged;
}

export function savePromptsVault(prompts) {
  if (Array.isArray(prompts)) {
    saveJSON(PROMPTS_PATH, prompts);
  }
}

export function addPrompt(promptData) {
  const prompts = loadPromptsVault();
  const newPrompt = {
    id: `prompt_custom_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    title: promptData.title?.trim() || 'Untitled Directive',
    subtitle: promptData.subtitle?.trim() || '',
    category: promptData.category || 'ops',
    personaId: promptData.personaId || null,
    favorite: !!promptData.favorite,
    favoriteReason: promptData.favoriteReason?.trim() || '',
    tags: Array.isArray(promptData.tags) ? promptData.tags : (promptData.tags ? String(promptData.tags).split(',').map(t => t.trim()).filter(Boolean) : []),
    content: promptData.content || '',
    isCustom: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  prompts.unshift(newPrompt);
  savePromptsVault(prompts);
  return newPrompt;
}

export function updatePrompt(id, updates) {
  const prompts = loadPromptsVault();
  const target = prompts.find(p => p.id === id);
  if (!target) return null;

  if (updates.title !== undefined) target.title = updates.title.trim();
  if (updates.subtitle !== undefined) target.subtitle = updates.subtitle.trim();
  if (updates.content !== undefined) target.content = updates.content;
  if (updates.category !== undefined) target.category = updates.category;
  if (updates.personaId !== undefined) target.personaId = updates.personaId;
  if (updates.favorite !== undefined) target.favorite = !!updates.favorite;
  if (updates.favoriteReason !== undefined) target.favoriteReason = updates.favoriteReason.trim();
  if (updates.tags !== undefined) {
    target.tags = Array.isArray(updates.tags)
      ? updates.tags
      : String(updates.tags).split(',').map(t => t.trim()).filter(Boolean);
  }
  target.updatedAt = new Date().toISOString();

  savePromptsVault(prompts);
  return target;
}

export function deletePrompt(id) {
  const prompts = loadPromptsVault();
  const filtered = prompts.filter(p => p.id !== id);
  savePromptsVault(filtered);
  return filtered;
}

export function togglePromptFavorite(id, favorite, reason = null) {
  const prompts = loadPromptsVault();
  const target = prompts.find(p => p.id === id);
  if (!target) return null;

  target.favorite = typeof favorite === 'boolean' ? favorite : !target.favorite;
  if (reason !== null && reason !== undefined) {
    target.favoriteReason = String(reason).trim();
  }
  target.updatedAt = new Date().toISOString();

  savePromptsVault(prompts);
  return target;
}

// ============================================================
// CREDENTIALS, CERTIFICATES & MERIT VAULT
// ============================================================

export function loadCredentialsVault() {
  return loadJSON(CREDENTIALS_PATH, []);
}

export function saveCredentialsVault(credentials) {
  if (Array.isArray(credentials)) {
    saveJSON(CREDENTIALS_PATH, credentials);
  }
}

export function addCredential(credData) {
  const list = loadCredentialsVault();
  const newCred = {
    id: `cred_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    title: credData.title?.trim() || 'Untitled Credential',
    issuer: credData.issuer?.trim() || '',
    category: credData.category || 'certification', // certification | degree | license | award | patent | publication | merit
    issueDate: credData.issueDate || '',
    expiryDate: credData.expiryDate || '',
    credentialId: credData.credentialId?.trim() || '',
    skills: Array.isArray(credData.skills)
      ? credData.skills
      : (credData.skills ? String(credData.skills).split(',').map(s => s.trim()).filter(Boolean) : []),
    description: credData.description?.trim() || '',
    highlight: !!credData.highlight,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  list.unshift(newCred);
  saveCredentialsVault(list);
  return newCred;
}

export function updateCredential(id, updates) {
  const list = loadCredentialsVault();
  const target = list.find(c => c.id === id);
  if (!target) return null;

  if (updates.title !== undefined) target.title = updates.title.trim();
  if (updates.issuer !== undefined) target.issuer = updates.issuer.trim();
  if (updates.category !== undefined) target.category = updates.category;
  if (updates.issueDate !== undefined) target.issueDate = updates.issueDate;
  if (updates.expiryDate !== undefined) target.expiryDate = updates.expiryDate;
  if (updates.credentialId !== undefined) target.credentialId = updates.credentialId.trim();
  if (updates.description !== undefined) target.description = updates.description.trim();
  if (updates.highlight !== undefined) target.highlight = !!updates.highlight;
  if (updates.skills !== undefined) {
    target.skills = Array.isArray(updates.skills)
      ? updates.skills
      : String(updates.skills).split(',').map(s => s.trim()).filter(Boolean);
  }
  target.updatedAt = new Date().toISOString();

  saveCredentialsVault(list);
  return target;
}

export function deleteCredential(id) {
  const list = loadCredentialsVault();
  const filtered = list.filter(c => c.id !== id);
  saveCredentialsVault(filtered);
  return filtered;
}

export function toggleCredentialHighlight(id) {
  const list = loadCredentialsVault();
  const target = list.find(c => c.id === id);
  if (!target) return null;

  target.highlight = !target.highlight;
  target.updatedAt = new Date().toISOString();
  saveCredentialsVault(list);
  return target;
}

export function getCredentialsSnippet() {
  const list = loadCredentialsVault();
  if (!list || list.length === 0) return '';
  const highlights = list.filter(c => c.highlight);
  const itemsToShow = highlights.length > 0 ? highlights : list.slice(0, 10);

  let sec = `\n\n## USER CREDENTIALS, CERTIFICATIONS & MERIT\n`;
  sec += `The user has the following verified credentials, degrees, and honors. Ground answers in their proven competencies:\n`;
  for (const c of itemsToShow) {
    let line = `- [${(c.category || 'MERIT').toUpperCase()}] **${c.title}**`;
    if (c.issuer) line += ` from ${c.issuer}`;
    if (c.issueDate) line += ` (${c.issueDate})`;
    if (c.skills && c.skills.length > 0) line += ` | Core Competencies: ${c.skills.join(', ')}`;
    if (c.description) line += ` | Impact: ${c.description}`;
    sec += `${line}\n`;
  }
  return sec;
}

export {
  DATA_DIR,
  DEFAULT_PROFILE,
  DEFAULT_SETTINGS,
  FEEDBACK_PATH,
  PROMPTS_PATH,
  CREDENTIALS_PATH,
  loadJSON as loadSecureJSON,
  saveJSON as saveSecureJSON
};

