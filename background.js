

const FETCH_TIMEOUT_MS = 20000; // 20s timeout for provider requests

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
    if (!provider) {
      return { success: false, error: "No provider selected." };
    }
    let enhancedPrompt;
    switch (provider) {
      case 'gemini':
        enhancedPrompt = await enhanceWithGemini(prompt, model, apiKey);
        break;
      case 'openai':
        enhancedPrompt = await enhanceWithOpenAI(prompt, model, apiKey);
        break;
      case 'claude':
        enhancedPrompt = await enhanceWithClaude(prompt, model, apiKey);
        break;
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
    return { success: true, enhancedPrompt };
  } catch (err) {
    return { success: false, error: err.message || 'Unknown error' };
  }
}

const enhancementSystemPrompt = `You are a prompt optimization expert. Enhance the following prompt to be clearer, more detailed, and more effective for an AI model. Return ONLY the enhanced prompt, without any extra text or explanation.`;

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
    throw new Error(parseGeminiError(errData, model));
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
    throw new Error(parseOpenAIError(errData, model));
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
    throw new Error(parseClaudeError(errData, model));
  }

  const data = await response.json().catch(() => ({}));
  const enhancedText = data?.content?.[0]?.text;
  if (!enhancedText) throw new Error("Provider responded without enhanced text.");
  return enhancedText.trim();
}

// ----------------------
// Error parsers with safe fallback
// ----------------------
function genericFallback() {
  return "Check your API key and selected model in the Zeus extension settings.";
}
function isGenericMessage(msg) {
  if (!msg) return true;
  const m = String(msg).toLowerCase();
  return m.includes("http error") || m.includes("internal") || m.includes("server error") ||
         m.includes("timeout") || m.includes("failed to fetch") || m.includes("network") ||
         m.includes("unavailable") || m.includes("502") || m.includes("503") || m.includes("504");
}

function parseGeminiError(errData, model) {
  const msg = errData?.error?.message || '';
  const low = msg.toLowerCase();
  if (low.includes("api key") && low.includes("not valid")) {
    return "Invalid API Key. Please check your Gemini API key in the Zeus extension settings.";
  }
  if (low.includes("permission") || low.includes("permissiondenied")) {
    return `Permission Denied. Your key may not have access to the '${model}' model.`;
  }
  if (low.includes("quota") || low.includes("rate limit")) {
    return "Rate limit exceeded. Please wait a moment and try again.";
  }
  return isGenericMessage(msg) ? genericFallback() : genericFallback();
}

function parseOpenAIError(errData, model) {
  const msg = errData?.error?.message || '';
  const code = errData?.error?.code || '';
  const low = String(msg).toLowerCase();
  if (code === 'invalid_api_key' || (low.includes('invalid') && low.includes('key'))) {
    return "Invalid API Key. Please check your OpenAI API key in the Zeus extension settings.";
  }
  if (low.includes("does not exist") || code === 'model_not_found') {
    return `Model '${model}' may not be available to your account.`;
  }
  if (code === 'insufficient_quota' || low.includes('quota')) {
    return "Insufficient quota or rate limit exceeded. Please check your OpenAI account.";
  }
  return isGenericMessage(msg) ? genericFallback() : genericFallback();
}

function parseClaudeError(errData, model) {
  const msg = errData?.error?.message || '';
  const type = errData?.error?.type || '';
  const low = String(msg).toLowerCase();
  if ((errData?.type === 'error' && type === 'authentication_error') || low.includes('authentication')) {
    return "Invalid API Key. Please check your Claude API key in the Zeus extension settings.";
  }
  if (low.includes("not found") || type === 'not_found_error') {
    return `Model '${model}' may not be available to your account.`;
  }
  if (type === 'rate_limit_error' || low.includes('rate limit')) {
    return "Rate limit exceeded. Please wait a moment and try again.";
  }
  return isGenericMessage(msg) ? genericFallback() : genericFallback();
}

// ----------------------
// Utilities
// ----------------------
function getSettings(sendResponse) {
  const keys = [
    'zeus_selected_provider',
    'zeus_gemini_api_key', 'zeus_gemini_model',
    'zeus_openai_api_key', 'zeus_openai_model',
    'zeus_claude_api_key', 'zeus_claude_model'
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
