/**
 * Digital Bestie End-to-End Integration Test Suite
 * Validates:
 *   - Pillar 2: Knowledge Retrieval & Vector Store (RAG)
 *   - Pillar 3: Ingestion & Data Capture Engine (Webhooks & Unstructured Data)
 *   - Pillar 4: Telemetry & Observability Engine (Token Economics & Hardware)
 *   - Pillar 5: External Execution & Human-in-the-Loop (HITL) Gateway
 */

import { searchMemory, getRagPromptSnippet, getMemoryStats } from '../../src/services/rag.js';
import { startWebhookServer, stopWebhookServer, getIngestionStats, processIngestionPayload } from '../../src/services/ingestion.js';
import { recordLLMCall, recordToolCall, recordDAGExecution, getTelemetrySummary } from '../../src/services/telemetry.js';
import { requestExecution, getPendingApprovals, approveExecution, rejectExecution, getExecutionAuditLog, RISK_LEVELS } from '../../src/services/execution-node.js';

async function runTests() {
  console.log('============================================================');
  console.log('RUNNING DIGITAL BESTIE INTEGRATION VERIFICATION SUITE');
  console.log('============================================================\n');

  let passed = 0;
  let total = 4;

  // ──────────────────────────────────────────────────────────
  // TEST 1: RAG & Vector Memory
  // ──────────────────────────────────────────────────────────
  console.log('[TEST 1/4] Testing Knowledge Retrieval & Vector Store (RAG)...');
  try {
    const stats = await getMemoryStats();
    if (!stats.online) throw new Error('Qdrant service is offline');
    console.log(`  ✓ Qdrant connected: collection 'hawkeye_memory' has ${stats.pointsCount} points.`);

    const snippet = await getRagPromptSnippet('How do FastMCP and Qdrant communicate?');
    if (!snippet.includes('AUTONOMOUS RETRIEVAL CONTEXT')) {
      throw new Error('RAG snippet missing expected markdown context header');
    }
    console.log('  ✓ Autonomous retrieval injected memory context successfully.');
    passed++;
  } catch (err) {
    console.error('  ✗ TEST 1 FAILED:', err.message);
  }

  // ──────────────────────────────────────────────────────────
  // TEST 2: Ingestion & Webhook Capture
  // ──────────────────────────────────────────────────────────
  console.log('\n[TEST 2/4] Testing Ingestion & Webhook Capture Engine...');
  try {
    const srv = await startWebhookServer(3848);
    console.log(`  ✓ Webhook receiver listening on port ${srv.port}`);

    // Test POST to webhook endpoint via HTTP
    const res = await fetch(`http://127.0.0.1:${srv.port}/api/webhook/universal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Security Vulnerability Patch',
        text: 'CRITICAL BUG: Session token leaked in log stream. Patch immediately and rotate secrets.',
        source: 'sentry_alert',
        url: 'https://security.mesh/alerts/409'
      })
    });

    const data = await res.json();
    if (data.verdict !== 'ACTIONABLE_TASK' || !data.taskCreated) {
      throw new Error(`Ingestion expected ACTIONABLE_TASK with taskCreated, got ${JSON.stringify(data)}`);
    }
    console.log(`  ✓ Ingestion webhook classified payload as ${data.verdict} (Priority: ${data.priority})`);
    console.log(`  ✓ TaskFlow ticket spawned: "${data.title}"`);

    stopWebhookServer();
    passed++;
  } catch (err) {
    console.error('  ✗ TEST 2 FAILED:', err.message);
    stopWebhookServer();
  }

  // ──────────────────────────────────────────────────────────
  // TEST 3: Telemetry & Observability
  // ──────────────────────────────────────────────────────────
  console.log('\n[TEST 3/4] Testing Telemetry & Computational Economics...');
  try {
    recordLLMCall({
      model: 'bestie-abliterated',
      promptTokens: 1250,
      evalTokens: 420,
      totalDurationMs: 4800,
      evalDurationMs: 3800,
      status: 'SUCCESS'
    });

    recordToolCall({
      toolName: 'taskflow_create_task',
      silo: 'taskflow',
      durationMs: 35,
      status: 'SUCCESS'
    });

    recordDAGExecution({
      planId: 'plan-wfA-test',
      title: 'Workflow A: Experience Capitalization',
      durationMs: 240,
      nodesCount: 4,
      status: 'SUCCESS'
    });

    const summary = getTelemetrySummary();
    if (!summary.economics || summary.economics.totalTokens < 1670) {
      throw new Error('Telemetry totals did not accumulate properly');
    }
    if (summary.economics.costSavedGPT4USD <= 0) {
      throw new Error('Computational economics did not calculate GPT-4 savings');
    }

    console.log(`  ✓ Recorded tokens: ${summary.economics.totalTokens} tokens processed locally.`);
    console.log(`  ✓ Estimated ROI saved vs GPT-4 API: $${summary.economics.costSavedGPT4USD}`);
    console.log(`  ✓ System Hardware: ${summary.hardware.cpuModel} (${summary.hardware.usedMemoryGB}GB / ${summary.hardware.totalMemoryGB}GB used)`);
    console.log(`  ✓ Multi-Agent MCP Success Rate: ${summary.activity.mcpSuccessRate}%`);
    passed++;
  } catch (err) {
    console.error('  ✗ TEST 3 FAILED:', err.message);
  }

  // ──────────────────────────────────────────────────────────
  // TEST 4: Outbound Execution & HITL Gateway
  // ──────────────────────────────────────────────────────────
  console.log('\n[TEST 4/4] Testing Outbound Execution & Human-in-the-Loop Gateway...');
  try {
    // 1. Request high-risk action
    const req1 = requestExecution({
      actionType: 'send_email',
      target: 'executive@enterprise.org',
      payload: { subject: 'Automated Status Memo', body: 'Sprint 42 delivered.' },
      riskLevel: RISK_LEVELS.HIGH,
      description: 'Outbound B2B status memo'
    });

    if (req1.status !== 'PENDING_APPROVAL') {
      throw new Error(`Expected PENDING_APPROVAL, got ${req1.status}`);
    }
    console.log(`  ✓ Outbound action intercepted by HITL Gateway: ${req1.id} [${req1.riskLevel.toUpperCase()}]`);

    // 2. Approve action
    const approvalRes = await approveExecution(req1.id, 'Verified by operator');
    if (approvalRes.status !== 'EXECUTED' || !approvalRes.executionResult.sent) {
      throw new Error(`Expected EXECUTED status, got ${approvalRes.status}`);
    }
    console.log(`  ✓ Action approved and executed safely: ${approvalRes.requestId}`);

    // 3. Request second action and reject
    const req2 = requestExecution({
      actionType: 'shell_command',
      target: 'echo "destructive test"',
      riskLevel: RISK_LEVELS.DESTRUCTIVE,
      description: 'Dangerous shell execution test'
    });

    const rejectRes = rejectExecution(req2.id, 'Unauthorized dangerous operation');
    if (rejectRes.status !== 'REJECTED_BY_USER') {
      throw new Error(`Expected REJECTED_BY_USER, got ${rejectRes.status}`);
    }
    console.log(`  ✓ Destructive action successfully rejected by operator: ${rejectRes.requestId}`);

    const audit = getExecutionAuditLog(5);
    if (audit.length < 2) throw new Error('Audit log missing entries');
    console.log(`  ✓ Immutable audit trail contains ${audit.length} verified records.`);
    passed++;
  } catch (err) {
    console.error('  ✗ TEST 4 FAILED:', err.message);
  }

  // ──────────────────────────────────────────────────────────
  // RESULTS
  // ──────────────────────────────────────────────────────────
  console.log('\n============================================================');
  console.log(`VERIFICATION SUMMARY: ${passed}/${total} TEST SUITES PASSED`);
  console.log('============================================================\n');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
