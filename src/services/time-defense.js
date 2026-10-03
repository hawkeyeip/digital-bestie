/**
 * Digital Bestie — Time Defense & Autonomous Proactivity Engine
 * 
 * Features:
 * - Dynamic Calendar Shifting: auto-schedules task backlog into capacity-aware focus slots
 *   and shifts unfinished tasks forward.
 * - Focus Block Protection: defends deep work from external B2B interruptions by
 *   automatically generating decompression buffer times and flagging scheduling conflicts.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const DATA_DIR = path.join(os.homedir(), '.digital-bestie');
const SCHEDULE_FILE = path.join(DATA_DIR, 'calendar_schedule.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadScheduleData() {
  ensureDataDir();
  if (fs.existsSync(SCHEDULE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf-8'));
    } catch {
      return getInitialScheduleData();
    }
  }
  const initial = getInitialScheduleData();
  saveScheduleData(initial);
  return initial;
}

function saveScheduleData(data) {
  ensureDataDir();
  fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function getInitialScheduleData() {
  return {
    version: '1.0.0',
    config: {
      workDayStart: '09:00',
      workDayEnd: '18:00',
      defaultBufferMinutes: 20,
      focusBlockMinMinutes: 30,
      focusBlockMaxMinutes: 90,
      autoShiftOverdue: true,
      defenseLevel: 'STRICT'
    },
    blocks: [],
    threatAuditLog: []
  };
}

export function estimateTaskDuration(task) {
  if (task.estimated_minutes && task.estimated_minutes > 0) {
    return Math.min(Math.max(task.estimated_minutes, 15), 180);
  }
  const tagStr = (task.tags || []).join(' ') + ' ' + (task.title || '');
  const minMatch = tagStr.match(/\b(\d+)\s*(?:min|mins|m)\b/i);
  if (minMatch) return parseInt(minMatch[1], 10);
  const hourMatch = tagStr.match(/\b(\d+(?:\.\d+)?)\s*(?:h|hr|hours)\b/i);
  if (hourMatch) return Math.round(parseFloat(hourMatch[1]) * 60);

  switch ((task.priority || '').toLowerCase()) {
    case 'critical':
      return 90;
    case 'high':
      return 60;
    case 'medium':
      return 45;
    case 'low':
    default:
      return 30;
  }
}

function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(totalMins) {
  const h = Math.floor(totalMins / 60) % 24;
  const m = totalMins % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

export function getSchedule(dateStr = new Date().toISOString().slice(0, 10)) {
  const data = loadScheduleData();
  const dayBlocks = data.blocks.filter(b => b.date === dateStr);
  dayBlocks.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  return {
    date: dateStr,
    config: data.config,
    blocks: dayBlocks,
    summary: summarizeSchedule(dayBlocks, data.config)
  };
}

function summarizeSchedule(blocks, config) {
  const totalWorkMins = timeToMinutes(config.workDayEnd) - timeToMinutes(config.workDayStart);
  let focusMins = 0;
  let bufferMins = 0;
  let meetingMins = 0;

  for (const b of blocks) {
    const dur = timeToMinutes(b.endTime) - timeToMinutes(b.startTime);
    if (b.type === 'FOCUS') focusMins += dur;
    else if (b.type === 'BUFFER') bufferMins += dur;
    else if (b.type === 'MEETING') meetingMins += dur;
  }

  const freeMins = Math.max(0, totalWorkMins - (focusMins + bufferMins + meetingMins));
  return {
    totalCapacityMinutes: totalWorkMins,
    allocatedFocusMinutes: focusMins,
    protectedBufferMinutes: bufferMins,
    externalMeetingMinutes: meetingMins,
    freeMinutes: freeMins,
    focusBlockCount: blocks.filter(b => b.type === 'FOCUS').length,
    bufferCount: blocks.filter(b => b.type === 'BUFFER').length
  };
}

export function autoScheduleBacklog(tasks = [], targetDate = new Date().toISOString().slice(0, 10)) {
  const data = loadScheduleData();
  const { workDayStart, workDayEnd, defaultBufferMinutes } = data.config;
  
  const actionable = tasks.filter(t => t.status !== 'done' && t.status !== 'completed');
  const priorityWeight = { critical: 4, high: 3, medium: 2, low: 1 };
  actionable.sort((a, b) => (priorityWeight[b.priority] || 1) - (priorityWeight[a.priority] || 1));

  const existing = data.blocks.filter(b => b.date === targetDate && b.isManual);
  data.blocks = data.blocks.filter(b => !(b.date === targetDate && !b.isManual));

  let currentMinute = timeToMinutes(workDayStart);
  const endMinute = timeToMinutes(workDayEnd);
  const newBlocks = [];

  for (const task of actionable) {
    const duration = estimateTaskDuration(task);
    if (currentMinute + duration > endMinute) break;

    for (const mb of existing) {
      const mbStart = timeToMinutes(mb.startTime);
      const mbEnd = timeToMinutes(mb.endTime);
      if (currentMinute < mbEnd && currentMinute + duration > mbStart) {
        currentMinute = mbEnd + defaultBufferMinutes;
        break;
      }
    }

    if (currentMinute + duration > endMinute) break;

    const focusBlock = {
      id: 'focus-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      date: targetDate,
      taskId: task.id,
      title: '⚡ Deep Work: ' + task.title,
      type: 'FOCUS',
      priority: task.priority || 'medium',
      startTime: minutesToTime(currentMinute),
      endTime: minutesToTime(currentMinute + duration),
      durationMinutes: duration,
      isProtected: true,
      isManual: false,
      status: 'scheduled'
    };
    newBlocks.push(focusBlock);
    currentMinute += duration;

    if (currentMinute + defaultBufferMinutes <= endMinute) {
      const bufferBlock = {
        id: 'buf-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        date: targetDate,
        title: '🛡️ Focus Buffer & Decompression',
        type: 'BUFFER',
        startTime: minutesToTime(currentMinute),
        endTime: minutesToTime(currentMinute + defaultBufferMinutes),
        durationMinutes: defaultBufferMinutes,
        isProtected: true,
        isManual: false,
        status: 'active'
      };
      newBlocks.push(bufferBlock);
      currentMinute += defaultBufferMinutes;
    }
  }

  data.blocks.push(...existing, ...newBlocks);
  saveScheduleData(data);

  return {
    scheduledCount: newBlocks.filter(b => b.type === 'FOCUS').length,
    bufferCount: newBlocks.filter(b => b.type === 'BUFFER').length,
    blocks: newBlocks
  };
}

export function shiftUnfinishedTasks(tasks = [], asOfTimeStr = null) {
  const data = loadScheduleData();
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const currentTimeMins = asOfTimeStr ? timeToMinutes(asOfTimeStr) : (now.getHours() * 60 + now.getMinutes());

  const taskDoneMap = new Map();
  for (const t of tasks) {
    taskDoneMap.set(String(t.id), t.status === 'done' || t.status === 'completed');
  }

  let shiftedCount = 0;
  const shiftedBlocks = [];

  for (const block of data.blocks) {
    if (block.type !== 'FOCUS' || !block.taskId) continue;
    if (block.date > todayStr) continue;

    const isDone = taskDoneMap.get(String(block.taskId));
    const blockEndMins = timeToMinutes(block.endTime);

    if (!isDone && (block.date < todayStr || blockEndMins < currentTimeMins)) {
      block.status = 'shifted';
      const nextDate = new Date(now.getTime() + 86400000).toISOString().slice(0, 10);
      const newBlock = {
        ...block,
        id: 'focus-shift-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        date: nextDate,
        startTime: '10:00',
        endTime: minutesToTime(timeToMinutes('10:00') + block.durationMinutes),
        status: 'scheduled',
        isManual: false,
        shiftedFrom: block.id
      };
      shiftedBlocks.push(newBlock);
      shiftedCount++;
    }
  }

  if (shiftedCount > 0) {
    data.blocks.push(...shiftedBlocks);
    saveScheduleData(data);
  }

  return {
    shiftedCount,
    shiftedBlocks
  };
}

export function checkInterruptionThreats(proposedEvent) {
  const data = loadScheduleData();
  const { date, startTime, endTime, title = 'External Meeting' } = proposedEvent;
  const propStart = timeToMinutes(startTime);
  const propEnd = timeToMinutes(endTime);

  const dayBlocks = data.blocks.filter(b => b.date === date && b.status !== 'shifted');
  const conflicts = [];

  for (const b of dayBlocks) {
    const bStart = timeToMinutes(b.startTime);
    const bEnd = timeToMinutes(b.endTime);

    if (propStart < bEnd && propEnd > bStart) {
      conflicts.push({
        blockId: b.id,
        blockTitle: b.title,
        type: b.type,
        overlapMinutes: Math.min(propEnd, bEnd) - Math.max(propStart, bStart),
        threatLevel: b.type === 'FOCUS' ? 'CRITICAL_INTERRUPTION' : 'BUFFER_EROSION'
      });
    }
  }

  const isThreat = conflicts.length > 0;
  let counterProposals = [];

  if (isThreat) {
    const { workDayStart, workDayEnd } = data.config;
    const dur = propEnd - propStart;
    let scanMin = timeToMinutes(workDayStart);
    const maxScan = timeToMinutes(workDayEnd) - dur;

    while (scanMin <= maxScan && counterProposals.length < 2) {
      const scanEnd = scanMin + dur;
      const overlaps = dayBlocks.some(b => {
        const bs = timeToMinutes(b.startTime);
        const be = timeToMinutes(b.endTime);
        return scanMin < be && scanEnd > bs;
      });

      if (!overlaps) {
        counterProposals.push({
          date,
          startTime: minutesToTime(scanMin),
          endTime: minutesToTime(scanEnd)
        });
        scanMin += dur + 30;
      } else {
        scanMin += 15;
      }
    }

    data.threatAuditLog.unshift({
      timestamp: new Date().toISOString(),
      proposedEvent: { title, date, startTime, endTime },
      conflicts,
      counterProposals,
      decision: 'BLOCKED_DEFENSE_ENGAGED'
    });
    if (data.threatAuditLog.length > 50) data.threatAuditLog.pop();
    saveScheduleData(data);
  }

  return {
    isThreat,
    defenseAction: isThreat ? 'DEFENSE_ENGAGED' : 'APPROVED_NO_CONFLICT',
    conflicts,
    contextSwitchCostMinutes: isThreat ? 25 : 0,
    recommendedAlternatives: counterProposals
  };
}

export function getActiveDefenseStatus() {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const currentMins = now.getHours() * 60 + now.getMinutes();

  const data = loadScheduleData();
  const dayBlocks = data.blocks.filter(b => b.date === todayStr && b.status !== 'shifted');

  let activeBlock = null;
  for (const b of dayBlocks) {
    const bStart = timeToMinutes(b.startTime);
    const bEnd = timeToMinutes(b.endTime);
    if (currentMins >= bStart && currentMins < bEnd) {
      activeBlock = {
        ...b,
        remainingMinutes: bEnd - currentMins
      };
      break;
    }
  }

  return {
    timestamp: now.toISOString(),
    defenseActive: true,
    defenseLevel: data.config.defenseLevel,
    isInFocusBlock: activeBlock ? activeBlock.type === 'FOCUS' : false,
    isInBuffer: activeBlock ? activeBlock.type === 'BUFFER' : false,
    activeBlockTitle: activeBlock ? activeBlock.title : 'No active focus block',
    remainingMinutes: activeBlock ? activeBlock.remainingMinutes : 0,
    activeTask: activeBlock ? activeBlock.taskId : null
  };
}
