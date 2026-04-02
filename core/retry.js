(function initZeusRetry(globalScope) {
  const DEFAULT_FETCH_TIMEOUT_MS = 20000;

  async function fetchWithTimeout(url, options, timeoutMs) {
    const timeout = Number(timeoutMs) > 0 ? Number(timeoutMs) : DEFAULT_FETCH_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      return await fetch(url, {
        ...(options || {}),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
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
