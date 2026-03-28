const FETCH_TIMEOUT_MS = 20000; // 20s timeout for provider requests
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_APP_REFERER = 'https://zeus-extension.local';
const OPENROUTER_APP_TITLE = 'Zeus Prompt Enhancer';
const OPENROUTER_MAX_RETRIES = 3;
const OLLAMA_API_URL = 'http://localhost:11434/api/generate';
const OLLAMA_HEALTH_URL = 'http://localhost:11434/api/version';
const OLLAMA_RUNNING_MODELS_URL = 'http://localhost:11434/api/ps';
const OLLAMA_MODELS_URL = 'http://localhost:11434/api/tags';
const OLLAMA_NOT_RUNNING_MESSAGE = 'Ollama not running. Start with: ollama run llama3';
const OLLAMA_NO_MODEL_MESSAGE = 'No local Ollama model detected. Start one with: ollama run llama3';

function buildOllamaOriginBlockedMessage() {
  const extensionOrigin = `chrome-extension://${chrome.runtime.id}`;
  return `Ollama blocked extension origin '${extensionOrigin}'. Start Ollama with OLLAMA_ORIGINS=${extensionOrigin} (or OLLAMA_ORIGINS=*) and restart Ollama.`;
}

const DEFAULT_SETTINGS = {
  provider: 'gemini',
  apiKeys: {
    openai: '',
    claude: '',
    gemini: '',
    openrouter: ''
  },
  models: {
    gemini: 'gemini-2.5-pro',
    openai: 'gpt-4.1-mini',
    claude: 'claude-3-sonnet-20240229',
    openrouter: 'openai/gpt-4o'
  },
  ollama: {}
};

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

// Context menu on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'zeus-enhance-prompt',
    title: 'Enhance Prompt with Zeus',
    contexts: ['editable']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'zeus-enhance-prompt' && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { action: 'contextEnhancePrompt' });
  }
});

// Message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'enhancePrompt':
      (async () => {
        try {
          const enhancedPrompt = await enhancePrompt(message.prompt);
          sendResponse({ success: true, enhancedPrompt });
        } catch (err) {
          sendResponse({ success: false, error: normalizeEnhanceError(err) });
        }
      })();
      return true; // indicate async response

    case 'ping':
      sendResponse({ status: 'pong' });
      return true;

    case 'getSettings':
      getSettings(sendResponse);
      return true;

    case 'settingsUpdated':
      notifyTabsOfUpdate(message.settings);
      break;

    case 'forceInject':
      forceInject(sender.tab?.id, sendResponse);
      return true;

    default:
      // Unknown action — do nothing
      break;
  }

  return false;
});

// ----------------------
// Core orchestration
// ----------------------

