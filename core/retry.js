(function initZeusRetry(globalScope) {
  const DEFAULT_FETCH_TIMEOUT_MS = 20000;

  /**
   * Combines a caller-supplied signal with the timeout signal so cancellation and
   * the timeout are both honoured. Previously the caller's signal was overwritten,
   * which made a hung request impossible to cancel from the copilot port.
   */
  function combineSignals(controller, callerSignal) {
    if (!callerSignal || typeof callerSignal.addEventListener !== 'function') {
      return { signal: controller.signal, cleanup: null };
    }

    if (typeof globalScope?.AbortSignal?.any === 'function') {
      return {
        signal: globalScope.AbortSignal.any([callerSignal, controller.signal]),
        cleanup: null
      };
    }

    if (callerSignal.aborted) {
      if (typeof controller.abort === 'function') {
        controller.abort(callerSignal.reason);
      }
      return { signal: controller.signal, cleanup: null };
    }

    const forwardAbort = () => {
      if (typeof controller.abort === 'function') {
        controller.abort(callerSignal.reason);
      }
    };

    callerSignal.addEventListener('abort', forwardAbort, { once: true });
    return {
      signal: controller.signal,
      cleanup: () => {
        callerSignal.removeEventListener('abort', forwardAbort);
      }
    };
  }

  async function fetchWithTimeout(url, options, timeoutMs) {
    const timeout = Number(timeoutMs) > 0 ? Number(timeoutMs) : DEFAULT_FETCH_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    const requestOptions = { ...(options || {}) };
    const callerSignal = requestOptions.signal;
    const { signal, cleanup } = combineSignals(controller, callerSignal);

    requestOptions.signal = signal;

    try {
      return await fetch(url, requestOptions);
    } finally {
      clearTimeout(timer);
      if (typeof cleanup === 'function') {
        cleanup();
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
