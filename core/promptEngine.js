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

  function hasOllamaModel(config) {
    return Boolean(String(config?.ollama?.model || '').trim());
  }

  function isProviderConfigured(config, provider) {
    if (provider === 'ollama') {
      return hasOllamaModel(config);
    }
    return hasApiKeyForProvider(config, provider);
  }

  function formatProviderLabel(provider) {
    if (provider === 'openai') return 'OpenAI';
    if (provider === 'openrouter') return 'OpenRouter';
    if (provider === 'claude') return 'Claude';
    if (provider === 'gemini') return 'Gemini';
    if (provider === 'ollama') return 'Ollama';
    if (provider === 'auto') return 'Auto mode';
    return provider || 'provider';
  }

  function createConfigError(code, provider, message, details = {}) {
    const errorsModule = getErrors();
    if (errorsModule && typeof errorsModule.ProviderConfigError === 'function') {
      return new errorsModule.ProviderConfigError(code, provider, message, details);
    }
    const err = new Error(message);
    err.name = 'ProviderConfigError';
    err.code = code || 'NOT_CONFIGURED';
    err.category = details?.category || err.code;
    err.provider = String(provider || '').trim();
    err.model = String(details?.model || '').trim();
    err.status = Number(details?.status) || 0;
    err.retryable = Boolean(details?.retryable);
    err.details = details;
    return err;
  }

  function safelyAttachErrorMetadata(error, metadata) {
    if (!error || typeof error !== 'object') {
      return;
    }

    const errorsModule = getErrors();
    const ollamaMeta = globalScope.ZeusOllamaMeta || {};
    const context = {
      provider: error.provider || metadata.provider || '',
      model: error.model || metadata.model || '',
      ollamaNotRunningMessage: ollamaMeta.OLLAMA_NOT_RUNNING_MESSAGE,
      ollamaNoModelMessage: ollamaMeta.OLLAMA_NO_MODEL_MESSAGE,
      buildOllamaOriginBlockedMessage: ollamaMeta.buildOllamaOriginBlockedMessage
    };

    const detail = errorsModule && typeof errorsModule.classifyEnhanceError === 'function'
      ? errorsModule.classifyEnhanceError(error, context)
      : null;

    const assignIfSafe = (key, value) => {
      if (value === undefined) return;
      try {
        if (error[key] === undefined || error[key] === '') {
          error[key] = value;
        }
      } catch (_) {
        // Ignore non-writable or frozen error properties
      }
    };

    const setIfSafe = (key, value) => {
      if (value === undefined) return;
      try {
        error[key] = value;
      } catch (_) {
        // Ignore non-writable or frozen error properties
      }
    };

    if (detail) {
      assignIfSafe('code', detail.code);
      assignIfSafe('category', detail.category);
      assignIfSafe('provider', detail.provider);
      assignIfSafe('model', detail.model);
      assignIfSafe('retryable', detail.retryable);
      assignIfSafe('errorDetail', detail);
    } else {
      assignIfSafe('provider', context.provider);
      assignIfSafe('model', context.model);
    }

    if (Array.isArray(metadata.fallbackAttempts) && metadata.fallbackAttempts.length > 0) {
      setIfSafe('fallbackAttempts', metadata.fallbackAttempts.slice());
    }
    if (Array.isArray(metadata.skippedProviders) && metadata.skippedProviders.length > 0) {
      setIfSafe('skippedProviders', metadata.skippedProviders.slice());
    }
  }

  function withProviderModelOverride(config, provider, model) {
    const normalizedModel = String(model || '').trim();
    if (!normalizedModel) {
      return config;
    }

    if (provider === 'ollama') {
      return {
        ...config,
        ollama: {
          ...(config.ollama || {}),
          model: normalizedModel
        }
      };
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

    // 1. Resolve authoritative settings before evaluating redaction rules
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
        ...(options?.model && options?.provider && options.provider !== 'ollama'
          ? { [options.provider]: options.model }
          : {})
      },
      ollama: {
        ...(baseConfig.ollama || {}),
        ...(options?.provider === 'ollama' && options?.model ? { model: options.model } : {})
      }
    };

    // 2. Defense-in-Depth Scrubbing (honors SettingsStore redactionEnabled and customRedactionPatterns)
    let scrubbedPrompt = rawInput;
    let internalSecretMap = null;
    const redactor = getRedactor();
    const redactionOptions = {
      redactionEnabled: config.redactionEnabled !== false,
      customRedactionPatterns: config.customRedactionPatterns
    };

    if (
      redactionOptions.redactionEnabled &&
      redactor &&
      typeof redactor.hasSensitive === 'function' &&
      typeof redactor.scrub === 'function'
    ) {
      if (redactor.hasSensitive(rawInput, redactionOptions)) {
        const scrubRes = redactor.scrub(rawInput, redactionOptions);
        if (scrubRes.hasRedactions) {
          scrubbedPrompt = scrubRes.text;
          internalSecretMap = scrubRes.secretMap;
          warningsList.push('NOTICE: Defense-in-depth redaction applied to background enhancement');
        }
      }
    }

    const timeoutMs = Number(options?.timeoutMs) > 0 ? Number(options.timeoutMs) : 0;
    const timeoutController = (timeoutMs > 0 || options?.signal) ? new AbortController() : null;
    let timeoutTimer = null;
    let externalAbortHandler = null;

    if (timeoutController) {
      if (options?.signal) {
        if (options.signal.aborted) {
          timeoutController.abort(options.signal.reason);
        } else {
          externalAbortHandler = () => timeoutController.abort(options.signal.reason);
          options.signal.addEventListener('abort', externalAbortHandler, { once: true });
        }
      }
      if (timeoutMs > 0) {
        timeoutTimer = setTimeout(() => {
          const timeoutErr = new Error(`Enhancement request timed out after ${timeoutMs}ms.`);
          timeoutErr.name = 'AbortError';
          timeoutController.abort(timeoutErr);
        }, timeoutMs);
      }
    }

    const runtimeConfig = timeoutController ? { ...config, signal: timeoutController.signal } : config;

    const router = getRouter();
    const providers = getProviders();
    const configuredProvider = String(config.provider || 'gemini').trim();

    let finalEnhancedText = '';
    let executedProvider = configuredProvider;
    let executedModel = configuredProvider === 'ollama'
      ? String(config.ollama?.model || '').trim()
      : String(config.models?.[configuredProvider] || '').trim();
    let detectedIntent = 'general';
    const fallbackAttempts = [];
    const skippedProviders = [];

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
        let attemptedCount = 0;
        let lastAutoError = null;

        for (const route of candidates) {
          if (timeoutController?.signal?.aborted) {
            const abortErr = new Error(`Enhancement request timed out after ${timeoutMs}ms.`);
            abortErr.name = 'AbortError';
            throw abortErr;
          }

          const provider = route.provider;
          const model = route.model;

          if (!isProviderConfigured(config, provider)) {
            if (!skippedProviders.includes(provider)) {
              skippedProviders.push(provider);
              fallbackAttempts.push(
                `${provider}:${model || 'auto'} (not configured: ${provider === 'ollama' ? 'no local model' : 'missing API key'})`
              );
            }
            continue;
          }

          const providerFn = providers[provider] || globalScope.ZeusProviders?.[provider];
          if (typeof providerFn !== 'function') {
            continue;
          }

          attemptedCount += 1;

          try {
            const candidateConfig = withProviderModelOverride(runtimeConfig, provider, model);
            finalEnhancedText = await providerFn(scrubbedPrompt, candidateConfig);
            executedProvider = provider;
            executedModel = provider === 'ollama'
              ? String(candidateConfig.ollama?.model || '').trim()
              : (model || String(candidateConfig.models?.[provider] || '').trim());
            success = true;
            break;
          } catch (error) {
            if (timeoutController?.signal?.aborted || error?.name === 'AbortError') {
              throw error;
            }
            lastAutoError = error;
            fallbackAttempts.push(`${provider}:${model || 'auto'} (${String(error?.message || 'failed')})`);
            safelyAttachErrorMetadata(lastAutoError, {
              provider,
              model: model || (provider === 'ollama' ? config.ollama?.model : config.models?.[provider]) || '',
              fallbackAttempts,
              skippedProviders
            });
            trackFallbackEvent({
              provider,
              fromModel: model || '',
              toModel: '',
              reason: String(error?.message || 'unknown error'),
              intent,
              stage: 'provider-candidate-error'
            });
          }
        }

        if (!success) {
          if (attemptedCount === 0 || !lastAutoError) {
            throw createConfigError(
              'NOT_CONFIGURED',
              'auto',
              'No AI provider is configured for Auto mode. Add a cloud API key or configure a local Ollama model in Zeus settings.',
              { skippedProviders: skippedProviders.slice(), fallbackAttempts: fallbackAttempts.slice() }
            );
          }

          safelyAttachErrorMetadata(lastAutoError, {
            provider: lastAutoError?.provider || 'auto',
            model: lastAutoError?.model || '',
            fallbackAttempts,
            skippedProviders
          });
          throw lastAutoError;
        }
      } else {
        const providerFn = providers[configuredProvider] || globalScope.ZeusProviders?.[configuredProvider];
        if (typeof providerFn !== 'function') {
          throw createConfigError(
            'NOT_CONFIGURED',
            configuredProvider,
            `Unsupported provider: ${configuredProvider}`
          );
        }

        if (!isProviderConfigured(config, configuredProvider)) {
          const ollamaMeta = globalScope.ZeusOllamaMeta || {};
          const msg = configuredProvider === 'ollama'
            ? (ollamaMeta.OLLAMA_NO_MODEL_MESSAGE || 'No local Ollama model configured. Select or enter a model in Zeus settings.')
            : `Missing ${formatProviderLabel(configuredProvider)} API key. Add your key in Zeus settings.`;
          throw createConfigError('NOT_CONFIGURED', configuredProvider, msg, {
            model: executedModel
          });
        }

        finalEnhancedText = await providerFn(scrubbedPrompt, runtimeConfig);
        executedProvider = configuredProvider;
        executedModel = configuredProvider === 'ollama'
          ? String(config.ollama?.model || '').trim()
          : String(config.models?.[configuredProvider] || '').trim();
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
          fallbackAttempts,
          skippedProviders
        }
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const storageLocal = globalScope?.chrome?.storage?.local;
      if (storageLocal && typeof storageLocal.set === 'function') {
        storageLocal.set({ zeus_last_latency: durationMs });
      }

      safelyAttachErrorMetadata(error, {
        provider: error?.provider || executedProvider,
        model: error?.model || executedModel,
        fallbackAttempts,
        skippedProviders
      });

      console.error(`${logPrefix.error} NEURAL LINK FAILED`, logStyle.error, error);
      throw error;
    } finally {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (options?.signal && externalAbortHandler) {
        options.signal.removeEventListener('abort', externalAbortHandler);
      }
    }
  }

  const ZeusPromptEngine = Object.freeze({
    execute,
    hasApiKeyForProvider,
    hasOllamaModel,
    isProviderConfigured,
    withProviderModelOverride
  });

  globalScope.ZeusPromptEngine = ZeusPromptEngine;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ZeusPromptEngine;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
