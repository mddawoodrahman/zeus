(function registerCustomOpenAiProvider(globalScope) {
  const retry = globalScope.ZeusRetry;
  const prompts = globalScope.ZeusPrompts;
  const errors = globalScope.ZeusErrors;
  const providerUtils = globalScope.ZeusProviderUtils;

  const CUSTOM_MAX_RETRIES = 3;

  function validateEndpointUrl(baseUrl) {
    let clean = String(baseUrl || '').trim();
    if (!clean) {
      throw new Error('Custom provider baseUrl is required.');
    }

    let parsed;
    try {
      parsed = new URL(clean);
    } catch (_) {
      throw new Error('Invalid endpoint URL: Must be a valid HTTP or HTTPS URL.');
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`Unsupported protocol "${parsed.protocol}". Only HTTP and HTTPS are supported.`);
    }

    const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '[::1]';
    if (parsed.protocol === 'http:' && !isLocal) {
      throw new Error('Insecure HTTP is only permitted for local endpoints (localhost / 127.0.0.1). Remote endpoints must use HTTPS.');
    }

    return parsed;
  }

  function getOriginPattern(baseUrl) {
    const parsed = validateEndpointUrl(baseUrl);
    return `${parsed.protocol}//${parsed.hostname}/*`;
  }

  async function hasOriginPermission(baseUrl) {
    if (typeof globalScope?.chrome?.permissions?.contains !== 'function') {
      return true;
    }
    try {
      const origin = getOriginPattern(baseUrl);
      return new Promise((resolve) => {
        globalScope.chrome.permissions.contains({ origins: [origin] }, (granted) => {
          if (globalScope.chrome.runtime?.lastError) {
            resolve(false);
            return;
          }
          resolve(Boolean(granted));
        });
      });
    } catch (_) {
      return false;
    }
  }

  function normalizeEndpoint(baseUrl) {
    validateEndpointUrl(baseUrl);
    let clean = String(baseUrl || '').trim().replace(/\/+$/, '');

    if (clean.endsWith('/chat/completions')) {
      return clean;
    }

    if (clean.endsWith('/v1')) {
      return `${clean}/chat/completions`;
    }

    return `${clean}/v1/chat/completions`;
  }

  function resolveCustomConfig(config, requestedProvider) {
    const customList = Array.isArray(config?.customProviders) ? config.customProviders : [];
    if (requestedProvider && requestedProvider.startsWith('custom-')) {
      const found = customList.find((p) => p.id === requestedProvider);
      if (found) return found;
    }

    // Check if there is an active custom provider in customProviders
    const active = customList.find((p) => p.enabled !== false);
    if (active) return active;

    // Fallback to legacy or direct properties if present
    if (config?.custom) {
      return config.custom;
    }

    return null;
  }

  async function enhance(prompt, config, options) {
    const customConfig = resolveCustomConfig(config, config?.provider);
    if (!customConfig || !customConfig.baseUrl) {
      throw new Error('No valid custom OpenAI-compatible provider configured.');
    }

    const permitted = await hasOriginPermission(customConfig.baseUrl);
    if (!permitted) {
      const origin = getOriginPattern(customConfig.baseUrl);
      throw new Error(`Host permission not granted for ${origin}. Please authorize this endpoint in Zeus Options.`);
    }

    const endpoint = normalizeEndpoint(customConfig.baseUrl);
    const model = String(customConfig.model || 'default').trim();
    const apiKey = String(customConfig.apiKey || '').trim();

    const headers = {
      'Content-Type': 'application/json'
    };

    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    if (customConfig.customHeaders && typeof customConfig.customHeaders === 'object') {
      Object.assign(headers, customConfig.customHeaders);
    }

    let lastError = null;

    for (let attempt = 0; attempt < CUSTOM_MAX_RETRIES; attempt += 1) {
      const body = {
        model,
        messages: [
          { role: 'system', content: prompts.getRewriteSystemInstruction(options && options.instruction) },
          { role: 'user', content: prompts.buildEnhancePrompt(prompt, options) }
        ],
        temperature: 0.4
      };

      try {
        const response = await retry.fetchWithTimeout(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(body)
        });

        if (response.ok) {
          const data = await providerUtils.readJsonSafe(response);
          const enhancedText = data?.choices?.[0]?.message?.content;
          if (!enhancedText) {
            throw new Error('Custom provider responded without message content.');
          }
          return String(enhancedText).trim();
        }

        const errData = await providerUtils.readJsonSafe(response);
        const errMsg = errData?.error?.message || errData?.message || `HTTP ${response.status}`;
        lastError = new errors.ProviderHttpError('custom', response.status, errData, model);

        if ([408, 429, 500, 502, 503, 504].includes(response.status)) {
          await retry.delay(retry.computeBackoffMs(attempt));
          continue;
        }

        throw new Error(`Custom provider error (${response.status}): ${errMsg}`);
      } catch (err) {
        lastError = err;
        if (attempt === CUSTOM_MAX_RETRIES - 1) {
          break;
        }
        await retry.delay(retry.computeBackoffMs(attempt));
      }
    }

    throw lastError || new Error('Custom provider request failed after retries.');
  }

  async function suggest(text, settings, port, abortSignal) {
    const customConfig = resolveCustomConfig(settings, settings?.provider);
    if (!customConfig || !customConfig.baseUrl) {
      port.postMessage({ type: 'error', message: 'Custom provider not configured.' });
      return;
    }

    const permitted = await hasOriginPermission(customConfig.baseUrl);
    if (!permitted) {
      const origin = getOriginPattern(customConfig.baseUrl);
      port.postMessage({ type: 'error', message: `Host permission not granted for ${origin}. Please authorize this endpoint in Zeus Options.` });
      return;
    }

    const endpoint = normalizeEndpoint(customConfig.baseUrl);
    const model = String(customConfig.model || 'default').trim();
    const apiKey = String(customConfig.apiKey || '').trim();

    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const body = {
      model,
      messages: [
        { role: 'user', content: String(text || '') }
      ],
      max_tokens: Number(settings?.copilotMaxTokens) || 60,
      temperature: 0.3
    };

    const response = await retry.fetchWithTimeout(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: abortSignal
    });

    if (!response.ok) {
      throw new Error(`Custom copilot suggest failed with status ${response.status}`);
    }

    const data = await providerUtils.readJsonSafe(response);
    const textOut = data?.choices?.[0]?.message?.content || '';
    port.postMessage({ type: 'chunk', text: textOut });
    port.postMessage({ type: 'done' });
  }

  enhance.suggest = suggest;
  enhance.normalizeEndpoint = normalizeEndpoint;
  enhance.resolveCustomConfig = resolveCustomConfig;
  enhance.validateEndpointUrl = validateEndpointUrl;
  enhance.getOriginPattern = getOriginPattern;
  enhance.hasOriginPermission = hasOriginPermission;

  globalScope.ZeusProviders = globalScope.ZeusProviders || {};
  globalScope.ZeusProviders.custom = enhance;
})(typeof globalThis !== 'undefined' ? globalThis : this);
