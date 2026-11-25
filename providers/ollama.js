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

  const DEFAULT_OLLAMA_HOST = 'http://localhost:11434';
  const OLLAMA_NOT_RUNNING_MESSAGE = 'Ollama not running. Start with: ollama run qwen3:8b';
  const OLLAMA_NO_MODEL_MESSAGE = 'No local Ollama model detected. Start one with: ollama run qwen3:8b';

  function resolveBaseUrl(config) {
    const store = globalScope.ZeusSettingsStore || globalScope.ZeusSettings;
    if (store && typeof store.normalizeOllamaHost === 'function') {
      return store.normalizeOllamaHost(config?.ollama?.host);
    }
    const raw = String(config?.ollama?.host || '').trim().replace(/\/+$/, '');
    if (!raw) return DEFAULT_OLLAMA_HOST;
    try {
      const parsed = new URL(raw);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return DEFAULT_OLLAMA_HOST;
      }
      const cleanPath = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, '');
      return `${parsed.origin}${cleanPath}`;
    } catch (_) {
      return DEFAULT_OLLAMA_HOST;
    }
  }

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

  async function fetchModels(url, signal) {
    if (transport && typeof transport.execute === 'function') {
      let result;
      try {
        result = await transport.execute({
          url,
          method: 'GET',
          timeoutMs: 5000,
          signal,
          maxRetries: 1,
          provider: 'ollama'
        });
      } catch (error) {
        if (signal?.aborted || error?.name === 'AbortError') throw error;
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

    const response = await retry.fetchWithTimeout(url, { method: 'GET' }, 5000, signal);

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

  async function checkHealth(signal, baseUrl = DEFAULT_OLLAMA_HOST) {
    const healthUrl = `${baseUrl}/api/version`;
    try {
      if (transport && typeof transport.execute === 'function') {
        const result = await transport.execute({
          url: healthUrl,
          method: 'GET',
          timeoutMs: 5000,
          signal,
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

      const response = await retry.fetchWithTimeout(healthUrl, { method: 'GET' }, 5000, signal);
      if (response.status === 403) {
        throw new Error(buildOllamaOriginBlockedMessage());
      }
      if (!response.ok) {
        throw new Error('Ollama health check failed.');
      }
    } catch (error) {
      if (signal?.aborted || error?.name === 'AbortError') {
        throw error;
      }
      const msg = String(error?.message || '');
      if (msg.includes('Ollama blocked extension origin')) {
        throw error;
      }
      throw new Error(OLLAMA_NOT_RUNNING_MESSAGE);
    }
  }

  async function detectModel(config, signal, baseUrl = resolveBaseUrl(config)) {
    const preferredModel = String(config?.ollama?.model || '').trim();
    if (preferredModel) {
      return preferredModel;
    }

    const running = await fetchModels(`${baseUrl}/api/ps`, signal);
    if (running.length > 0) {
      return running[0];
    }

    const installed = await fetchModels(`${baseUrl}/api/tags`, signal);
    if (installed.length > 0) {
      return installed[0];
    }

    throw new Error(OLLAMA_NO_MODEL_MESSAGE);
  }

  async function enhance(prompt, config) {
    const signal = config?.signal;
    const baseUrl = resolveBaseUrl(config);
    const generateUrl = `${baseUrl}/api/generate`;
    await checkHealth(signal, baseUrl);

    try {
      const model = await detectModel(config, signal, baseUrl);
      const body = {
        model,
        prompt: prompts.buildEnhancePrompt(prompt),
        stream: false
      };

      if (transport && typeof transport.execute === 'function') {
        const result = await transport.execute({
          url: generateUrl,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          signal,
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

      const response = await retry.fetchWithTimeout(generateUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }, undefined, signal);

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
      if (signal?.aborted || error?.name === 'AbortError') {
        throw error;
      }

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
    const baseUrl = resolveBaseUrl(settings);
    const generateUrl = `${baseUrl}/api/generate`;
    await checkHealth(signal, baseUrl);
    const model = await detectModel(settings, signal, baseUrl);

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
        url: generateUrl,
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
        url: generateUrl,
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
      const response = await retry.fetchWithTimeout(generateUrl, {
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
