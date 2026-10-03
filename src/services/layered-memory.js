/**
 * Digital Bestie — Layered Memory Architecture & Drift Detection
 * 
 * Features:
 * - Temporal Tiering: Segments memory into 3 retention horizons:
 *     Tier 1: Durable Preferences (Core Identity, Non-negotiable Rules) — Never Decays
 *     Tier 2: Day-to-Day Context (Active Sprints, Projects, Running Priorities) — 14-day half-life decay
 *     Tier 3: Short-term Working Memory (Current Session Scratchpad, Ephemeral Notes) — Fast decay / session purge
 * - Drift Detection: Continuous telemetry monitoring deviations in persona fidelity,
 *   decision routing entropy, and output quality against established calibration baselines.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadProfile } from "./memory.js";

const DATA_DIR = path.join(os.homedir(), ".digital-bestie");
const LAYERED_MEM_FILE = path.join(DATA_DIR, "layered_memory.json");
const DRIFT_FILE = path.join(DATA_DIR, "drift_telemetry.json");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadLayeredMemory() {
  ensureDataDir();
  if (fs.existsSync(LAYERED_MEM_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(LAYERED_MEM_FILE, "utf-8"));
    } catch {
      return getInitialMemory();
    }
  }
  const initial = getInitialMemory();
  saveLayeredMemory(initial);
  return initial;
}

function saveLayeredMemory(data) {
  ensureDataDir();
  fs.writeFileSync(LAYERED_MEM_FILE, JSON.stringify(data, null, 2), "utf-8");
}

function loadDriftData() {
  ensureDataDir();
  if (fs.existsSync(DRIFT_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(DRIFT_FILE, "utf-8"));
    } catch {
      return getInitialDriftData();
    }
  }
  const initial = getInitialDriftData();
  saveDriftData(initial);
  return initial;
}

function saveDriftData(data) {
  ensureDataDir();
  fs.writeFileSync(DRIFT_FILE, JSON.stringify(data, null, 2), "utf-8");
}

function getInitialMemory() {
  return {
    version: "1.0.0",
    tier1_durable: {
      core_rules: [
        "Uncensored, anti-moralizing, operationally focused.",
        "Prioritize local offline tool execution over cloud APIs.",
        "Protect deep work focus blocks and respect time defense buffers."
      ],
      user_traits: [],
      updated_at: new Date().toISOString()
    },
    tier2_sprint: [
      {
        id: "sprint-init-1",
        title: "Q4 Hawkeye Stack Integration & Wear OS Deployment",
        description: "Multi-agent orchestration, Qdrant RAG integration, and Wear OS companion launch.",
        created_at: new Date().toISOString(),
        last_accessed: new Date().toISOString(),
        weight: 1.0,
        status: "active"
      }
    ],
    tier3_working: [
      {
        id: "work-init-1",
        content: "Active session: Proactivity, Layered Memory & Ambient Governance implementation.",
        timestamp: new Date().toISOString(),
        ephemeral: true
      }
    ]
  };
}

function getInitialDriftData() {
  return {
    version: "1.0.0",
    baseline: {
      target_persona: "Digital Bestie Strategic Confidante",
      verbosity_target_words: 85,
      moralizing_tolerance: 0.0,
      tool_routing_ratio_target: 0.75,
      established_at: new Date().toISOString()
    },
    history: [],
    current_drift_score: 0.03,
    status: "OPTIMAL"
  };
}

export function addSprintItem({ title, description = "", weight = 1.0 }) {
  const mem = loadLayeredMemory();
  const newItem = {
    id: "sprint-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
    title,
    description,
    created_at: new Date().toISOString(),
    last_accessed: new Date().toISOString(),
    weight: Math.max(0.1, Math.min(1.0, weight)),
    status: "active"
  };
  mem.tier2_sprint.unshift(newItem);
  saveLayeredMemory(mem);
  return newItem;
}

export function addWorkingMemoryItem(content) {
  const mem = loadLayeredMemory();
  const newItem = {
    id: "work-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
    content,
    timestamp: new Date().toISOString(),
    ephemeral: true
  };
  mem.tier3_working.unshift(newItem);
  if (mem.tier3_working.length > 15) mem.tier3_working = mem.tier3_working.slice(0, 15);
  saveLayeredMemory(mem);
  return newItem;
}

export function clearWorkingMemory() {
  const mem = loadLayeredMemory();
  mem.tier3_working = [];
  saveLayeredMemory(mem);
  return { cleared: true, timestamp: new Date().toISOString() };
}

function calculateDecayedWeight(item) {
  const created = new Date(item.last_accessed || item.created_at).getTime();
  const daysElapsed = (Date.now() - created) / (1000 * 60 * 60 * 24);
  const lambda = 0.0495;
  const decayFactor = Math.exp(-lambda * daysElapsed);
  return (item.weight || 1.0) * decayFactor;
}

export function getTieredPromptContext() {
  const mem = loadLayeredMemory();
  const dossier = loadProfile();

  const durableRules = [...(mem.tier1_durable?.core_rules || [])];
  if (dossier.identity?.name) durableRules.push("Operator: " + dossier.identity.name);
  if (dossier.identity?.role) durableRules.push("Role: " + dossier.identity.role);

  const activeSprints = (mem.tier2_sprint || [])
    .map(item => ({ ...item, currentScore: calculateDecayedWeight(item) }))
    .filter(item => item.currentScore >= 0.15 && item.status === "active")
    .sort((a, b) => b.currentScore - a.currentScore);

  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const activeWorking = (mem.tier3_working || [])
    .filter(item => new Date(item.timestamp).getTime() >= oneDayAgo);

  const lines = [];
  lines.push("## LAYERED MEMORY ARCHITECTURE (TEMPORAL TIERS)");
  lines.push("### [TIER 1: DURABLE PREFERENCES & RULES] (Non-Decaying)");
  durableRules.forEach(r => lines.push("- " + r));

  lines.push("");
  lines.push("### [TIER 2: DAY-TO-DAY CONTEXT & ACTIVE SPRINTS] (Relevance-Decayed)");
  if (activeSprints.length === 0) {
    lines.push("- No active high-relevance sprint items.");
  } else {
    activeSprints.forEach(s => {
      lines.push("- [Relevance " + s.currentScore.toFixed(2) + "] **" + s.title + "**: " + s.description);
    });
  }

  lines.push("");
  lines.push("### [TIER 3: WORKING SCRATCHPAD] (Ephemeral / 24h Decay)");
  if (activeWorking.length === 0) {
    lines.push("- Working scratchpad is clear.");
  } else {
    activeWorking.forEach(w => {
      lines.push("- " + w.content);
    });
  }

  return lines.join("\n");
}

export function recordAndEvaluateDrift({ responseText = "", toolsUsed = [], userFeedback = null }) {
  const drift = loadDriftData();
  const wordCount = responseText.split(/\s+/).filter(Boolean).length;
  
  const moralizingKeywords = [/as an ai/i, /i cannot recommend/i, /it is important to remember/i, /please be mindful/i];
  let moralizingHits = 0;
  for (const rgx of moralizingKeywords) {
    if (rgx.test(responseText)) moralizingHits++;
  }

  const verbosityDiff = Math.abs(wordCount - drift.baseline.verbosity_target_words);
  const verbosityScore = Math.min(verbosityDiff / 200, 1.0);
  const hasToolExecution = toolsUsed.length > 0;
  const toolScore = hasToolExecution ? 0.0 : 0.05;

  const currentDrift = Math.min(1.0, (moralizingHits * 0.4) + (verbosityScore * 0.15) + toolScore);

  const evaluationEntry = {
    timestamp: new Date().toISOString(),
    drift_score: parseFloat(currentDrift.toFixed(3)),
    wordCount,
    moralizingHits,
    toolsUsedCount: toolsUsed.length,
    status: currentDrift > 0.20 ? "CRITICAL_DRIFT" : (currentDrift > 0.10 ? "MODERATE_DRIFT" : "OPTIMAL")
  };

  drift.history.unshift(evaluationEntry);
  if (drift.history.length > 50) drift.history.pop();

  const recent = drift.history.slice(0, 5);
  const avgDrift = recent.reduce((sum, e) => sum + e.drift_score, 0) / recent.length;
  drift.current_drift_score = parseFloat(avgDrift.toFixed(3));
  drift.status = avgDrift > 0.20 ? "CRITICAL_DRIFT" : (avgDrift > 0.10 ? "MODERATE_DRIFT" : "OPTIMAL");

  saveDriftData(drift);

  return {
    entryDriftScore: evaluationEntry.drift_score,
    driftScore: drift.current_drift_score,
    status: drift.status,
    alertNeeded: avgDrift > 0.15,
    recommendation: avgDrift > 0.15 ? "Trigger calibration recalibration and reset Tier 3 working memory." : "Persona alignment is within nominal limits."
  };
}

export function getDriftSummary() {
  const drift = loadDriftData();
  return {
    current_drift_score: drift.current_drift_score,
    status: drift.status,
    baseline: drift.baseline,
    recentEntries: drift.history.slice(0, 10)
  };
}
