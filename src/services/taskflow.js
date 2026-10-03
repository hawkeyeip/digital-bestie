/**
 * TaskFlow Service — Native Kanban Task Manager for Digital Bestie
 * Handles CRUD operations, priority tagging, status columns,
 * due date tracking, ordering, and persistent encrypted storage.
 */

import crypto from 'node:crypto';
import path from 'node:path';
import { DATA_DIR, loadSecureJSON, saveSecureJSON } from './memory.js';

const TASKFLOW_PATH = path.join(DATA_DIR, 'taskflow.json');

const DEFAULT_TASKS = [
  {
    id: 'tf-sample-1',
    title: 'Audit monthly burn rate & recurring subscriptions',
    description: 'Review Resource Tracker telemetry to eliminate inactive SaaS charges.',
    status: 'todo',
    priority: 'high',
    tags: ['finance', 'admin'],
    due_date: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0],
    position: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    completed_at: null
  },
  {
    id: 'tf-sample-2',
    title: 'Deepen 90-Day North Star in Calibration Lab',
    description: 'Run a 1-on-1 interview session with Dossier Interviewer to refine primary goals.',
    status: 'in_progress',
    priority: 'critical',
    tags: ['strategy', 'mindset'],
    due_date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
    position: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    completed_at: null
  },
  {
    id: 'tf-sample-3',
    title: 'Install TaskFlow Kanban module into Digital Bestie',
    description: 'Embed task manager service, IPC bridge, sidebar nav, and interactive board.',
    status: 'done',
    priority: 'medium',
    tags: ['dev', 'integration'],
    due_date: new Date().toISOString().split('T')[0],
    position: 0,
    created_at: new Date(Date.now() - 86400000).toISOString(),
    updated_at: new Date().toISOString(),
    completed_at: new Date().toISOString()
  }
];

/**
 * Load raw task collection from encrypted disk storage
 */
function loadAllRawTasks() {
  const data = loadSecureJSON(TASKFLOW_PATH, { tasks: DEFAULT_TASKS });
  if (!Array.isArray(data.tasks)) {
    data.tasks = DEFAULT_TASKS;
  }
  return data.tasks;
}

/**
 * Save raw task collection to encrypted disk storage
 */
function saveAllRawTasks(tasks) {
  saveSecureJSON(TASKFLOW_PATH, { tasks });
}

/**
 * Retrieve tasks with optional filtering and sorting
 */
export function loadTasks({ status, priority, search, sort = 'position', order = 'asc' } = {}) {
  let tasks = loadAllRawTasks();

  // Exclude archived by default unless specifically asked
  if (!status || status === 'all') {
    tasks = tasks.filter(t => t.status !== 'archived');
  } else if (status) {
    tasks = tasks.filter(t => t.status === status);
  }

  if (priority && priority !== 'all') {
    tasks = tasks.filter(t => t.priority === priority);
  }

  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    tasks = tasks.filter(t => {
      const matchTitle = (t.title || '').toLowerCase().includes(q);
      const matchDesc = (t.description || '').toLowerCase().includes(q);
      const matchTags = Array.isArray(t.tags) && t.tags.some(tag => (tag || '').toLowerCase().includes(q));
      return matchTitle || matchDesc || matchTags;
    });
  }

  // Sort
  const sortMultiplier = order === 'desc' ? -1 : 1;
  const priorityRank = { critical: 0, high: 1, medium: 2, low: 3 };

  tasks.sort((a, b) => {
    if (sort === 'priority') {
      const rankA = priorityRank[a.priority] ?? 2;
      const rankB = priorityRank[b.priority] ?? 2;
      if (rankA !== rankB) return (rankA - rankB) * sortMultiplier;
      return (a.position - b.position);
    }
    if (sort === 'due_date') {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date) * sortMultiplier;
    }
    if (sort === 'title') {
      return (a.title || '').localeCompare(b.title || '') * sortMultiplier;
    }
    if (sort === 'created_at') {
      return (a.created_at || '').localeCompare(b.created_at || '') * sortMultiplier;
    }
    // Default: position
    return ((a.position ?? 0) - (b.position ?? 0)) * sortMultiplier;
  });

  return tasks;
}

