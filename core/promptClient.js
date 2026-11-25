(function initZeusPromptClient(globalScope) {
  'use strict';

  const DEFAULT_TIMEOUT_MS = 45000;

  function getRedactor() {
    return globalScope.ZeusRedactor || (typeof require !== 'undefined' ? (function() {
      try {
        const path = require('node:path');
        return require(path.resolve(process.cwd(), 'core/redactor.js'));
      } catch (_) {
        try {
          return require('./redactor.js');
        } catch (_2) {
          return null;
        }
      }
    })() : null);
  }

  function dispatchMessage(message, timeoutMs) {
    return new Promise((resolve, reject) => {
      const chromeRuntime = globalScope?.chrome?.runtime;
      if (!chromeRuntime || typeof chromeRuntime.sendMessage !== 'function') {
        reject(new Error('Extension runtime unavailable (chrome.runtime.sendMessage not found).'));
        return;
      }

      let timer = null;
      let settled = false;

      const timeout = Number(timeoutMs) > 0 ? Number(timeoutMs) : DEFAULT_TIMEOUT_MS;
      timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          const timeoutErr = new Error(`Enhancement request timed out after ${timeout}ms.`);
          timeoutErr.code = 'TIMEOUT';
          timeoutErr.category = 'TIMEOUT';
          timeoutErr.retryable = true;
          reject(timeoutErr);
        }
      }, timeout);

      try {
        chromeRuntime.sendMessage(message, (response) => {
          if (settled) return;
          settled = true;
          if (timer) clearTimeout(timer);

          if (chromeRuntime.lastError) {
            reject(new Error(chromeRuntime.lastError.message || 'Failed to communicate with background service.'));
            return;
          }

          resolve(response);
        });
      } catch (err) {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        reject(err);
      }
    });
  }

  function buildResponseError(response) {
    const detail = response?.errorDetail && typeof response.errorDetail === 'object'
      ? { ...response.errorDetail }
      : null;
    const errMsg = response?.error || detail?.userMessage || 'Enhancement failed without specific error message.';
    const err = new Error(String(errMsg));

    err.code = String(detail?.code || response?.code || '').trim();
    err.category = String(detail?.category || response?.category || '').trim();
    err.provider = String(detail?.provider || response?.provider || '').trim();
    err.retryable = Boolean(detail?.retryable ?? response?.retryable);
    err.errorDetail = detail;

    return err;
  }

  async function enhance(rawText, options = {}) {
    const text = String(rawText || '').trim();
    if (!text) {
      throw new Error('Empty prompt provided.');
    }

    const redactor = getRedactor();
    const redactionOptions = {
      redactionEnabled: options?.redactionEnabled,
      customRedactionPatterns: options?.customRedactionPatterns
    };

    // 1. Client-Side Scrubbing: Redact sensitive tokens BEFORE message dispatch
    // INVARIANT: Plaintext secrets NEVER cross chrome.runtime.sendMessage
    const scrubResult = redactor && typeof redactor.scrub === 'function'
      ? redactor.scrub(text, redactionOptions)
      : { text, secretMap: {}, hasRedactions: false };

    // 2. Dispatch IPC message across MV3 boundary
    const response = await dispatchMessage({
      action: 'enhancePrompt',
      prompt: scrubResult.text,
      options: {
        timeoutMs: options.timeoutMs,
        provider: options.provider,
        model: options.model
      }
    }, options.timeoutMs);

    if (!response || !response.success) {
      throw buildResponseError(response);
    }

    const backgroundEnhancedText = String(response.enhancedText || response.enhancedPrompt || '').trim();
    if (!backgroundEnhancedText) {
      throw new Error('Background service worker returned empty enhanced text.');
    }

    // 3. Client-Side Rehydration: Restore original secret values locally
    let finalEnhancedText = backgroundEnhancedText;
    const clientWarnings = [];
    let droppedPlaceholders = [];

    if (scrubResult.hasRedactions && redactor) {
      if (typeof redactor.hydrateWithDetails === 'function') {
        const hydration = redactor.hydrateWithDetails(backgroundEnhancedText, scrubResult.secretMap);
        finalEnhancedText = hydration.text;
        droppedPlaceholders = hydration.droppedPlaceholders || [];
      } else if (typeof redactor.hydrate === 'function') {
        finalEnhancedText = redactor.hydrate(backgroundEnhancedText, scrubResult.secretMap);
      }

      if (droppedPlaceholders.length > 0) {
        clientWarnings.push(`WARNING: SENSITIVE PLACEHOLDER OMITTED BY AI (${droppedPlaceholders.join(', ')})`);
      }
    }

    const allWarnings = [
      ...(Array.isArray(response.warnings) ? response.warnings : []),
      ...clientWarnings
    ];

    // 4. Return structured return payload
    return {
      enhancedText: finalEnhancedText,
      originalText: text,
      warnings: allWarnings,
      meta: {
        ...(response.meta || {}),
        hasRedactions: scrubResult.hasRedactions,
        droppedPlaceholders,
        scrubbedOriginal: scrubResult.text,
        scrubbedEnhanced: backgroundEnhancedText
      }
    };
  }

  const ZeusPromptClient = Object.freeze({
    enhance,
    dispatchMessage
  });

  globalScope.ZeusPromptClient = ZeusPromptClient;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ZeusPromptClient;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
