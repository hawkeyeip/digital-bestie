import { Agent, setGlobalDispatcher } from 'undici';

// Configure global dispatcher to disable timeout for local LLM inference
setGlobalDispatcher(new Agent({
  headersTimeout: 0,
  bodyTimeout: 0,
  connectTimeout: 60000,
  keepAliveTimeout: 60000,
}));

import { getBundledModelfile, generateModelfileForBaseModel } from './modelfile-templates.js';
import { checkForModelUpdates, getCuratedCatalog } from './model-registry.js';

export const OLLAMA_BASE_URL = 'http://localhost:11434';
export const MODEL_NAME = 'bestie-abliterated';

/**
 * Intelligent self-healing model resolver.
 * Finds the requested model, or gracefully falls back through prioritized generative alternatives.
 */
export function resolveBestAvailableModel(requestedModel, modelsList = []) {
  if (!modelsList || modelsList.length === 0) {
    return { model: null, isFallback: false, reason: 'No models found in Ollama' };
  }

  // 1. Direct exact or prefix match
  const directMatch = modelsList.find(m => m.name === requestedModel || m.name.startsWith(`${requestedModel}:`));
  if (directMatch) {
    return { model: directMatch, isFallback: false, originalModel: requestedModel };
  }

  // 2. Filter out pure embedding models for chat generation
  const generativeModels = modelsList.filter(m => !m.name.includes('embed'));

  if (generativeModels.length === 0) {
    return { model: null, isFallback: false, reason: 'Only embedding models detected; no generative chat LLM installed.' };
  }

  // 3. Digital Bestie priority fallback cascade (Curated Uncensored & High-Logic Cores prioritized)
  const priorities = [
    'bestie',
    'hermes3:70b',
    'hermes3:8b',
    'hermes3',
    'dolphin-llama3:8b',
    'dolphin-llama3',
    'qwen2.5-coder:32b-instruct-q6_K',
    'qwen2.5-coder:32b',
    'qwen2.5-coder:14b',
    'qwen2.5-coder',
    'bestie-abliterated',
    'huihui_ai/qwen3.5-abliterated:27b-Claude-4.6-Opus-q4_K',
    'huihui_ai/qwen3.5-abliterated:27b-q4_K',
    'bestie-light',
    'qwen2.5:32b',
    'qwen2.5:14b',
    'qwen2.5:7b',
    'qwen2.5',
    'llama3',
    'mistral'
  ];

  for (const prio of priorities) {
    const candidate = generativeModels.find(m => m.name === prio || m.name.startsWith(`${prio}:`));
    if (candidate) {
      return {
        model: candidate,
        isFallback: true,
        originalModel: requestedModel,
        fallbackReason: `Model "${requestedModel}" was missing. Self-healed by selecting "${candidate.name}".`
      };
    }
  }

  // 4. Default to first available generative model
  const fallback = generativeModels[0];
  return {
    model: fallback,
    isFallback: true,
    originalModel: requestedModel,
    fallbackReason: `Model "${requestedModel}" was missing. Defaulted to available model "${fallback.name}".`
  };
}

/**
 * Check if Ollama is running and get model status with self-healing fallback & system diagnostics
 * @param {string} [targetModel] - Model name to check
 */
export async function checkOllamaStatus(targetModel = MODEL_NAME) {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    if (!res.ok) {
      return {
        connected: false,
        error: 'Ollama service offline or unreachable',
        models: [],
        systemHealth: {
          ollamaRunning: false,
          activeChatModel: null,
          hasBestieCore: false,
          hasEmbeddingModel: false,
          totalModels: 0
        }
      };
    }
    
    const data = await res.json();
    const modelsList = (data.models || []).map(m => ({
      name: m.name,
      size: m.size,
      modified_at: m.modified_at,
      details: m.details
    }));

    const resolution = resolveBestAvailableModel(targetModel, modelsList);
    const hasEmbeddingModel = modelsList.some(m => m.name.includes('nomic-embed-text') || m.name.includes('embed'));
    const hasBestieCore = modelsList.some(m => m.name.startsWith('bestie') || m.name.includes('abliterated'));

    const activeResolved = resolution.model ? resolution.model.name : targetModel;
    const modelUpdates = checkForModelUpdates(modelsList, activeResolved);

    if (resolution.model) {
      return {
        connected: true,
        models: modelsList,
        activeModel: resolution.model.name,
        targetModel,
        modelAvailable: true,
        isFallback: resolution.isFallback,
        fallbackReason: resolution.fallbackReason || null,
        modelDetails: resolution.model.details || null,
        modelUpdates,
        systemHealth: {
          ollamaRunning: true,
          activeChatModel: resolution.model.name,
          hasBestieCore,
          hasEmbeddingModel,
          totalModels: modelsList.length
        },
        error: null
      };
    }

    return {
      connected: true,
      models: modelsList,
      activeModel: targetModel,
      modelAvailable: false,
      isFallback: false,
      modelUpdates,
      systemHealth: {
        ollamaRunning: true,
        activeChatModel: null,
        hasBestieCore: false,
        hasEmbeddingModel,
        totalModels: modelsList.length
      },
      error: resolution.reason || `No generative chat model found in Ollama`
    };
  } catch (err) {
    return {
      connected: false,
      error: err.message,
      models: [],
      systemHealth: {
        ollamaRunning: false,
        activeChatModel: null,
        hasBestieCore: false,
        hasEmbeddingModel: false,
        totalModels: 0
      }
    };
  }
}