/**
 * Retrieve a single task by ID
 */
export function getTaskById(id) {
  const tasks = loadAllRawTasks();
  return tasks.find(t => t.id === id) || null;
}

/**
 * Create a new task
 */
export function createTask({ title, description = '', status = 'todo', priority = 'medium', tags = [], due_date = null }) {
  if (!title || !title.trim()) {
    throw new Error('Task title is required');
  }

  const tasks = loadAllRawTasks();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  // Find max position in the destination status column
  const columnTasks = tasks.filter(t => t.status === status);
  const maxPos = columnTasks.reduce((max, t) => Math.max(max, t.position ?? 0), -1);

  const newTask = {
    id,
    title: title.trim(),
    description: (description || '').trim(),
    status: ['todo', 'in_progress', 'done', 'archived'].includes(status) ? status : 'todo',
    priority: ['critical', 'high', 'medium', 'low'].includes(priority) ? priority : 'medium',
    tags: Array.isArray(tags) ? tags.map(t => String(t).trim()).filter(Boolean) : [],
    due_date: due_date || null,
    position: maxPos + 1,
    created_at: now,
    updated_at: now,
    completed_at: status === 'done' ? now : null
  };

  tasks.push(newTask);
  saveAllRawTasks(tasks);
  return newTask;
}

/**
 * Update an existing task
 */
export function updateTask(id, updates = {}) {
  const tasks = loadAllRawTasks();
  const idx = tasks.findIndex(t => t.id === id);
  if (idx === -1) return null;

  const existing = tasks[idx];
  const now = new Date().toISOString();

  let completed_at = existing.completed_at;
  if (updates.status && updates.status === 'done' && existing.status !== 'done') {
    completed_at = now;
  } else if (updates.status && updates.status !== 'done') {
    completed_at = null;
  }

  const updated = {
    ...existing,
    title: updates.title !== undefined ? String(updates.title).trim() : existing.title,
    description: updates.description !== undefined ? String(updates.description).trim() : existing.description,
    status: updates.status !== undefined ? updates.status : existing.status,
    priority: updates.priority !== undefined ? updates.priority : existing.priority,
    tags: updates.tags !== undefined ? (Array.isArray(updates.tags) ? updates.tags : []) : existing.tags,
    due_date: updates.due_date !== undefined ? updates.due_date : existing.due_date,
    position: updates.position !== undefined ? updates.position : existing.position,
    updated_at: now,
    completed_at
  };

  tasks[idx] = updated;
  saveAllRawTasks(tasks);
  return updated;
}

/**
 * Delete a task by ID
 */
export function deleteTask(id) {
  const tasks = loadAllRawTasks();
  const idx = tasks.findIndex(t => t.id === id);
  if (idx === -1) return null;

  const [removed] = tasks.splice(idx, 1);
  saveAllRawTasks(tasks);
  return removed;
}

/**
 * Batch reorder task positions
 */
export function reorderTasks(taskOrders = []) {
  if (!Array.isArray(taskOrders) || taskOrders.length === 0) return true;
  const tasks = loadAllRawTasks();
  const orderMap = new Map(taskOrders.map(o => [o.id, o.position]));
  const now = new Date().toISOString();

  let modified = false;
  tasks.forEach(t => {
    if (orderMap.has(t.id)) {
      t.position = orderMap.get(t.id);
      t.updated_at = now;
      modified = true;
    }
  });

  if (modified) {
    saveAllRawTasks(tasks);
  }
  return true;
}

/**
 * Calculate dashboard metrics and counts
 */