async function enhancePrompt(prompt) {
  if (!prompt || !String(prompt).trim()) {
    throw new Error('Empty prompt provided.');
  }

  const config = await loadConfig();
  const provider = config.provider || DEFAULT_SETTINGS.provider;

  switch (provider) {
    case 'gemini':
      return callGemini(prompt, config);
    case 'openai':
      return callOpenAI(prompt, config);
    case 'claude':
      return callClaude(prompt, config);
    case 'openrouter':
      return callOpenRouter(prompt, config);
    case 'ollama':
      return callOllama(prompt, config);
    case 'auto':
      return enhanceWithAuto(prompt, config);
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

async function enhanceWithAuto(prompt, config) {
  try {
    return await callOllama(prompt, config);
  } catch (ollamaErr) {
    if (!config.apiKeys.openai) {
      const ollamaMessage = normalizeEnhanceError(ollamaErr, 'ollama', config?.ollama?.model);
      throw new Error(`Auto mode could not use Ollama and OpenAI fallback is not configured. ${ollamaMessage}`);
    }

    try {
      return await callOpenAI(prompt, config);
    } catch (openaiErr) {
      const ollamaMessage = normalizeEnhanceError(ollamaErr, 'ollama', config?.ollama?.model);
      const openaiMessage = normalizeEnhanceError(openaiErr, 'openai', config.models.openai);
      throw new Error(`Auto mode failed. Ollama: ${ollamaMessage} OpenAI fallback: ${openaiMessage}`);
    }
  }
}

function buildEnhancePrompt(input) {
  const cleanInput = String(input || '').trim();

  if (!cleanInput) {
    throw new Error('Prompt input cannot be empty.');
  }

  const sections = [
    // ── Identity ────────────────────────────────────────────────────────────
    'You are an elite AI prompt architect with deep expertise in cognitive task design,',
    'instruction engineering, and LLM behavior optimization.',
    '',

    // ── Primary Objective ───────────────────────────────────────────────────
    'OBJECTIVE:',
    'Rewrite the given raw prompt into a maximally precise, structured, and actionable',
    'instruction set that extracts peak performance from any large language model.',
    '',

    // ── Optimization Framework ──────────────────────────────────────────────
    'OPTIMIZATION FRAMEWORK:',
    '',
    'A. INTENT EXTRACTION',
    '   - Identify the true, underlying goal — not just the surface request.',
    '   - Infer missing but logically necessary context.',
    '   - Eliminate all ambiguity, vagueness, and redundancy.',
    '   - If the prompt implies a domain, make it explicit.',
    '',
    'B. ROLE ASSIGNMENT',
    '   - Assign a single, highly specific expert role aligned with the task domain.',
    '   - The role must be relevant and elevate response quality (e.g., "Senior DevOps',
    '     Engineer with Kubernetes expertise" over just "engineer").',
    '',
    'C. STRUCTURAL CLARITY',
    '   - Divide the prompt into labeled, logically ordered sections.',
    '   - Use numbered steps for sequential tasks; use categories for non-linear ones.',
    '   - Ensure each section has a single, clear purpose.',
    '',
    'D. OUTPUT SPECIFICATION',
    '   - Define the exact deliverable format (plain prose, numbered list, table, etc.).',
    '   - Specify length, depth, and tone where relevant.',
    '   - Add constraints to scope the response (e.g., word limits, audience level).',
    '   - For complex tasks, include a chain-of-thought instruction.',
    '',
    'E. QUALITY AMPLIFICATION',
    '   - Encourage specificity, actionability, and logical flow.',
    '   - Promote thoroughness where depth is required.',
    '   - Enforce conciseness where brevity is required.',
    '',
    // ── Formatting Rules ────────────────────────────────────────────────────
    'FORMATTING RULES (STRICT):',
    '   - Output MUST use plain text only.',
    '   - Do NOT use Markdown syntax of any kind: no **, no *, no #, no __, no backticks.',
    '   - Use ALL CAPS labels for section headers (e.g., ROLE:, TASK:, FORMAT:).',
    '   - Use plain hyphens (-) for bullet lists.',
    '   - Use numbers (1. 2. 3.) for ordered steps.',
    '',
    // ── Hard Safety Rules ───────────────────────────────────────────────────
    'SAFETY RULES (NON-NEGOTIABLE):',
    '   - Do NOT answer or respond to the original prompt.',
    '   - Do NOT include explanations, commentary, or notes about your changes.',
    '   - Do NOT add preambles like "Here is the enhanced prompt:".',
    '   - Do NOT alter the original intent in any way.',
    '   - Preserve all domain-specific terminology from the original.',
    '',
    // ── Input / Output ──────────────────────────────────────────────────────
    'ORIGINAL PROMPT:',
    cleanInput,
    '',
    'ENHANCED PROMPT:',
  ];

  return sections.join('\n');
}

function getRewriteSystemInstruction() {
  return 'You improve prompts for LLM usage. Keep intent intact and return only the rewritten prompt text.';
}

// ----------------------
// Fetch wrapper with timeout
// ----------------------

async function fetchWithTimeout(url, opts = {}, timeout = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...opts, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

// ----------------------
// Provider implementations
// ----------------------

async function callGemini(prompt, config) {
  const apiKey = config.apiKeys.gemini;
  const model = config.models.gemini;
  if (!apiKey) throw new Error('Missing Gemini API key.');
  if (!model) throw new Error('Missing Gemini model.');

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ parts: [{ text: buildEnhancePrompt(prompt) }] }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 2048 }
  };

  const response = await fetchWithTimeout(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new ProviderHttpError('gemini', response.status, errData, model);
  }

  const data = await response.json().catch(() => ({}));
  const enhancedText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!enhancedText) throw new Error('Provider responded without enhanced text.');
  return enhancedText.trim();
}

