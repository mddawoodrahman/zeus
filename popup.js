// popup.js - Handles popup settings for cloud and local providers

document.addEventListener('DOMContentLoaded', function() {
  const aiProviderSelect = document.getElementById('aiProvider');
  const darkModeToggle = document.getElementById('darkModeToggle');
  const saveBtn = document.getElementById('saveBtn');
  const statusEl = document.getElementById('status');

  const DEFAULT_SETTINGS = {
    provider: 'gemini',
    apiKeys: {
      gemini: '',
      openai: '',
      claude: '',
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

  const settingsMap = {
    gemini: {
      settingsDiv: document.getElementById('gemini-settings'),
      apiKeyInput: document.getElementById('geminiApiKey'),
      showHideBtn: document.getElementById('showHideGemini')
    },
    openai: {
      settingsDiv: document.getElementById('openai-settings'),
      apiKeyInput: document.getElementById('openaiApiKey'),
      showHideBtn: document.getElementById('showHideOpenAI')
    },
    claude: {
      settingsDiv: document.getElementById('claude-settings'),
      apiKeyInput: document.getElementById('claudeApiKey'),
      showHideBtn: document.getElementById('showHideClaude')
    },
    openrouter: {
      settingsDiv: document.getElementById('openrouter-settings'),
      apiKeyInput: document.getElementById('openrouterApiKey'),
      showHideBtn: document.getElementById('showHideOpenRouter')
    },
    ollama: {
      settingsDiv: document.getElementById('ollama-settings')
    },
    auto: {
      settingsDiv: document.getElementById('auto-settings')
    }
  };

  function initializeDarkMode() {
    chrome.storage.sync.get(['zeus_dark_mode_preference'], (data) => {
      let isDarkMode = data?.zeus_dark_mode_preference;
      if (isDarkMode === undefined) {
        isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
      }
      applyDarkMode(isDarkMode);
    });
  }

  function applyDarkMode(isDark) {
    if (isDark) {
      document.documentElement.setAttribute('data-theme', 'dark');
      darkModeToggle?.classList.add('active');
    } else {
      document.documentElement.removeAttribute('data-theme');
      darkModeToggle?.classList.remove('active');
    }
  }

  function toggleDarkMode() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const next = !isDark;
    applyDarkMode(next);
    chrome.storage.sync.set({ zeus_dark_mode_preference: next });
  }

  try {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', (e) => {
      chrome.storage.sync.get(['zeus_dark_mode_preference'], (data) => {
        if (data?.zeus_dark_mode_preference === undefined) {
          applyDarkMode(e.matches);
        }
      });
    });
  } catch (_) {
    // ignore
  }

  function toggleProviderPanels(selectedProvider) {
    for (const provider in settingsMap) {
      const sec = settingsMap[provider].settingsDiv;
      if (!sec) continue;
      sec.style.display = provider === selectedProvider ? 'block' : 'none';
    }
  }

  darkModeToggle?.addEventListener('click', toggleDarkMode);

  aiProviderSelect.addEventListener('change', () => {
    toggleProviderPanels(aiProviderSelect.value);
  });

  saveBtn.addEventListener('click', saveSettings);

  for (const provider of ['gemini', 'openai', 'claude', 'openrouter']) {
    const { apiKeyInput, showHideBtn } = settingsMap[provider];
    if (apiKeyInput && showHideBtn) {
      showHideBtn.addEventListener('click', () => togglePasswordVisibility(apiKeyInput, showHideBtn));
    }
  }

  function normalizeStoredSettings(data) {
    const provider = data.provider || data.zeus_selected_provider || DEFAULT_SETTINGS.provider;

    const apiKeys = {
      ...DEFAULT_SETTINGS.apiKeys,
      ...(data.apiKeys || {}),
      gemini: data.apiKeys?.gemini ?? data.zeus_gemini_api_key ?? DEFAULT_SETTINGS.apiKeys.gemini,
      openai: data.apiKeys?.openai ?? data.zeus_openai_api_key ?? DEFAULT_SETTINGS.apiKeys.openai,
      claude: data.apiKeys?.claude ?? data.zeus_claude_api_key ?? DEFAULT_SETTINGS.apiKeys.claude,
      openrouter: data.apiKeys?.openrouter ?? data.zeus_openrouter_api_key ?? data?.zeus_provider_configs?.openrouter?.apiKey ?? DEFAULT_SETTINGS.apiKeys.openrouter
    };

    const models = {
      ...DEFAULT_SETTINGS.models,
      ...(data.models || {}),
      gemini: data.models?.gemini ?? data.zeus_gemini_model ?? DEFAULT_SETTINGS.models.gemini,
      openai: data.models?.openai ?? data.zeus_openai_model ?? DEFAULT_SETTINGS.models.openai,
      claude: data.models?.claude ?? data.zeus_claude_model ?? DEFAULT_SETTINGS.models.claude,
      openrouter: data.models?.openrouter ?? data.zeus_openrouter_model ?? data?.zeus_provider_configs?.openrouter?.model ?? DEFAULT_SETTINGS.models.openrouter
    };

    const ollama = {
      model: data.ollama?.model || data.zeus_ollama_model || ''
    };

    return { provider, apiKeys, models, ollama };
  }

  function buildStoragePayload(config) {
    return {
      provider: config.provider,
      apiKeys: config.apiKeys,
      models: config.models,
      ollama: config.ollama,

      // Legacy compatibility
      zeus_selected_provider: config.provider,
      zeus_gemini_api_key: config.apiKeys.gemini,
      zeus_gemini_model: config.models.gemini,
      zeus_openai_api_key: config.apiKeys.openai,
      zeus_openai_model: config.models.openai,
      zeus_claude_api_key: config.apiKeys.claude,
      zeus_claude_model: config.models.claude,
      zeus_openrouter_api_key: config.apiKeys.openrouter,
      zeus_openrouter_model: config.models.openrouter,
      zeus_ollama_model: String(config?.ollama?.model || '').trim(),
      zeus_provider_configs: {
        openrouter: {
          apiKey: config.apiKeys.openrouter,
          model: config.models.openrouter
        }
      }
    };
  }

  function loadSettings() {
    const keysToGet = [
      'provider', 'apiKeys', 'models', 'ollama',
      'zeus_selected_provider',
      'zeus_gemini_api_key', 'zeus_gemini_model',
      'zeus_openai_api_key', 'zeus_openai_model',
      'zeus_claude_api_key', 'zeus_claude_model',
      'zeus_openrouter_api_key', 'zeus_openrouter_model',
      'zeus_provider_configs'
    ];

    chrome.storage.sync.get(keysToGet, (data) => {
      if (chrome.runtime.lastError) {
        showStatus('Could not load settings', 'error');
        return;
      }

      const normalized = normalizeStoredSettings(data || {});

      aiProviderSelect.value = normalized.provider;
      settingsMap.gemini.apiKeyInput.value = normalized.apiKeys.gemini;
      settingsMap.openai.apiKeyInput.value = normalized.apiKeys.openai;
      settingsMap.claude.apiKeyInput.value = normalized.apiKeys.claude;
      settingsMap.openrouter.apiKeyInput.value = normalized.apiKeys.openrouter;

      toggleProviderPanels(normalized.provider);
    });
  }

  function saveSettings() {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    const provider = aiProviderSelect.value;
    const settings = {
      provider,
      apiKeys: {
        gemini: settingsMap.gemini.apiKeyInput?.value.trim() || '',
        openai: settingsMap.openai.apiKeyInput?.value.trim() || '',
        claude: settingsMap.claude.apiKeyInput?.value.trim() || '',
        openrouter: settingsMap.openrouter.apiKeyInput?.value.trim() || ''
      },
      models: { ...DEFAULT_SETTINGS.models },
      ollama: {}
    };

    const payload = buildStoragePayload(settings);

    chrome.storage.sync.set(payload, () => {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Settings';

      if (chrome.runtime.lastError) {
        showStatus(`Error: ${chrome.runtime.lastError.message}`, 'error');
        return;
      }

      showStatus('Settings saved successfully!', 'success');
      chrome.runtime.sendMessage({ action: 'settingsUpdated', settings: payload });
    });
  }

  function togglePasswordVisibility(input, btn) {
    if (!input || !btn) return;
    const toText = input.type === 'password';
    input.type = toText ? 'text' : 'password';
    btn.textContent = toText ? 'Hide' : 'Show';
  }

  let statusTimeout;
  function showStatus(message, type) {
    clearTimeout(statusTimeout);
    statusEl.textContent = message;
    statusEl.className = 'status ' + (type || '');
    statusTimeout = setTimeout(() => {
      statusEl.textContent = '';
      statusEl.className = 'status';
    }, 4000);
  }

  initializeDarkMode();
  loadSettings();
});
