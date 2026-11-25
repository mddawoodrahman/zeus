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

  function getTransport() {
    return globalScope.ZeusProviderTransport || transport;
  }

  function resolveBaseUrl(config) {
    const rawHostInput = typeof config === 'string'
      ? config
      : (config?.ollama?.host !== undefined ? config.ollama.host : config?.host);
    const store = globalScope.ZeusSettingsStore || globalScope.ZeusSettings;
    if (store && typeof store.normalizeOllamaHost === 'function') {
      return store.normalizeOllamaHost(rawHostInput);
    }
    const raw = String(rawHostInput || '').trim().replace(/\/+$/, '');
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

  async function executeGet(url, signal, timeoutMs = 5000) {
    const activeTransport = getTransport();
    if (activeTransport && typeof activeTransport.execute === 'function') {
      return activeTransport.execute({
        url,
        method: 'GET',
        timeoutMs,
        signal,
        maxRetries: 1,
        provider: 'ollama'
      });
    }

    const response = await retry.fetchWithTimeout(url, { method: 'GET' }, timeoutMs, signal);
    const data = await providerUtils.readJsonSafe(response);
    return {
      ok: response.ok,
      status: response.status,
      data,
      headers: response.headers
    };
  }

  function extractModelNames(data) {
    const list = Array.isArray(data?.models) ? data.models : [];
    return list
      .map((item) => String(item?.model || item?.name || '').trim())
      .filter(Boolean);
  }

  async function fetchModels(url, signal) {
    let result;
    try {
      result = await executeGet(url, signal, 5000);
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

    return extractModelNames(result.data || {});
  }

  async function fetchModelEndpointSafe(url, signal) {
    try {
      const result = await executeGet(url, signal, 5000);
      if (result.status === 403) {
        return { originBlocked: true, models: [] };
      }
      if (!result.ok) {
        return { originBlocked: false, models: [] };
      }
      return { originBlocked: false, models: extractModelNames(result.data || {}) };
    } catch (error) {
      if (signal?.aborted) {
        throw error;
      }
      return { originBlocked: false, models: [] };
    }
  }

  async function checkHealth(signal, baseUrl = DEFAULT_OLLAMA_HOST) {
    const healthUrl = `${baseUrl}/api/version`;
    try {
      const result = await executeGet(healthUrl, signal, 5000);
      if (result.status === 403) {
        throw new Error(buildOllamaOriginBlockedMessage());
      }
      if (!result.ok) {
        throw new Error('Ollama health check failed.');
      }
      return result.data || {};
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

  async function discoverLocalModels(config = {}, signal) {
    const baseUrl = resolveBaseUrl(config);
    const origin = getOllamaOrigin();
    let versionResult;

    try {
      versionResult = await executeGet(`${baseUrl}/api/version`, signal, 5000);
    } catch (error) {
      if (signal?.aborted) {
        throw error;
      }
      return {
        reachable: false,
        originBlocked: false,
        origin,
        version: '',
        running: [],
        installed: [],
        models: [],
        error: OLLAMA_NOT_RUNNING_MESSAGE
      };
    }

    if (versionResult.status === 403) {
      return {
        reachable: false,
        originBlocked: true,
        origin,
        version: '',
        running: [],
        installed: [],
        models: [],
        error: buildOllamaOriginBlockedMessage()
      };
    }

    if (!versionResult.ok) {
      return {
        reachable: false,
        originBlocked: false,
        origin,
        version: '',
        running: [],
        installed: [],
        models: [],
        error: OLLAMA_NOT_RUNNING_MESSAGE
      };
    }

    const version = String(versionResult.data?.version || '').trim();
    const [runningRes, installedRes] = await Promise.all([
      fetchModelEndpointSafe(`${baseUrl}/api/ps`, signal),
      fetchModelEndpointSafe(`${baseUrl}/api/tags`, signal)
    ]);

    if (runningRes.originBlocked || installedRes.originBlocked) {
      return {
        reachable: false,
        originBlocked: true,
        origin,
        version,
        running: [],
        installed: [],
        models: [],
        error: buildOllamaOriginBlockedMessage()
      };
    }

    const running = runningRes.models;
    const installed = installedRes.models;
    const models = [...new Set([...running, ...installed])];

    return {
      reachable: true,
      originBlocked: false,
      origin,
      version,
      running,
      installed,
      models,
      error: ''
    };
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

      const activeTransport = getTransport();
      if (activeTransport && typeof activeTransport.execute === 'function') {
        const result = await activeTransport.execute({
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

    const activeTransport = getTransport();
    if (activeTransport && typeof activeTransport.stream === 'function') {
      await activeTransport.stream({
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
    } else if (activeTransport && typeof activeTransport.execute === 'function') {
      const result = await activeTransport.execute({
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
    DEFAULT_OLLAMA_HOST,
    OLLAMA_NOT_RUNNING_MESSAGE,
    OLLAMA_NO_MODEL_MESSAGE,
    getOllamaOrigin,
    buildOllamaCommands,
    buildOllamaOriginBlockedMessage,
    resolveBaseUrl,
    checkHealth,
    fetchModels,
    detectModel,
    discoverLocalModels
  });

  providers.ollama = enhance;
  providers.ollama.suggest = suggest;
  providers.ollama.discoverModels = discoverLocalModels;
})(typeof globalThis !== 'undefined' ? globalThis : this);