async function callOpenAI(prompt, config) {
  const apiKey = config.apiKeys.openai;
  const model = config.models.openai;
  if (!apiKey) throw new Error('Missing OpenAI API key.');
  if (!model) throw new Error('Missing OpenAI model.');

  const body = {
    model,
    messages: [
      { role: 'system', content: getRewriteSystemInstruction() },
      { role: 'user', content: buildEnhancePrompt(prompt) }
    ],
    temperature: 0.4,
    max_tokens: 2048
  };

  const response = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new ProviderHttpError('openai', response.status, errData, model);
  }

  const data = await response.json().catch(() => ({}));
  const enhancedText = data?.choices?.[0]?.message?.content;
  if (!enhancedText) throw new Error('Provider responded without enhanced text.');
  return enhancedText.trim();
}

async function callClaude(prompt, config) {
  const apiKey = config.apiKeys.claude;
  const model = config.models.claude;
  if (!apiKey) throw new Error('Missing Claude API key.');
  if (!model) throw new Error('Missing Claude model.');

  const body = {
    model,
    system: getRewriteSystemInstruction(),
    messages: [{ role: 'user', content: buildEnhancePrompt(prompt) }],
    max_tokens: 2048,
    temperature: 0.4
  };

  const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new ProviderHttpError('claude', response.status, errData, model);
  }

  const data = await response.json().catch(() => ({}));
  const enhancedText = data?.content?.[0]?.text;
  if (!enhancedText) throw new Error('Provider responded without enhanced text.');
  return enhancedText.trim();
}

async function callOpenRouter(prompt, config) {
  const apiKey = config.apiKeys.openrouter;
  const model = config.models.openrouter;
  if (!apiKey) throw new Error('Missing OpenRouter API key.');
  if (!model) throw new Error('Missing OpenRouter model.');

  const body = {
    model,
    messages: [
      { role: 'system', content: getRewriteSystemInstruction() },
      { role: 'user', content: buildEnhancePrompt(prompt) }
    ],
    temperature: 0.4,
    max_tokens: 2048
  };

  for (let attempt = 0; attempt < OPENROUTER_MAX_RETRIES; attempt++) {
    const response = await fetchWithTimeout(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': OPENROUTER_APP_REFERER,
        'X-Title': OPENROUTER_APP_TITLE
      },
      body: JSON.stringify(body)
    });

    if (response.ok) {
      const data = await response.json().catch(() => ({}));
      const enhancedText = data?.choices?.[0]?.message?.content;
      if (!enhancedText) throw new Error('Provider responded without enhanced text.');
      return enhancedText.trim();
    }

    const errData = await response.json().catch(() => ({}));
    if (response.status === 429 && attempt < OPENROUTER_MAX_RETRIES - 1) {
      await waitWithBackoff(attempt);
      continue;
    }

    throw new ProviderHttpError('openrouter', response.status, errData, model);
  }

  throw new Error('OpenRouter rate limit reached after multiple retries. Please try again shortly.');
}

async function callOllama(prompt, config) {
  await checkOllamaHealth();

  try {
    const model = await detectOllamaModel(config);
    const response = await fetchWithTimeout(OLLAMA_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: buildEnhancePrompt(prompt),
        stream: false
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new ProviderHttpError('ollama', response.status, errData, model);
    }

    const data = await response.json().catch(() => ({}));
    const enhancedText = data?.response;
    if (!enhancedText) throw new Error('Ollama responded without enhanced text.');
    return String(enhancedText).trim();
  } catch (err) {
    if (err instanceof ProviderHttpError) {
      throw err;
    }
    if (looksLikeOllamaConnectionError(err?.message)) {
      throw new Error(OLLAMA_NOT_RUNNING_MESSAGE);
    }
    throw err;
  }
}

