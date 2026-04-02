(function initZeusErrors(globalScope) {
  class ProviderHttpError extends Error {
    constructor(provider, status, data, model) {
      super(`${provider} request failed with status ${status}`);
      this.name = 'ProviderHttpError';
      this.provider = provider;
      this.status = Number(status) || 0;
      this.data = data || {};
      this.model = model || '';
    }
  }

  const SAFE_GENERIC_PATTERNS = [
    /internal\s+server\s+error/i,
    /server\s+error/i,
    /service\s+unavailable/i,
    /bad\s+gateway/i,
    /gateway\s+timeout/i,
    /network/i,
    /timed?\s*out/i,
    /failed\s+to\s+fetch/i
  ];

  const CLASSIFICATION_PATTERNS = {
    AUTHENTICATION_ERROR: [/invalid[_\s-]?api[_\s-]?key/i, /authentication/i, /unauthorized/i],
    MODEL_NOT_FOUND: [/model[_\s-]?not[_\s-]?found/i, /unknown\s+model/i, /not\s+found/i],
    RATE_LIMIT_ERROR: [/rate[_\s-]?limit/i, /too\s+many\s+requests/i],
    QUOTA_EXCEEDED: [
      /insufficient[_\s-]?(quota|credits)/i,
      /payment\s+required/i,
      /quota\s+exceeded/i,
      /exceeded\s+your\s+current\s+quota/i,
      /resource[_\s-]?exhausted/i,
      /billing/i,
      /credit\s+balance/i,
      /hard\s+limit/i
    ],
    NETWORK_ERROR: [/network/i, /timed?\s*out/i, /failed\s+to\s+fetch/i]
  };

  const PROVIDER_ERROR_CONFIG = {
    gemini: {
      codePaths: ['error.status', 'error.code', 'status', 'code'],
      typePaths: ['error.type', 'type'],
      messagePaths: ['error.message', 'message']
    },
    openai: {
      codePaths: ['error.code', 'code'],
      typePaths: ['error.type', 'type'],
      messagePaths: ['error.message', 'message']
    },
    claude: {
      codePaths: ['error.type', 'error.code', 'type', 'code'],
      typePaths: ['error.type', 'type'],
      messagePaths: ['error.message', 'message']
    },
    openrouter: {
      codePaths: ['error.code', 'code'],
      typePaths: ['error.type', 'type'],
      messagePaths: ['error.message', 'message']
    },
    ollama: {
      codePaths: ['error.code', 'code'],
      typePaths: ['error.type', 'type'],
      messagePaths: ['error', 'message']
    }
  };

  function safeReadByPath(obj, path) {
    if (!obj || !path) return undefined;
    return path.split('.').reduce((acc, part) => {
      if (acc && typeof acc === 'object') {
        return acc[part];
      }
      return undefined;
    }, obj);
  }

  function pickFirstNonEmpty(obj, paths) {
    for (const path of paths || []) {
      const value = safeReadByPath(obj, path);
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        return String(value).trim();
      }
    }
    return '';
  }

  function matchesPatterns(value, patterns) {
    const text = String(value || '');
    return (patterns || []).some((pattern) => pattern.test(text));
  }

  function normalizeProviderError(provider, status, errData) {
    const config = PROVIDER_ERROR_CONFIG[provider] || PROVIDER_ERROR_CONFIG.openai;
    const code = pickFirstNonEmpty(errData, config.codePaths).toLowerCase();
    const type = pickFirstNonEmpty(errData, config.typePaths).toLowerCase();
    const message = pickFirstNonEmpty(errData, config.messagePaths);

    return {
      provider,
      status: Number(status) || 0,
      code,
      type,
      message
    };
  }

  function classifyError(normalizedError) {
    const signal = `${normalizedError.code} ${normalizedError.type} ${normalizedError.message}`;

    if (matchesPatterns(signal, CLASSIFICATION_PATTERNS.QUOTA_EXCEEDED)) return 'QUOTA_EXCEEDED';
    if (normalizedError.status === 401) return 'AUTHENTICATION_ERROR';
    if (normalizedError.status === 403) return 'AUTHORIZATION_ERROR';
    if (normalizedError.status === 404) return 'MODEL_NOT_FOUND';
    if (normalizedError.status === 429) return 'RATE_LIMIT_ERROR';
    if (normalizedError.status === 402) return 'QUOTA_EXCEEDED';
    if (normalizedError.status === 400) return 'INVALID_REQUEST';
    if (normalizedError.status >= 500 && normalizedError.status <= 599) return 'SERVER_ERROR';

    if (matchesPatterns(signal, CLASSIFICATION_PATTERNS.AUTHENTICATION_ERROR)) return 'AUTHENTICATION_ERROR';
    if (matchesPatterns(signal, CLASSIFICATION_PATTERNS.MODEL_NOT_FOUND)) return 'MODEL_NOT_FOUND';
    if (matchesPatterns(signal, CLASSIFICATION_PATTERNS.RATE_LIMIT_ERROR)) return 'RATE_LIMIT_ERROR';
    if (matchesPatterns(signal, CLASSIFICATION_PATTERNS.QUOTA_EXCEEDED)) return 'QUOTA_EXCEEDED';
    if (matchesPatterns(signal, CLASSIFICATION_PATTERNS.NETWORK_ERROR)) return 'NETWORK_ERROR';

    if (normalizedError.status === 0 && !normalizedError.message) return 'NETWORK_ERROR';
    return 'UNKNOWN_ERROR';
  }

  function sanitizeServerMessage(message) {
    if (!message) return '';

    let safe = String(message)
      .replace(/sk-[a-zA-Z0-9_-]{10,}/g, '[redacted-key]')
      .replace(/AIza[0-9A-Za-z\-_]{20,}/g, '[redacted-key]')
      .replace(/api[_\s-]?key\s*[:=]\s*[^\s,;]+/gi, 'api key: [redacted]')
      .replace(/\n\s*at\s+[^\n]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (safe.includes('{') || safe.includes('}')) {
      safe = safe.replace(/[{}]/g, '').trim();
    }

    return safe.slice(0, 300);
  }

  function isSafeSpecificMessage(message) {
    if (!message) return false;
    if (matchesPatterns(message, SAFE_GENERIC_PATTERNS)) return false;
    return message.length >= 10;
  }

  function formatProviderName(provider) {
    if (provider === 'openai') return 'OpenAI';
    if (provider === 'openrouter') return 'OpenRouter';
    if (provider === 'claude') return 'Claude';
    if (provider === 'gemini') return 'Gemini';
    if (provider === 'ollama') return 'Ollama';
    return provider || 'provider';
  }

  function categoryMessage(category, provider, model) {
    const providerName = formatProviderName(provider);
    const modelName = model || 'selected model';

    switch (category) {
      case 'AUTHENTICATION_ERROR':
        return `Invalid ${providerName} API key. Please verify your key in Zeus settings.`;
      case 'AUTHORIZATION_ERROR':
        return `Authorization failed for ${providerName}. Your account may not have required permissions.`;
      case 'MODEL_NOT_FOUND':
        return `Model '${modelName}' may not be available for ${providerName}.`;
      case 'RATE_LIMIT_ERROR':
        return `${providerName} rate limit exceeded. Please wait and try again.`;
      case 'QUOTA_EXCEEDED':
        if (provider === 'openai') {
          return 'OpenAI quota or credits are insufficient for this project or org. Check billing and usage limits in your OpenAI dashboard.';
        }
        return `${providerName} quota or credits are insufficient. Please check your account.`;
      case 'INVALID_REQUEST':
        return `Invalid request sent to ${providerName}. Please verify configuration and model.`;
      case 'SERVER_ERROR':
        return `${providerName} is temporarily unavailable. Please try again shortly.`;
      case 'NETWORK_ERROR':
        return `Network issue while contacting ${providerName}. Check your connection and retry.`;
      default:
        return 'Check your provider settings in the Zeus extension popup and try again.';
    }
  }

  function buildUserFacingError(provider, status, errData, model, options) {
    const normalized = normalizeProviderError(provider, status, errData);
    const category = classifyError(normalized);
    const safeMessage = sanitizeServerMessage(normalized.message);

    if (provider === 'ollama' && status === 403 && typeof options?.buildOllamaOriginBlockedMessage === 'function') {
      return options.buildOllamaOriginBlockedMessage();
    }

    if (provider === 'ollama' && category === 'NETWORK_ERROR' && options?.ollamaNotRunningMessage) {
      return options.ollamaNotRunningMessage;
    }

    const base = categoryMessage(category, provider, model);
    if (isSafeSpecificMessage(safeMessage) && category !== 'AUTHENTICATION_ERROR' && category !== 'AUTHORIZATION_ERROR') {
      return `${base} ${safeMessage}`.trim();
    }

    return base;
  }

  function looksLikeOllamaConnectionError(message) {
    const text = String(message || '').toLowerCase();
    return (
      text.includes('failed to fetch') ||
      text.includes('networkerror') ||
      text.includes('timed out') ||
      text.includes('timeout') ||
      text.includes('econnrefused') ||
      text.includes('localhost:11434')
    );
  }

  function normalizeEnhanceError(error, options) {
    const provider = options?.provider || '';
    const model = options?.model || '';

    if (error instanceof ProviderHttpError) {
      return buildUserFacingError(
        error.provider,
        error.status,
        error.data,
        error.model || model,
        options || {}
      );
    }

    const message = sanitizeServerMessage(error?.message || '');

    if (options?.ollamaNotRunningMessage && message === options.ollamaNotRunningMessage) {
      return message;
    }

    if (options?.ollamaNoModelMessage && message === options.ollamaNoModelMessage) {
      return message;
    }

    if (message.includes('Ollama blocked extension origin')) {
      return message;
    }

    if (provider === 'ollama' && looksLikeOllamaConnectionError(message) && options?.ollamaNotRunningMessage) {
      return options.ollamaNotRunningMessage;
    }

    if (error?.name === 'AbortError') {
      return 'Request timed out. Please try again.';
    }

    if (isSafeSpecificMessage(message)) {
      return message;
    }

    return categoryMessage('UNKNOWN_ERROR', provider || 'provider', model);
  }

  globalScope.ZeusErrors = Object.freeze({
    ProviderHttpError,
    normalizeEnhanceError,
    looksLikeOllamaConnectionError
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
