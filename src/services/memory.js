/**
 * Living Dossier — Persistent Memory System
 * File-based JSON store for the user's profile, preferences, and state
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const DATA_DIR = path.join(os.homedir(), '.digital-bestie');
const PROFILE_PATH = path.join(DATA_DIR, 'user_profile.json');
const SETTINGS_PATH = path.join(DATA_DIR, 'settings.json');
const CONVERSATION_PATH = path.join(DATA_DIR, 'conversation.json');
const FEEDBACK_PATH = path.join(DATA_DIR, 'feedback_and_bugs.json');

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
  model_name: 'bestie-light',
  context_window: 50,
  theme: 'neon-dark',
  num_ctx: 16384
};

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadJSON(filePath, defaults) {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error(`Error loading ${filePath}:`, err.message);
  }
  return JSON.parse(JSON.stringify(defaults));
}

function saveJSON(filePath, data) {
  ensureDataDir();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
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
 * Update a nested field using dot notation
 */
export function updateProfileField(dotPath, value) {
  const profile = loadProfile();
  const keys = dotPath.split('.');
  let obj = profile;
  for (let i = 0; i < keys.length - 1; i++) {
    if (obj[keys[i]] === undefined) obj[keys[i]] = {};
    obj = obj[keys[i]];
  }
  obj[keys[keys.length - 1]] = value;
  saveProfile(profile);
  return profile;
}

export function deleteProfileField(dotPath) {
  const profile = loadProfile();
  const keys = dotPath.split('.');
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

// --- Conversation ---

export function loadConversation() {
  ensureDataDir();
  return loadJSON(CONVERSATION_PATH, { messages: [] });
}

export function saveConversation(conversation) {
  saveJSON(CONVERSATION_PATH, conversation);
}

export function appendMessage(role, content) {
  const conversation = loadConversation();
  conversation.messages.push({
    role,
    content,
    timestamp: new Date().toISOString()
  });
  saveConversation(conversation);
  return conversation;
}

/**
 * Get the sliding window of recent messages for Ollama context
 */
export function getMessageWindow(windowSize = 50) {
  const conversation = loadConversation();
  const messages = conversation.messages || [];
  const windowed = messages.slice(-windowSize);
  return windowed.map(m => ({ role: m.role, content: m.content }));
}

export function clearConversation() {
  saveConversation({ messages: [] });
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
    exportedAt: new Date().toISOString()
  };
}

export function importProfile(data) {
  if (data.profile) saveProfile(data.profile);
  if (data.settings) saveSettings(data.settings);
  if (data.conversation) saveConversation(data.conversation);
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

export { DATA_DIR, DEFAULT_PROFILE, DEFAULT_SETTINGS, FEEDBACK_PATH };

