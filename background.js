

const FETCH_TIMEOUT_MS = 20000; // 20s timeout for provider requests
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_APP_REFERER = 'https://zeus-extension.local';
const OPENROUTER_APP_TITLE = 'Zeus Prompt Enhancer';
const OPENROUTER_MAX_RETRIES = 3;

// Context menu on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "zeus-enhance-prompt",
    title: "Enhance Prompt with Zeus",
    contexts: ["editable"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "zeus-enhance-prompt" && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { action: "contextEnhancePrompt" });
  }
});

// Message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'enhancePrompt':
      (async () => {
        try {
          const result = await handleEnhancePrompt(message);
          sendResponse(result);
        } catch (err) {
          sendResponse({ success: false, error: err.message || 'Unknown error' });
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
});

// ----------------------
// Core orchestration
// ----------------------

async function handleEnhancePrompt({ prompt, provider, model, apiKey }) {
  try {
    if (!prompt || !prompt.trim()) {
      return { success: false, error: "Empty prompt provided." };
    }
    const resolvedProvider = provider || inferProviderFromApiKey(apiKey);
    const resolvedModel = model;
    const resolvedApiKey = apiKey;

    if (!resolvedProvider) {
      return { success: false, error: "Could not detect provider from API key. Please select a provider in Zeus settings." };
    }

    let enhancedPrompt;
    switch (resolvedProvider) {
      case 'gemini':
        enhancedPrompt = await enhanceWithGemini(prompt, resolvedModel, resolvedApiKey);
        break;
      case 'openai':
        enhancedPrompt = await enhanceWithOpenAI(prompt, resolvedModel, resolvedApiKey);
        break;
      case 'claude':
        enhancedPrompt = await enhanceWithClaude(prompt, resolvedModel, resolvedApiKey);
        break;
      case 'openrouter':
        enhancedPrompt = await enhanceWithOpenRouter(prompt, resolvedModel, resolvedApiKey);
        break;
      default:
        throw new Error(`Unsupported provider: ${resolvedProvider}`);
    }
    return { success: true, enhancedPrompt };
  } catch (err) {
    return { success: false, error: err.message || 'Unknown error' };
  }
}

const enhancementSystemPrompt = `
You are an elite AI prompt architect specializing in transforming raw instructions into high-performance prompts optimized for large language models (LLMs).

Your objective is to rewrite the user's prompt into a maximally effective, precise, and structured instruction set.

Optimization Framework:

A. Intent Extraction
- Identify the true goal of the user.
- Infer missing but necessary context logically.
- Remove ambiguity and vagueness.

B. Role Assignment
- Assign an expert-level role to the AI that matches the task domain.
- Examples: senior engineer, legal analyst, academic researcher, marketing strategist.

C. Structural Enhancement
- Organize the request into clearly defined sections.
- Use numbered steps where appropriate.
- Define deliverables clearly.

D. Precision & Constraints
- Specify expected output format.
- Define scope boundaries.
- Add depth requirements (detailed, technical, beginner-friendly, etc.).
- Add reasoning instructions for complex tasks.

E. Quality Amplification
- Encourage thoroughness.
- Encourage actionable insights.
- Ensure logical flow.
- Remove redundancy.

F. Safety Rules
- Do NOT answer the prompt.
- Do NOT include explanations.
- Do NOT include meta commentary.
- Preserve the original intent completely.

Return ONLY the enhanced prompt text.
No extra text.
`;

function inferProviderFromApiKey(apiKey) {
  const key = String(apiKey || '').trim();
  if (!key) return '';
  if (key.startsWith('sk-or-')) return 'openrouter';
  if (key.startsWith('sk-ant-')) return 'claude';
  if (key.startsWith('AIza')) return 'gemini';
  if (key.startsWith('sk-')) return 'openai';
  return '';
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
async function enhanceWithGemini(prompt, model, apiKey) {
  if (!apiKey) throw new Error("Missing Gemini API key.");
  if (!model) throw new Error("Missing Gemini model.");
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ parts: [{ text: `${enhancementSystemPrompt}\n\nOriginal: "${prompt}"\n\nEnhanced:` }] }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
  };

  const response = await fetchWithTimeout(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(buildUserFacingError('gemini', response.status, errData, model));
  }

  const data = await response.json().catch(() => ({}));
  const enhancedText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!enhancedText) throw new Error("Provider responded without enhanced text.");
  return enhancedText.trim();
}

async function enhanceWithOpenAI(prompt, model, apiKey) {
  if (!apiKey) throw new Error("Missing OpenAI API key.");
  if (!model) throw new Error("Missing OpenAI model.");
  const apiUrl = 'https://api.openai.com/v1/chat/completions';
  const body = {
    model,
    messages: [
      { role: "system", content: enhancementSystemPrompt },
      { role: "user", content: `Original: "${prompt}"\n\nEnhanced:` }
    ],
    temperature: 0.7,
    max_tokens: 2048
  };

  const response = await fetchWithTimeout(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(buildUserFacingError('openai', response.status, errData, model));
  }

  const data = await response.json().catch(() => ({}));
  const enhancedText = data?.choices?.[0]?.message?.content;
  if (!enhancedText) throw new Error("Provider responded without enhanced text.");
  return enhancedText.trim();
}

