(function initZeusTelemetry(globalScope) {
  const STORAGE_KEY = 'zeus_fallback_telemetry';
  const MAX_EVENTS = 250;
  const IN_MEMORY_EVENTS = [];

  function nowIso() {
    return new Date().toISOString();
  }

  function safeString(value) {
    return String(value || '').trim();
  }

  function withStorageLocal(callback) {
    try {
      const storageLocal = globalScope?.chrome?.storage?.local;
      if (storageLocal && typeof storageLocal.get === 'function' && typeof storageLocal.set === 'function') {
        callback(storageLocal);
        return;
      }
    } catch (_) {
      // Ignore runtime access failures and fallback to memory.
    }

    callback(null);
  }

  function writeEvents(nextEvents) {
    const trimmed = (Array.isArray(nextEvents) ? nextEvents : []).slice(-MAX_EVENTS);

    withStorageLocal((storageLocal) => {
      if (!storageLocal) {
        IN_MEMORY_EVENTS.length = 0;
        IN_MEMORY_EVENTS.push(...trimmed);
        return;
      }

      storageLocal.set({ [STORAGE_KEY]: trimmed }, () => {
        if (globalScope?.chrome?.runtime?.lastError) {
          IN_MEMORY_EVENTS.length = 0;
          IN_MEMORY_EVENTS.push(...trimmed);
        }
      });
    });
  }

  function readEvents(callback) {
    withStorageLocal((storageLocal) => {
      if (!storageLocal) {
        callback(IN_MEMORY_EVENTS.slice());
        return;
      }

      storageLocal.get([STORAGE_KEY], (payload) => {
        if (globalScope?.chrome?.runtime?.lastError) {
          callback(IN_MEMORY_EVENTS.slice());
          return;
        }

        const events = Array.isArray(payload?.[STORAGE_KEY]) ? payload[STORAGE_KEY] : [];
        callback(events);
      });
    });
  }

  function track(eventType, payload) {
    const type = safeString(eventType);
    if (!type) {
      return;
    }

    const event = {
      type,
      at: nowIso(),
      payload: payload && typeof payload === 'object' ? { ...payload } : {}
    };

    readEvents((events) => {
      writeEvents(events.concat(event));
    });
  }

  function trackFallback(payload) {
    track('fallback', payload);
  }

  function getSummary(callback) {
    readEvents((events) => {
      const summary = {
        totalEvents: events.length,
        byProvider: {},
        byReason: {},
        recent: events.slice(-20)
      };

      for (const event of events) {
        const provider = safeString(event?.payload?.provider) || 'unknown';
        const reason = safeString(event?.payload?.reason || event?.payload?.reasonCode) || 'unspecified';

        summary.byProvider[provider] = (summary.byProvider[provider] || 0) + 1;
        summary.byReason[reason] = (summary.byReason[reason] || 0) + 1;
      }

      callback(summary);
    });
  }

  function getFallbackCount(callback) {
    readEvents((events) => {
      const fallbackEvents = events.filter((e) => e.type === 'fallback');
      callback(fallbackEvents.length);
    });
  }

  function clear() {
    writeEvents([]);
  }

  globalScope.ZeusTelemetry = Object.freeze({
    STORAGE_KEY,
    MAX_EVENTS,
    track,
    trackFallback,
    getFallbackCount,
    getSummary,
    clear
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
