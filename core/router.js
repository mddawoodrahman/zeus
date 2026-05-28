(function initZeusRouter(globalScope) {
  const settingsModule = globalScope.ZeusSettings;
  const registry = globalScope.ZeusModelRegistry || null;
  const providers = globalScope.ZeusProviders || {};
  const telemetry = globalScope.ZeusTelemetry || null;

  function trackAutoFallback(payload) {
    const logPrefix = globalScope?.LOG_PREFIX || { warn: '%c[ZEUS_NET]' };
    const logStyle = globalScope?.LOG_STYLE || { warn: 'color: #FCEE0A; font-family: JetBrains Mono; font-weight: bold;' };
    console.warn(`${logPrefix.warn} FALLBACK TRIGGERED`, logStyle.warn, payload);

    if (telemetry && typeof telemetry.trackFallback === 'function') {
      telemetry.trackFallback({
        category: 'auto-route-fallback',
        ...(payload && typeof payload === 'object' ? payload : {})
      });
    }
  }

  function getProviderDefaultModel(provider) {
    const preferred = String(registry?.getDefaultModel?.(provider) || '').trim();
    if (preferred) {
      return preferred;
    }

    const first = registry?.getProviderModels?.(provider)?.[0]?.id;
    return String(first || '').trim();
  }

  function getProviderModelByPredicate(provider, predicate, fallback) {
    const providerModels = registry?.getProviderModels?.(provider) || [];
    const model = providerModels.find((item) => {
      try {
        return Boolean(predicate(item || {}));
      } catch (_) {
        return false;
      }
    });

    return String(model?.id || fallback || '').trim();
  }

  function detectPromptIntent(prompt) {
    const text = String(prompt || '').toLowerCase();

    const codingSignals = /\b(code|coding|debug|bug|stack trace|refactor|typescript|javascript|python|sql|algorithm|function|compile|test case|unit test|api endpoint)\b/i;
    const cheapSignals = /\b(cheap|budget|low cost|fast answer|quick rewrite|minimal tokens|lightweight)\b/i;
    const longFormSignals = /\b(long form|long-form|essay|detailed report|comprehensive|in-depth|whitepaper|multi section|article|extensive)\b/i;

    if (codingSignals.test(text)) return 'coding';
    if (cheapSignals.test(text)) return 'cheap';
    if (longFormSignals.test(text) || text.length > 1200) return 'long-form';
    return 'default';
  }

  function autoRouteForIntent(intent) {
    const openAiDefault = getProviderDefaultModel('openai');
    const claudeDefault = getProviderDefaultModel('claude');
    const geminiDefault = getProviderDefaultModel('gemini');

    if (intent === 'coding') {
      return {
        provider: 'openai',
        model: getProviderModelByPredicate(
          'openai',
          (item) => item.group === 'coding-agents' || (item.bestFor || []).includes('coding'),
          openAiDefault
        )
      };
    }

    if (intent === 'long-form') {
      return {
        provider: 'claude',
        model: getProviderModelByPredicate(
          'claude',
          (item) => (item.bestFor || []).includes('long-form') || item.group === 'high-intelligence',
          claudeDefault
        )
      };
    }

    if (intent === 'cheap') {
      return {
        provider: 'gemini',
        model: getProviderModelByPredicate(
          'gemini',
          (item) => item.cost === 'low' || item.group === 'fast-cheap',
          geminiDefault
        )
      };
    }

    return { provider: 'openai', model: openAiDefault };
  }

  function buildAutoRouteCandidates(primaryRoute) {
    const defaults = [
      primaryRoute,
      { provider: 'openai', model: getProviderDefaultModel('openai') },
      { provider: 'claude', model: getProviderDefaultModel('claude') },
      { provider: 'gemini', model: getProviderDefaultModel('gemini') },
      { provider: 'ollama', model: '' }
    ];

    const unique = [];
    const seen = new Set();

    for (const item of defaults) {
      const provider = String(item?.provider || '').trim();
      const model = String(item?.model || '').trim();
      const key = `${provider}:${model}`;

      if (!provider || seen.has(key)) continue;
      seen.add(key);
      unique.push({ provider, model });
    }

    return unique;
  }

  function hasApiKeyForProvider(config, provider) {
    return Boolean(String(config?.apiKeys?.[provider] || '').trim());
  }

  function withProviderModelOverride(config, provider, model) {
    const normalizedModel = String(model || '').trim();
    if (!normalizedModel) {
      return config;
    }

    return {
      ...config,
      models: {
        ...(config.models || {}),
        [provider]: normalizedModel
      }
    };
  }

  async function callProvider(provider, prompt, config) {
    const providerFn = providers[provider];
    if (typeof providerFn !== 'function') {
      throw new Error(`Unsupported provider: ${provider}`);
    }

    return providerFn(prompt, config);
  }

  async function enhanceWithAuto(prompt, config) {
    const intent = detectPromptIntent(prompt);
    const primaryRoute = autoRouteForIntent(intent);
    const candidates = buildAutoRouteCandidates(primaryRoute);

    const attempted = [];

    for (const route of candidates) {
      const provider = route.provider;
      const model = route.model;

      if (provider !== 'ollama' && !hasApiKeyForProvider(config, provider)) {
        trackAutoFallback({
          provider,
          fromModel: model || 'auto',
          toModel: '',
          reason: 'missing-api-key',
          intent,
          stage: 'provider-candidate-skip'
        });
        attempted.push(`${provider}:${model || 'n/a'} (missing key)`);
        continue;
      }

      try {
        const override = withProviderModelOverride(config, provider, model);
        return await callProvider(provider, prompt, override);
      } catch (error) {
        trackAutoFallback({
          provider,
          fromModel: model || 'auto',
          toModel: '',
          reason: String(error?.message || 'provider-failed'),
          intent,
          stage: 'provider-candidate-error'
        });
        attempted.push(`${provider}:${model || 'auto'} (${String(error?.message || 'failed')})`);
      }
    }

    throw new Error(`Auto mode failed after smart routing attempts. ${attempted.join(' | ')}`);
  }

  async function enhancePrompt(prompt) {
    if (!String(prompt || '').trim()) {
      throw new Error('Empty prompt provided.');
    }

    const logPrefix = globalScope?.LOG_PREFIX || {
      info: '%c[ZEUS_NET]',
      warn: '%c[ZEUS_NET]',
      error: '%c[ZEUS_NET]'
    };
    const logStyle = globalScope?.LOG_STYLE || {
      info: 'color: #00F0FF; font-family: JetBrains Mono; font-weight: bold;',
      warn: 'color: #FCEE0A; font-family: JetBrains Mono; font-weight: bold;',
      error: 'color: #FF003C; font-family: JetBrains Mono; font-weight: bold;'
    };

    const startTime = Date.now();
    try {
      const config = await settingsModule.loadSettings();
      const provider = String(config?.provider || settingsModule.createDefaultSettings().provider).trim();

      console.log(`${logPrefix.info} ROUTING PROMPT`, logStyle.info, { provider });

      let result;
      if (provider === 'auto') {
        result = await enhanceWithAuto(prompt, config);
      } else {
        result = await callProvider(provider, prompt, config);
      }

      const duration = Date.now() - startTime;
      const storageLocal = globalScope?.chrome?.storage?.local;
      if (storageLocal && typeof storageLocal.set === 'function') {
        storageLocal.set({ zeus_last_latency: duration });
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const storageLocal = globalScope?.chrome?.storage?.local;
      if (storageLocal && typeof storageLocal.set === 'function') {
        storageLocal.set({ zeus_last_latency: duration });
      }

      console.error(`${logPrefix.error} NEURAL LINK FAILED`, logStyle.error, error);
      throw error;
    }
  }

  async function streamSuggest(text, settings, port, abortSignal) {
    let provider = String(settings?.copilotProvider || 'auto').trim();

    if (provider === 'auto') {
      const hasOllamaModel = Boolean(settings?.ollama?.model);
      if (hasOllamaModel) {
        provider = 'ollama';
      } else {
        const hasGeminiKey = Boolean(settings?.apiKeys?.gemini);
        const hasOpenAiKey = Boolean(settings?.apiKeys?.openai);
        const hasClaudeKey = Boolean(settings?.apiKeys?.claude);
        const hasOpenRouterKey = Boolean(settings?.apiKeys?.openrouter);

        if (hasGeminiKey) {
          provider = 'gemini';
        } else if (hasOpenAiKey) {
          provider = 'openai';
        } else if (hasClaudeKey) {
          provider = 'claude';
        } else if (hasOpenRouterKey) {
          provider = 'openrouter';
        } else {
          return;
        }
      }
    } else {
      if (provider !== 'ollama' && !settings?.apiKeys?.[provider]) {
        port.postMessage({ type: 'error', message: `Missing API key for provider ${provider}` });
        return;
      }
    }

    const providerFn = providers[provider];
    if (typeof providerFn !== 'function') {
      port.postMessage({ type: 'error', message: `Unsupported provider: ${provider}` });
      return;
    }

    if (typeof providerFn.suggest !== 'function') {
      port.postMessage({ type: 'error', message: `Provider ${provider} does not support copilot suggestions` });
      return;
    }

    try {
      await providerFn.suggest(text, settings, port, abortSignal);
    } catch (err) {
      if (abortSignal?.aborted) return;
      port.postMessage({ type: 'error', message: err.message || 'Error fetching suggestion' });
    }
  }

  globalScope.ZeusRouter = Object.freeze({
    enhancePrompt,
    detectPromptIntent,
    autoRouteForIntent,
    buildAutoRouteCandidates,
    streamSuggest
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