async function detectOllamaModel(config) {
  const preferredModel = String(config?.ollama?.model || '').trim();
  if (preferredModel) {
    return preferredModel;
  }

  const runningModels = await fetchOllamaModels(OLLAMA_RUNNING_MODELS_URL);
  if (runningModels.length > 0) {
    return runningModels[0];
  }

  const installedModels = await fetchOllamaModels(OLLAMA_MODELS_URL);
  if (installedModels.length > 0) {
    return installedModels[0];
  }

  throw new Error(OLLAMA_NO_MODEL_MESSAGE);
}

async function fetchOllamaModels(url) {
  const response = await fetchWithTimeout(url, {
    method: 'GET'
  }, 5000);

  if (response.status === 403) {
    throw new Error(buildOllamaOriginBlockedMessage());
  }

  if (!response.ok) {
    return [];
  }

  const data = await response.json().catch(() => ({}));
  const list = data?.models;
  if (!Array.isArray(list)) {
    return [];
  }

  return list
    .map((item) => String(item?.model || item?.name || '').trim())
    .filter(Boolean);
}

async function checkOllamaHealth() {
  try {
    const response = await fetchWithTimeout(OLLAMA_HEALTH_URL, {
      method: 'GET'
    }, 5000);

    if (response.status === 403) {
      throw new Error(buildOllamaOriginBlockedMessage());
    }

    if (!response.ok) {
      throw new Error('Ollama health check failed.');
    }

    return true;
  } catch (err) {
    if (String(err?.message || '').includes('Ollama blocked extension origin')) {
      throw err;
    }
    throw new Error(OLLAMA_NOT_RUNNING_MESSAGE);
  }
}

async function waitWithBackoff(attempt) {
  const baseMs = 400;
  const backoffMs = baseMs * Math.pow(2, attempt);
  const jitterMs = Math.floor(Math.random() * 200);
  await new Promise((resolve) => setTimeout(resolve, backoffMs + jitterMs));
}

// ----------------------
// Settings helpers
// ----------------------

function loadConfig() {
  const keys = [
    'provider', 'apiKeys', 'models', 'ollama',
    'zeus_selected_provider',
    'zeus_gemini_api_key', 'zeus_gemini_model',
    'zeus_openai_api_key', 'zeus_openai_model',
    'zeus_claude_api_key', 'zeus_claude_model',
    'zeus_openrouter_api_key', 'zeus_openrouter_model',
    'zeus_ollama_model'
  ];

  return new Promise((resolve, reject) => {
    chrome.storage.sync.get(keys, (stored) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(normalizeStoredConfig(stored || {}));
    });
  });
}

function normalizeStoredConfig(stored) {
  const provider = stored.provider || stored.zeus_selected_provider || DEFAULT_SETTINGS.provider;

  const apiKeys = {
    ...DEFAULT_SETTINGS.apiKeys,
    ...(stored.apiKeys || {}),
    gemini: stored.apiKeys?.gemini ?? stored.zeus_gemini_api_key ?? DEFAULT_SETTINGS.apiKeys.gemini,
    openai: stored.apiKeys?.openai ?? stored.zeus_openai_api_key ?? DEFAULT_SETTINGS.apiKeys.openai,
    claude: stored.apiKeys?.claude ?? stored.zeus_claude_api_key ?? DEFAULT_SETTINGS.apiKeys.claude,
    openrouter: stored.apiKeys?.openrouter ?? stored.zeus_openrouter_api_key ?? DEFAULT_SETTINGS.apiKeys.openrouter
  };

  const models = {
    ...DEFAULT_SETTINGS.models,
    ...(stored.models || {}),
    gemini: stored.models?.gemini ?? stored.zeus_gemini_model ?? DEFAULT_SETTINGS.models.gemini,
    openai: stored.models?.openai ?? stored.zeus_openai_model ?? DEFAULT_SETTINGS.models.openai,
    claude: stored.models?.claude ?? stored.zeus_claude_model ?? DEFAULT_SETTINGS.models.claude,
    openrouter: stored.models?.openrouter ?? stored.zeus_openrouter_model ?? DEFAULT_SETTINGS.models.openrouter
  };

  // Ollama model is auto-detected from local server; ignore stale persisted model values.
  const ollama = {
    model: ''
  };

  return { provider, apiKeys, models, ollama };
}