/**
 * Pull an Ollama model programmatically
 */
export async function pullOllamaModel(modelName) {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: modelName, stream: false })
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to pull ${modelName}: ${errText}`);
  }
  return await res.json();
}

/**
 * Create or recreate an Ollama model programmatically from Modelfile content
 */
export async function createOllamaModel(modelName, modelfileContent) {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: modelName, modelfile: modelfileContent, stream: false })
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to create model ${modelName}: ${errText}`);
  }
  return await res.json();
}

/**
 * Recreate the canonical Digital Bestie persona model using bundled templates
 */
export async function restoreBestieModel(variant = 'abliterated') {
  let modelName = 'bestie-abliterated';
  if (variant === 'light' || variant === '14b') {
    modelName = 'bestie-light';
  } else if (variant === 'hermes' || variant === '70b' || variant === 'bestie') {
    modelName = 'bestie';
  }
  const template = getBundledModelfile(variant);
  return await createOllamaModel(modelName, template);
}

/**
 * Infuse any user-selected base model with Digital Bestie's soul, operating tenets,
 * and calibrated context window parameters to forge a new dedicated Bestie core.
 */
export async function infuseBaseModel(baseModel, targetName = 'bestie', options = {}) {
  const modelfileContent = generateModelfileForBaseModel(baseModel, options);
  return await createOllamaModel(targetName, modelfileContent);
}

/**
 * Send a streaming chat request to Ollama
 * @param {string} systemPrompt - The full system prompt
 * @param {Array} messages - Array of {role, content} message objects
 * @param {Function} onToken - Callback for each token received
 * @param {Function} onDone - Callback when generation is complete
 * @param {Function} onError - Callback on error
 * @param {AbortSignal} signal - Optional abort signal to cancel generation
 * @param {Object} customOptions - Optional inference parameters (num_ctx, temperature, etc.)
 * @returns {Promise<void>}
 */
export async function streamChat(systemPrompt, messages, onToken, onDone, onError, signal, customOptions = {}) {
  try {
    const fullMessages = [
      { role: 'system', content: systemPrompt },
      ...messages
    ];

    const modelName = customOptions.model || MODEL_NAME;
    const { model: _, keep_alive, ...ollamaOptions } = customOptions;

    const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelName,
        messages: fullMessages,
        stream: true,
        keep_alive: keep_alive !== undefined ? keep_alive : '5m',
        options: {
          temperature: 0.8,
          top_p: 0.95,
          repeat_penalty: 1.08,
          num_ctx: 16384,
          ...ollamaOptions
        }
      }),
      signal
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Ollama error (${res.status}): ${errText}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullResponse = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const chunk = JSON.parse(line);
          if (chunk.message?.content) {
            fullResponse += chunk.message.content;
            onToken(chunk.message.content);
          }
          if (chunk.done) {
            onDone({
              fullResponse,
              totalDuration: chunk.total_duration,
              evalCount: chunk.eval_count,
              evalDuration: chunk.eval_duration
            });
            return;
          }
        } catch (parseErr) {
          // Skip malformed JSON lines
        }
      }
    }

    // Handle case where stream ends without done flag
    if (buffer.trim()) {
      try {
        const chunk = JSON.parse(buffer);
        if (chunk.message?.content) {
          fullResponse += chunk.message.content;
          onToken(chunk.message.content);
        }
      } catch (e) { /* ignore */ }
    }
    onDone({ fullResponse });

  } catch (err) {
    if (err.name === 'AbortError') {
      onDone({ fullResponse: '', aborted: true });
    } else {
      onError(err);
    }
  }
}

/**
 * Retrieve curated model catalog annotated with local installation state
 */
export async function getCuratedCatalogWithStatus(targetModel = MODEL_NAME) {
  const status = await checkOllamaStatus(targetModel);
  return getCuratedCatalog(status.models, status.activeModel || targetModel);
}

/**
 * High-level model upgrade pipeline:
 * 1. Pulls the model via Ollama if not already installed.
 * 2. Automatically infuses it into the 'bestie' core.
 */
export async function upgradeAndInfuseModel(targetTag, onProgress = null) {
  if (onProgress) onProgress({ status: 'pulling', model: targetTag });
  await pullOllamaModel(targetTag);

  if (onProgress) onProgress({ status: 'infusing', model: targetTag });
  const infuseRes = await infuseBaseModel(targetTag, 'bestie');

  return { success: true, model: targetTag, infuseResult: infuseRes };
}
