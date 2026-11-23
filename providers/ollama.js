(function initOllamaProvider(globalScope) {
  const retry = globalScope.ZeusRetry;
  const prompts = globalScope.ZeusPrompts;
  const errors = globalScope.ZeusErrors;
  const providerUtils = globalScope.ZeusProviderUtils;
  const transport = globalScope.ZeusProviderTransport || (typeof require !== 'undefined' ? (function() {
    try {
      const path = require('node:path');
      return require(path.resolve(process.cwd(), 'core/providerTransport.js'));
    } catch (_) {
      try {
        return require('../core/providerTransport.js');
      } catch (_2) {
        return null;
      }
    }
  })() : null);
  const providers = providerUtils.ensureProviderBag();

  const OLLAMA_API_URL = 'http://localhost:11434/api/generate';
  const OLLAMA_HEALTH_URL = 'http://localhost:11434/api/version';
  const OLLAMA_RUNNING_MODELS_URL = 'http://localhost:11434/api/ps';
  const OLLAMA_MODELS_URL = 'http://localhost:11434/api/tags';
  const OLLAMA_NOT_RUNNING_MESSAGE = 'Ollama not running. Start with: ollama run qwen3:8b';
  const OLLAMA_NO_MODEL_MESSAGE = 'No local Ollama model detected. Start one with: ollama run qwen3:8b';

  function getOllamaOrigin(customId) {
    const id = customId || (typeof chrome !== 'undefined' && chrome?.runtime?.id) || '<YOUR_EXTENSION_ID>';
    return `chrome-extension://${id}`;
  }

  function buildOllamaCommands(customId) {
    const origin = getOllamaOrigin(customId);
    return {
      origin,
      macLinux: `OLLAMA_ORIGINS="${origin}" ollama serve`,
      macDesktop: `launchctl setenv OLLAMA_ORIGINS "${origin}"`,
      windowsPowerShell: `$env:OLLAMA_ORIGINS="${origin}"; ollama serve`,
      windowsCmd: `set OLLAMA_ORIGINS=${origin} && ollama serve`
    };
  }

  function buildOllamaOriginBlockedMessage(customId) {
    const origin = getOllamaOrigin(customId);
    return `Ollama blocked extension origin '${origin}'. Start Ollama with OLLAMA_ORIGINS="${origin}" (or run 'launchctl setenv OLLAMA_ORIGINS "${origin}"' for macOS Ollama Desktop) and restart Ollama.`;
  }

  async function fetchModels(url) {
    if (transport && typeof transport.execute === 'function') {
      let result;
      try {
        result = await transport.execute({
          url,
          method: 'GET',
          timeoutMs: 5000,
          maxRetries: 1,
          provider: 'ollama'
        });
      } catch (error) {
        return [];
      }

      if (result.status === 403) {
        throw new Error(buildOllamaOriginBlockedMessage());
      }
      if (!result.ok) {
        return [];
      }

      const data = result.data || {};
      const list = Array.isArray(data?.models) ? data.models : [];
      return list
        .map((item) => String(item?.model || item?.name || '').trim())
        .filter(Boolean);
    }

    const response = await retry.fetchWithTimeout(url, { method: 'GET' }, 5000);

    if (response.status === 403) {
      throw new Error(buildOllamaOriginBlockedMessage());
    }

    if (!response.ok) {
      return [];
    }

    const data = await providerUtils.readJsonSafe(response);
    const list = Array.isArray(data?.models) ? data.models : [];

    return list
      .map((item) => String(item?.model || item?.name || '').trim())
      .filter(Boolean);
  }

  async function checkHealth() {
    try {
      if (transport && typeof transport.execute === 'function') {
        const result = await transport.execute({
          url: OLLAMA_HEALTH_URL,
          method: 'GET',
          timeoutMs: 5000,
          maxRetries: 1,
          provider: 'ollama'
        });

        if (result.status === 403) {
          throw new Error(buildOllamaOriginBlockedMessage());
        }
        if (!result.ok) {
          throw new Error('Ollama health check failed.');
        }
        return;
      }

      const response = await retry.fetchWithTimeout(OLLAMA_HEALTH_URL, { method: 'GET' }, 5000);
      if (response.status === 403) {
        throw new Error(buildOllamaOriginBlockedMessage());
      }
      if (!response.ok) {
        throw new Error('Ollama health check failed.');
      }
    } catch (error) {
      const msg = String(error?.message || '');
      if (msg.includes('Ollama blocked extension origin')) {
        throw error;
      }
      throw new Error(OLLAMA_NOT_RUNNING_MESSAGE);
    }
  }

  async function detectModel(config) {
    const preferredModel = String(config?.ollama?.model || '').trim();
    if (preferredModel) {
      return preferredModel;
    }

    const running = await fetchModels(OLLAMA_RUNNING_MODELS_URL);
    if (running.length > 0) {
      return running[0];
    }

    const installed = await fetchModels(OLLAMA_MODELS_URL);
    if (installed.length > 0) {
      return installed[0];
    }

    throw new Error(OLLAMA_NO_MODEL_MESSAGE);
  }

  async function enhance(prompt, config) {
    await checkHealth();

    try {
      const model = await detectModel(config);
      const body = {
        model,
        prompt: prompts.buildEnhancePrompt(prompt),
        stream: false
      };

      if (transport && typeof transport.execute === 'function') {
        const result = await transport.execute({
          url: OLLAMA_API_URL,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          maxRetries: 1,
          provider: 'ollama'
        });

        if (!result.ok) {
          throw new errors.ProviderHttpError('ollama', result.status, result.data, model);
        }

        const enhancedText = result.data?.response;
        if (!enhancedText) {
          throw new Error('Ollama responded without enhanced text.');
        }

        return String(enhancedText).trim();
      }

      const response = await retry.fetchWithTimeout(OLLAMA_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errData = await providerUtils.readJsonSafe(response);
        throw new errors.ProviderHttpError('ollama', response.status, errData, model);
      }

      const data = await providerUtils.readJsonSafe(response);
      const enhancedText = data?.response;
      if (!enhancedText) {
        throw new Error('Ollama responded without enhanced text.');
      }

      return String(enhancedText).trim();
    } catch (error) {
      if (error instanceof errors.ProviderHttpError) {
        throw error;
      }

      if (errors.looksLikeOllamaConnectionError(error?.message)) {
        throw new Error(OLLAMA_NOT_RUNNING_MESSAGE);
      }

      throw error;
    }
  }

  async function suggest(text, settings, port, signal) {
    await checkHealth();
    const model = await detectModel(settings);

    const promptText = `You are a concise prompt-completion assistant. Continue the user's incomplete prompt with at most 2 sentences. Do not repeat what they already typed. Prompt: ${text}`;
    const body = {
      model,
      prompt: promptText,
      options: {
        temperature: 0.3,
        num_predict: settings.copilotMaxTokens || 60
      }
    };

    if (transport && typeof transport.stream === 'function') {
      await transport.stream({
        url: OLLAMA_API_URL,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { ...body, stream: true },
        decoder: 'ndjson',
        provider: 'ollama',
        signal
      }, {
        signal,
        onChunk: (chunk) => {
          const content = chunk?.response;
          if (content && !signal?.aborted) {
            port.postMessage({ type: 'chunk', text: content });
          }
        }
      });
    } else if (transport && typeof transport.execute === 'function') {
      const result = await transport.execute({
        url: OLLAMA_API_URL,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { ...body, stream: false },
        signal,
        maxRetries: 1,
        provider: 'ollama'
      });

      if (!result.ok) {
        throw new errors.ProviderHttpError('ollama', result.status, result.data, model);
      }

      const content = result.data?.response;
      if (content && !signal?.aborted) {
        port.postMessage({ type: 'chunk', text: String(content).trim() });
      }
    } else {
      const response = await retry.fetchWithTimeout(OLLAMA_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, stream: false }),
        signal
      });

      if (!response.ok) {
        const errData = await providerUtils.readJsonSafe(response);
        throw new errors.ProviderHttpError('ollama', response.status, errData, model);
      }

      const data = await providerUtils.readJsonSafe(response);
      const content = data?.response;
      if (content && !signal?.aborted) {
        port.postMessage({ type: 'chunk', text: String(content).trim() });
      }
    }

    if (!signal?.aborted) {
      port.postMessage({ type: 'done' });
    }
  }

  globalScope.ZeusOllamaMeta = Object.freeze({
    OLLAMA_NOT_RUNNING_MESSAGE,
    OLLAMA_NO_MODEL_MESSAGE,
    getOllamaOrigin,
    buildOllamaCommands,
    buildOllamaOriginBlockedMessage
  });

  providers.ollama = enhance;
  providers.ollama.suggest = suggest;
})(typeof globalThis !== 'undefined' ? globalThis : this);
