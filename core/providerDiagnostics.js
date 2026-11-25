(function initZeusProviderDiagnostics(globalScope) {
  'use strict';

  const CLOUD_PROVIDERS = Object.freeze(['gemini', 'openai', 'claude', 'openrouter']);
  const ALL_PROVIDERS = Object.freeze(['gemini', 'openai', 'claude', 'openrouter', 'ollama']);
  const TEST_TIMEOUT_MS = 8000;

  const STATE = Object.freeze({
    NOT_CONFIGURED: 'not_configured',
    CONFIGURED_UNTESTED: 'configured_untested',
    TESTING: 'testing',
    VERIFIED: 'verified',
    ERROR: 'error'
  });

  const PROVIDER_LABELS = Object.freeze({
    gemini: 'Gemini',
    openai: 'OpenAI',
    claude: 'Claude',
    openrouter: 'OpenRouter',
    ollama: 'Ollama',
    auto: 'Auto Route'
  });

  // Ephemeral in-memory non-secret status cache keyed by provider ID
  const statusCache = new Map();
  const inFlightTesting = new Set();
  const providerGenerations = new Map();

  function getSettingsStore() {
    if (globalScope.ZeusSettingsStore) return globalScope.ZeusSettingsStore;
    if (globalScope.ZeusSettings) return globalScope.ZeusSettings;
    if (typeof require !== 'undefined') {
      try {
        const path = require('node:path');
        return require(path.resolve(process.cwd(), 'settings/settingsStore.js'));
      } catch (_) {
        try {
          return require('../settings/settingsStore.js');
        } catch (_2) {
          return null;
        }
      }
    }
    return null;
  }

  function getTransport() {
    if (globalScope.ZeusProviderTransport) return globalScope.ZeusProviderTransport;
    if (typeof require !== 'undefined') {
      try {
        const path = require('node:path');
        return require(path.resolve(process.cwd(), 'core/providerTransport.js'));
      } catch (_) {
        try {
          return require('./providerTransport.js');
        } catch (_2) {
          return null;
        }
      }
    }
    return null;
  }

  function getErrors() {
    if (globalScope.ZeusErrors) return globalScope.ZeusErrors;
    if (typeof require !== 'undefined') {
      try {
        const path = require('node:path');
        return require(path.resolve(process.cwd(), 'core/errors.js'));
      } catch (_) {
        try {
          return require('./errors.js');
        } catch (_2) {
          return null;
        }
      }
    }
    return null;
  }

  function getOllamaMeta() {
    return globalScope.ZeusOllamaMeta || null;
  }

  function getRegistry() {
    return globalScope.ZeusModelRegistry || null;
  }

  function formatProviderLabel(provider) {
    return PROVIDER_LABELS[provider] || provider || 'Provider';
  }

  function bumpGeneration(provider) {
    const next = (providerGenerations.get(provider) || 0) + 1;
    providerGenerations.set(provider, next);
    return next;
  }

  function getGeneration(provider) {
    return providerGenerations.get(provider) || 0;
  }

  function hashStringHex(input, seed) {
    let h = seed >>> 0;
    const str = String(input || '');
    for (let i = 0; i < str.length; i += 1) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
  }

  function computeKeyFingerprint(provider, apiKey) {
    const raw = String(apiKey || '').trim();
    if (!raw) return '';
    const material = `${provider}\u0000${raw}\u0000${raw.length}`;
    return `v1:${raw.length}:${hashStringHex(material, 0x811c9dc5)}${hashStringHex(material, 0x9e3779b9)}`;
  }

  function resolveProviderModel(settings, provider, modelOverride) {
    const registry = getRegistry();
    if (provider === 'ollama') {
      return String(modelOverride !== undefined ? modelOverride : (settings?.ollama?.model || '')).trim();
    }
    const raw = String(
      modelOverride !== undefined
        ? modelOverride
        : (settings?.models?.[provider] || registry?.getDefaultModel?.(provider) || '')
    ).trim();
    if (provider === 'gemini' && registry && typeof registry.normalizeGeminiModel === 'function') {
      return registry.normalizeGeminiModel(raw);
    }
    return raw;
  }

  function resolveOllamaHost(settings, hostOverride) {
    const ollamaMeta = getOllamaMeta();
    const candidate = hostOverride !== undefined ? hostOverride : settings?.ollama?.host;
    if (ollamaMeta && typeof ollamaMeta.resolveBaseUrl === 'function') {
      return ollamaMeta.resolveBaseUrl({ ollama: { host: candidate } });
    }
    const store = getSettingsStore();
    if (store && typeof store.normalizeOllamaHost === 'function') {
      return store.normalizeOllamaHost(candidate);
    }
    const clean = String(candidate || '').trim().replace(/\/+$/, '');
    return clean || 'http://localhost:11434';
  }

  function computeConfigSignature(provider, settings, overrides = {}) {
    if (provider === 'ollama') {
      const host = resolveOllamaHost(settings, overrides.host);
      const model = resolveProviderModel(settings, 'ollama', overrides.model);
      return `${host}|${model}`;
    }
    const key = String(settings?.apiKeys?.[provider] || '').trim();
    const keyFingerprint = computeKeyFingerprint(provider, key);
    const model = resolveProviderModel(settings, provider, overrides.model);
    return `${keyFingerprint}|${model}`;
  }

  function mapErrorCodeToStatusLabel(code) {
    switch (String(code || '').toUpperCase()) {
      case 'NOT_CONFIGURED':
        return 'Not configured';
      case 'AUTH_FAILED':
        return 'Authentication failed';
      case 'RATE_LIMITED':
        return 'Rate limited';
      case 'NETWORK_UNAVAILABLE':
      case 'TIMEOUT':
        return 'Network unavailable';
      case 'PROVIDER_UNAVAILABLE':
        return 'Provider unavailable';
      case 'QUOTA_EXCEEDED':
        return 'Quota exceeded';
      case 'OLLAMA_ORIGIN_BLOCKED':
        return 'Origin blocked';
      case 'MODEL_UNAVAILABLE':
        return 'Model unavailable';
      default:
        return 'Request failed';
    }
  }

  function isHardBlockingErrorCode(code) {
    const normalized = String(code || '').toUpperCase();
    return (
      normalized === 'NOT_CONFIGURED' ||
      normalized === 'AUTH_FAILED' ||
      normalized === 'QUOTA_EXCEEDED' ||
      normalized === 'MODEL_UNAVAILABLE' ||
      normalized === 'OLLAMA_ORIGIN_BLOCKED'
    );
  }

  function matchesOllamaModel(installedName, requestedName) {
    const installed = String(installedName || '').trim().toLowerCase();
    const requested = String(requestedName || '').trim().toLowerCase();
    if (!installed || !requested) return false;
    if (installed === requested) return true;
    if (!requested.includes(':') && installed === `${requested}:latest`) return true;
    return false;
  }

  function buildProviderStatus(provider, settings) {
    const label = formatProviderLabel(provider);

    if (provider === 'ollama') {
      const host = resolveOllamaHost(settings);
      const model = resolveProviderModel(settings, 'ollama');
      const configured = Boolean(model);
      const configSignature = `${host}|${model}`;
      const cached = statusCache.get('ollama');
      const hasValidCache = Boolean(cached && cached.configSignature === configSignature);

      if (inFlightTesting.has('ollama')) {
        return {
          provider: 'ollama',
          label,
          configured,
          hasApiKey: false,
          host,
          model,
          state: STATE.TESTING,
          statusLabel: 'Testing',
          code: 'TESTING',
          usable: configured,
          retryable: false,
          userMessage: `Testing ${label} connection at ${host}...`,
          testedAt: cached?.testedAt || null,
          originBlocked: false,
          reachable: null,
          version: '',
          availableModels: []
        };
      }

      if (hasValidCache) {
        const isVerified = cached.state === STATE.VERIFIED;
        const isError = cached.state === STATE.ERROR;
        const isNotConfigured = cached.state === STATE.NOT_CONFIGURED;
        const usable = isVerified
          ? Boolean(configured || (cached.reachable && cached.availableModels?.length > 0))
          : (configured && !isError && !isNotConfigured);

        return {
          provider: 'ollama',
          label,
          configured: Boolean(configured || (isVerified && cached.reachable && cached.availableModels?.length > 0)),
          hasApiKey: false,
          host,
          model: model || cached.model || '',
          state: cached.state,
          statusLabel: cached.statusLabel,
          code: cached.code,
          usable,
          retryable: Boolean(cached.retryable),
          userMessage: cached.userMessage,
          testedAt: cached.testedAt || null,
          originBlocked: Boolean(cached.originBlocked),
          reachable: cached.reachable !== undefined ? cached.reachable : null,
          version: cached.version || '',
          availableModels: Array.isArray(cached.availableModels) ? cached.availableModels.slice() : []
        };
      }

      if (!configured) {
        return {
          provider: 'ollama',
          label,
          configured: false,
          hasApiKey: false,
          host,
          model: '',
          state: STATE.NOT_CONFIGURED,
          statusLabel: 'Not configured',
          code: 'NOT_CONFIGURED',
          usable: false,
          retryable: false,
          userMessage: 'No local Ollama model configured. Detect or enter a local model in Zeus settings.',
          testedAt: null,
          originBlocked: false,
          reachable: null,
          version: '',
          availableModels: []
        };
      }

      return {
        provider: 'ollama',
        label,
        configured: true,
        hasApiKey: false,
        host,
        model,
        state: STATE.CONFIGURED_UNTESTED,
        statusLabel: 'Configured, not tested',
        code: 'UNTESTED',
        usable: true,
        retryable: false,
        userMessage: `Ollama model '${model}' configured at ${host} (not yet tested).`,
        testedAt: null,
        originBlocked: false,
        reachable: null,
        version: '',
        availableModels: []
      };
    }

    const apiKey = String(settings?.apiKeys?.[provider] || '').trim();
    const hasApiKey = Boolean(apiKey);
    const model = resolveProviderModel(settings, provider);
    const configSignature = `${computeKeyFingerprint(provider, apiKey)}|${model}`;
    const cached = statusCache.get(provider);
    const hasValidCache = Boolean(cached && cached.configSignature === configSignature);

    if (!hasApiKey) {
      return {
        provider,
        label,
        configured: false,
        hasApiKey: false,
        model,
        state: STATE.NOT_CONFIGURED,
        statusLabel: 'Not configured',
        code: 'NOT_CONFIGURED',
        usable: false,
        retryable: false,
        userMessage: `Missing ${label} API key. Add your key in Zeus settings.`,
        testedAt: null,
        originBlocked: false,
        reachable: null,
        availableModels: []
      };
    }

    if (inFlightTesting.has(provider)) {
      return {
        provider,
        label,
        configured: true,
        hasApiKey: true,
        model,
        state: STATE.TESTING,
        statusLabel: 'Testing',
        code: 'TESTING',
        usable: true,
        retryable: false,
        userMessage: `Testing ${label} connection...`,
        testedAt: cached?.testedAt || null,
        originBlocked: false,
        reachable: null,
        availableModels: []
      };
    }

    if (hasValidCache) {
      const usable = cached.state === STATE.VERIFIED ||
        (cached.state === STATE.ERROR && !isHardBlockingErrorCode(cached.code));
      return {
        provider,
        label,
        configured: true,
        hasApiKey: true,
        model,
        state: cached.state,
        statusLabel: cached.statusLabel,
        code: cached.code,
        usable,
        retryable: Boolean(cached.retryable),
        userMessage: cached.userMessage,
        testedAt: cached.testedAt || null,
        originBlocked: false,
        reachable: cached.state === STATE.VERIFIED ? true : (cached.reachable ?? null),
        availableModels: []
      };
    }

    return {
      provider,
      label,
      configured: true,
      hasApiKey: true,
      model,
      state: STATE.CONFIGURED_UNTESTED,
      statusLabel: 'Configured, not tested',
      code: 'UNTESTED',
      usable: true,
      retryable: false,
      userMessage: `${label} API key is saved (not yet tested).`,
      testedAt: null,
      originBlocked: false,
      reachable: null,
      availableModels: []
    };
  }

  async function loadResolvedSettings(settingsInput) {
    const store = getSettingsStore();
    if (settingsInput && typeof settingsInput === 'object') {
      return store && typeof store.normalizeSettings === 'function'
        ? store.normalizeSettings(settingsInput)
        : settingsInput;
    }
    if (store && typeof store.get === 'function') {
      return await store.get();
    }
    if (store && typeof store.loadSettings === 'function') {
      return await store.loadSettings();
    }
    if (store && typeof store.createDefaultSettings === 'function') {
      return store.createDefaultSettings();
    }
    return { provider: 'gemini', apiKeys: {}, models: {}, ollama: { host: 'http://localhost:11434', model: '' } };
  }

  async function getReadinessSummary(settingsInput) {
    const settings = await loadResolvedSettings(settingsInput);
    const activeProvider = String(settings?.provider || 'gemini').trim().toLowerCase() || 'gemini';

    const providers = {};
    for (const id of ALL_PROVIDERS) {
      providers[id] = buildProviderStatus(id, settings);
    }

    const configuredProviders = ALL_PROVIDERS.filter((id) => providers[id].configured);
    const usableProviders = ALL_PROVIDERS.filter((id) => providers[id].usable);

    if (activeProvider === 'auto') {
      let activeState = STATE.NOT_CONFIGURED;
      let statusLabel = 'Not configured';
      let code = 'NOT_CONFIGURED';
      let userMessage = 'No AI provider is configured for Auto mode. Add a cloud API key or configure a local Ollama model.';
      const usable = usableProviders.length > 0;
      const configured = configuredProviders.length > 0;

      if (usable) {
        const testingAny = usableProviders.some((id) => providers[id].state === STATE.TESTING);
        const verifiedList = usableProviders.filter((id) => providers[id].state === STATE.VERIFIED);
        if (testingAny) {
          activeState = STATE.TESTING;
          statusLabel = 'Testing';
          code = 'TESTING';
          userMessage = 'Testing configured Auto mode providers...';
        } else if (verifiedList.length > 0) {
          activeState = STATE.VERIFIED;
          statusLabel = 'Connection verified';
          code = 'OK';
          userMessage = `Auto mode ready via ${verifiedList.map(formatProviderLabel).join(', ')}.`;
        } else {
          activeState = STATE.CONFIGURED_UNTESTED;
          statusLabel = 'Configured, not tested';
          code = 'UNTESTED';
          userMessage = `Auto mode ready (${usableProviders.map(formatProviderLabel).join(', ')} configured, not yet tested).`;
        }
      } else if (configured) {
        const firstErrored = configuredProviders
          .map((id) => providers[id])
          .find((entry) => entry.state === STATE.ERROR) || providers[configuredProviders[0]];
        activeState = firstErrored.state;
        statusLabel = firstErrored.statusLabel;
        code = firstErrored.code;
        userMessage = firstErrored.userMessage;
      }

      return {
        activeProvider: 'auto',
        activeState,
        statusLabel,
        code,
        usable,
        configured,
        userMessage,
        model: '',
        usableProviders,
        configuredProviders,
        providers
      };
    }

    const activeEntry = providers[activeProvider] || providers.gemini;
    return {
      activeProvider,
      activeState: activeEntry.state,
      statusLabel: activeEntry.statusLabel,
      code: activeEntry.code,
      usable: activeEntry.usable,
      configured: activeEntry.configured,
      userMessage: activeEntry.userMessage,
      model: activeEntry.model,
      usableProviders,
      configuredProviders,
      providers
    };
  }

  function buildErrorClassifyOptions(provider, model) {
    const ollamaMeta = getOllamaMeta() || {};
    return {
      provider,
      model,
      ollamaNotRunningMessage: ollamaMeta.OLLAMA_NOT_RUNNING_MESSAGE,
      ollamaNoModelMessage: ollamaMeta.OLLAMA_NO_MODEL_MESSAGE,
      buildOllamaOriginBlockedMessage: ollamaMeta.buildOllamaOriginBlockedMessage
    };
  }

  function classifyDiagnosticError(error, provider, model) {
    const errors = getErrors();
    const opts = buildErrorClassifyOptions(provider, model);
    if (errors && typeof errors.classifyEnhanceError === 'function') {
      return errors.classifyEnhanceError(error, opts);
    }
    return {
      code: 'UNKNOWN_ERROR',
      category: 'UNKNOWN_ERROR',
      provider,
      model,
      status: Number(error?.status) || 0,
      retryable: false,
      userMessage: String(error?.message || 'Connection test failed.')
    };
  }

  async function executeCloudProbe(provider, apiKey, model, signal) {
    const transport = getTransport();
    if (!transport || typeof transport.execute !== 'function') {
      throw new Error('Provider transport unavailable.');
    }

    if (provider === 'gemini') {
      const targetModel = model || 'gemini-flash-latest';
      return transport.execute({
        url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(targetModel)}`,
        method: 'GET',
        headers: { 'x-goog-api-key': apiKey },
        timeoutMs: TEST_TIMEOUT_MS,
        maxRetries: 1,
        signal,
        provider: 'gemini'
      });
    }

    if (provider === 'openai') {
      const targetModel = model || 'gpt-5.4-mini';
      return transport.execute({
        url: `https://api.openai.com/v1/models/${encodeURIComponent(targetModel)}`,
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
        timeoutMs: TEST_TIMEOUT_MS,
        maxRetries: 1,
        signal,
        provider: 'openai'
      });
    }

    if (provider === 'claude') {
      return transport.execute({
        url: 'https://api.anthropic.com/v1/models',
        method: 'GET',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        timeoutMs: TEST_TIMEOUT_MS,
        maxRetries: 1,
        signal,
        provider: 'claude'
      });
    }

    if (provider === 'openrouter') {
      return transport.execute({
        url: 'https://openrouter.ai/api/v1/key',
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
        timeoutMs: TEST_TIMEOUT_MS,
        maxRetries: 1,
        signal,
        provider: 'openrouter'
      });
    }

    throw new Error(`Unsupported provider: ${provider}`);
  }

  function cacheEntryIfCurrent(provider, startedGeneration, entry) {
    if (getGeneration(provider) !== startedGeneration) {
      return;
    }
    statusCache.set(provider, entry);
  }

  async function testSingleProvider(provider, settings, options = {}) {
    const label = formatProviderLabel(provider);
    const modelOverride = options?.model !== undefined ? String(options.model || '').trim() : undefined;
    const hostOverride = options?.host !== undefined ? String(options.host || '').trim() : undefined;
    const targetModel = resolveProviderModel(settings, provider, modelOverride);

    if (provider === 'ollama') {
      const targetHost = resolveOllamaHost(settings, hostOverride);
      const configSignature = `${targetHost}|${targetModel}`;
      const startedGen = getGeneration('ollama');
      const ollamaMeta = getOllamaMeta();

      inFlightTesting.add('ollama');
      try {
        let discovery;
        if (ollamaMeta && typeof ollamaMeta.discoverLocalModels === 'function') {
          discovery = await ollamaMeta.discoverLocalModels({ ollama: { host: targetHost } }, options?.signal);
        } else {
          const transport = getTransport();
          const versionRes = await transport.execute({
            url: `${targetHost}/api/version`,
            method: 'GET',
            timeoutMs: 5000,
            maxRetries: 1,
            signal: options?.signal,
            provider: 'ollama'
          });
          discovery = {
            reachable: Boolean(versionRes.ok),
            originBlocked: versionRes.status === 403,
            origin: '',
            version: String(versionRes.data?.version || '').trim(),
            running: [],
            installed: [],
            models: [],
            error: versionRes.status === 403
              ? 'Ollama blocked extension origin.'
              : (versionRes.ok ? '' : 'Ollama not running. Start with: ollama run qwen3:8b')
          };
        }

        const testedAt = Date.now();

        if (discovery.originBlocked) {
          const userMessage = discovery.error || ollamaMeta?.buildOllamaOriginBlockedMessage?.() || 'Ollama blocked extension origin.';
          cacheEntryIfCurrent('ollama', startedGen, {
            configSignature,
            state: STATE.ERROR,
            statusLabel: 'Origin blocked',
            code: 'OLLAMA_ORIGIN_BLOCKED',
            userMessage,
            retryable: false,
            testedAt,
            originBlocked: true,
            reachable: false,
            version: '',
            availableModels: [],
            model: targetModel
          });
          return {
            ok: false,
            provider: 'ollama',
            host: targetHost,
            model: targetModel,
            state: STATE.ERROR,
            statusLabel: 'Origin blocked',
            code: 'OLLAMA_ORIGIN_BLOCKED',
            userMessage,
            retryable: false,
            status: 403,
            testedAt,
            originBlocked: true,
            reachable: false,
            version: '',
            availableModels: []
          };
        }

        if (!discovery.reachable) {
          const userMessage = discovery.error || ollamaMeta?.OLLAMA_NOT_RUNNING_MESSAGE || 'Ollama not running.';
          cacheEntryIfCurrent('ollama', startedGen, {
            configSignature,
            state: STATE.ERROR,
            statusLabel: 'Network unavailable',
            code: 'NETWORK_UNAVAILABLE',
            userMessage,
            retryable: true,
            testedAt,
            originBlocked: false,
            reachable: false,
            version: '',
            availableModels: [],
            model: targetModel
          });
          return {
            ok: false,
            provider: 'ollama',
            host: targetHost,
            model: targetModel,
            state: STATE.ERROR,
            statusLabel: 'Network unavailable',
            code: 'NETWORK_UNAVAILABLE',
            userMessage,
            retryable: true,
            status: 0,
            testedAt,
            originBlocked: false,
            reachable: false,
            version: '',
            availableModels: []
          };
        }

        const models = Array.isArray(discovery.models) ? discovery.models : [];
        if (models.length === 0) {
          const userMessage = ollamaMeta?.OLLAMA_NO_MODEL_MESSAGE || 'No local Ollama model detected. Start one with: ollama run qwen3:8b';
          cacheEntryIfCurrent('ollama', startedGen, {
            configSignature,
            state: STATE.NOT_CONFIGURED,
            statusLabel: 'Not configured',
            code: 'NOT_CONFIGURED',
            userMessage,
            retryable: false,
            testedAt,
            originBlocked: false,
            reachable: true,
            version: discovery.version || '',
            availableModels: [],
            model: targetModel
          });
          return {
            ok: false,
            provider: 'ollama',
            host: targetHost,
            model: targetModel,
            state: STATE.NOT_CONFIGURED,
            statusLabel: 'Not configured',
            code: 'NOT_CONFIGURED',
            userMessage,
            retryable: false,
            status: 200,
            testedAt,
            originBlocked: false,
            reachable: true,
            version: discovery.version || '',
            availableModels: []
          };
        }

        if (targetModel && !models.some((m) => matchesOllamaModel(m, targetModel))) {
          const userMessage = `Ollama is reachable, but model '${targetModel}' was not found locally. Available: ${models.slice(0, 5).join(', ')}.`;
          cacheEntryIfCurrent('ollama', startedGen, {
            configSignature,
            state: STATE.ERROR,
            statusLabel: 'Model unavailable',
            code: 'MODEL_UNAVAILABLE',
            userMessage,
            retryable: false,
            testedAt,
            originBlocked: false,
            reachable: true,
            version: discovery.version || '',
            availableModels: models,
            model: targetModel
          });
          return {
            ok: false,
            provider: 'ollama',
            host: targetHost,
            model: targetModel,
            state: STATE.ERROR,
            statusLabel: 'Model unavailable',
            code: 'MODEL_UNAVAILABLE',
            userMessage,
            retryable: false,
            status: 404,
            testedAt,
            originBlocked: false,
            reachable: true,
            version: discovery.version || '',
            availableModels: models
          };
        }

        const resolvedModel = targetModel || models[0];
        const versionSuffix = discovery.version ? ` v${discovery.version}` : '';
        const userMessage = `Ollama${versionSuffix} connected (${models.length} local model${models.length === 1 ? '' : 's'} available).`;

        cacheEntryIfCurrent('ollama', startedGen, {
          configSignature,
          state: STATE.VERIFIED,
          statusLabel: 'Connection verified',
          code: 'OK',
          userMessage,
          retryable: false,
          testedAt,
          originBlocked: false,
          reachable: true,
          version: discovery.version || '',
          availableModels: models,
          model: resolvedModel
        });

        return {
          ok: true,
          provider: 'ollama',
          host: targetHost,
          model: resolvedModel,
          state: STATE.VERIFIED,
          statusLabel: 'Connection verified',
          code: 'OK',
          userMessage,
          retryable: false,
          status: 200,
          testedAt,
          originBlocked: false,
          reachable: true,
          version: discovery.version || '',
          availableModels: models
        };
      } catch (err) {
        const detail = classifyDiagnosticError(err, 'ollama', targetModel);
        const statusLabel = mapErrorCodeToStatusLabel(detail.code);
        const testedAt = Date.now();
        cacheEntryIfCurrent('ollama', startedGen, {
          configSignature,
          state: STATE.ERROR,
          statusLabel,
          code: detail.code,
          userMessage: detail.userMessage,
          retryable: detail.retryable,
          testedAt,
          originBlocked: detail.code === 'OLLAMA_ORIGIN_BLOCKED',
          reachable: false,
          version: '',
          availableModels: [],
          model: targetModel
        });
        return {
          ok: false,
          provider: 'ollama',
          host: targetHost,
          model: targetModel,
          state: STATE.ERROR,
          statusLabel,
          code: detail.code,
          userMessage: detail.userMessage,
          retryable: detail.retryable,
          status: detail.status,
          testedAt,
          originBlocked: detail.code === 'OLLAMA_ORIGIN_BLOCKED',
          reachable: false,
          version: '',
          availableModels: []
        };
      } finally {
        inFlightTesting.delete('ollama');
      }
    }

    if (!CLOUD_PROVIDERS.includes(provider)) {
      return {
        ok: false,
        provider,
        model: targetModel,
        state: STATE.ERROR,
        statusLabel: 'Request failed',
        code: 'INVALID_REQUEST',
        userMessage: `Unsupported provider: ${provider}`,
        retryable: false,
        status: 0,
        testedAt: Date.now()
      };
    }

    const apiKey = String(settings?.apiKeys?.[provider] || '').trim();
    if (!apiKey) {
      statusCache.delete(provider);
      const userMessage = `Missing ${label} API key. Add your key in Zeus settings.`;
      return {
        ok: false,
        provider,
        model: targetModel,
        state: STATE.NOT_CONFIGURED,
        statusLabel: 'Not configured',
        code: 'NOT_CONFIGURED',
        userMessage,
        retryable: false,
        status: 0,
        testedAt: null
      };
    }

    const keyFingerprint = computeKeyFingerprint(provider, apiKey);
    const configSignature = `${keyFingerprint}|${targetModel}`;
    const startedGen = getGeneration(provider);

    inFlightTesting.add(provider);
    try {
      const response = await executeCloudProbe(provider, apiKey, targetModel, options?.signal);
      const testedAt = Date.now();

      if (response.ok) {
        const userMessage = `${label} connection verified${targetModel ? ` (${targetModel})` : ''}.`;
        cacheEntryIfCurrent(provider, startedGen, {
          keyFingerprint,
          configSignature,
          state: STATE.VERIFIED,
          statusLabel: 'Connection verified',
          code: 'OK',
          userMessage,
          retryable: false,
          status: response.status,
          testedAt,
          reachable: true,
          model: targetModel
        });

        return {
          ok: true,
          provider,
          model: targetModel,
          state: STATE.VERIFIED,
          statusLabel: 'Connection verified',
          code: 'OK',
          userMessage,
          retryable: false,
          status: response.status,
          testedAt
        };
      }

      const errors = getErrors();
      const httpErr = errors?.ProviderHttpError
        ? new errors.ProviderHttpError(provider, response.status, response.data, targetModel)
        : Object.assign(new Error(`${provider} returned status ${response.status}`), {
            provider,
            status: response.status,
            data: response.data,
            model: targetModel
          });

      const detail = classifyDiagnosticError(httpErr, provider, targetModel);
      const statusLabel = mapErrorCodeToStatusLabel(detail.code);

      cacheEntryIfCurrent(provider, startedGen, {
        keyFingerprint,
        configSignature,
        state: STATE.ERROR,
        statusLabel,
        code: detail.code,
        userMessage: detail.userMessage,
        retryable: detail.retryable,
        status: detail.status,
        testedAt,
        reachable: false,
        model: targetModel
      });

      return {
        ok: false,
        provider,
        model: targetModel,
        state: STATE.ERROR,
        statusLabel,
        code: detail.code,
        userMessage: detail.userMessage,
        retryable: detail.retryable,
        status: detail.status,
        testedAt
      };
    } catch (err) {
      const detail = classifyDiagnosticError(err, provider, targetModel);
      const statusLabel = mapErrorCodeToStatusLabel(detail.code);
      const testedAt = Date.now();

      cacheEntryIfCurrent(provider, startedGen, {
        keyFingerprint,
        configSignature,
        state: STATE.ERROR,
        statusLabel,
        code: detail.code,
        userMessage: detail.userMessage,
        retryable: detail.retryable,
        status: detail.status,
        testedAt,
        reachable: false,
        model: targetModel
      });

      return {
        ok: false,
        provider,
        model: targetModel,
        state: STATE.ERROR,
        statusLabel,
        code: detail.code,
        userMessage: detail.userMessage,
        retryable: detail.retryable,
        status: detail.status,
        testedAt
      };
    } finally {
      inFlightTesting.delete(provider);
    }
  }

  /**
   * Tests provider connectivity using credentials loaded strictly from ZeusSettingsStore.
   * Never accepts or returns raw API keys.
   */
  async function testConnection(options = {}) {
    const settings = await loadResolvedSettings();
    const requestedProvider = String(options?.provider || settings?.provider || 'gemini').trim().toLowerCase();

    if (requestedProvider === 'auto') {
      const targets = ALL_PROVIDERS.filter((id) => {
        if (id === 'ollama') return Boolean(String(settings?.ollama?.model || '').trim());
        return Boolean(String(settings?.apiKeys?.[id] || '').trim());
      });

      if (targets.length === 0) {
        const readiness = await getReadinessSummary(settings);
        return {
          ok: false,
          provider: 'auto',
          model: '',
          state: STATE.NOT_CONFIGURED,
          statusLabel: 'Not configured',
          code: 'NOT_CONFIGURED',
          userMessage: readiness.userMessage,
          retryable: false,
          status: 0,
          testedAt: null,
          results: {},
          readiness
        };
      }

      const settled = await Promise.all(
        targets.map(async (id) => [id, await testSingleProvider(id, settings, { signal: options?.signal })])
      );
      const results = Object.fromEntries(settled);
      const readiness = await getReadinessSummary(settings);
      const ok = Boolean(readiness.usable && targets.some((id) => results[id]?.ok));

      return {
        ok,
        provider: 'auto',
        model: '',
        state: readiness.activeState,
        statusLabel: readiness.statusLabel,
        code: ok ? 'OK' : readiness.code,
        userMessage: readiness.userMessage,
        retryable: !ok && targets.some((id) => results[id]?.retryable),
        status: 0,
        testedAt: Date.now(),
        results,
        readiness
      };
    }

    const result = await testSingleProvider(requestedProvider, settings, options);
    const readiness = await getReadinessSummary(settings);
    return {
      ...result,
      readiness
    };
  }

  function invalidateStatus(provider) {
    const normalized = String(provider || '').trim().toLowerCase();
    if (!normalized || normalized === 'all' || normalized === 'auto') {
      clearAllStatuses();
      return;
    }
    bumpGeneration(normalized);
    statusCache.delete(normalized);
  }

  function clearAllStatuses() {
    for (const id of ALL_PROVIDERS) {
      bumpGeneration(id);
    }
    statusCache.clear();
  }

  function invalidateForStorageChange(changes, areaName) {
    if (!changes || typeof changes !== 'object') {
      return;
    }

    if (areaName === 'local') {
      if ('apiKeys' in changes) {
        const oldKeys = changes.apiKeys?.oldValue;
        const newKeys = changes.apiKeys?.newValue;
        if (oldKeys && newKeys && typeof oldKeys === 'object' && typeof newKeys === 'object') {
          for (const id of CLOUD_PROVIDERS) {
            if (String(oldKeys[id] || '').trim() !== String(newKeys[id] || '').trim()) {
              invalidateStatus(id);
            }
          }
        } else {
          for (const id of CLOUD_PROVIDERS) {
            invalidateStatus(id);
          }
        }
      }

      for (const key of Object.keys(changes)) {
        const match = key.match(/^zeus_(gemini|openai|claude|openrouter)_api_key$/i);
        if (match) {
          invalidateStatus(match[1].toLowerCase());
        }
      }
      return;
    }

    if (areaName === 'sync') {
      if ('models' in changes) {
        const oldModels = changes.models?.oldValue;
        const newModels = changes.models?.newValue;
        if (oldModels && newModels && typeof oldModels === 'object' && typeof newModels === 'object') {
          for (const id of CLOUD_PROVIDERS) {
            if (String(oldModels[id] || '').trim() !== String(newModels[id] || '').trim()) {
              invalidateStatus(id);
            }
          }
        } else {
          for (const id of CLOUD_PROVIDERS) {
            invalidateStatus(id);
          }
        }
      }

      if ('ollama' in changes || 'zeus_ollama_model' in changes) {
        invalidateStatus('ollama');
      }

      if ('apiKeys' in changes) {
        for (const id of CLOUD_PROVIDERS) {
          invalidateStatus(id);
        }
      }

      for (const key of Object.keys(changes)) {
        const match = key.match(/^zeus_(gemini|openai|claude|openrouter)_(?:api_key|model)$/i);
        if (match) {
          invalidateStatus(match[1].toLowerCase());
        }
      }
    }
  }

  const ZeusProviderDiagnostics = Object.freeze({
    STATE,
    testConnection,
    getReadinessSummary,
    invalidateStatus,
    invalidateForStorageChange,
    clearAllStatuses
  });

  globalScope.ZeusProviderDiagnostics = ZeusProviderDiagnostics;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ZeusProviderDiagnostics;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
