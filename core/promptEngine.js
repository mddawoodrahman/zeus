(function initZeusPromptEngine(globalScope) {
  'use strict';

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

  function getRouter() {
    if (globalScope.ZeusRouter) return globalScope.ZeusRouter;
    if (typeof require !== 'undefined') {
      try {
        const path = require('node:path');
        return require(path.resolve(process.cwd(), 'core/router.js'));
      } catch (_) {
        try {
          return require('./router.js');
        } catch (_2) {
          return null;
        }
      }
    }
    return null;
  }

  function getRedactor() {
    if (globalScope.ZeusRedactor) return globalScope.ZeusRedactor;
    if (typeof require !== 'undefined') {
      try {
        const path = require('node:path');
        return require(path.resolve(process.cwd(), 'core/redactor.js'));
      } catch (_) {
        try {
          return require('./redactor.js');
        } catch (_2) {
          return null;
        }
      }
    }
    return null;
  }

  function getTelemetry() {
    if (globalScope.ZeusTelemetry) return globalScope.ZeusTelemetry;
    if (typeof require !== 'undefined') {
      try {
        const path = require('node:path');
        return require(path.resolve(process.cwd(), 'core/telemetry.js'));
      } catch (_) {
        try {
          return require('./telemetry.js');
        } catch (_2) {
          return null;
        }
      }
    }
    return null;
  }

  function getProviders() {
    return globalScope.ZeusProviders || {};
  }

  function trackFallbackEvent(payload) {
    const logPrefix = globalScope?.LOG_PREFIX || { warn: '%c[ZEUS_NET]' };
    const logStyle = globalScope?.LOG_STYLE || { warn: 'color: #FCEE0A; font-family: JetBrains Mono; font-weight: bold;' };
    console.warn(`${logPrefix.warn} FALLBACK TRIGGERED`, logStyle.warn, payload);

    const telemetry = getTelemetry();
    if (telemetry && typeof telemetry.trackFallback === 'function') {
      telemetry.trackFallback({
        category: 'auto-route-fallback',
        ...(payload && typeof payload === 'object' ? payload : {})
      });
    }
  }

  function hasApiKeyForProvider(config, provider) {
    if (provider === 'ollama') return true;
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

  async function execute(promptText, options = {}) {
    const rawInput = String(promptText || '').trim();
    if (!rawInput) {
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
    const warningsList = [];

    // 1. Defense-in-Depth Scrubbing:
    // If background is invoked directly without client-side scrubbing, scrub internally
    let scrubbedPrompt = rawInput;
    let internalSecretMap = null;
    const redactor = getRedactor();

    if (redactor && typeof redactor.hasSensitive === 'function' && typeof redactor.scrub === 'function') {
      if (redactor.hasSensitive(rawInput)) {
        const scrubRes = redactor.scrub(rawInput);
        if (scrubRes.hasRedactions) {
          scrubbedPrompt = scrubRes.text;
          internalSecretMap = scrubRes.secretMap;
          warningsList.push('NOTICE: Defense-in-depth redaction applied to background enhancement');
        }
      }
    }

    // 2. Resolve settings
    const settingsStore = getSettingsStore();
    const baseConfig = settingsStore && typeof settingsStore.loadSettings === 'function'
      ? await settingsStore.loadSettings()
      : (settingsStore && typeof settingsStore.createDefaultSettings === 'function'
        ? settingsStore.createDefaultSettings()
        : { provider: 'gemini' });

    const config = {
      ...baseConfig,
      ...(options?.provider ? { provider: options.provider } : {}),
      models: {
        ...(baseConfig.models || {}),
        ...(options?.model && options?.provider ? { [options.provider]: options.model } : {})
      }
    };

    const router = getRouter();
    const providers = getProviders();
    const configuredProvider = String(config.provider || 'gemini').trim();

    let finalEnhancedText = '';
    let executedProvider = configuredProvider;
    let executedModel = String(config.models?.[configuredProvider] || '').trim();
    let detectedIntent = 'general';
    const fallbackAttempts = [];

    try {
      console.log(`${logPrefix.info} ROUTING PROMPT`, logStyle.info, { provider: configuredProvider });

      if (configuredProvider === 'auto') {
        const intent = router && typeof router.detectPromptIntent === 'function'
          ? router.detectPromptIntent(scrubbedPrompt)
          : 'default';
        detectedIntent = intent;

        const primaryRoute = router && typeof router.autoRouteForIntent === 'function'
          ? router.autoRouteForIntent(intent)
          : { provider: 'openai', model: '' };

        const candidates = router && typeof router.buildAutoRouteCandidates === 'function'
          ? router.buildAutoRouteCandidates(primaryRoute)
          : [primaryRoute];

        let success = false;
        let lastAutoError = null;

        for (const route of candidates) {
          const provider = route.provider;
          const model = route.model;

          if (!hasApiKeyForProvider(config, provider)) {
            continue;
          }

          const providerFn = providers[provider] || globalScope.ZeusProviders?.[provider];
          if (typeof providerFn !== 'function') {
            continue;
          }

          try {
            const candidateConfig = withProviderModelOverride(config, provider, model);
            finalEnhancedText = await providerFn(scrubbedPrompt, candidateConfig);
            executedProvider = provider;
            executedModel = model || String(candidateConfig.models?.[provider] || '').trim();
            success = true;
            break;
          } catch (error) {
            lastAutoError = error;
            trackFallbackEvent({
              provider,
              fromModel: model || '',
              toModel: '',
              reason: String(error?.message || 'unknown error'),
              intent,
              stage: 'provider-candidate-error'
            });
            fallbackAttempts.push(`${provider}:${model || 'auto'} (${String(error?.message || 'failed')})`);
          }
        }

        if (!success) {
          throw new Error(`Auto mode failed after smart routing attempts. ${fallbackAttempts.join(' | ')}`);
        }
      } else {
        const providerFn = providers[configuredProvider] || globalScope.ZeusProviders?.[configuredProvider];
        if (typeof providerFn !== 'function') {
          throw new Error(`Unsupported provider: ${configuredProvider}`);
        }

        finalEnhancedText = await providerFn(scrubbedPrompt, config);
        executedProvider = configuredProvider;
        executedModel = String(config.models?.[configuredProvider] || '').trim();
      }

      // 3. Defense-in-Depth Rehydration (if background-only scrubbing was performed)
      if (internalSecretMap && redactor && typeof redactor.hydrateWithDetails === 'function') {
        const hydration = redactor.hydrateWithDetails(finalEnhancedText, internalSecretMap);
        finalEnhancedText = hydration.text;
        if (hydration.droppedPlaceholders?.length > 0) {
          warningsList.push(`WARNING: SENSITIVE PLACEHOLDER OMITTED BY AI (${hydration.droppedPlaceholders.join(', ')})`);
        }
      }

      const durationMs = Date.now() - startTime;
      const storageLocal = globalScope?.chrome?.storage?.local;
      if (storageLocal && typeof storageLocal.set === 'function') {
        storageLocal.set({ zeus_last_latency: durationMs });
      }

      return {
        enhancedText: String(finalEnhancedText).trim(),
        warnings: warningsList,
        meta: {
          provider: executedProvider,
          model: executedModel,
          durationMs,
          intent: detectedIntent,
          fallbackAttempts
        }
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const storageLocal = globalScope?.chrome?.storage?.local;
      if (storageLocal && typeof storageLocal.set === 'function') {
        storageLocal.set({ zeus_last_latency: durationMs });
      }

      console.error(`${logPrefix.error} NEURAL LINK FAILED`, logStyle.error, error);
      throw error;
    }
  }

  const ZeusPromptEngine = Object.freeze({
    execute,
    hasApiKeyForProvider,
    withProviderModelOverride
  });

  globalScope.ZeusPromptEngine = ZeusPromptEngine;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ZeusPromptEngine;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
