// popup.js - Handles the extension popup interface for multiple AI providers and models

document.addEventListener('DOMContentLoaded', function() {
  // --- Element References ---
  const aiProviderSelect = document.getElementById('aiProvider');
  const darkModeToggle = document.getElementById('darkModeToggle');
  const DEFAULT_MODELS = {
    gemini: 'gemini-2.5-pro',
    openai: 'gpt-4.1-mini',
    claude: 'claude-3-sonnet-20240229',
    openrouter: 'openai/gpt-4o'
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
    }
  };

  const saveBtn = document.getElementById('saveBtn');
  const statusEl = document.getElementById('status');

  // --- Dark Mode Management ---
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
    // Optional: notify content scripts if you later theme injected elements
    // chrome.runtime.sendMessage({ action: 'darkModeToggled', value: next });
  }

  // Listen for system dark mode changes when no explicit user pref
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
    // Older browsers fallback (not needed for MV3 Chrome, but safe)
  }

  // --- Event Listeners ---
  darkModeToggle?.addEventListener('click', toggleDarkMode);

  aiProviderSelect.addEventListener('change', () => {
    const selectedProvider = aiProviderSelect.value;
    for (const provider in settingsMap) {
      const sec = settingsMap[provider].settingsDiv;
      if (sec) sec.style.display = provider === selectedProvider ? 'block' : 'none';
    }
  });

  saveBtn.addEventListener('click', saveSettings);

  for (const provider in settingsMap) {
    const { apiKeyInput, showHideBtn } = settingsMap[provider];
    if (apiKeyInput && showHideBtn) {
      showHideBtn.addEventListener('click', () => togglePasswordVisibility(apiKeyInput, showHideBtn));
    }
  }

  // --- Functions ---
  function loadSettings() {
    const keysToGet = [
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

      aiProviderSelect.value = data.zeus_selected_provider || 'gemini';

      if (settingsMap.gemini.apiKeyInput) settingsMap.gemini.apiKeyInput.value = data.zeus_gemini_api_key || '';

      if (settingsMap.openai.apiKeyInput) settingsMap.openai.apiKeyInput.value = data.zeus_openai_api_key || '';

      if (settingsMap.claude.apiKeyInput) settingsMap.claude.apiKeyInput.value = data.zeus_claude_api_key || '';

      if (settingsMap.openrouter.apiKeyInput) {
        settingsMap.openrouter.apiKeyInput.value = data.zeus_openrouter_api_key || data?.zeus_provider_configs?.openrouter?.apiKey || '';
      }

      aiProviderSelect.dispatchEvent(new Event('change'));
    });
  }

  function saveSettings() {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    const openRouterModel = DEFAULT_MODELS.openrouter;
    const payload = {
      zeus_selected_provider: aiProviderSelect.value,
      zeus_gemini_api_key: settingsMap.gemini.apiKeyInput?.value.trim() || '',
      zeus_gemini_model: DEFAULT_MODELS.gemini,
      zeus_openai_api_key: settingsMap.openai.apiKeyInput?.value.trim() || '',
      zeus_openai_model: DEFAULT_MODELS.openai,
      zeus_claude_api_key: settingsMap.claude.apiKeyInput?.value.trim() || '',
      zeus_claude_model: DEFAULT_MODELS.claude,
      zeus_openrouter_api_key: settingsMap.openrouter.apiKeyInput?.value.trim() || '',
      zeus_openrouter_model: openRouterModel,
      zeus_provider_configs: {
        openrouter: {
          apiKey: settingsMap.openrouter.apiKeyInput?.value.trim() || '',
          model: openRouterModel
        }
      }
    };

    chrome.storage.sync.set(payload, () => {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save API Keys';
      if (chrome.runtime.lastError) {
        showStatus(`Error: ${chrome.runtime.lastError.message}`, 'error');
      } else {
        showStatus('Settings saved successfully!', 'success');
        chrome.runtime.sendMessage({ action: 'settingsUpdated', settings: payload });
      }
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

  // --- Initialization ---
  initializeDarkMode();
  loadSettings();
});