function buildSettingsPayload(config) {
  const ollamaModel = String(config?.ollama?.model || '').trim();
  return {
    provider: config.provider,
    apiKeys: config.apiKeys,
    models: config.models,
    ollama: config.ollama,

    // Legacy compatibility keys for existing content script versions
    zeus_selected_provider: config.provider,
    zeus_gemini_api_key: config.apiKeys.gemini,
    zeus_gemini_model: config.models.gemini,
    zeus_openai_api_key: config.apiKeys.openai,
    zeus_openai_model: config.models.openai,
    zeus_claude_api_key: config.apiKeys.claude,
    zeus_claude_model: config.models.claude,
    zeus_openrouter_api_key: config.apiKeys.openrouter,
    zeus_openrouter_model: config.models.openrouter,
    zeus_ollama_model: ollamaModel,
    zeus_provider_configs: {
      openrouter: {
        apiKey: config.apiKeys.openrouter,
        model: config.models.openrouter
      }
    }
  };
}

// ----------------------
// Unified provider-agnostic error engine
// ----------------------

function genericFallback() {
  return 'Check your provider settings in the Zeus extension popup and try again.';
}

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

const CLASSIFICATION_FALLBACK_PATTERNS = {
  AUTHENTICATION_ERROR: [/invalid[_\s-]?api[_\s-]?key/i, /authentication/i, /unauthorized/i],
  MODEL_NOT_FOUND: [/model[_\s-]?not[_\s-]?found/i, /unknown\s+model/i, /not\s+found/i],
  RATE_LIMIT_ERROR: [/rate[_\s-]?limit/i, /too\s+many\s+requests/i],
  QUOTA_EXCEEDED: [/insufficient[_\s-]?(quota|credits)/i, /payment\s+required/i],
  NETWORK_ERROR: [/network/i, /timed?\s*out/i, /failed\s+to\s+fetch/i]
};

function safeReadByPath(obj, path) {
  if (!obj || !path) return undefined;
  return path.split('.').reduce((acc, part) => (acc && typeof acc === 'object') ? acc[part] : undefined, obj);
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
    message,
    isAuthError: status === 401 || status === 403,
    isRateLimit: status === 429,
    isModelError: status === 404 || code === 'model_not_found',
    isQuotaError: status === 402 || code === 'insufficient_quota',
    isServerError: Number(status) >= 500 && Number(status) <= 599
  };
}

