/**
 * RAG & Knowledge Retrieval Service
 * Connects Digital Bestie directly to the local Qdrant Vector Database (port 6333)
 * and Ollama nomic-embed-text (port 11434).
 * Enables autonomous semantic memory retrieval for conversational context injection.
 */

import crypto from 'node:crypto';

export const QDRANT_BASE_URL = process.env.QDRANT_URL || 'http://localhost:6333';
export const OLLAMA_BASE_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
export const EMBEDDING_MODEL = 'nomic-embed-text';
export const COLLECTION_NAME = 'hawkeye_memory';

/**
 * Generate 768-dimensional embedding vector using local Ollama nomic-embed-text
 */
export async function getEmbedding(text) {
  const cleaned = (text || '').trim();
  if (!cleaned) return new Array(768).fill(0.0);

  const res = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      prompt: cleaned
    })
  });

  if (!res.ok) {
    throw new Error(`Ollama embedding error: ${res.statusText}`);
  }

  const data = await res.json();
  return data.embedding || [];
}

/**
 * Query Qdrant vector memory for semantically similar context items
 */
export async function searchMemory(query, { limit = 4, scoreThreshold = 0.35, sourceModule = null } = {}) {
  try {
    const vector = await getEmbedding(query);
    if (!vector || vector.length === 0) return [];

    const requestBody = {
      query: vector,
      limit,
      with_payload: true,
      score_threshold: scoreThreshold
    };

    if (sourceModule) {
      requestBody.filter = {
        must: [
          {
            key: 'source_module',
            match: { value: sourceModule }
          }
        ]
      };
    }

    const res = await fetch(`${QDRANT_BASE_URL}/collections/${COLLECTION_NAME}/points/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!res.ok) {
      // Return empty array gracefully if collection does not exist yet or Qdrant offline
      return [];
    }

    const data = await res.json();
    const points = data.result?.points || [];

    return points.map(p => ({
      id: p.id,
      score: p.score,
      sourceModule: p.payload?.source_module || 'unknown',
      documentType: p.payload?.document_type || 'reference',
      name: p.payload?.name || p.payload?.title || 'Memory Record',
      text: p.payload?.chunk_text || '',
      url: p.payload?.source_url || '',
      metadata: p.payload?.metadata || {},
      createdAt: p.payload?.created_at || null
    }));
  } catch (err) {
    console.warn(`[RAG] Semantic search warning: ${err.message}`);
    return [];
  }
}

/**
 * Embed and index a memory record into Qdrant
 */
export async function indexMemoryItem({
  id = null,
  text,
  name = 'Ingested Memory',
  sourceModule = 'digital_bestie',
  documentType = 'reference',
  sourceUrl = '',
  metadata = {}
}) {
  const pointId = id || crypto.randomUUID();
  const vector = await getEmbedding(text);
  const now = new Date().toISOString();

  const payload = {
    source_module: sourceModule,
    entity_id: pointId,
    name,
    document_type: documentType,
    source_url: sourceUrl,
    chunk_text: text,
    created_at: now,
    metadata
  };

  const res = await fetch(`${QDRANT_BASE_URL}/collections/${COLLECTION_NAME}/points`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      points: [
        {
          id: pointId,
          vector,
          payload
        }
      ]
    })
  });

  if (!res.ok) {
    throw new Error(`Failed to index point into Qdrant: ${res.statusText}`);
  }

  return { pointId, status: 'indexed', sourceModule };
}

/**
 * Get Qdrant collection status and vector counts
 */
export async function getMemoryStats() {
  try {
    const res = await fetch(`${QDRANT_BASE_URL}/collections/${COLLECTION_NAME}`);
    if (!res.ok) {
      return {
        online: false,
        status: 'disconnected',
        error: `Qdrant returned HTTP ${res.status}`
      };
    }
    const data = await res.json();
    const result = data.result || {};
    return {
      online: true,
      status: result.status || 'green',
      vectorsCount: result.vectors_count || result.indexed_vectors_count || 0,
      pointsCount: result.points_count || 0,
      dimension: 768,
      distanceMetric: 'Cosine',
      model: EMBEDDING_MODEL
    };
  } catch (err) {
    return {
      online: false,
      status: 'offline',
      error: err.message
    };
  }
}

/**
 * Build dynamic markdown prompt snippet from pre-flight vector retrieval
 */
export async function getRagPromptSnippet(userMessage, limit = 3) {
  if (!userMessage || userMessage.trim().length < 4) return '';

  const results = await searchMemory(userMessage, { limit, scoreThreshold: 0.40 });
  if (!results || results.length === 0) return '';

  const lines = ['\n## AUTONOMOUS RETRIEVAL CONTEXT (Vector Memory)'];
  lines.push('Relevant memories and resources automatically retrieved from your local knowledge vault:');

  for (const item of results) {
    const scorePct = Math.round(item.score * 100);
    lines.push(`- **[${item.sourceModule.toUpperCase()}] ${item.name}** (Relevance: ${scorePct}%)`);
    const preview = item.text.replace(/\n+/g, ' ').slice(0, 220);
    lines.push(`  ${preview}${item.text.length > 220 ? '...' : ''}`);
    if (item.url) {
      lines.push(`  Source: ${item.url}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}
