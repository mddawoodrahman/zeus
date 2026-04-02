document.addEventListener('DOMContentLoaded', () => {
  const registry = globalThis.ZeusModelRegistry || null;
  const settingsModule = globalThis.ZeusSettings;

  const aiProviderSelect = document.getElementById('aiProvider');
  const modelSelectionSection = document.getElementById('model-selection');
  const providerModelSelect = document.getElementById('providerModel');
  const providerHelpText = document.getElementById('provider-help-text');
  const modelHelpText = document.getElementById('model-help-text');
  const modelMeta = document.getElementById('model-meta');
  const modelDisplayName = document.getElementById('model-display-name');
  const modelBadge = document.getElementById('model-badge');
  const modelTags = document.getElementById('model-tags');
  const ollamaSuggestions = document.getElementById('ollama-suggestions');
  const darkModeToggle = document.getElementById('darkModeToggle');
  const saveBtn = document.getElementById('saveBtn');
  const statusEl = document.getElementById('status');

  const GROUP_LABELS = registry?.getGroupLabels?.() || {
    recommended: 'Recommended (Latest)',
    'fast-cheap': 'Fast / Cheap',
    'high-intelligence': 'High Intelligence',
    'coding-agents': 'Coding / Agents'
  };

  const PROVIDER_GROUP_ORDER = ['recommended', 'fast-cheap', 'high-intelligence', 'coding-agents'];

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

  let currentSettings = settingsModule?.createDefaultSettings?.() || {
    provider: 'gemini',
    apiKeys: { gemini: '', openai: '', claude: '', openrouter: '' },
    models: { gemini: '', openai: '', claude: '', openrouter: '' },
    ollama: { model: '' }
  };

  function initializeDarkMode() {
    chrome.storage.sync.get(['zeus_dark_mode_preference'], (data) => {
      let isDarkMode = data?.zeus_dark_mode_preference;
      if (isDarkMode === undefined) {
        isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
      }
      applyDarkMode(Boolean(isDarkMode));
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

  function toggleProviderPanels(selectedProvider) {
    for (const provider in settingsMap) {
      const section = settingsMap[provider].settingsDiv;
      if (!section) continue;
      section.style.display = provider === selectedProvider ? 'block' : 'none';
    }

    if (providerHelpText) {
      providerHelpText.textContent = registry?.getProviderHelper?.(selectedProvider) || '';
    }

    if (selectedProvider === 'ollama' && ollamaSuggestions) {
      const suggestions = registry?.providers?.ollama?.suggestedLocalModels || [];
      ollamaSuggestions.textContent = suggestions.length
        ? `Suggested local models: ${suggestions.join(', ')}`
        : '';
    }
  }

  function supportsModelSelection(provider) {
    return Boolean(registry?.supportsModelSelection?.(provider));
  }

  function setModelSelectorVisibility(provider) {
    if (!modelSelectionSection) return;
    modelSelectionSection.style.display = supportsModelSelection(provider) ? 'block' : 'none';
  }

  function formatModelOptionLabel(model) {
    const badge = String(model?.badge || '').trim();
    const label = String(model?.label || model?.id || '').trim();
    const id = String(model?.id || '').trim();
    const hasDistinctLabel = label && id && label.toLowerCase() !== id.toLowerCase();
    const baseLabel = hasDistinctLabel ? label : id;
    return badge ? `${baseLabel} - ${badge}` : baseLabel;
  }

  function populateModelOptions(provider, selectedModel) {
    if (!providerModelSelect) return;

    providerModelSelect.innerHTML = '';
    const groupedModels = registry?.getGroupedModels?.(provider) || {};
    let totalOptions = 0;

    for (const groupKey of PROVIDER_GROUP_ORDER) {
      const items = Array.isArray(groupedModels[groupKey]) ? groupedModels[groupKey] : [];
      if (items.length === 0) continue;

      const group = document.createElement('optgroup');
      group.label = GROUP_LABELS[groupKey] || 'Models';

      for (const item of items) {
        const option = document.createElement('option');
        option.value = item.id;
        option.textContent = formatModelOptionLabel(item);
        group.appendChild(option);
        totalOptions += 1;
      }

      providerModelSelect.appendChild(group);
    }

    if (totalOptions === 0) {
      return;
    }

    const modelIdList = registry?.getProviderModels?.(provider)?.map((item) => item.id) || [];
    const normalizedSelected = String(selectedModel || '').trim();

    if (normalizedSelected && modelIdList.includes(normalizedSelected)) {
      providerModelSelect.value = normalizedSelected;
      return;
    }

    if (normalizedSelected && !modelIdList.includes(normalizedSelected)) {
      const customOption = document.createElement('option');
      customOption.value = normalizedSelected;
      customOption.textContent = `${normalizedSelected} (custom)`;
      providerModelSelect.prepend(customOption);
      providerModelSelect.value = normalizedSelected;
      return;
    }

    providerModelSelect.value = modelIdList[0] || '';
  }

  function renderModelMeta(provider, modelId) {
    if (!modelMeta || !modelDisplayName || !modelBadge || !modelTags || !modelHelpText) {
      return;
    }

    const model = registry?.getModel?.(provider, modelId);
    if (!model) {
      modelMeta.style.display = 'none';
      modelHelpText.textContent = '';
      modelTags.innerHTML = '';
      return;
    }

    modelMeta.style.display = 'block';
    modelDisplayName.textContent = model.label || model.id;
    modelBadge.textContent = model.badge || 'Model';

    const providerHint = registry?.getProviderHelper?.(provider) || '';
    const modelHint = model.bestFor?.length ? `Best for: ${model.bestFor.join(', ')}` : '';
    modelHelpText.textContent = [providerHint, modelHint].filter(Boolean).join(' ');

    modelTags.innerHTML = '';
    const tags = [
      `Speed: ${model.speed || 'n/a'}`,
      `Cost: ${model.cost || 'n/a'}`,
      ...((model.bestFor || []).map((item) => `Use: ${item}`))
    ];

    for (const tagText of tags.slice(0, 4)) {
      const tag = document.createElement('span');
      tag.className = 'model-tag';
      tag.textContent = tagText;
      modelTags.appendChild(tag);
    }
  }

  function syncModelSelector(provider, selectedModel) {
    setModelSelectorVisibility(provider);
    if (!supportsModelSelection(provider)) {
      if (modelMeta) modelMeta.style.display = 'none';
      if (modelHelpText) modelHelpText.textContent = '';
      return;
    }

    populateModelOptions(provider, selectedModel);
    renderModelMeta(provider, providerModelSelect?.value || selectedModel || '');
  }

  function togglePasswordVisibility(input, button) {
    if (!input || !button) return;
    const toText = input.type === 'password';
    input.type = toText ? 'text' : 'password';
    button.textContent = toText ? 'Hide' : 'Show';
  }

  let statusTimeout = null;
  function showStatus(message, type) {
    clearTimeout(statusTimeout);
    statusEl.textContent = message;
    statusEl.className = `status ${type || ''}`;
    statusTimeout = setTimeout(() => {
      statusEl.textContent = '';
      statusEl.className = 'status';
    }, 4000);
  }

  function applySettingsToUI() {
    const provider = currentSettings.provider;
    aiProviderSelect.value = provider;

    settingsMap.gemini.apiKeyInput.value = currentSettings.apiKeys.gemini || '';
    settingsMap.openai.apiKeyInput.value = currentSettings.apiKeys.openai || '';
    settingsMap.claude.apiKeyInput.value = currentSettings.apiKeys.claude || '';
    settingsMap.openrouter.apiKeyInput.value = currentSettings.apiKeys.openrouter || '';

    toggleProviderPanels(provider);
    syncModelSelector(provider, currentSettings.models?.[provider]);
  }

  async function loadSettings() {
    try {
      const loaded = await settingsModule.loadSettings();
      currentSettings = settingsModule.normalizeSettings(loaded);
      applySettingsToUI();
    } catch (error) {
      showStatus(String(error?.message || 'Could not load settings'), 'error');
    }
  }

  async function saveSettings() {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    try {
      const provider = aiProviderSelect.value;
      const nextSettings = settingsModule.normalizeSettings({
        ...currentSettings,
        provider,
        apiKeys: {
          gemini: settingsMap.gemini.apiKeyInput?.value.trim() || '',
          openai: settingsMap.openai.apiKeyInput?.value.trim() || '',
          claude: settingsMap.claude.apiKeyInput?.value.trim() || '',
          openrouter: settingsMap.openrouter.apiKeyInput?.value.trim() || ''
        },
        models: {
          ...(currentSettings.models || {})
        }
      });

      if (supportsModelSelection(provider)) {
        const selectedModel = String(providerModelSelect?.value || '').trim();
        if (selectedModel) {
          nextSettings.models[provider] = selectedModel;
        }
      }

      const { settings: normalizedSettings, payload } = await settingsModule.saveSettings(nextSettings);
      currentSettings = normalizedSettings;

      showStatus('Settings saved successfully!', 'success');
      chrome.runtime.sendMessage({ action: 'settingsUpdated', settings: payload });
      applySettingsToUI();
    } catch (error) {
      showStatus(`Error: ${String(error?.message || error)}`, 'error');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Settings';
    }
  }

  darkModeToggle?.addEventListener('click', toggleDarkMode);

  aiProviderSelect?.addEventListener('change', () => {
    const selectedProvider = aiProviderSelect.value;
    currentSettings.provider = selectedProvider;
    toggleProviderPanels(selectedProvider);
    syncModelSelector(selectedProvider, currentSettings.models?.[selectedProvider]);
  });

  providerModelSelect?.addEventListener('change', () => {
    const selectedProvider = aiProviderSelect.value;
    if (!supportsModelSelection(selectedProvider)) return;

    const selectedModel = String(providerModelSelect.value || '').trim();
    if (!selectedModel) return;

    currentSettings.models[selectedProvider] = selectedModel;
    renderModelMeta(selectedProvider, selectedModel);
  });

  for (const provider of ['gemini', 'openai', 'claude', 'openrouter']) {
    const { apiKeyInput, showHideBtn } = settingsMap[provider];
    if (apiKeyInput && showHideBtn) {
      showHideBtn.addEventListener('click', () => togglePasswordVisibility(apiKeyInput, showHideBtn));
    }
  }

  saveBtn?.addEventListener('click', saveSettings);

  try {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', (event) => {
      chrome.storage.sync.get(['zeus_dark_mode_preference'], (data) => {
        if (data?.zeus_dark_mode_preference === undefined) {
          applyDarkMode(event.matches);
        }
      });
    });
  } catch (_) {
    // Ignore browser support edge cases.
  }

  initializeDarkMode();
  loadSettings();
});
