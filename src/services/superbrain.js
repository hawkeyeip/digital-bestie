/**
 * Superbrain Bridge Service
 * Connects Digital Bestie with Resource Tracker & Neon Brain
 * Unifying financial obligations, assets, task backlog, and thought vaults
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadProfile, saveProfile, updateProfileField, DATA_DIR } from './memory.js';

const SUPERBRAIN_DATA_FILE = path.join(DATA_DIR, 'superbrain.json');

// Known candidate paths for Resource Tracker data file
const CANDIDATE_RESOURCE_PATHS = [
  path.join(os.homedir(), 'Resource-Tracker', 'data.json'),
  path.join(os.homedir(), 'Desktop', 'Resource-Tracker', 'data.json'),
  path.join(os.homedir(), 'Projects', 'Resource-Tracker', 'data.json'),
  path.join(os.homedir(), 'Library', 'Application Support', 'resource-tracker', 'data.json'),
];

/**
 * Default Superbrain state
 */
const DEFAULT_SUPERBRAIN_STATE = {
  resource_tracker: {
    connected: false,
    source_type: 'none', // 'api' | 'file' | 'manual'
    source_path: '',
    api_url: 'http://localhost:5174',
    last_synced: null,
    metrics: {
      monthly_burn_rate: 0,
      weekly_burn_rate: 0,
      subscription_count: 0,
      total_travel_credits: 0,
      hardware_asset_value: 0,
    },
    upcoming_renewals: [],
    items: [],
  },
  neon_brain: {
    connected: false,
    source_type: 'none', // 'file' | 'manual'
    source_path: '',
    last_synced: null,
    metrics: {
      open_tasks_count: 0,
      high_priority_tasks_count: 0,
      notes_count: 0,
      prompts_count: 0,
    },
    tasks: [],
    notes: [],
    prompts: [],
  }
};

/**
 * Load persistent Superbrain cache
 */
export function loadSuperbrainData() {
  try {
    if (fs.existsSync(SUPERBRAIN_DATA_FILE)) {
      const raw = fs.readFileSync(SUPERBRAIN_DATA_FILE, 'utf-8');
      return { ...DEFAULT_SUPERBRAIN_STATE, ...JSON.parse(raw) };
    }
  } catch (err) {
    console.error('Error loading Superbrain data:', err.message);
  }
  return JSON.parse(JSON.stringify(DEFAULT_SUPERBRAIN_STATE));
}

/**
 * Save Superbrain cache
 */
export function saveSuperbrainData(data) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(SUPERBRAIN_DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving Superbrain data:', err.message);
  }
}

/**
 * Auto-detect Resource Tracker location
 */
