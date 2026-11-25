(function initZeusErrors(globalScope) {
  const ERROR_CODES = Object.freeze({
    NOT_CONFIGURED: 'NOT_CONFIGURED',
    AUTH_FAILED: 'AUTH_FAILED',
    QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
    RATE_LIMITED: 'RATE_LIMITED',
    MODEL_UNAVAILABLE: 'MODEL_UNAVAILABLE',
    NETWORK_UNAVAILABLE: 'NETWORK_UNAVAILABLE',
    PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
    OLLAMA_ORIGIN_BLOCKED: 'OLLAMA_ORIGIN_BLOCKED',
    INVALID_REQUEST: 'INVALID_REQUEST',
    TIMEOUT: 'TIMEOUT',
    UNKNOWN_ERROR: 'UNKNOWN_ERROR'
  });

  const CANONICAL_CODE_SET = new Set(Object.values(ERROR_CODES));

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

  class ProviderConfigError extends Error {
    constructor(code, provider, message, details = {}) {
      const normalizedCode = normalizeCanonicalCode(code) || ERROR_CODES.NOT_CONFIGURED;
      const normalizedProvider = String(provider || '').trim();
      super(message || buildDefaultConfigMessage(normalizedProvider));
      this.name = 'ProviderConfigError';
      this.code = normalizedCode;
      this.category = String(details?.category || normalizedCode).trim() || normalizedCode;
      this.provider = normalizedProvider;
      this.model = String(details?.model || '').trim();
      this.status = Number(details?.status) || 0;
      this.retryable = Boolean(details?.retryable);
      if (details && typeof details === 'object') {
        this.details = details;
      }
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
    AUTHENTICATION_ERROR: [
      /invalid[_\s-]?api[_\s-]?key/i,
      /api[_\s-]?key[_\s-]?not[_\s-]?valid/i,
      /api_key_invalid/i,
      /incorrect\s+api\s+key/i,
      /authentication/i,
      /unauthorized/i
    ],
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
    NETWORK_ERROR: [
      /network/i,
      /timed?\s*out/i,
      /failed\s+to\s+fetch/i,
      /econnrefused/i,
      /enotfound/i,
      /err_connection/i
    ],
    TIMEOUT: [/\btimed?\s*out\b/i, /\btimeout\b/i, /\betimedout\b/i]
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

  function normalizeCanonicalCode(code) {
    const normalized = String(code || '').trim().toUpperCase();
    return CANONICAL_CODE_SET.has(normalized) ? normalized : '';
  }

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

  function extractDetailReasons(errData) {
    const details = errData?.error?.details;
    if (!Array.isArray(details)) return '';
    return details
      .map((entry) => String(entry?.reason || entry?.metadata?.reason || '').trim())
      .filter(Boolean)
      .join(' ');
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
    const detailReasons = extractDetailReasons(errData).toLowerCase();

    return {
      provider,
      status: Number(status) || 0,
      code,
      type,
      message,
      detailReasons
    };
  }

  function classifyError(normalizedError) {
    const signal = `${normalizedError.code} ${normalizedError.type} ${normalizedError.detailReasons || ''} ${normalizedError.message}`;

    if (matchesPatterns(signal, CLASSIFICATION_PATTERNS.QUOTA_EXCEEDED)) return 'QUOTA_EXCEEDED';
    if (normalizedError.status === 401) return 'AUTHENTICATION_ERROR';
    if (normalizedError.status === 403) return 'AUTHORIZATION_ERROR';
    if (normalizedError.status === 404) return 'MODEL_NOT_FOUND';
    if (normalizedError.status === 408) return 'TIMEOUT';
    if (normalizedError.status === 429) return 'RATE_LIMIT_ERROR';
    if (normalizedError.status === 402) return 'QUOTA_EXCEEDED';
    if (matchesPatterns(signal, CLASSIFICATION_PATTERNS.AUTHENTICATION_ERROR)) return 'AUTHENTICATION_ERROR';
    if (normalizedError.status === 400) return 'INVALID_REQUEST';
    if (normalizedError.status >= 500 && normalizedError.status <= 599) return 'SERVER_ERROR';

    if (matchesPatterns(signal, CLASSIFICATION_PATTERNS.MODEL_NOT_FOUND)) return 'MODEL_NOT_FOUND';
    if (matchesPatterns(signal, CLASSIFICATION_PATTERNS.RATE_LIMIT_ERROR)) return 'RATE_LIMIT_ERROR';
    if (matchesPatterns(signal, CLASSIFICATION_PATTERNS.QUOTA_EXCEEDED)) return 'QUOTA_EXCEEDED';
    if (matchesPatterns(signal, CLASSIFICATION_PATTERNS.TIMEOUT)) return 'TIMEOUT';
    if (matchesPatterns(signal, CLASSIFICATION_PATTERNS.NETWORK_ERROR)) return 'NETWORK_ERROR';

    if (normalizedError.status === 0 && !normalizedError.message) return 'NETWORK_ERROR';
    return 'UNKNOWN_ERROR';
  }

  function sanitizeServerMessage(message) {
    if (!message) return '';

    let safe = String(message)
      .replace(/sk-[a-zA-Z0-9_-]{10,}/g, '[redacted-key]')
      .replace(/AIza[0-9A-Za-z\-_]{20,}/g, '[redacted-key]')
      .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [redacted-key]')
      .replace(/(?:api[_\s-]?key|x-goog-api-key|x-api-key)\s*[:=]\s*[^\s,;]+/gi, 'api key: [redacted]')
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
    if (provider === 'auto') return 'Auto mode';
    return provider || 'provider';
  }

  function inferProviderFromMessage(message) {
    const text = String(message || '');
    if (/\bgemini\b/i.test(text)) return 'gemini';
    if (/\bopenai\b/i.test(text)) return 'openai';
    if (/\bclaude\b|\banthropic\b/i.test(text)) return 'claude';
    if (/\bopenrouter\b/i.test(text)) return 'openrouter';
    if (/\bollama\b/i.test(text)) return 'ollama';
    return '';
  }

  function buildDefaultConfigMessage(provider, options) {
    if (provider === 'auto') {
      return 'No AI provider is configured. Add a cloud API key or configure a local Ollama model in Zeus settings.';
    }
    if (provider === 'ollama') {
      return options?.ollamaNoModelMessage || 'No local Ollama model configured. Select or enter a model in Zeus settings.';
    }
    if (provider) {
      return `Missing ${formatProviderName(provider)} API key. Add your key in Zeus settings.`;
    }
    return 'No AI provider is configured. Open Zeus settings to add an API key or configure Ollama.';
  }

  function categoryMessage(category, provider, model, options) {
    const providerName = formatProviderName(provider);
    const modelName = model || 'selected model';

    switch (category) {
      case 'NOT_CONFIGURED':
        return buildDefaultConfigMessage(provider, options);
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
      case 'TIMEOUT':
        return 'Request timed out. Please try again.';
      case 'NETWORK_ERROR':
        return `Network issue while contacting ${providerName}. Check your connection and retry.`;
      default:
        return 'Check your provider settings in the Zeus extension popup and try again.';
    }
  }

  function mapCategoryToCanonicalCode(category) {
    switch (category) {
      case 'NOT_CONFIGURED':
        return ERROR_CODES.NOT_CONFIGURED;
      case 'AUTHENTICATION_ERROR':
      case 'AUTHORIZATION_ERROR':
        return ERROR_CODES.AUTH_FAILED;
      case 'QUOTA_EXCEEDED':
        return ERROR_CODES.QUOTA_EXCEEDED;
      case 'RATE_LIMIT_ERROR':
        return ERROR_CODES.RATE_LIMITED;
      case 'MODEL_NOT_FOUND':
        return ERROR_CODES.MODEL_UNAVAILABLE;
      case 'NETWORK_ERROR':
        return ERROR_CODES.NETWORK_UNAVAILABLE;
      case 'SERVER_ERROR':
        return ERROR_CODES.PROVIDER_UNAVAILABLE;
      case 'OLLAMA_ORIGIN_BLOCKED':
        return ERROR_CODES.OLLAMA_ORIGIN_BLOCKED;
      case 'INVALID_REQUEST':
        return ERROR_CODES.INVALID_REQUEST;
      case 'TIMEOUT':
        return ERROR_CODES.TIMEOUT;
      default:
        return ERROR_CODES.UNKNOWN_ERROR;
    }
  }

  function isRetryableCode(code) {
    return (
      code === ERROR_CODES.RATE_LIMITED ||
      code === ERROR_CODES.NETWORK_UNAVAILABLE ||
      code === ERROR_CODES.PROVIDER_UNAVAILABLE ||
      code === ERROR_CODES.TIMEOUT
    );
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

    const base = categoryMessage(category, provider, model, options);
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

  function looksLikeNotConfiguredMessage(message) {
    const text = String(message || '').trim();
    if (!text) return false;
    return (
      /missing\s+(?:[a-z]+\s+)?api\s+key/i.test(text) ||
      /missing\s+(?:[a-z]+\s+)?model/i.test(text) ||
      /no\s+local\s+ollama\s+model\s+detected/i.test(text) ||
      /no\s+local\s+ollama\s+model\s+configured/i.test(text) ||
      /no\s+configured\s+(?:ai|copilot|cloud|[a-z]+\s+)?provider/i.test(text) ||
      /no\s+usable\s+(?:ai\s+)?provider/i.test(text) ||
      /no\s+ai\s+provider\s+is\s+configured/i.test(text) ||
      /not\s+configured/i.test(text) ||
      /add\s+an\s+api\s+key/i.test(text)
    );
  }

  function classifyEnhanceError(error, options = {}) {
    const optionProvider = String(options?.provider || '').trim();
    const optionModel = String(options?.model || '').trim();
    const rawMessage = typeof error === 'string' ? error : (error?.message || '');
    const safeMessage = sanitizeServerMessage(rawMessage);
    const inferredProvider = inferProviderFromMessage(safeMessage);

    let provider = String(error?.provider || '').trim();
    if (!provider) {
      provider = (optionProvider && optionProvider !== 'auto')
        ? optionProvider
        : (inferredProvider || optionProvider);
    }
    const model = String(error?.model || optionModel || '').trim();
    const status = Number(error?.status) || 0;

    if (error instanceof ProviderConfigError || error?.name === 'ProviderConfigError') {
      const code = normalizeCanonicalCode(error.code) || ERROR_CODES.NOT_CONFIGURED;
      const category = String(error.category || code).trim() || code;
      const userMessage = safeMessage || buildDefaultConfigMessage(provider, options);
      return {
        code,
        category,
        provider,
        model,
        status,
        retryable: Boolean(error.retryable),
        userMessage
      };
    }

    if (error instanceof ProviderHttpError || (error && typeof error === 'object' && status > 0)) {
      const httpProvider = String(error.provider || provider).trim();
      const httpModel = String(error.model || model).trim();
      if (httpProvider === 'ollama' && status === 403) {
        const blockedMessage = typeof options?.buildOllamaOriginBlockedMessage === 'function'
          ? options.buildOllamaOriginBlockedMessage()
          : (safeMessage || 'Ollama blocked extension origin. Configure OLLAMA_ORIGINS for this extension and restart Ollama.');
        return {
          code: ERROR_CODES.OLLAMA_ORIGIN_BLOCKED,
          category: 'OLLAMA_ORIGIN_BLOCKED',
          provider: httpProvider,
          model: httpModel,
          status,
          retryable: false,
          userMessage: blockedMessage
        };
      }

      const normalized = normalizeProviderError(httpProvider, status, error.data || {});
      const category = classifyError(normalized);
      const code = mapCategoryToCanonicalCode(category);
      const userMessage = buildUserFacingError(httpProvider, status, error.data || {}, httpModel, options || {});
      return {
        code,
        category,
        provider: httpProvider,
        model: httpModel,
        status,
        retryable: isRetryableCode(code),
        userMessage
      };
    }

    if (safeMessage.includes('Ollama blocked extension origin')) {
      return {
        code: ERROR_CODES.OLLAMA_ORIGIN_BLOCKED,
        category: 'OLLAMA_ORIGIN_BLOCKED',
        provider: provider || 'ollama',
        model,
        status,
        retryable: false,
        userMessage: safeMessage
      };
    }

    if (error?.name === 'AbortError') {
      return {
        code: ERROR_CODES.TIMEOUT,
        category: 'TIMEOUT',
        provider,
        model,
        status,
        retryable: true,
        userMessage: 'Request timed out. Please try again.'
      };
    }

    if (
      normalizeCanonicalCode(error?.code) === ERROR_CODES.NOT_CONFIGURED ||
      (options?.ollamaNoModelMessage && safeMessage === options.ollamaNoModelMessage) ||
      looksLikeNotConfiguredMessage(safeMessage)
    ) {
      return {
        code: ERROR_CODES.NOT_CONFIGURED,
        category: 'NOT_CONFIGURED',
        provider,
        model,
        status,
        retryable: false,
        userMessage: isSafeSpecificMessage(safeMessage) ? safeMessage : buildDefaultConfigMessage(provider, options)
      };
    }

    if (
      (options?.ollamaNotRunningMessage && safeMessage === options.ollamaNotRunningMessage) ||
      (provider === 'ollama' && looksLikeOllamaConnectionError(safeMessage))
    ) {
      return {
        code: ERROR_CODES.NETWORK_UNAVAILABLE,
        category: 'NETWORK_ERROR',
        provider: 'ollama',
        model,
        status,
        retryable: true,
        userMessage: options?.ollamaNotRunningMessage || categoryMessage('NETWORK_ERROR', 'ollama', model, options)
      };
    }

    const explicitCode = normalizeCanonicalCode(error?.code);
    if (explicitCode && explicitCode !== ERROR_CODES.UNKNOWN_ERROR) {
      return {
        code: explicitCode,
        category: String(error?.category || explicitCode),
        provider,
        model,
        status,
        retryable: error?.retryable !== undefined ? Boolean(error.retryable) : isRetryableCode(explicitCode),
        userMessage: isSafeSpecificMessage(safeMessage)
          ? safeMessage
          : categoryMessage(error?.category || explicitCode, provider || 'provider', model, options)
      };
    }

    if (matchesPatterns(safeMessage, CLASSIFICATION_PATTERNS.TIMEOUT)) {
      return {
        code: ERROR_CODES.TIMEOUT,
        category: 'TIMEOUT',
        provider,
        model,
        status,
        retryable: true,
        userMessage: 'Request timed out. Please try again.'
      };
    }

    if (matchesPatterns(safeMessage, CLASSIFICATION_PATTERNS.QUOTA_EXCEEDED)) {
      return {
        code: ERROR_CODES.QUOTA_EXCEEDED,
        category: 'QUOTA_EXCEEDED',
        provider,
        model,
        status,
        retryable: false,
        userMessage: isSafeSpecificMessage(safeMessage)
          ? safeMessage
          : categoryMessage('QUOTA_EXCEEDED', provider || 'provider', model, options)
      };
    }

    if (matchesPatterns(safeMessage, CLASSIFICATION_PATTERNS.AUTHENTICATION_ERROR)) {
      return {
        code: ERROR_CODES.AUTH_FAILED,
        category: 'AUTHENTICATION_ERROR',
        provider,
        model,
        status,
        retryable: false,
        userMessage: categoryMessage('AUTHENTICATION_ERROR', provider || 'provider', model, options)
      };
    }

    if (matchesPatterns(safeMessage, CLASSIFICATION_PATTERNS.RATE_LIMIT_ERROR)) {
      return {
        code: ERROR_CODES.RATE_LIMITED,
        category: 'RATE_LIMIT_ERROR',
        provider,
        model,
        status,
        retryable: true,
        userMessage: categoryMessage('RATE_LIMIT_ERROR', provider || 'provider', model, options)
      };
    }

    if (matchesPatterns(safeMessage, CLASSIFICATION_PATTERNS.MODEL_NOT_FOUND)) {
      return {
        code: ERROR_CODES.MODEL_UNAVAILABLE,
        category: 'MODEL_NOT_FOUND',
        provider,
        model,
        status,
        retryable: false,
        userMessage: isSafeSpecificMessage(safeMessage)
          ? safeMessage
          : categoryMessage('MODEL_NOT_FOUND', provider || 'provider', model, options)
      };
    }

    if (matchesPatterns(safeMessage, CLASSIFICATION_PATTERNS.NETWORK_ERROR)) {
      return {
        code: ERROR_CODES.NETWORK_UNAVAILABLE,
        category: 'NETWORK_ERROR',
        provider,
        model,
        status,
        retryable: true,
        userMessage: categoryMessage('NETWORK_ERROR', provider || 'provider', model, options)
      };
    }

    if (/internal\s+server\s+error|service\s+unavailable|bad\s+gateway|overloaded/i.test(safeMessage)) {
      return {
        code: ERROR_CODES.PROVIDER_UNAVAILABLE,
        category: 'SERVER_ERROR',
        provider,
        model,
        status,
        retryable: true,
        userMessage: categoryMessage('SERVER_ERROR', provider || 'provider', model, options)
      };
    }

    return {
      code: ERROR_CODES.UNKNOWN_ERROR,
      category: 'UNKNOWN_ERROR',
      provider,
      model,
      status,
      retryable: false,
      userMessage: isSafeSpecificMessage(safeMessage)
        ? safeMessage
        : categoryMessage('UNKNOWN_ERROR', provider || 'provider', model, options)
    };
  }

  function normalizeEnhanceError(error, options) {
    return classifyEnhanceError(error, options).userMessage;
  }

  const ZeusErrors = Object.freeze({
    ERROR_CODES,
    ProviderHttpError,
    ProviderConfigError,
    classifyEnhanceError,
    normalizeEnhanceError,
    looksLikeOllamaConnectionError
  });

  globalScope.ZeusErrors = ZeusErrors;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ZeusErrors;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
