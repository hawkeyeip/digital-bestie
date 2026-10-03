/**
 * Telemetry & Observability Engine
 * Tracks token usage, hardware utilization, MCP tool invocations,
 * DAG execution traces, and computational economics.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const DATA_DIR = path.join(os.homedir(), '.digital-bestie');
const TELEMETRY_PATH = path.join(DATA_DIR, 'telemetry.json');

const MAX_STORED_EVENTS = 200;

// Pricing benchmarks (USD per 1M tokens) for computational economics comparison
const BENCHMARK_RATES = {
  openai_gpt4: { prompt: 30.00, completion: 60.00 },
  claude_opus: { prompt: 15.00, completion: 75.00 },
  claude_sonnet: { prompt: 3.00, completion: 15.00 }
};

let telemetryState = null;

function getInitialState() {
  return {
    totals: {
      llmCalls: 0,
      promptTokens: 0,
      evalTokens: 0,
      totalTokens: 0,
      totalInferenceSeconds: 0,
      mcpToolCalls: 0,
      mcpToolSuccesses: 0,
      mcpToolFailures: 0,
      dagWorkflowsExecuted: 0,
      webhooksReceived: 0
    },
    toolsBreakdown: {},
    modelsUsed: {},
    events: [],
    lastUpdated: new Date().toISOString()
  };
}

function loadTelemetry() {
  if (telemetryState) return telemetryState;
  try {
    if (fs.existsSync(TELEMETRY_PATH)) {
      const raw = fs.readFileSync(TELEMETRY_PATH, 'utf-8');
      telemetryState = JSON.parse(raw);
      if (!telemetryState.totals) telemetryState = getInitialState();
    } else {
      telemetryState = getInitialState();
    }
  } catch (err) {
    console.warn(`[Telemetry] Failed to load ${TELEMETRY_PATH}, initializing fresh state.`);
    telemetryState = getInitialState();
  }
  return telemetryState;
}

function saveTelemetry() {
  if (!telemetryState) return;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    telemetryState.lastUpdated = new Date().toISOString();
    const temp = `${TELEMETRY_PATH}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(telemetryState, null, 2), 'utf-8');
    fs.renameSync(temp, TELEMETRY_PATH);
  } catch (err) {
    console.error(`[Telemetry] Error saving telemetry: ${err.message}`);
  }
}

/**
 * Record an LLM inference call
 */
export function recordLLMCall({
  model = 'bestie-abliterated',
  promptTokens = 0,
  evalTokens = 0,
  totalDurationMs = 0,
  evalDurationMs = 0,
  status = 'SUCCESS',
  error = null
}) {
  const state = loadTelemetry();
  const totals = state.totals;

  totals.llmCalls++;
  totals.promptTokens += promptTokens;
  totals.evalTokens += evalTokens;
  totals.totalTokens += (promptTokens + evalTokens);

  const durationSec = totalDurationMs / 1000;
  totals.totalInferenceSeconds += durationSec;

  state.modelsUsed[model] = (state.modelsUsed[model] || 0) + 1;

  const tps = evalDurationMs > 0 ? Math.round((evalTokens / (evalDurationMs / 1000)) * 10) / 10 : 0;

  state.events.unshift({
    id: crypto.randomUUID(),
    type: 'LLM_INFERENCE',
    name: model,
    durationMs: totalDurationMs,
    tokens: promptTokens + evalTokens,
    promptTokens,
    evalTokens,
    tokensPerSecond: tps,
    status,
    error,
    timestamp: new Date().toISOString()
  });

  if (state.events.length > MAX_STORED_EVENTS) {
    state.events.pop();
  }

  saveTelemetry();
}

/**
 * Record an MCP Tool invocation
 */
export function recordToolCall({
  toolName,
  silo = 'mcp',
  durationMs = 0,
  status = 'SUCCESS',
  sessionId = null,
  error = null
}) {
  const state = loadTelemetry();
  const totals = state.totals;

  totals.mcpToolCalls++;
  if (status === 'SUCCESS') {
    totals.mcpToolSuccesses++;
  } else {
    totals.mcpToolFailures++;
  }

  state.toolsBreakdown[toolName] = (state.toolsBreakdown[toolName] || 0) + 1;

  state.events.unshift({
    id: crypto.randomUUID(),
    type: 'MCP_TOOL',
    name: toolName,
    silo,
    durationMs,
    sessionId,
    status,
    error,
    timestamp: new Date().toISOString()
  });

  if (state.events.length > MAX_STORED_EVENTS) {
    state.events.pop();
  }

  saveTelemetry();
}