export function detectResourceTrackerPath() {
  for (const p of CANDIDATE_RESOURCE_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/**
 * Parse and normalize Resource Tracker items
 */
function computeResourceMetrics(items = []) {
  let monthlyBurn = 0;
  let travelCredits = 0;
  let hardwareValue = 0;
  let subCount = 0;
  const upcomingRenewals = [];
  const now = Date.now();
  const thirtyDaysAhead = now + 30 * 86400000;

  for (const item of items) {
    const cost = parseFloat(item.cost) || 0;
    const cat = (item.category || '').toLowerCase();
    const cycle = (item.billingCycle || item.billing_cycle || 'Monthly').toLowerCase();

    // Check category types
    if (cat.includes('travel') || cat.includes('voucher') || cat.includes('credit') || cycle === 'voucher') {
      travelCredits += cost;
    } else if (cat.includes('hardware') || cat.includes('asset') || cat.includes('equipment')) {
      hardwareValue += cost;
    } else {
      // Recurring subscription / software / utilities
      subCount++;
      if (cycle.includes('month')) {
        monthlyBurn += cost;
      } else if (cycle.includes('year') || cycle.includes('annual')) {
        monthlyBurn += cost / 12;
      } else if (cycle.includes('week')) {
        monthlyBurn += cost * 4.33;
      }
    }

    // Check renewals
    const renewalStr = item.renewalDate || item.renewal_date || item.expiryDate || item.expiration_date;
    if (renewalStr) {
      const renewalTime = new Date(renewalStr).getTime();
      if (!isNaN(renewalTime) && renewalTime >= (now - 86400000) && renewalTime <= thirtyDaysAhead) {
        upcomingRenewals.push({
          title: item.title || item.name || 'Untitled Service',
          cost,
          renewalDate: renewalStr,
          daysLeft: Math.ceil((renewalTime - now) / 86400000)
        });
      }
    }
  }

  upcomingRenewals.sort((a, b) => a.daysLeft - b.daysLeft);

  return {
    monthly_burn_rate: Math.round(monthlyBurn * 100) / 100,
    weekly_burn_rate: Math.round((monthlyBurn / 4.33) * 100) / 100,
    subscription_count: subCount,
    total_travel_credits: Math.round(travelCredits * 100) / 100,
    hardware_asset_value: Math.round(hardwareValue * 100) / 100,
    upcoming_renewals: upcomingRenewals
  };
}

/**
 * Fetch and sync Resource Tracker data (via local file or REST API)
 */
export async function syncResourceTracker(customPathOrUrl = null) {
  const state = loadSuperbrainData();
  let items = [];
  let sourceType = 'none';
  let resolvedSource = '';

  // 1. Try custom path or detected file
  const filePath = customPathOrUrl && fs.existsSync(customPathOrUrl) 
    ? customPathOrUrl 
    : (state.resource_tracker.source_path && fs.existsSync(state.resource_tracker.source_path) 
        ? state.resource_tracker.source_path 
        : detectResourceTrackerPath());

  if (filePath && fs.existsSync(filePath)) {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw);
      items = Array.isArray(data) ? data : (data.resources || data.items || []);
      sourceType = 'file';
      resolvedSource = filePath;
    } catch (e) {
      console.warn('Error reading Resource Tracker file:', e.message);
    }
  }

  // 2. Fallback: try REST API if file not found or empty
  if (items.length === 0) {
    const urlsToTry = [
      customPathOrUrl && customPathOrUrl.startsWith('http') ? customPathOrUrl : null,
      state.resource_tracker.api_url,
      'http://localhost:5174/api/resources',
      'http://localhost:5173/api/resources'
    ].filter(Boolean);

    for (const url of urlsToTry) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
        if (res.ok) {
          const data = await res.json();
          items = Array.isArray(data) ? data : (data.resources || data.items || []);
          sourceType = 'api';
          resolvedSource = url;
          break;
        }
      } catch (_) {
        // Continue trying
      }
    }
  }

  if (items.length > 0) {
    const computed = computeResourceMetrics(items);
    state.resource_tracker = {
      connected: true,
      source_type: sourceType,
      source_path: resolvedSource,
      api_url: state.resource_tracker.api_url,
      last_synced: new Date().toISOString(),
      metrics: {
        monthly_burn_rate: computed.monthly_burn_rate,
        weekly_burn_rate: computed.weekly_burn_rate,
        subscription_count: computed.subscription_count,
        total_travel_credits: computed.total_travel_credits,
        hardware_asset_value: computed.hardware_asset_value,
      },
      upcoming_renewals: computed.upcoming_renewals,
      items: items.slice(0, 100)
    };

    saveSuperbrainData(state);

    // Automatically update Living Dossier burn rate!
    await updateProfileField('user_profile.identity_and_baseline.burn_rate_weekly', computed.weekly_burn_rate);
    return { success: true, count: items.length, metrics: computed };
  }

  return { success: false, error: 'Could not connect to Resource Tracker file or API' };
}

/**
 * Import a Neon Brain JSON backup file (contains notes, tasks, prompts, resources)
 */
