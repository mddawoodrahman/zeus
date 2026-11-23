(function initZeusProviderTransport(globalScope) {
  'use strict';

  const retry = globalScope.ZeusRetry || null;
  const errors = globalScope.ZeusErrors || null;

  const TRANSIENT_STATUS_CODES = Object.freeze([408, 429, 500, 502, 503, 504]);
  const DEFAULT_TIMEOUT_MS = (retry && retry.DEFAULT_FETCH_TIMEOUT_MS) || 20000;

  function isTransientStatus(status) {
    return TRANSIENT_STATUS_CODES.includes(Number(status));
  }

  async function waitBackoff(attempt) {
    if (retry && typeof retry.waitWithBackoff === 'function') {
      await retry.waitWithBackoff(attempt);
    } else {
      const delay = 400 * Math.pow(2, Math.max(0, Number(attempt) || 0));
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  async function fetchWithTimeout(url, options, timeoutMs, externalSignal) {
    if (externalSignal?.aborted) {
      const abortErr = new Error('The operation was aborted');
      abortErr.name = 'AbortError';
      throw abortErr;
    }

    const timeout = Number(timeoutMs) > 0 ? Number(timeoutMs) : DEFAULT_TIMEOUT_MS;
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

  async function readJsonSafe(response) {
    if (!response) return {};
    if (typeof response.json === 'function') {
      try {
        return await response.json();
      } catch (_) {
        return {};
      }
    }
    return {};
  }

  async function execute(requestSpec) {
    const {
      url,
      method = 'POST',
      headers = {},
      body,
      timeoutMs,
      signal,
      maxRetries = 3,
      isRetryable: customIsRetryable,
      provider = 'provider'
    } = requestSpec;

    const payloadBody = typeof body === 'object' && body !== null ? JSON.stringify(body) : body;
    let lastError = null;

    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
      if (signal?.aborted) {
        const abortErr = new Error('The operation was aborted');
        abortErr.name = 'AbortError';
        throw abortErr;
      }

      let response;
      try {
        response = await fetchWithTimeout(url, {
          method,
          headers,
          body: payloadBody
        }, timeoutMs, signal);
      } catch (fetchErr) {
        lastError = fetchErr;
        if (signal?.aborted) {
          throw fetchErr;
        }
        // Pre-first-byte transient network error: retry if attempts remain
        if (attempt < maxRetries - 1) {
          await waitBackoff(attempt);
          continue;
        }
        throw fetchErr;
      }

      if (response.ok) {
        const data = await readJsonSafe(response);
        return {
          ok: true,
          status: response.status,
          data,
          headers: response.headers
        };
      }

      const errData = await readJsonSafe(response);
      const retryable = isTransientStatus(response.status) || (typeof customIsRetryable === 'function' && customIsRetryable(response.status, errData, null));

      if (retryable && attempt < maxRetries - 1 && !signal?.aborted) {
        await waitBackoff(attempt);
        continue;
      }

      return {
        ok: false,
        status: response.status,
        data: errData,
        headers: response.headers
      };
    }

    if (lastError) throw lastError;
    throw new Error(`${provider} request failed after retries.`);
  }

  async function stream(requestSpec, options = {}) {
    const {
      url,
      method = 'POST',
      headers = {},
      body,
      timeoutMs,
      signal: specSignal,
      maxRetries = 3,
      decoder = 'sse',
      provider = 'provider',
      isRetryable: customIsRetryable
    } = requestSpec;

    const onChunk = options.onChunk || (() => {});
    const signal = options.signal || specSignal;

    const payloadBody = typeof body === 'object' && body !== null ? JSON.stringify(body) : body;
    let hasEmittedFirstChunk = false;
    let lastError = null;

    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
      if (signal?.aborted) {
        return;
      }

      let response;
      try {
        response = await fetchWithTimeout(url, {
          method,
          headers,
          body: payloadBody
        }, timeoutMs, signal);
      } catch (fetchErr) {
        lastError = fetchErr;
        if (signal?.aborted) {
          return;
        }
        // RETRY INVARIANT: Retries only allowed pre-first-byte
        if (!hasEmittedFirstChunk && attempt < maxRetries - 1) {
          await waitBackoff(attempt);
          continue;
        }
        throw fetchErr;
      }

      if (!response.ok) {
        const errData = await readJsonSafe(response);
        const retryable = isTransientStatus(response.status) || (typeof customIsRetryable === 'function' && customIsRetryable(response.status, errData, null));

        // Pre-first-byte HTTP retry
        if (retryable && !hasEmittedFirstChunk && attempt < maxRetries - 1 && !signal?.aborted) {
          await waitBackoff(attempt);
          continue;
        }

        if (errors && errors.ProviderHttpError) {
          throw new errors.ProviderHttpError(provider, response.status, errData);
        }
        throw new Error(errData?.error?.message || `HTTP error ${response.status}`);
      }

      // Pre-first-byte checks passed; response is OK.
      // Define chunk handler that flips hasEmittedFirstChunk.
      const chunkHandler = (parsed) => {
        hasEmittedFirstChunk = true;
        onChunk(parsed);
      };

      try {
        if (decoder === 'ndjson') {
          await parseNdjsonStream(response, chunkHandler, signal);
        } else {
          await parseSseStream(response, chunkHandler, signal);
        }
        return; // Stream completed normally
      } catch (streamErr) {
        // STRICT INVARIANT: Never retry once first chunk has been emitted
        if (signal?.aborted) {
          return;
        }
        throw streamErr;
      }
    }

    if (lastError) throw lastError;
  }

  async function parseSseStream(response, onChunk, signal) {
    if (!response?.body || typeof response.body.getReader !== 'function') {
      if (typeof response.text === 'function') {
        const text = await response.text();
        decodeSseText(text, onChunk);
        return;
      }
      return;
    }

    const reader = response.body.getReader();
    const textDecoder = new TextDecoder('utf-8');
    let buffer = '';

    try {
      while (true) {
        if (signal?.aborted) {
          break;
        }

        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += textDecoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (trimmed.startsWith('data:')) {
            const dataStr = trimmed.slice(5).trim();
            if (dataStr === '[DONE]') {
              continue;
            }
            try {
              const parsed = JSON.parse(dataStr);
              onChunk(parsed);
            } catch (_) {
              // Ignore partial or non-json lines
            }
          }
        }
      }

      if (buffer.trim() && buffer.trim().startsWith('data:')) {
        const dataStr = buffer.trim().slice(5).trim();
        if (dataStr !== '[DONE]') {
          try {
            const parsed = JSON.parse(dataStr);
            onChunk(parsed);
          } catch (_) {}
        }
      }
    } finally {
      try {
        reader.releaseLock();
      } catch (_) {}
    }
  }

  async function parseNdjsonStream(response, onChunk, signal) {
    if (!response?.body || typeof response.body.getReader !== 'function') {
      if (typeof response.text === 'function') {
        const text = await response.text();
        decodeNdjsonText(text, onChunk);
        return;
      }
      return;
    }

    const reader = response.body.getReader();
    const textDecoder = new TextDecoder('utf-8');
    let buffer = '';

    try {
      while (true) {
        if (signal?.aborted) {
          break;
        }

        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += textDecoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const parsed = JSON.parse(trimmed);
            onChunk(parsed);
          } catch (_) {
            // Ignore partial or non-json lines
          }
        }
      }

      if (buffer.trim()) {
        try {
          const parsed = JSON.parse(buffer.trim());
          onChunk(parsed);
        } catch (_) {}
      }
    } finally {
      try {
        reader.releaseLock();
      } catch (_) {}
    }
  }

  function decodeSseText(text, onChunk) {
    const lines = String(text || '').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data:')) continue;
      const dataStr = trimmed.slice(5).trim();
      if (dataStr === '[DONE]') continue;
      try {
        onChunk(JSON.parse(dataStr));
      } catch (_) {}
    }
  }

  function decodeNdjsonText(text, onChunk) {
    const lines = String(text || '').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        onChunk(JSON.parse(trimmed));
      } catch (_) {}
    }
  }

  const ZeusProviderTransport = Object.freeze({
    execute,
    stream,
    parseSseStream,
    parseNdjsonStream,
    decodeSseText,
    decodeNdjsonText,
    isTransientStatus,
    fetchWithTimeout,
    readJsonSafe,
    TRANSIENT_STATUS_CODES
  });

  globalScope.ZeusProviderTransport = ZeusProviderTransport;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ZeusProviderTransport;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