/**
 * Record a DAG Workflow execution
 */
export function recordDAGExecution({
  planId,
  title,
  durationMs = 0,
  nodesCount = 0,
  status = 'SUCCESS',
  error = null
}) {
  const state = loadTelemetry();
  state.totals.dagWorkflowsExecuted++;

  state.events.unshift({
    id: crypto.randomUUID(),
    type: 'DAG_WORKFLOW',
    name: title || planId,
    durationMs,
    nodesCount,
    status,
    error,
    timestamp: new Date().toISOString()
  });

  if (state.events.length > MAX_STORED_EVENTS) {
    state.events.pop();
  }

  saveTelemetry();
}

/**
 * Get aggregated telemetry summary, hardware status, and economic ROI
 */
export function getTelemetrySummary() {
  const state = loadTelemetry();
  const totals = state.totals;

  // Computational Economics (savings vs GPT-4 & Claude 3.5 Sonnet)
  const promptM = totals.promptTokens / 1_000_000;
  const evalM = totals.evalTokens / 1_000_000;

  const costEquivalentGPT4 = (promptM * BENCHMARK_RATES.openai_gpt4.prompt) + (evalM * BENCHMARK_RATES.openai_gpt4.completion);
  const costEquivalentSonnet = (promptM * BENCHMARK_RATES.claude_sonnet.prompt) + (evalM * BENCHMARK_RATES.claude_sonnet.completion);

  const avgTokensPerSec = totals.totalInferenceSeconds > 0
    ? Math.round((totals.evalTokens / totals.totalInferenceSeconds) * 10) / 10
    : 0;

  const toolSuccessRate = totals.mcpToolCalls > 0
    ? Math.round((totals.mcpToolSuccesses / totals.mcpToolCalls) * 100)
    : 100;

  // System Hardware Metrics (Apple Silicon)
  const totalMemGB = Math.round((os.totalmem() / (1024 ** 3)) * 10) / 10;
  const freeMemGB = Math.round((os.freemem() / (1024 ** 3)) * 10) / 10;
  const usedMemGB = Math.round((totalMemGB - freeMemGB) * 10) / 10;
  const memUsagePercent = Math.round((usedMemGB / totalMemGB) * 100);

  const procMem = process.memoryUsage();
  const appHeapUsedMB = Math.round(procMem.heapUsed / (1024 * 1024));

  return {
    economics: {
      totalTokens: totals.totalTokens,
      promptTokens: totals.promptTokens,
      evalTokens: totals.evalTokens,
      costSavedGPT4USD: Math.round(costEquivalentGPT4 * 100) / 100,
      costSavedSonnetUSD: Math.round(costEquivalentSonnet * 100) / 100,
      avgTokensPerSec
    },
    activity: {
      llmCalls: totals.llmCalls,
      mcpToolCalls: totals.mcpToolCalls,
      mcpSuccessRate: toolSuccessRate,
      dagWorkflows: totals.dagWorkflowsExecuted
    },
    hardware: {
      platform: `${os.type()} (${os.arch()})`,
      cpuModel: os.cpus()[0]?.model || 'Apple Silicon',
      cpuCores: os.cpus().length,
      totalMemoryGB: totalMemGB,
      usedMemoryGB: usedMemGB,
      freeMemoryGB: freeMemGB,
      memoryUsagePercent: memUsagePercent,
      appMemoryMB: appHeapUsedMB
    },
    toolsBreakdown: state.toolsBreakdown,
    modelsUsed: state.modelsUsed,
    recentEvents: state.events.slice(0, 30),
    lastUpdated: state.lastUpdated
  };
}

/**
 * Clear or reset telemetry counters
 */
export function clearTelemetry() {
  telemetryState = getInitialState();
  saveTelemetry();
  return { status: 'cleared' };
}