export function importNeonBrainBackup(filePathOrData) {
  const state = loadSuperbrainData();
  let data = null;

  if (typeof filePathOrData === 'string') {
    if (!fs.existsSync(filePathOrData)) {
      throw new Error(`File not found: ${filePathOrData}`);
    }
    const raw = fs.readFileSync(filePathOrData, 'utf-8');
    data = JSON.parse(raw);
  } else {
    data = filePathOrData;
  }

  const tasks = data.tasks || data.neon_brain_tasks_v1 || [];
  const notes = data.notes || data.neon_brain_notes_v1 || [];
  const prompts = data.prompts || data.neon_brain_prompts_v1 || [];
  const resources = data.resources || data.neon_brain_resources_v1 || [];

  const openTasks = tasks.filter(t => !t.completed && t.status !== 'done');
  const highPriority = openTasks.filter(t => t.priority === 'high' || t.priority === 'urgent');

  state.neon_brain = {
    connected: true,
    source_type: 'file',
    source_path: typeof filePathOrData === 'string' ? filePathOrData : 'Direct Import',
    last_synced: new Date().toISOString(),
    metrics: {
      open_tasks_count: openTasks.length,
      high_priority_tasks_count: highPriority.length,
      notes_count: notes.length,
      prompts_count: prompts.length,
    },
    tasks: tasks.slice(0, 100),
    notes: notes.slice(0, 50),
    prompts: prompts.slice(0, 50)
  };

  // If resources are also in this backup, merge them
  if (resources.length > 0 && (!state.resource_tracker.connected || state.resource_tracker.items.length === 0)) {
    const computed = computeResourceMetrics(resources);
    state.resource_tracker.connected = true;
    state.resource_tracker.source_type = 'neon-brain-backup';
    state.resource_tracker.metrics = {
      monthly_burn_rate: computed.monthly_burn_rate,
      weekly_burn_rate: computed.weekly_burn_rate,
      subscription_count: computed.subscription_count,
      total_travel_credits: computed.total_travel_credits,
      hardware_asset_value: computed.hardware_asset_value,
    };
    state.resource_tracker.upcoming_renewals = computed.upcoming_renewals;
    state.resource_tracker.items = resources;
    updateProfileField('user_profile.identity_and_baseline.burn_rate_weekly', computed.weekly_burn_rate);
  }

  saveSuperbrainData(state);
  return {
    success: true,
    tasksCount: tasks.length,
    notesCount: notes.length,
    promptsCount: prompts.length,
    resourcesCount: resources.length
  };
}

/**
 * Export a task or thought formatted for Neon Brain
 */
export function exportTaskToNeonBrainFormat(task) {
  return {
    id: `task-${Date.now()}`,
    title: task.title,
    description: task.description || '',
    priority: task.priority || 'medium',
    status: 'todo',
    dueDate: task.dueDate || null,
    tags: task.tags || ['digital-bestie'],
    createdAt: new Date().toISOString()
  };
}

/**
 * Generate formatted prompt snippet for the AI System Prompt
 */
export function getSuperbrainPromptSnippet() {
  const state = loadSuperbrainData();
  const sections = [];

  if (state.resource_tracker?.connected) {
    const m = state.resource_tracker.metrics;
    let sec = `### 🌌 RESOURCE TRACKER TELEMETRY
- Weekly Burn Rate: $${m.weekly_burn_rate} / week ($${m.monthly_burn_rate} / month)
- Active Subscriptions Tracked: ${m.subscription_count}
- Available Travel Credits & Vouchers: $${m.total_travel_credits}
- Tracked Hardware & Physical Assets Value: $${m.hardware_asset_value}`;

    if (state.resource_tracker.upcoming_renewals?.length > 0) {
      sec += `\n- Imminent Renewals (Next 30 Days):\n` +
        state.resource_tracker.upcoming_renewals.slice(0, 5).map(r => `  * ${r.title}: $${r.cost} (in ${r.daysLeft} days)`).join('\n');
    }
    sections.push(sec);
  }

  if (state.neon_brain?.connected) {
    const m = state.neon_brain.metrics;
    let sec = `### ⚡ NEON BRAIN (SECOND BRAIN BACKLOG)
- Open Tasks: ${m.open_tasks_count} (${m.high_priority_tasks_count} high priority)
- Thought Vault Notes: ${m.notes_count}
- Prompt Templates: ${m.prompts_count}`;

    const highPriTasks = (state.neon_brain.tasks || [])
      .filter(t => !t.completed && (t.priority === 'high' || t.priority === 'urgent'))
      .slice(0, 5);

    if (highPriTasks.length > 0) {
      sec += `\n- Top Urgent Tasks:\n` + highPriTasks.map(t => `  * [${t.priority.toUpperCase()}] ${t.title}`).join('\n');
    }
    sections.push(sec);
  }

  if (sections.length > 0) {
    return `\n\n## CONNECTED SUPERBRAIN TELEMETRY\n` + sections.join('\n\n');
  }

  return '';
}

/**
 * Add a new resource item to Resource Tracker from Digital Bestie
 */
