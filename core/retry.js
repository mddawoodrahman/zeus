(function initZeusRetry(globalScope) {
  const DEFAULT_FETCH_TIMEOUT_MS = 20000;

  async function fetchWithTimeout(url, options, timeoutMs, externalSignal) {
    if (externalSignal?.aborted) {
      const abortErr = new Error('The operation was aborted');
      abortErr.name = 'AbortError';
      throw abortErr;
    }

    const timeout = Number(timeoutMs) > 0 ? Number(timeoutMs) : DEFAULT_FETCH_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    let onExternalAbort = null;
    if (externalSignal) {
      onExternalAbort = () => controller.abort();
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }

    try {
      return await fetch(url, {
        ...(options || {}),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
      if (externalSignal && onExternalAbort) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }
    }
  }

  async function waitWithBackoff(attempt, baseMs, jitterRangeMs, signal) {
    if (signal?.aborted) {
      const abortErr = new Error('The operation was aborted');
      abortErr.name = 'AbortError';
      throw abortErr;
    }

    const base = Number(baseMs) > 0 ? Number(baseMs) : 400;
    const jitterRange = Number(jitterRangeMs) > 0 ? Number(jitterRangeMs) : 200;
    const jitter = Math.floor(Math.random() * jitterRange);
    const delay = base * Math.pow(2, Math.max(0, Number(attempt) || 0)) + jitter;

    await new Promise((resolve, reject) => {
      let timer = null;
      const onAbort = () => {
        if (timer) clearTimeout(timer);
        const abortErr = new Error('The operation was aborted');
        abortErr.name = 'AbortError';
        reject(abortErr);
      };

      timer = setTimeout(() => {
        if (signal && onAbort) {
          signal.removeEventListener('abort', onAbort);
        }
        resolve();
      }, delay);

      if (signal) {
        signal.addEventListener('abort', onAbort, { once: true });
      }
    });
  }

  globalScope.ZeusRetry = Object.freeze({
    DEFAULT_FETCH_TIMEOUT_MS,
    fetchWithTimeout,
    waitWithBackoff
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