async function enhanceWithClaude(prompt, model, apiKey) {
  if (!apiKey) throw new Error("Missing Claude API key.");
  if (!model) throw new Error("Missing Claude model.");
  const apiUrl = 'https://api.anthropic.com/v1/messages';
  const body = {
    model,
    system: enhancementSystemPrompt,
    messages: [{ role: "user", content: `Original: "${prompt}"\n\nEnhanced:` }],
    max_tokens: 2048,
    temperature: 0.7
  };

  const response = await fetchWithTimeout(apiUrl, {
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
    throw new Error(buildUserFacingError('claude', response.status, errData, model));
  }

  const data = await response.json().catch(() => ({}));
  const enhancedText = data?.content?.[0]?.text;
  if (!enhancedText) throw new Error("Provider responded without enhanced text.");
  return enhancedText.trim();
}

async function enhanceWithOpenRouter(prompt, model, apiKey) {
  if (!apiKey) throw new Error("Missing OpenRouter API key.");
  if (!model) throw new Error("Missing OpenRouter model.");

  const body = {
    model,
    messages: [
      { role: "system", content: enhancementSystemPrompt },
      { role: "user", content: `Original: "${prompt}"\n\nEnhanced:` }
    ],
    temperature: 0.7,
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
      if (!enhancedText) throw new Error("Provider responded without enhanced text.");
      return enhancedText.trim();
    }

    const errData = await response.json().catch(() => ({}));
    if (response.status === 429 && attempt < OPENROUTER_MAX_RETRIES - 1) {
      await waitWithBackoff(attempt);
      continue;
    }

    throw new Error(buildUserFacingError('openrouter', response.status, errData, model));
  }

  throw new Error("OpenRouter rate limit reached after multiple retries. Please try again shortly.");
}

async function waitWithBackoff(attempt) {
  const baseMs = 400;
  const backoffMs = baseMs * Math.pow(2, attempt);
  const jitterMs = Math.floor(Math.random() * 200);
  await new Promise(resolve => setTimeout(resolve, backoffMs + jitterMs));
}

// ----------------------
// Unified provider-agnostic error engine
// ----------------------
function genericFallback() {
  return "Check your API key and selected model in the Zeus extension settings.";
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

function categoryMessage(category, provider, model) {
  const modelName = model || 'selected model';
  switch (category) {
    case 'AUTHENTICATION_ERROR':
      return `Invalid ${provider} API key. Please verify your key in Zeus settings.`;
    case 'AUTHORIZATION_ERROR':
      return `Authorization failed for ${provider}. Your account may not have required permissions.`;
    case 'MODEL_NOT_FOUND':
      return `Model '${modelName}' may not be available for ${provider}.`;
    case 'RATE_LIMIT_ERROR':
      return `${provider} rate limit exceeded. Please wait and try again.`;
    case 'QUOTA_EXCEEDED':
      return `${provider} quota or credits are insufficient. Please check your account.`;
    case 'INVALID_REQUEST':
      return `Invalid request sent to ${provider}. Please verify configuration and model.`;
    case 'SERVER_ERROR':
      return `${provider} is temporarily unavailable. Please try again shortly.`;
    case 'NETWORK_ERROR':
      return `Network issue while contacting ${provider}. Check your connection and retry.`;
    default:
      return genericFallback();
  }
}

function buildUserFacingError(provider, status, errData, model) {
  // Step 1: normalize provider-specific payload into a standard internal shape.
  const normalizedError = normalizeProviderError(provider, status, errData);
  // Step 2: classify using status-first strategy, then structured fields, then fallback patterns.
  const category = classifyError(normalizedError);
  // Step 3: sanitize server message before any user exposure.
  const safeMessage = sanitizeServerMessage(normalizedError.message);
  const baseMessage = categoryMessage(category, provider, model);

  // Step 4: include server detail only when it's meaningful and safe.
  if (isSafeSpecificMessage(safeMessage) && category !== 'AUTHENTICATION_ERROR' && category !== 'AUTHORIZATION_ERROR') {
    return `${baseMessage} ${safeMessage}`.trim();
  }

  return baseMessage || genericFallback();
}

// ----------------------
// Utilities
// ----------------------
function getSettings(sendResponse) {
  const keys = [
    'zeus_selected_provider',
    'zeus_gemini_api_key', 'zeus_gemini_model',
    'zeus_openai_api_key', 'zeus_openai_model',
    'zeus_claude_api_key', 'zeus_claude_model',
    'zeus_openrouter_api_key', 'zeus_openrouter_model',
    'zeus_provider_configs'
  ];
  chrome.storage.sync.get(keys, (settings) => {
    if (chrome.runtime.lastError) sendResponse({ error: chrome.runtime.lastError.message });
    else sendResponse({ settings });
  });
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
    sendResponse({ success: false, message: "No active tab found." });
    return;
  }
  chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] })
    .then(() => {
      setTimeout(() => {
        chrome.tabs.sendMessage(tabId, { action: 'forceInjectButton' })
          .then(() => sendResponse({ success: true }))
          .catch(err => sendResponse({ success: false, message: err.message }));
      }, 100);
    })
    .catch(err => sendResponse({ success: false, message: err.message }));
}
