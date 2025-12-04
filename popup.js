// popup.js - Handles the extension popup interface for multiple AI providers and models

document.addEventListener('DOMContentLoaded', function() {
  // --- Element References ---
  const aiProviderSelect = document.getElementById('aiProvider');
  const darkModeToggle = document.getElementById('darkModeToggle');
  
  const settingsMap = {
    gemini: {
      settingsDiv: document.getElementById('gemini-settings'),
      apiKeyInput: document.getElementById('geminiApiKey'),
      showHideBtn: document.getElementById('showHideGemini'),
      modelSelect: document.getElementById('geminiModel')
    },
    openai: {
      settingsDiv: document.getElementById('openai-settings'),
      apiKeyInput: document.getElementById('openaiApiKey'),
      showHideBtn: document.getElementById('showHideOpenAI'),
      modelSelect: document.getElementById('openaiModel')
    },
    claude: {
      settingsDiv: document.getElementById('claude-settings'),
      apiKeyInput: document.getElementById('claudeApiKey'),
      showHideBtn: document.getElementById('showHideClaude'),
      modelSelect: document.getElementById('claudeModel')
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
      'zeus_claude_api_key', 'zeus_claude_model'
    ];
    chrome.storage.sync.get(keysToGet, (data) => {
      if (chrome.runtime.lastError) {
        showStatus('Could not load settings', 'error');
        return;
      }

      aiProviderSelect.value = data.zeus_selected_provider || 'gemini';

      if (settingsMap.gemini.apiKeyInput) settingsMap.gemini.apiKeyInput.value = data.zeus_gemini_api_key || '';
      if (settingsMap.gemini.modelSelect) settingsMap.gemini.modelSelect.value = data.zeus_gemini_model || settingsMap.gemini.modelSelect.value;

      if (settingsMap.openai.apiKeyInput) settingsMap.openai.apiKeyInput.value = data.zeus_openai_api_key || '';
      if (settingsMap.openai.modelSelect) settingsMap.openai.modelSelect.value = data.zeus_openai_model || settingsMap.openai.modelSelect.value;

      if (settingsMap.claude.apiKeyInput) settingsMap.claude.apiKeyInput.value = data.zeus_claude_api_key || '';
      if (settingsMap.claude.modelSelect) settingsMap.claude.modelSelect.value = data.zeus_claude_model || settingsMap.claude.modelSelect.value;

      aiProviderSelect.dispatchEvent(new Event('change'));
    });
  }

  function saveSettings() {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    const payload = {
      zeus_selected_provider: aiProviderSelect.value,
      zeus_gemini_api_key: settingsMap.gemini.apiKeyInput?.value.trim() || '',
      zeus_gemini_model: settingsMap.gemini.modelSelect?.value || '',
      zeus_openai_api_key: settingsMap.openai.apiKeyInput?.value.trim() || '',
      zeus_openai_model: settingsMap.openai.modelSelect?.value || '',
      zeus_claude_api_key: settingsMap.claude.apiKeyInput?.value.trim() || '',
      zeus_claude_model: settingsMap.claude.modelSelect?.value || ''
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