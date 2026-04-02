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
    trackFallbackEvent
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
