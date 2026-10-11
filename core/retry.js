(function initZeusRetry(globalScope) {
  const DEFAULT_FETCH_TIMEOUT_MS = 20000;

  /**
   * Combines a caller-supplied signal with the timeout signal so cancellation and
   * the timeout are both honoured. Previously the caller's signal was overwritten,
   * which made a hung request impossible to cancel from the copilot port.
   */
  function combineSignals(controller, callerSignal) {
    if (!callerSignal || typeof callerSignal.addEventListener !== 'function') {
      return null;
    }

    if (typeof globalScope?.AbortSignal?.any === 'function') {
      return globalScope.AbortSignal.any([callerSignal, controller.signal]);
    }

    const forwardAbort = () => controller.abort();
    if (callerSignal.aborted) {
      forwardAbort();
      return null;
    }

    callerSignal.addEventListener('abort', forwardAbort, { once: true });
    return forwardAbort;
  }

  async function fetchWithTimeout(url, options, timeoutMs) {
    const timeout = Number(timeoutMs) > 0 ? Number(timeoutMs) : DEFAULT_FETCH_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    const requestOptions = { ...(options || {}) };
    const callerSignal = requestOptions.signal;
    const combined = combineSignals(controller, callerSignal);

    requestOptions.signal = combined || controller.signal;

    try {
      return await fetch(url, requestOptions);
    } finally {
      clearTimeout(timer);

      // Detach the forwarding listener when AbortSignal.any was unavailable.
      if (typeof combined === 'function') {
        callerSignal.removeEventListener('abort', combined);
      }
    }
  }

  async function waitWithBackoff(attempt, baseMs, jitterRangeMs) {
    const base = Number(baseMs) > 0 ? Number(baseMs) : 400;
    const jitterRange = Number(jitterRangeMs) > 0 ? Number(jitterRangeMs) : 200;
    const jitter = Math.floor(Math.random() * jitterRange);
    const delay = base * Math.pow(2, Math.max(0, Number(attempt) || 0)) + jitter;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  globalScope.ZeusRetry = Object.freeze({
    DEFAULT_FETCH_TIMEOUT_MS,
    fetchWithTimeout,
    waitWithBackoff
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