export async function addResourceItem(resource) {
  const state = loadSuperbrainData();
  const newItem = {
    id: resource.id || `res-${Date.now()}`,
    title: resource.title || resource.name || 'Untitled Resource',
    category: resource.category || 'Subscription',
    cost: parseFloat(resource.cost) || 0,
    billingCycle: resource.billingCycle || resource.billing_cycle || 'Monthly',
    renewalDate: resource.renewalDate || resource.renewal_date || null,
    notes: resource.notes || '',
    createdAt: new Date().toISOString()
  };

  if (!Array.isArray(state.resource_tracker.items)) {
    state.resource_tracker.items = [];
  }

  // Prepend new item
  state.resource_tracker.items.unshift(newItem);

  const computed = computeResourceMetrics(state.resource_tracker.items);
  state.resource_tracker.connected = true;
  if (state.resource_tracker.source_type === 'none') {
    state.resource_tracker.source_type = 'digital-bestie';
  }
  state.resource_tracker.last_synced = new Date().toISOString();
  state.resource_tracker.metrics = {
    monthly_burn_rate: computed.monthly_burn_rate,
    weekly_burn_rate: computed.weekly_burn_rate,
    subscription_count: computed.subscription_count,
    total_travel_credits: computed.total_travel_credits,
    hardware_asset_value: computed.hardware_asset_value,
  };
  state.resource_tracker.upcoming_renewals = computed.upcoming_renewals;

  saveSuperbrainData(state);

  // If local file exists and is linked, append/save to file as well
  if (state.resource_tracker.source_path && fs.existsSync(state.resource_tracker.source_path)) {
    try {
      const raw = fs.readFileSync(state.resource_tracker.source_path, 'utf-8');
      const existing = JSON.parse(raw);
      if (Array.isArray(existing)) {
        existing.unshift(newItem);
        fs.writeFileSync(state.resource_tracker.source_path, JSON.stringify(existing, null, 2), 'utf-8');
      } else if (existing && typeof existing === 'object') {
        const listKey = existing.resources ? 'resources' : (existing.items ? 'items' : null);
        if (listKey && Array.isArray(existing[listKey])) {
          existing[listKey].unshift(newItem);
          fs.writeFileSync(state.resource_tracker.source_path, JSON.stringify(existing, null, 2), 'utf-8');
        }
      }
    } catch (err) {
      console.warn('Could not write back to original Resource Tracker file:', err.message);
    }
  }

  // Update profile burn rate automatically
  await updateProfileField('user_profile.identity_and_baseline.burn_rate_weekly', computed.weekly_burn_rate);

  return { success: true, item: newItem, metrics: computed };
}

/**
 * Delete a resource item from Resource Tracker
 */
export async function deleteResourceItem(itemId) {
  const state = loadSuperbrainData();
  if (!Array.isArray(state.resource_tracker.items)) {
    return { success: false, error: 'No items found' };
  }

  state.resource_tracker.items = state.resource_tracker.items.filter(i => i.id !== itemId);
  const computed = computeResourceMetrics(state.resource_tracker.items);
  state.resource_tracker.metrics = {
    monthly_burn_rate: computed.monthly_burn_rate,
    weekly_burn_rate: computed.weekly_burn_rate,
    subscription_count: computed.subscription_count,
    total_travel_credits: computed.total_travel_credits,
    hardware_asset_value: computed.hardware_asset_value,
  };
  state.resource_tracker.upcoming_renewals = computed.upcoming_renewals;

  saveSuperbrainData(state);

  // If local file exists, remove it there too
  if (state.resource_tracker.source_path && fs.existsSync(state.resource_tracker.source_path)) {
    try {
      const raw = fs.readFileSync(state.resource_tracker.source_path, 'utf-8');
      const existing = JSON.parse(raw);
      if (Array.isArray(existing)) {
        const filtered = existing.filter(i => i.id !== itemId);
        fs.writeFileSync(state.resource_tracker.source_path, JSON.stringify(filtered, null, 2), 'utf-8');
      } else if (existing && typeof existing === 'object') {
        const listKey = existing.resources ? 'resources' : (existing.items ? 'items' : null);
        if (listKey && Array.isArray(existing[listKey])) {
          existing[listKey] = existing[listKey].filter(i => i.id !== itemId);
          fs.writeFileSync(state.resource_tracker.source_path, JSON.stringify(existing, null, 2), 'utf-8');
        }
      }
    } catch (err) {
      console.warn('Could not write back to original Resource Tracker file:', err.message);
    }
  }

  await updateProfileField('user_profile.identity_and_baseline.burn_rate_weekly', computed.weekly_burn_rate);
  return { success: true, metrics: computed };
}
