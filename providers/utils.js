(function initZeusProviderUtils(globalScope) {
  const registry = globalScope.ZeusModelRegistry || null;
  const telemetry = globalScope.ZeusTelemetry || null;

  function ensureProviderBag() {
    if (!globalScope.ZeusProviders) {
      globalScope.ZeusProviders = {};
    }
    return globalScope.ZeusProviders;
  }

  function buildModelCandidates(provider, preferredModel, extraModels) {
    const preferred = String(preferredModel || '').trim();
    const fallbackFromRegistry = registry?.getFallbackModels?.(provider) || [];
    const all = [
      preferred,
      ...(Array.isArray(extraModels) ? extraModels : []),
      ...(Array.isArray(fallbackFromRegistry) ? fallbackFromRegistry : [])
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean);

    return [...new Set(all)];
  }

  function readJsonSafe(response) {
    return response.json().catch(() => ({}));
  }

  function getErrorSignal(errData) {
    const code = String(errData?.error?.code ?? errData?.code ?? '').toLowerCase();
    const type = String(errData?.error?.type ?? errData?.type ?? '').toLowerCase();
    const status = String(errData?.error?.status ?? errData?.status ?? '').toLowerCase();
    const message = String(errData?.error?.message ?? errData?.message ?? '').toLowerCase();
    return `${code} ${type} ${status} ${message}`.trim();
  }

  function inferChatTokenParam(provider, model) {
    const providerName = String(provider || '').toLowerCase();
    const modelName = String(model || '').toLowerCase();

    if (providerName === 'openai') {
      if (/^(gpt-5|o1|o3|o4)/.test(modelName)) {
        return 'max_completion_tokens';
      }
      return 'max_tokens';
    }

    if (providerName === 'openrouter') {
      const modelParts = modelName.split('/');
      const family = String(modelParts[0] || '').trim();
      const familyModel = String(modelParts[1] || modelParts[0] || '').trim();

      if (family === 'openai' && /^(gpt-5|o1|o3|o4)/.test(familyModel)) {
        return 'max_completion_tokens';
      }
      return 'max_tokens';
    }

    return 'max_tokens';
  }

  function getAlternateChatTokenParam(paramName) {
    const normalized = String(paramName || '').toLowerCase();
    if (normalized === 'max_tokens') return 'max_completion_tokens';
    if (normalized === 'max_completion_tokens') return 'max_tokens';
    return '';
  }

  function isUnsupportedTokenParameterError(errData, paramName) {
    const signal = getErrorSignal(errData);
    const normalizedParam = String(paramName || '').toLowerCase();

    if (!normalizedParam) {
      return false;
    }

    const paramMentions = [
      `'${normalizedParam}'`,
      `"${normalizedParam}"`,
      ` ${normalizedParam} `,
      `:${normalizedParam}`,
      `${normalizedParam}.`
    ];

    return (
      signal.includes('unsupported parameter') &&
      paramMentions.some((needle) => signal.includes(needle))
    );
  }

  function buildChatTokenLimit(paramName, value) {
    const normalized = String(paramName || '').trim();
    const limit = Number(value);
    const fallback = 1024;
    const safeValue = Number.isFinite(limit) && limit > 0 ? Math.round(limit) : fallback;

    if (!normalized) {
      return {};
    }

    return {
      [normalized]: safeValue
    };
  }

  function trackFallbackEvent(payload) {
    if (!telemetry || typeof telemetry.trackFallback !== 'function') {
      return;
    }

    telemetry.trackFallback({
      category: 'provider-fallback',
      ...(payload && typeof payload === 'object' ? payload : {})
    });
  }

  globalScope.ZeusProviderUtils = Object.freeze({
    ensureProviderBag,
    buildModelCandidates,
    readJsonSafe,
    trackFallbackEvent,
    inferChatTokenParam,
    getAlternateChatTokenParam,
    isUnsupportedTokenParameterError,
    buildChatTokenLimit
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
