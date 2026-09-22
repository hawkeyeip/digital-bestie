import { Agent, setGlobalDispatcher } from 'undici';

// Configure global dispatcher to disable timeout for local LLM inference
setGlobalDispatcher(new Agent({
  headersTimeout: 0,
  bodyTimeout: 0,
  connectTimeout: 60000,
  keepAliveTimeout: 60000,
}));

export const OLLAMA_BASE_URL = 'http://localhost:11434';
export const MODEL_NAME = 'bestie';

/**
 * Check if Ollama is running and get model status
 * @param {string} [targetModel] - Model name to check
 */
export async function checkOllamaStatus(targetModel = MODEL_NAME) {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    if (!res.ok) return { connected: false, error: 'Ollama not responding', models: [] };
    
    const data = await res.json();
    const modelsList = (data.models || []).map(m => ({
      name: m.name,
      size: m.size,
      modified_at: m.modified_at,
      details: m.details
    }));

    const foundModel = modelsList.find(m => m.name === targetModel || m.name.startsWith(`${targetModel}:`));
    
    return {
      connected: true,
      models: modelsList,
      activeModel: targetModel,
      modelAvailable: !!foundModel,
      modelDetails: foundModel?.details || null,
      error: foundModel ? null : `Model "${targetModel}" not found in Ollama`
    };
  } catch (err) {
    return { connected: false, error: err.message, models: [] };
  }
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
          temperature: 0.7,
          top_p: 0.9,
          repeat_penalty: 1.1,
          num_ctx: 8192,
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
