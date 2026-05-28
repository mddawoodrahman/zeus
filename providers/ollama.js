(function initOllamaProvider(globalScope) {
  const retry = globalScope.ZeusRetry;
  const prompts = globalScope.ZeusPrompts;
  const errors = globalScope.ZeusErrors;
  const providerUtils = globalScope.ZeusProviderUtils;
  const providers = providerUtils.ensureProviderBag();

  const OLLAMA_API_URL = 'http://localhost:11434/api/generate';
  const OLLAMA_HEALTH_URL = 'http://localhost:11434/api/version';
  const OLLAMA_RUNNING_MODELS_URL = 'http://localhost:11434/api/ps';
  const OLLAMA_MODELS_URL = 'http://localhost:11434/api/tags';
  const OLLAMA_NOT_RUNNING_MESSAGE = 'Ollama not running. Start with: ollama run qwen3:8b';
  const OLLAMA_NO_MODEL_MESSAGE = 'No local Ollama model detected. Start one with: ollama run qwen3:8b';

  function buildOllamaOriginBlockedMessage() {
    const extensionOrigin = `chrome-extension://${chrome.runtime.id}`;
    return `Ollama blocked extension origin '${extensionOrigin}'. Start Ollama with OLLAMA_ORIGINS=${extensionOrigin} (or OLLAMA_ORIGINS=*) and restart Ollama.`;
  }

  async function fetchModels(url) {
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
      const response = await retry.fetchWithTimeout(OLLAMA_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt: prompts.buildEnhancePrompt(prompt),
          stream: false
        })
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
    const response = await retry.fetchWithTimeout(OLLAMA_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: promptText,
        stream: false,
        options: {
          temperature: 0.3,
          num_predict: settings.copilotMaxTokens || 60
        }
      }),
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

    if (!signal?.aborted) {
      port.postMessage({ type: 'done' });
    }
  }

  globalScope.ZeusOllamaMeta = Object.freeze({
    OLLAMA_NOT_RUNNING_MESSAGE,
    OLLAMA_NO_MODEL_MESSAGE,
    buildOllamaOriginBlockedMessage
  });

  providers.ollama = enhance;
  providers.ollama.suggest = suggest;
})(typeof globalThis !== 'undefined' ? globalThis : this);
