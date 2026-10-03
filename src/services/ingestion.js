/**
 * Ingestion & Data Capture Engine
 * Universal webhook receivers, unstructured data parsing,
 * and automated cross-silo routing into TaskFlow and Superbrain.
 */

import http from 'node:http';
import crypto from 'node:crypto';
import { createTask } from './taskflow.js';
import { addResourceItem } from './superbrain.js';
import { indexMemoryItem } from './rag.js';

export const DEFAULT_WEBHOOK_PORT = 3848;

let webhookServer = null;
let serverPort = DEFAULT_WEBHOOK_PORT;
let ingestionStats = {
  totalIngested: 0,
  actionableTasksCreated: 0,
  referentialResourcesIndexed: 0,
  lastIngestedAt: null,
  recentEvents: []
};

/**
 * Heuristically triage raw text into Actionable vs Referential
 */
export function classifyContent(text, sourceUrl = '') {
  const lower = (text || '').toLowerCase();
  const urlLower = (sourceUrl || '').toLowerCase();

  const actionKeywords = [
    'todo', 'fix', 'bug', 'urgent', 'critical', 'deploy', 'implement',
    'deadline', 'action required', 'pr #', 'invoice', 'pay', 'submit', 'broken'
  ];

  const hasActionKeyword = actionKeywords.some(kw => lower.includes(kw));
  const isGithubIssueOrPR = urlLower.includes('github.com') && (urlLower.includes('/issues') || urlLower.includes('/pull'));

  const isActionable = hasActionKeyword || isGithubIssueOrPR;
  const isHighPriority = ['urgent', 'critical', 'immediately', 'broken', 'p0', 'security'].some(kw => lower.includes(kw));

  return {
    isActionable,
    priority: isHighPriority ? 'critical' : (isActionable ? 'high' : 'medium'),
    type: isActionable ? 'ACTIONABLE_TASK' : 'REFERENTIAL_RESOURCE'
  };
}

/**
 * Universal Ingestion Pipeline
 * Takes any incoming text/data, classifies it, routes to TaskFlow or Superbrain,
 * and embeds into Qdrant vector memory.
 */