export function getTaskStats() {
  const tasks = loadAllRawTasks();
  const nowStr = new Date().toISOString().split('T')[0];

  const stats = {
    total: tasks.filter(t => t.status !== 'archived').length,
    todo: 0,
    in_progress: 0,
    done: 0,
    archived: 0,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    overdue: 0
  };

  tasks.forEach(t => {
    if (t.status === 'archived') {
      stats.archived++;
      return;
    }

    if (t.status === 'todo') stats.todo++;
    else if (t.status === 'in_progress') stats.in_progress++;
    else if (t.status === 'done') stats.done++;

    if (t.priority === 'critical') stats.critical++;
    else if (t.priority === 'high') stats.high++;
    else if (t.priority === 'medium') stats.medium++;
    else if (t.priority === 'low') stats.low++;

    if (t.due_date && t.due_date < nowStr && t.status !== 'done') {
      stats.overdue++;
    }
  });

  return stats;
}

/**
 * Sync tasks with Neon Brain (Superbrain) backlog
 */
export function syncTaskflowToNeonBrain() {
  try {
    const tasks = loadAllRawTasks();
    const stats = getTaskStats();
    return {
      success: true,
      syncedCount: tasks.length,
      stats
    };
  } catch (err) {
    console.error('[TaskFlow] Sync error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Prompt snippet for AI context injection into Digital Bestie's system prompt
 */
export function getTaskflowPromptSnippet() {
  try {
    const stats = getTaskStats();
    if (stats.total === 0) return '';

    let snippet = `\n### 📋 TASKFLOW KANBAN TELEMETRY (USER WORKLOAD)\n`;
    snippet += `- Active Tasks: ${stats.todo} To Do, ${stats.in_progress} In Progress, ${stats.done} Completed\n`;
    snippet += `- Priority Breakdown: ${stats.critical} Critical, ${stats.high} High, ${stats.medium} Medium, ${stats.low} Low\n`;
    if (stats.overdue > 0) {
      snippet += `- ⚠️ Overdue Deadlines: ${stats.overdue} task(s) currently past due!\n`;
    }

    // List top urgent/in-progress items
    const tasks = loadAllRawTasks().filter(t => t.status !== 'done' && t.status !== 'archived');
    const urgentItems = tasks
      .filter(t => t.priority === 'critical' || t.priority === 'high' || (t.due_date && t.due_date < new Date().toISOString().split('T')[0]))
      .slice(0, 3);

    if (urgentItems.length > 0) {
      snippet += `- Imminent & High-Priority Focus Items:\n`;
      urgentItems.forEach(t => {
        snippet += `  * [${t.priority.toUpperCase()}] "${t.title}" (${t.status === 'in_progress' ? 'In Progress' : 'To Do'}${t.due_date ? `, Due: ${t.due_date}` : ''})\n`;
      });
    }

    return snippet;
  } catch (err) {
    return '';
  }
}

/**
 * Wear OS Companion Helpers for Google Wear OS smartwatches
 */

export function getWearTasks() {
  const rawTasks = loadAllRawTasks().filter(t => t.status !== 'archived');
  const nowStr = new Date().toISOString().split('T')[0];

  return rawTasks.map(t => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    completed: t.status === 'done',
    due_date: t.due_date,
    is_overdue: !!(t.due_date && t.due_date < nowStr && t.status !== 'done'),
    tags: t.tags || []
  }));
}

export function toggleWearTask(id) {
  const task = getTaskById(id);
  if (!task) return null;
  const nextStatus = task.status === 'done' ? 'todo' : 'done';
  return updateTask(id, { status: nextStatus });
}

export function quickAddWearTask({ title, priority = 'medium' }) {
  return createTask({
    title,
    description: 'Captured via Google Wear OS wrist input',
    priority,
    status: 'todo',
    tags: ['wear-os', 'quick-capture']
  });
}

export function getWearTileData() {
  const stats = getTaskStats();
  const topTasks = loadAllRawTasks()
    .filter(t => t.status !== 'done' && t.status !== 'archived')
    .slice(0, 3)
    .map(t => ({ id: t.id, title: t.title, priority: t.priority, status: t.status }));

  return {
    success: true,
    tileTitle: 'TaskFlow Duties',
    pendingCount: stats.todo + stats.in_progress,
    overdueCount: stats.overdue,
    criticalCount: stats.critical,
    tasks: topTasks,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };
}
