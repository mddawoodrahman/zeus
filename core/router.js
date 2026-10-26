(function initZeusRouter(globalScope) {
  const settingsModule = globalScope.ZeusSettings;
  const registry = globalScope.ZeusModelRegistry || null;
  const providers = globalScope.ZeusProviders || {};
  const telemetry = globalScope.ZeusTelemetry || null;
  const errors = globalScope.ZeusErrors || null;

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

  const providerFailureCooldowns = new Map();

  function recordProviderFailure(provider) {
    if (!provider) return;
    providerFailureCooldowns.set(String(provider).toLowerCase(), Date.now());
  }

  function isProviderCoolingDown(provider, cooldownMs = 60000) {
    if (!provider) return false;
    const lastFailure = providerFailureCooldowns.get(String(provider).toLowerCase());
    if (!lastFailure) return false;
    return Date.now() - lastFailure < cooldownMs;
  }

  function clearProviderCooldown(provider) {
    if (provider) {
      providerFailureCooldowns.delete(String(provider).toLowerCase());
    } else {
      providerFailureCooldowns.clear();
    }
  }

  function analyzePrompt(prompt, options = {}) {
    const text = String(prompt || '').trim();
    const lower = text.toLowerCase();

    const hasAttachment = Boolean(options?.attachments?.length || options?.multimodal);
    if (hasAttachment) {
      return {
        intent: 'vision',
        complexity: Math.min(1.0, Math.max(0.6, Math.round((0.5 + text.length / 1000) * 10) / 10)),
        estimatedTokens: Math.max(1, Math.ceil(text.length / 4)),
        hasAttachments: true,
        attachmentsCount: Array.isArray(options?.attachments) ? options.attachments.length : 1
      };
    }

    const codingSignals = /\b(code|coding|debug|bug|stack trace|refactor|typescript|javascript|python|sql|algorithm|function|compile|test case|unit test|api endpoint)\b/i;
    const cheapSignals = /\b(cheap|budget|low cost|fast answer|quick rewrite|minimal tokens|lightweight)\b/i;
    const longFormSignals = /\b(long form|long-form|essay|detailed report|comprehensive|in-depth|whitepaper|multi section|article|extensive)\b/i;
    const reasoningSignals = /\b(proof|prove|derive|theorem|mathematical|logic|logical deduction|causal|step by step reasoning|step-by-step reasoning|chain of thought|first principles)\b/i;
    const creativeSignals = /\b(story|poem|poetry|fiction|novel|character|screenplay|dialogue|creative writing|narrative|lyric)\b/i;
    const visionSignals = /\b(image|diagram|chart|flowchart|wireframe|mockup|screenshot|visualize|infographic|ocr)\b/i;

    let intent = 'default';
    if (codingSignals.test(lower)) {
      intent = 'coding';
    } else if (cheapSignals.test(lower)) {
      intent = 'cheap';
    } else if (longFormSignals.test(lower) || lower.length > 1200) {
      intent = 'long-form';
    } else if (reasoningSignals.test(lower)) {
      intent = 'reasoning';
    } else if (creativeSignals.test(lower)) {
      intent = 'creative';
    } else if (visionSignals.test(lower)) {
      intent = 'vision';
    }

    let complexity = 0.2;
    if (text.length > 800) complexity += 0.3;
    else if (text.length > 200) complexity += 0.15;

    const structuralChecks = [
      /\n\s*[-*]\s+/,
      /\n\s*\d+\.\s+/,
      /```[\s\S]*?```/,
      /[{}()[\]]{2,}/,
      /\b(must|strictly|constraint|requirement|validate|edge cases|deterministic)\b/i
    ];

    for (const pattern of structuralChecks) {
      if (pattern.test(text)) {
        complexity += 0.1;
      }
    }

    complexity = Math.min(1.0, Math.round(complexity * 10) / 10);
    const estimatedTokens = Math.max(1, Math.ceil(text.length / 4));

    return {
      intent,
      complexity,
      estimatedTokens,
      hasAttachments: false,
      attachmentsCount: 0
    };
  }

  function detectPromptIntent(prompt, options = {}) {
    return analyzePrompt(prompt, options).intent;
  }

  function autoRouteForIntent(intent, options = {}) {
    const profile = String(options?.profile || 'balanced').toLowerCase();
    const openAiDefault = getProviderDefaultModel('openai');
    const claudeDefault = getProviderDefaultModel('claude');
    const geminiDefault = getProviderDefaultModel('gemini');

    if (profile === 'local-first') {
      return { provider: 'ollama', model: '' };
    }

    if (profile === 'performance') {
      if (intent === 'coding') {
        return {
          provider: 'openai',
          model: getProviderModelByPredicate(
            'openai',
            (item) => item.group === 'coding-agents' || item.id.includes('codex') || item.group === 'high-intelligence',
            openAiDefault
          )
        };
      }
      return {
        provider: 'claude',
        model: getProviderModelByPredicate(
          'claude',
          (item) => item.group === 'high-intelligence' || (item.bestFor || []).includes('reasoning'),
          claudeDefault
        )
      };
    }

    if (profile === 'cost-saver') {
      return {
        provider: 'gemini',
        model: getProviderModelByPredicate(
          'gemini',
          (item) => item.cost === 'low' || item.group === 'fast-cheap',
          geminiDefault
        )
      };
    }

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

    if (intent === 'long-form' || intent === 'reasoning') {
      return {
        provider: 'claude',
        model: getProviderModelByPredicate(
          'claude',
          (item) => (item.bestFor || []).includes('long-form') || item.group === 'high-intelligence' || (item.bestFor || []).includes('reasoning'),
          claudeDefault
        )
      };
    }

    if (intent === 'creative') {
      return {
        provider: 'claude',
        model: getProviderModelByPredicate(
          'claude',
          (item) => item.group === 'recommended' || item.group === 'high-intelligence',
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

    if (intent === 'vision') {
      return {
        provider: 'gemini',
        model: getProviderModelByPredicate(
          'gemini',
          (item) => item.group === 'recommended' || item.group === 'high-intelligence',
          geminiDefault
        )
      };
    }

    return { provider: 'openai', model: openAiDefault };
  }

  function buildSmartRouteCandidates(primaryRoute, options = {}) {
    const profile = String(options?.profile || 'balanced').toLowerCase();
    const cooldownMs = Number(options?.cooldownMs) || 60000;

    const openAiDefault = getProviderDefaultModel('openai');
    const claudeDefault = getProviderDefaultModel('claude');
    const geminiDefault = getProviderDefaultModel('gemini');

    let baseList = [];

    if (profile === 'local-first') {
      baseList = [
        primaryRoute,
        { provider: 'ollama', model: '' },
        { provider: 'gemini', model: geminiDefault },
        { provider: 'openai', model: openAiDefault },
        { provider: 'claude', model: claudeDefault }
      ];
    } else if (profile === 'performance') {
      baseList = [
        primaryRoute,
        { provider: 'claude', model: claudeDefault },
        { provider: 'openai', model: openAiDefault },
        { provider: 'gemini', model: geminiDefault },
        { provider: 'ollama', model: '' }
      ];
    } else if (profile === 'cost-saver') {
      baseList = [
        primaryRoute,
        { provider: 'gemini', model: geminiDefault },
        { provider: 'openai', model: getProviderModelByPredicate('openai', (i) => i.cost === 'low', openAiDefault) },
        { provider: 'ollama', model: '' },
        { provider: 'claude', model: claudeDefault }
      ];
    } else {
      baseList = [
        primaryRoute,
        { provider: 'openai', model: openAiDefault },
        { provider: 'claude', model: claudeDefault },
        { provider: 'gemini', model: geminiDefault },
        { provider: 'ollama', model: '' }
      ];
    }

    const seen = new Set();
    const healthy = [];
    const coolingDown = [];

    for (const item of baseList) {
      const provider = String(item?.provider || '').trim();
      const model = String(item?.model || '').trim();
      const key = `${provider}:${model}`;

      if (!provider || seen.has(key)) continue;
      seen.add(key);

      const routeItem = { provider, model };
      if (primaryRoute && primaryRoute.provider === provider && primaryRoute.model === model) {
        healthy.push(routeItem);
      } else if (isProviderCoolingDown(provider, cooldownMs)) {
        coolingDown.push(routeItem);
      } else {
        healthy.push(routeItem);
      }
    }

    return [...healthy, ...coolingDown];
  }

  function buildAutoRouteCandidates(primaryRoute, options) {
    return buildSmartRouteCandidates(primaryRoute, options);
  }

  function hasApiKeyForProvider(config, provider) {
    if (provider === 'custom' || provider.startsWith('custom-')) {
      return true;
    }
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

  async function callProvider(provider, prompt, config, options) {
    let providerFn = providers[provider];
    if (!providerFn && (provider === 'custom' || String(provider).startsWith('custom-'))) {
      providerFn = providers.custom;
    }

    if (typeof providerFn !== 'function') {
      throw new Error(`Unsupported provider: ${provider}`);
    }

    return providerFn(prompt, config, options);
  }

  async function enhanceWithAuto(prompt, config, options) {
    const analysis = analyzePrompt(prompt, options);
    const intent = analysis.intent;
    const profile = config?.smartRouterProfile || 'balanced';
    const primaryRoute = autoRouteForIntent(intent, { profile, complexity: analysis.complexity });
    const candidates = buildSmartRouteCandidates(primaryRoute, { profile, config, cooldownMs: config?.smartRouterCooldownMs });

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
        const result = await callProvider(provider, prompt, override, options);
        return result;
      } catch (error) {
        recordProviderFailure(provider);
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

  /**
   * @param {string} prompt
   * @param {{ transform?: { id: string, name: string, instruction: string } }} [options]
   */
  async function enhancePrompt(prompt, options) {
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

      // A transform supplies its own rewrite instruction; the prompt builder keeps
      // the shared formatting and safety rules regardless.
      const transform = options?.transform && typeof options.transform === 'object' ? options.transform : null;
      const conversationContext = options?.conversationContext || undefined;
      const attachments = (Array.isArray(options?.attachments) && options.attachments.length) ? options.attachments : undefined;

      const privacy = globalScope.ZeusPrivacy || null;
      const isPrivacyEnabled = options?.privacyMode !== undefined
        ? Boolean(options.privacyMode)
        : Boolean(config?.privacyModeEnabled);

      let effectivePrompt = prompt;
      let effectiveContext = conversationContext;
      const tokenMap = {};

      if (isPrivacyEnabled && privacy) {
        const privacyOptions = {
          categories: config?.privacyCategories,
          customPatterns: config?.privacyCustomPatterns
        };

        const promptRedaction = privacy.redactPrompt(prompt, privacyOptions);
        effectivePrompt = promptRedaction.redactedText;
        Object.assign(tokenMap, promptRedaction.tokenMap);

        if (promptRedaction.totalRedacted > 0 && config?.privacyAuditLogEnabled !== false) {
          privacy.recordRedactionStats(promptRedaction.counts).catch(() => {});
        }

        if (effectiveContext) {
          if (typeof effectiveContext === 'string') {
            const ctxRedaction = privacy.redactPrompt(effectiveContext, privacyOptions);
            Object.assign(tokenMap, ctxRedaction.tokenMap);
            effectiveContext = ctxRedaction.redactedText;
          } else if (Array.isArray(effectiveContext)) {
            effectiveContext = effectiveContext.map((turn) => {
              if (typeof turn === 'string') {
                const tr = privacy.redactPrompt(turn, privacyOptions);
                Object.assign(tokenMap, tr.tokenMap);
                return tr.redactedText;
              }
              if (turn && typeof turn === 'object' && typeof turn.text === 'string') {
                const tr = privacy.redactPrompt(turn.text, privacyOptions);
                Object.assign(tokenMap, tr.tokenMap);
                return { ...turn, text: tr.redactedText };
              }
              return turn;
            });
          }
        }
      }

      const hasTransform = Boolean(transform);
      const hasContext = Boolean(effectiveContext);
      const hasAttachments = Boolean(attachments);
      const promptOptions = (hasTransform || hasContext || hasAttachments)
        ? {
            ...(hasTransform ? { instruction: transform.instruction, label: transform.name } : {}),
            ...(hasContext ? { conversationContext: effectiveContext } : {}),
            ...(hasAttachments ? { attachments } : {})
          }
        : undefined;

      console.log(`${logPrefix.info} ROUTING PROMPT`, logStyle.info, {
        provider,
        transform: transform?.id || 'default',
        contextAware: Boolean(effectiveContext),
        attachmentsCount: attachments?.length || 0,
        privacyMode: isPrivacyEnabled,
        redactedTokens: Object.keys(tokenMap).length
      });

      let result;
      if (provider === 'auto') {
        result = await enhanceWithAuto(effectivePrompt, config, promptOptions);
      } else {
        result = await callProvider(provider, effectivePrompt, config, promptOptions);
      }

      if (isPrivacyEnabled && privacy && Object.keys(tokenMap).length > 0) {
        const autoRestore = options?.autoRestore !== undefined
          ? Boolean(options.autoRestore)
          : (config?.privacyAutoRestore !== false);

        if (autoRestore) {
          result = privacy.restorePrompt(result, tokenMap);
        }
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
      if (provider !== 'ollama' && provider !== 'custom' && !provider.startsWith('custom-') && !settings?.apiKeys?.[provider]) {
        port.postMessage({ type: 'error', message: `Missing API key for provider ${provider}` });
        return;
      }
    }

    let providerFn = providers[provider];
    if (!providerFn && (provider === 'custom' || provider.startsWith('custom-'))) {
      providerFn = providers.custom;
    }

    if (typeof providerFn !== 'function') {
      port.postMessage({ type: 'error', message: `Unsupported provider: ${provider}` });
      return;
    }

    if (typeof providerFn.suggest !== 'function') {
      port.postMessage({ type: 'error', message: `Provider ${provider} does not support copilot suggestions` });
      return;
    }

    let suggestionText = text;
    const privacy = globalScope.ZeusPrivacy || null;
    if (settings?.privacyModeEnabled && privacy) {
      const red = privacy.redactPrompt(text, {
        categories: settings?.privacyCategories,
        customPatterns: settings?.privacyCustomPatterns
      });
      suggestionText = red.redactedText;
    }

    try {
      await providerFn.suggest(suggestionText, settings, port, abortSignal);
    } catch (err) {
      if (abortSignal?.aborted) return;
      // Provider text must be redacted before it reaches the page.
      const safeMessage = errors && typeof errors.sanitizePortError === 'function'
        ? errors.sanitizePortError(err)
        : 'Suggestion request failed.';
      port.postMessage({ type: 'error', message: safeMessage });
    }
  }

  globalScope.ZeusRouter = Object.freeze({
    enhancePrompt,
    detectPromptIntent,
    analyzePrompt,
    autoRouteForIntent,
    buildAutoRouteCandidates,
    buildSmartRouteCandidates,
    recordProviderFailure,
    isProviderCoolingDown,
    clearProviderCooldown,
    streamSuggest
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