function classifyError(normalizedError) {
  if (normalizedError.status === 401) return 'AUTHENTICATION_ERROR';
  if (normalizedError.status === 403) return 'AUTHORIZATION_ERROR';
  if (normalizedError.status === 404) return 'MODEL_NOT_FOUND';
  if (normalizedError.status === 429) return 'RATE_LIMIT_ERROR';
  if (normalizedError.status === 402) return 'QUOTA_EXCEEDED';
  if (normalizedError.status === 400) return 'INVALID_REQUEST';
  if (normalizedError.status >= 500 && normalizedError.status <= 599) return 'SERVER_ERROR';

  const signal = `${normalizedError.code} ${normalizedError.type} ${normalizedError.message}`;
  if (matchesPatterns(signal, CLASSIFICATION_FALLBACK_PATTERNS.AUTHENTICATION_ERROR)) return 'AUTHENTICATION_ERROR';
  if (matchesPatterns(signal, CLASSIFICATION_FALLBACK_PATTERNS.MODEL_NOT_FOUND)) return 'MODEL_NOT_FOUND';
  if (matchesPatterns(signal, CLASSIFICATION_FALLBACK_PATTERNS.RATE_LIMIT_ERROR)) return 'RATE_LIMIT_ERROR';
  if (matchesPatterns(signal, CLASSIFICATION_FALLBACK_PATTERNS.QUOTA_EXCEEDED)) return 'QUOTA_EXCEEDED';
  if (matchesPatterns(signal, CLASSIFICATION_FALLBACK_PATTERNS.NETWORK_ERROR)) return 'NETWORK_ERROR';

  if (normalizedError.isAuthError) return 'AUTHENTICATION_ERROR';
  if (normalizedError.isModelError) return 'MODEL_NOT_FOUND';
  if (normalizedError.isRateLimit) return 'RATE_LIMIT_ERROR';
  if (normalizedError.isQuotaError) return 'QUOTA_EXCEEDED';
  if (normalizedError.isServerError) return 'SERVER_ERROR';

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
      return `${providerName} quota or credits are insufficient. Please check your account.`;
    case 'INVALID_REQUEST':
      return `Invalid request sent to ${providerName}. Please verify configuration and model.`;
    case 'SERVER_ERROR':
      return `${providerName} is temporarily unavailable. Please try again shortly.`;
    case 'NETWORK_ERROR':
      return `Network issue while contacting ${providerName}. Check your connection and retry.`;
    default:
      return genericFallback();
  }
}

function buildUserFacingError(provider, status, errData, model) {
  const normalizedError = normalizeProviderError(provider, status, errData);
  const category = classifyError(normalizedError);
  const safeMessage = sanitizeServerMessage(normalizedError.message);

  if (provider === 'ollama' && status === 403) {
    return buildOllamaOriginBlockedMessage();
  }

  if (provider === 'ollama' && (category === 'NETWORK_ERROR' || looksLikeOllamaConnectionError(safeMessage))) {
    return OLLAMA_NOT_RUNNING_MESSAGE;
  }

  const baseMessage = categoryMessage(category, provider, model);
  if (isSafeSpecificMessage(safeMessage) && category !== 'AUTHENTICATION_ERROR' && category !== 'AUTHORIZATION_ERROR') {
    return `${baseMessage} ${safeMessage}`.trim();
  }

  return baseMessage || genericFallback();
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

function normalizeEnhanceError(error, provider, model) {
  if (error instanceof ProviderHttpError) {
    return buildUserFacingError(error.provider, error.status, error.data, error.model || model);
  }

  const message = sanitizeServerMessage(error?.message || '');

  if (message === OLLAMA_NOT_RUNNING_MESSAGE) {
    return message;
  }

  if (message.includes('Ollama blocked extension origin')) {
    return message;
  }

  if (provider === 'ollama' && looksLikeOllamaConnectionError(message)) {
    return OLLAMA_NOT_RUNNING_MESSAGE;
  }

  if (error?.name === 'AbortError') {
    return 'Request timed out. Please try again.';
  }

  if (message === OLLAMA_NO_MODEL_MESSAGE) {
    return message;
  }

  if (isSafeSpecificMessage(message)) {
    return message;
  }

  return categoryMessage('UNKNOWN_ERROR', provider || 'provider', model);
}

// ----------------------
// Utilities
// ----------------------

async function getSettings(sendResponse) {
  try {
    const config = await loadConfig();
    sendResponse({ settings: buildSettingsPayload(config) });
  } catch (err) {
    sendResponse({ error: err?.message || 'Failed to load settings.' });
  }
}

function notifyTabsOfUpdate(settings) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (chrome.runtime.lastError) return;
    if (tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'settingsUpdated', settings }).catch(() => {});
    }
  });
}

function forceInject(tabId, sendResponse) {
  if (!tabId) {
    sendResponse({ success: false, message: 'No active tab found.' });
    return;
  }

  chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] })
    .then(() => {
      setTimeout(() => {
        chrome.tabs.sendMessage(tabId, { action: 'forceInjectButton' })
          .then(() => sendResponse({ success: true }))
          .catch((err) => sendResponse({ success: false, message: err.message }));
      }, 100);
    })
    .catch((err) => sendResponse({ success: false, message: err.message }));
}
