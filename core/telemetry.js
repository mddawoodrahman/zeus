(function initZeusTelemetry(globalScope) {
  const STORAGE_KEY = 'zeus_fallback_telemetry';
  const MAX_EVENTS = 250;
  const FLUSH_DEBOUNCE_MS = 400;

  // The in-memory buffer is the source of truth. Reading the whole array back out
  // of storage on every event created a read-modify-write race where concurrent
  // fallbacks in the same tick silently overwrote each other.
  let events = [];
  let hydrated = false;
  let hydrationPromise = null;
  let flushTimer = null;

  function nowIso() {
    return new Date().toISOString();
  }

  function safeString(value) {
    return String(value || '').trim();
  }

  function getStorageLocal() {
    try {
      const storageLocal = globalScope?.chrome?.storage?.local;
      if (storageLocal && typeof storageLocal.get === 'function' && typeof storageLocal.set === 'function') {
        return storageLocal;
      }
    } catch (_) {
      // Ignore runtime access failures and stay in memory.
    }

    return null;
  }

  function scheduleFlush() {
    if (flushTimer) {
      return;
    }

    const schedule = globalScope?.setTimeout;
    if (typeof schedule !== 'function') {
      persistNow();
      return;
    }

    flushTimer = schedule(() => {
      flushTimer = null;
      persistNow();
    }, FLUSH_DEBOUNCE_MS);
  }

  function persistNow() {
    const storageLocal = getStorageLocal();
    if (!storageLocal) {
      return;
    }

    const payload = events.slice(-MAX_EVENTS);
    try {
      storageLocal.set({ [STORAGE_KEY]: payload }, () => {});
    } catch (_) {
      // Storage rejected the write; the in-memory buffer still holds the events.
    }
  }

  function ensureHydrated() {
    if (hydrated) {
      return Promise.resolve();
    }

    if (hydrationPromise) {
      return hydrationPromise;
    }

    const storageLocal = getStorageLocal();

    hydrationPromise = new Promise((resolve) => {
      if (!storageLocal || typeof storageLocal.get !== 'function') {
        resolve();
        return;
      }

      try {
        storageLocal.get([STORAGE_KEY], (payload) => {
          const stored = Array.isArray(payload?.[STORAGE_KEY]) ? payload[STORAGE_KEY] : [];
          // Events recorded before hydration finished are newer than whatever
          // storage held, so they must be appended rather than discarded.
          events = stored.concat(events).slice(-MAX_EVENTS);
          resolve();
        });
      } catch (_) {
        resolve();
      }
    }).then(() => {
      hydrated = true;
      return undefined;
    });

    return hydrationPromise;
  }

  function track(eventType, payload) {
    const type = safeString(eventType);
    if (!type) {
      return;
    }

    events.push({
      type,
      at: nowIso(),
      payload: payload && typeof payload === 'object' ? { ...payload } : {}
    });

    if (events.length > MAX_EVENTS) {
      events = events.slice(-MAX_EVENTS);
    }

    // Preserve any history already on disk before the first flush overwrites it.
    ensureHydrated().then(scheduleFlush);
  }

  function trackFallback(payload) {
    track('fallback', payload);
  }

  async function readEvents() {
    await ensureHydrated();
    return events.slice();
  }

  async function getSummary() {
    const snapshot = await readEvents();
    const summary = {
      totalEvents: snapshot.length,
      byProvider: {},
      byReason: {},
      recent: snapshot.slice(-20)
    };

    for (const event of snapshot) {
      const provider = safeString(event?.payload?.provider) || 'unknown';
      const reason = safeString(event?.payload?.reason || event?.payload?.reasonCode) || 'unspecified';

      summary.byProvider[provider] = (summary.byProvider[provider] || 0) + 1;
      summary.byReason[reason] = (summary.byReason[reason] || 0) + 1;
    }

    return summary;
  }

  async function getFallbackCount() {
    const snapshot = await readEvents();
    return snapshot.filter((event) => event.type === 'fallback').length;
  }

  function clear() {
    events = [];
    hydrated = true;

    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }

    persistNow();
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
