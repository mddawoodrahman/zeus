(function initZeusRouter(globalScope) {
  const settingsModule = globalScope.ZeusSettings;
  const registry = globalScope.ZeusModelRegistry || null;
  const providers = globalScope.ZeusProviders || {};
  const telemetry = globalScope.ZeusTelemetry || null;

  function trackAutoFallback(payload) {
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

    const config = await settingsModule.loadSettings();
    const provider = String(config?.provider || settingsModule.createDefaultSettings().provider).trim();

    if (provider === 'auto') {
      return enhanceWithAuto(prompt, config);
    }

    return callProvider(provider, prompt, config);
  }

  globalScope.ZeusRouter = Object.freeze({
    enhancePrompt,
    detectPromptIntent,
    autoRouteForIntent,
    buildAutoRouteCandidates
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