export async function processIngestionPayload({
  text,
  source = 'universal_webhook',
  sourceUrl = '',
  title = '',
  contentType = 'text',
  metadata = {}
}) {
  const content = (text || '').trim();
  if (!content) {
    throw new Error('Ingestion payload content is empty.');
  }

  const classification = classifyContent(content, sourceUrl);
  const now = new Date().toISOString();

  // Extract clean title
  let derivedTitle = title;
  if (!derivedTitle) {
    const firstLine = content.split('\n')[0].replace(/^[#\*\-]+\s*/, '').trim();
    derivedTitle = firstLine.length > 70 ? `${firstLine.slice(0, 67)}...` : firstLine;
  }
  if (!derivedTitle) derivedTitle = `Captured ${source} Data`;

  let taskResult = null;
  let resourceResult = null;
  let qdrantResult = null;

  // 1. If Actionable, create task in TaskFlow
  if (classification.isActionable) {
    taskResult = await createTask({
      title: derivedTitle.startsWith('Action:') ? derivedTitle : `Action: ${derivedTitle}`,
      description: `Automated capture from [${source}](${sourceUrl || 'direct'}):\n\n${content}`,
      priority: classification.priority,
      tags: ['auto-ingestion', source.toLowerCase().replace(/[^a-z0-9]/g, '-')]
    });
    ingestionStats.actionableTasksCreated++;
  }

  // 2. Always register as reference knowledge in Superbrain / Resource Tracker
  resourceResult = await addResourceItem({
    name: derivedTitle,
    type: classification.isActionable ? 'action_memo' : (contentType === 'pdf' ? 'document' : 'snippet'),
    category: 'Ingestion Vault',
    url: sourceUrl,
    notes: `Ingested via ${source} at ${now}.\nClassification: ${classification.type}`,
    content
  });
  ingestionStats.referentialResourcesIndexed++;

  // 3. Autonomous Vector Embedding into Qdrant
  try {
    qdrantResult = await indexMemoryItem({
      text: `${derivedTitle}\n${content}`,
      name: derivedTitle,
      sourceModule: classification.isActionable ? 'taskflow_ingest' : 'resource_ingest',
      documentType: classification.type,
      sourceUrl,
      metadata: {
        ...metadata,
        source,
        taskId: taskResult?.id || null,
        priority: classification.priority
      }
    });
  } catch (err) {
    console.warn(`[Ingestion] Vector indexing failed: ${err.message}`);
  }

  // Update telemetry stats
  ingestionStats.totalIngested++;
  ingestionStats.lastIngestedAt = now;
  ingestionStats.recentEvents.unshift({
    id: crypto.randomUUID(),
    title: derivedTitle,
    source,
    type: classification.type,
    priority: classification.priority,
    taskId: taskResult?.id || null,
    timestamp: now
  });
  if (ingestionStats.recentEvents.length > 50) {
    ingestionStats.recentEvents.pop();
  }

  return {
    success: true,
    verdict: classification.type,
    title: derivedTitle,
    priority: classification.priority,
    taskCreated: taskResult,
    resourceCreated: resourceResult,
    vectorIndexed: qdrantResult
  };
}

/**
 * Start Universal Webhook HTTP Server
 */
export function startWebhookServer(port = DEFAULT_WEBHOOK_PORT) {
  if (webhookServer) {
    return Promise.resolve({ status: 'already_running', port: serverPort });
  }

  serverPort = port;
  return new Promise((resolve, reject) => {
    webhookServer = http.createServer(async (req, res) => {
      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      const url = new URL(req.url, `http://localhost:${serverPort}`);

      if (req.method === 'GET' && url.pathname === '/api/webhook/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', server: 'Digital Bestie Ingestion Webhook', stats: ingestionStats }));
        return;
      }

      if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
          try {
            let parsedBody = {};
            let rawText = body;
            try {
              parsedBody = JSON.parse(body);
              rawText = parsedBody.text || parsedBody.content || parsedBody.body || parsedBody.comment?.body || body;
            } catch (_) {
              // Raw text payload
            }

            let source = 'universal';
            let sourceUrl = parsedBody.url || parsedBody.html_url || '';
            let title = parsedBody.title || parsedBody.subject || '';

            if (url.pathname.includes('/github')) {
              source = 'github_webhook';
              title = parsedBody.issue?.title || parsedBody.pull_request?.title || parsedBody.head_commit?.message || 'GitHub Event';
              rawText = parsedBody.issue?.body || parsedBody.pull_request?.body || rawText;
              sourceUrl = parsedBody.issue?.html_url || parsedBody.pull_request?.html_url || sourceUrl;
            } else if (url.pathname.includes('/email')) {
              source = 'email_forward';
              title = parsedBody.subject || 'Incoming Email Digest';
              rawText = parsedBody.text || parsedBody.stripped_text || rawText;
            }

            const result = await processIngestionPayload({
              text: rawText,
              source,
              sourceUrl,
              title,
              metadata: parsedBody
            });

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
          } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: err.message }));
          }
        });
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Endpoint not found' }));
    });

    webhookServer.on('error', err => {
      console.error(`[WebhookServer] Error: ${err.message}`);
      reject(err);
    });

    webhookServer.listen(serverPort, '127.0.0.1', () => {
      console.log(`[WebhookServer] Ingestion receiver listening on http://127.0.0.1:${serverPort}`);
      resolve({ status: 'running', port: serverPort });
    });
  });
}

/**
 * Stop Webhook Server
 */
export function stopWebhookServer() {
  if (webhookServer) {
    webhookServer.close();
    webhookServer = null;
  }
}

/**
 * Get Ingestion Engine Status & Statistics
 */
export function getIngestionStats() {
  return {
    ...ingestionStats,
    serverRunning: webhookServer !== null,
    port: serverPort,
    webhookEndpoints: [
      `http://127.0.0.1:${serverPort}/api/webhook/universal`,
      `http://127.0.0.1:${serverPort}/api/webhook/github`,
      `http://127.0.0.1:${serverPort}/api/webhook/email`,
      `http://127.0.0.1:${serverPort}/api/webhook/health`
    ]
  };
}
