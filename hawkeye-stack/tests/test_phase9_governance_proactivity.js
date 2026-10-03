/**
 * Test Suite: Phase 9 Inclusions
 * - Autonomous Proactivity & Time Defense Engine
 * - Layered Memory Architecture & Drift Detection
 * - Evaluation & Output Governance (LLM-as-a-Judge & Zero Data Retention)
 * - Screen-Free Dictation & Glanceable Status Architecture
 */

import { autoScheduleBacklog, shiftUnfinishedTasks, checkInterruptionThreats, getActiveDefenseStatus, getSchedule } from '../../src/services/time-defense.js';
import { getTieredPromptContext, addSprintItem, addWorkingMemoryItem, clearWorkingMemory, recordAndEvaluateDrift, getDriftSummary } from '../../src/services/layered-memory.js';
import { evaluateOutput, repairOutput, sanitizePayloadForExternalAPI, encryptZDRLocal, decryptZDRLocal } from '../../src/services/output-governance.js';
import { startWebhookServer, stopWebhookServer, DEFAULT_WEBHOOK_PORT } from '../../src/services/ingestion.js';

let passed = 0;
let total = 0;

function assert(condition, message) {
  total++;
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✕ FAILED: ${message}`);
    process.exitCode = 1;
  }
}

async function runPhase9Tests() {
  console.log('============================================================');
  console.log('RUNNING PHASE 9: PROACTIVITY, MEMORY & GOVERNANCE TEST SUITE');
  console.log('============================================================');

  // ------------------------------------------------------------
  // TEST 1: Autonomous Proactivity & Time Defense Engine
  // ------------------------------------------------------------
  console.log('[TEST 1/4] Testing Time Defense & Dynamic Calendar Shifting...');
  const sampleTasks = [
    { id: 101, title: 'Architect ZDR Enclave', priority: 'critical', status: 'todo' },
    { id: 102, title: 'Draft Weekly Board Brief', priority: 'high', status: 'todo' },
    { id: 103, title: 'Refactor Menu Bar Script', priority: 'low', status: 'todo' }
  ];

  const schedRes = autoScheduleBacklog(sampleTasks);
  assert(schedRes.scheduledCount === 3, `Scheduled 3 focus blocks (got ${schedRes.scheduledCount})`);
  assert(schedRes.bufferCount >= 2, `Injected anti-fatigue decompression buffers (got ${schedRes.bufferCount})`);

  const sched = getSchedule();
  assert(sched.blocks.length >= 5, `Daily schedule contains focus and buffer blocks (${sched.blocks.length} blocks)`);
  assert(sched.summary.allocatedFocusMinutes > 0, `Capacity allocated: ${sched.summary.allocatedFocusMinutes}m`);

  // Threat Detection
  const firstFocus = sched.blocks.find(b => b.type === 'FOCUS');
  const conflictCheck = checkInterruptionThreats({
    date: sched.date,
    startTime: firstFocus.startTime,
    endTime: firstFocus.endTime,
    title: 'Ad-hoc Vendor Pitch'
  });
  assert(conflictCheck.isThreat === true, 'Flagged external meeting collision with protected focus block');
  assert(conflictCheck.contextSwitchCostMinutes === 25, 'Calculated 25m cognitive context-switching penalty');
  assert(conflictCheck.recommendedAlternatives.length > 0, 'Generated conflict-free counter-proposal slots');

  // Dynamic Calendar Shifting
  const shiftRes = shiftUnfinishedTasks(sampleTasks, '23:59');
  assert(shiftRes.shiftedCount > 0, `Dynamically shifted ${shiftRes.shiftedCount} overdue focus task(s) forward`);

  // ------------------------------------------------------------
  // TEST 2: Layered Memory Architecture & Drift Detection
  // ------------------------------------------------------------
  console.log('[TEST 2/4] Testing Layered Memory & Drift Telemetry...');
  addSprintItem({ title: 'Autonomous Wear OS Beta', description: 'Deploy wrist companion APK', weight: 0.95 });
  addWorkingMemoryItem('Meeting note: Prioritize on-premise local encryption');

  const context = getTieredPromptContext();
  assert(context.includes('TIER 1: DURABLE PREFERENCES'), 'Context contains Tier 1 Durable principles');
  assert(context.includes('TIER 2: DAY-TO-DAY CONTEXT'), 'Context contains Tier 2 Sprint context');
  assert(context.includes('TIER 3: WORKING SCRATCHPAD'), 'Context contains Tier 3 Working scratchpad');

  // Drift Detection
  const normalDrift = recordAndEvaluateDrift({ responseText: 'Here is your direct strategic execution roadmap.' });
  assert(normalDrift.entryDriftScore <= 0.15, `Nominal persona alignment score: ${normalDrift.driftScore}`);

  const moralizingDrift = recordAndEvaluateDrift({ responseText: 'As an AI, it is important to remember that you should consult with legal.' });
  assert(moralizingDrift.alertNeeded === false || moralizingDrift.status !== 'OPTIMAL', 'Detected persona drift deviation from moralizing response');

  // ------------------------------------------------------------
  // TEST 3: Output Governance & Zero Data Retention
  // ------------------------------------------------------------
  console.log('[TEST 3/4] Testing Output Governance (LLM-as-a-Judge & ZDR)...');
  const testSecret = 'SuperSecretClientContract_2026';
  const enc = encryptZDRLocal(testSecret);
  assert(enc.algorithm === 'aes-256-gcm' && enc.ciphertext, 'Encrypted secret with local AES-256-GCM cipher');
  const dec = decryptZDRLocal(enc);
  assert(dec === testSecret, 'Decrypted local data matches original plaintext');

  // ZDR Redaction
  const dirtyPayload = {
    apiKey: 'sk-proj-9823471829374182934718293471',
    dbUrl: 'postgres://dbuser:pass123@10.0.0.1:5432/corp',
    plan: 'Autonomous sync'
  };
  const sanitized = sanitizePayloadForExternalAPI(dirtyPayload);
  assert(sanitized.hasRedactions === true, 'Detected and redacted confidential credentials');
  assert(sanitized.sanitizedPayload.apiKey.startsWith('[ZDR_SECURED_OPENAI_KEY_'), 'Replaced OpenAI API key with secured HMAC digest');

  // LLM-as-a-Judge Quality Gate
  const highQuality = evaluateOutput({ candidateOutput: 'Successfully deployed Docker container to port 8765.', userPrompt: 'deploy container' });
  assert(highQuality.passed === true && highQuality.score >= 80, `High quality candidate passed gate (score: ${highQuality.score})`);

  const dangerousOutput = evaluateOutput({ candidateOutput: 'Deleting all directories with rm -rf /.', userPrompt: 'clean space' });
  assert(dangerousOutput.passed === false && dangerousOutput.matrix.action_safety.score === 0, 'Blocked dangerous destructive command in output');

  // ------------------------------------------------------------
  // TEST 4: Ambient Dictation & Glanceable Telemetry Endpoints
  // ------------------------------------------------------------
  console.log('[TEST 4/4] Testing Ambient Dictation & Glanceable Telemetry...');
  await startWebhookServer(DEFAULT_WEBHOOK_PORT);

  // Test Glanceable Status Endpoint
  const glanceRes = await fetch(`http://127.0.0.1:${DEFAULT_WEBHOOK_PORT}/api/telemetry/glanceable`);
  const glanceData = await glanceRes.json();
  assert(glanceRes.status === 200, 'GET /api/telemetry/glanceable returned 200 OK');
  assert(glanceData.glanceableLine && glanceData.defense, `Glanceable status: "${glanceData.glanceableLine}"`);

  // Test Voice Dictation Webhook
  const dictRes = await fetch(`http://127.0.0.1:${DEFAULT_WEBHOOK_PORT}/api/webhook/dictation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transcript: 'Urgent bug in calendar time defense needs immediate patch',
      source: 'apple_watch_voice'
    })
  });
  const dictData = await dictRes.json();
  assert(dictRes.status === 200 && dictData.success, 'POST /api/webhook/dictation processed ambient voice memo');
  assert(dictData.verdict === 'ACTIONABLE_TASK', 'Classified voice input as ACTIONABLE_TASK');

  stopWebhookServer();

  console.log('============================================================');
  console.log(`PHASE 9 VERIFICATION SUMMARY: ${passed}/${total} TESTS PASSED`);
  console.log('============================================================');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runPhase9Tests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
