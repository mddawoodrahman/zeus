document.addEventListener('DOMContentLoaded', () => {
  const registry = globalThis.ZeusModelRegistry || null;
  const settingsModule = globalThis.ZeusSettings;

  const aiProviderSelect = document.getElementById('aiProvider');
  const modelSelectionSection = document.getElementById('model-selection');
  const providerModelSelect = document.getElementById('providerModel');
  const modelPicker = document.getElementById('modelPicker');
  const modelPickerTrigger = document.getElementById('modelPickerTrigger');
  const modelPickerPanel = document.getElementById('modelPickerPanel');
  const modelSearchInput = document.getElementById('modelSearchInput');
  const modelOptionGroups = document.getElementById('modelOptionGroups');
  const modelEmptyState = document.getElementById('modelEmptyState');
  const selectedModelText = document.getElementById('selectedModelText');
  const selectedModelBadge = document.getElementById('selectedModelBadge');
  const providerHelpText = document.getElementById('provider-help-text');
  const modelHelpText = document.getElementById('model-help-text');
  const modelMeta = document.getElementById('model-meta');
  const modelDisplayName = document.getElementById('model-display-name');
  const modelBadge = document.getElementById('model-badge');
  const modelTags = document.getElementById('model-tags');
  const ollamaSuggestions = document.getElementById('ollama-suggestions');
  const saveBtn = document.getElementById('saveBtn');
  const resetBtn = document.getElementById('resetBtn');
  const statusEl = document.getElementById('status');
  const optionsConsole = document.getElementById('optionsConsole');
  const clearTelemetryBtn = document.getElementById('clearTelemetryBtn');
  const sidePanelEnabledCheckbox = document.getElementById('sidePanelEnabled');
  const copilotEnabledCheckbox = document.getElementById('copilotEnabled');
  const copilotConfigsDiv = document.getElementById('copilot-configs');
  const copilotProviderSelect = document.getElementById('copilotProvider');
  const copilotModeSelect = document.getElementById('copilotMode');
  const copilotMaxTokensInput = document.getElementById('copilotMaxTokens');

  copilotEnabledCheckbox?.addEventListener('change', () => {
    if (copilotConfigsDiv) {
      copilotConfigsDiv.style.display = copilotEnabledCheckbox.checked ? 'flex' : 'none';
    }
  });

  // Sidebar navigation toggling
  const navItems = document.querySelectorAll('.options-nav-item');
  const sections = document.querySelectorAll('.options-section');

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      navItems.forEach(nav => nav.classList.remove('active'));
      sections.forEach(sec => sec.style.display = 'none');

      item.classList.add('active');
      const targetId = item.dataset.target;
      const targetSection = document.getElementById(targetId);
      if (targetSection) {
        targetSection.style.display = 'flex';
      }

      if (targetId === 'telemetry-section') {
        loadTelemetryData();
      }
    });
  });

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

  function setModelPickerOpen(isOpen) {
    if (!modelPicker || !modelPickerPanel || !modelPickerTrigger) return;

    modelPicker.classList.toggle('open', Boolean(isOpen));
    modelPickerPanel.hidden = !isOpen;
    modelPickerTrigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');

    if (isOpen && modelSearchInput) {
      modelSearchInput.focus();
      modelSearchInput.select();
    }
  }

  function updateSelectedModelHeader(provider, modelId) {
    if (!selectedModelText || !selectedModelBadge) return;

    const model = registry?.getModel?.(provider, modelId);
    if (model) {
      selectedModelText.textContent = formatModelOptionLabel(model);
      selectedModelBadge.textContent = model.badge || '';
      selectedModelBadge.style.display = model.badge ? 'inline-flex' : 'none';
      return;
    }

    const normalized = String(modelId || '').trim();
    selectedModelText.textContent = normalized ? `${normalized} (custom)` : 'Select a model';
    selectedModelBadge.style.display = 'none';
  }

  function syncSelectedModelOptionState(modelId) {
    if (!modelOptionGroups) return;

    const normalized = String(modelId || '').trim();
    const options = modelOptionGroups.querySelectorAll('.model-option');

    for (const option of options) {
      const selected = String(option.dataset.value || '') === normalized;
      option.classList.toggle('is-selected', selected);
      option.setAttribute('aria-selected', selected ? 'true' : 'false');
    }
  }

  function applyModelSearchFilter() {
    if (!modelOptionGroups) return;

    const query = String(modelSearchInput?.value || '').trim().toLowerCase();
    const groups = modelOptionGroups.querySelectorAll('.model-option-group');
    let visibleOptionCount = 0;

    for (const group of groups) {
      const options = group.querySelectorAll('.model-option');
      let visibleInGroup = 0;

      for (const option of options) {
        const haystack = String(option.dataset.search || '').toLowerCase();
        const match = !query || haystack.includes(query);
        option.hidden = !match;
        if (match) {
          visibleInGroup += 1;
          visibleOptionCount += 1;
        }
      }

      group.hidden = visibleInGroup === 0;
    }

    if (modelEmptyState) {
      modelEmptyState.hidden = visibleOptionCount > 0;
    }
  }

  function toggleProviderPanels(selectedProvider) {
    for (const provider in settingsMap) {
      const section = settingsMap[provider].settingsDiv;
      if (!section) continue;
      section.style.display = (provider === selectedProvider || provider === 'gemini' || provider === 'openai' || provider === 'claude' || provider === 'openrouter') ? 'block' : 'none';
    }

    // Toggle specific local ollama/auto config cards visibility
    const localOllamaCard = document.getElementById('ollama-settings');
    if (localOllamaCard) {
      localOllamaCard.style.display = selectedProvider === 'ollama' ? 'block' : 'none';
    }

    const autoRoutingCard = document.getElementById('auto-settings');
    if (autoRoutingCard) {
      autoRoutingCard.style.display = selectedProvider === 'auto' ? 'block' : 'none';
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

  function createModelOptionButton(provider, model) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'model-option';
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', 'false');
    button.dataset.value = model.id;
    button.dataset.search = [
      model.id,
      model.label,
      model.badge,
      model.speed,
      model.cost,
      ...(Array.isArray(model.bestFor) ? model.bestFor : [])
    ].join(' ').toLowerCase();

    const label = document.createElement('span');
    label.className = 'model-option-label';
    label.textContent = model.label || model.id;

    const meta = document.createElement('span');
    meta.className = 'model-option-meta';
    meta.textContent = [model.badge, model.speed, model.cost]
      .filter(Boolean)
      .join(' • ');

    button.appendChild(label);
    button.appendChild(meta);

    button.addEventListener('click', () => {
      providerModelSelect.value = model.id;
      currentSettings.models[provider] = model.id;
      syncSelectedModelOptionState(model.id);
      updateSelectedModelHeader(provider, model.id);
      renderModelMeta(provider, model.id);
      setModelPickerOpen(false);
    });

    return button;
  }

  function populateModelOptions(provider, selectedModel) {
    if (!providerModelSelect || !modelOptionGroups) return;

    providerModelSelect.innerHTML = '';
    modelOptionGroups.innerHTML = '';
    const groupedModels = registry?.getGroupedModels?.(provider) || {};
    let totalOptions = 0;
    const allModelIds = [];

    function appendHiddenOption(value, text) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = text;
      providerModelSelect.appendChild(option);
    }

    for (const groupKey of PROVIDER_GROUP_ORDER) {
      const items = Array.isArray(groupedModels[groupKey]) ? groupedModels[groupKey] : [];
      if (items.length === 0) continue;

      const group = document.createElement('div');
      group.className = 'model-option-group';

      const groupTitle = document.createElement('div');
      groupTitle.className = 'model-option-group-title';
      groupTitle.textContent = GROUP_LABELS[groupKey] || 'Models';
      group.appendChild(groupTitle);

      for (const item of items) {
        appendHiddenOption(item.id, formatModelOptionLabel(item));
        allModelIds.push(item.id);
        group.appendChild(createModelOptionButton(provider, item));
        totalOptions += 1;
      }

      modelOptionGroups.appendChild(group);
    }

    if (totalOptions === 0) {
      updateSelectedModelHeader(provider, '');
      return;
    }

    const modelIdList = allModelIds;
    const normalizedSelected = String(selectedModel || '').trim();

    if (normalizedSelected && modelIdList.includes(normalizedSelected)) {
      providerModelSelect.value = normalizedSelected;
    } else if (normalizedSelected && !modelIdList.includes(normalizedSelected)) {
      appendHiddenOption(normalizedSelected, `${normalizedSelected} (custom)`);
      providerModelSelect.value = normalizedSelected;
    } else {
      providerModelSelect.value = modelIdList[0] || '';
    }

    if (modelSearchInput) {
      modelSearchInput.value = '';
    }

    syncSelectedModelOptionState(providerModelSelect.value);
    updateSelectedModelHeader(provider, providerModelSelect.value);
    applyModelSearchFilter();
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
      setModelPickerOpen(false);
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

  function updateHealthIndicators() {
    ['gemini', 'openai', 'claude', 'openrouter'].forEach(provider => {
      const keyVal = settingsMap[provider].apiKeyInput?.value.trim() || '';
      const healthEl = document.getElementById(`health-${provider}`);
      if (healthEl) {
        healthEl.className = 'provider-health-indicator ' + (keyVal ? 'online' : 'offline');
      }
    });
  }

  function applySettingsToUI() {
    const provider = currentSettings.provider;
    aiProviderSelect.value = provider;

    settingsMap.gemini.apiKeyInput.value = currentSettings.apiKeys.gemini || '';
    settingsMap.openai.apiKeyInput.value = currentSettings.apiKeys.openai || '';
    settingsMap.claude.apiKeyInput.value = currentSettings.apiKeys.claude || '';
    settingsMap.openrouter.apiKeyInput.value = currentSettings.apiKeys.openrouter || '';

    const ollamaModelInput = document.getElementById('ollamaModel');
    if (ollamaModelInput) {
      ollamaModelInput.value = currentSettings.ollama?.model || '';
    }

    if (sidePanelEnabledCheckbox) {
      sidePanelEnabledCheckbox.checked = Boolean(currentSettings.sidePanelEnabled);
    }
    if (copilotEnabledCheckbox) {
      copilotEnabledCheckbox.checked = Boolean(currentSettings.copilotEnabled);
    }
    if (copilotConfigsDiv) {
      copilotConfigsDiv.style.display = currentSettings.copilotEnabled ? 'flex' : 'none';
    }
    if (copilotProviderSelect) {
      copilotProviderSelect.value = currentSettings.copilotProvider || 'auto';
    }
    if (copilotModeSelect) {
      copilotModeSelect.value = currentSettings.copilotMode || 'conservative';
    }
    if (copilotMaxTokensInput) {
      copilotMaxTokensInput.value = currentSettings.copilotMaxTokens || 60;
    }

    toggleProviderPanels(provider);
    syncModelSelector(provider, currentSettings.models?.[provider]);
    updateHealthIndicators();
  }

  async function loadSettings() {
    try {
      const loaded = await settingsModule.loadSettings();
      currentSettings = settingsModule.normalizeSettings(loaded);
      applySettingsToUI();
    } catch (error) {
      showStatus('LINK FAILURE', 'error');
    }
  }

  async function saveSettings() {
    saveBtn.disabled = true;
    saveBtn.textContent = 'EXECUTING CONFIG...';

    try {
      const provider = aiProviderSelect.value;
      const nextSettings = settingsModule.normalizeSettings({
        ...currentSettings,
        provider,
        sidePanelEnabled: sidePanelEnabledCheckbox ? sidePanelEnabledCheckbox.checked : currentSettings.sidePanelEnabled,
        copilotEnabled: copilotEnabledCheckbox ? copilotEnabledCheckbox.checked : currentSettings.copilotEnabled,
        copilotProvider: copilotProviderSelect ? copilotProviderSelect.value : currentSettings.copilotProvider,
        copilotMode: copilotModeSelect ? copilotModeSelect.value : currentSettings.copilotMode,
        copilotMaxTokens: copilotMaxTokensInput ? (Number(copilotMaxTokensInput.value) || 60) : currentSettings.copilotMaxTokens,
        apiKeys: {
          gemini: settingsMap.gemini.apiKeyInput?.value.trim() || '',
          openai: settingsMap.openai.apiKeyInput?.value.trim() || '',
          claude: settingsMap.claude.apiKeyInput?.value.trim() || '',
          openrouter: settingsMap.openrouter.apiKeyInput?.value.trim() || ''
        },
        models: {
          ...(currentSettings.models || {})
        },
        ollama: {
          model: document.getElementById('ollamaModel')?.value.trim() || ''
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

      showStatus('INJECTION COMPLETE', 'success');
      chrome.runtime.sendMessage({ action: 'settingsUpdated', settings: payload });
      applySettingsToUI();
      writeToConsole('CONFIG SUCCESFULLY UPDATED. SETTINGS COMMITTED TO LOCAL SYNC.');
    } catch (error) {
      showStatus('LINK FAILURE', 'error');
      writeToConsole('ERROR: FAILED TO COMMIT CONFIG.');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'EXECUTE CONFIG';
    }
  }

  function writeToConsole(message) {
    if (!optionsConsole) return;
    const timestamp = new Date().toISOString().substring(11, 19);
    optionsConsole.textContent = `[${timestamp}] ${message}\n` + optionsConsole.textContent;
  }

  function loadTelemetryData() {
    chrome.storage.local.get(['zeus_last_latency'], (data) => {
      const latVal = data?.zeus_last_latency;
      const latEl = document.getElementById('telemetryLatency');
      if (latEl) {
        latEl.textContent = (latVal !== undefined && latVal !== null) ? latVal : '--';
      }
    });

    chrome.runtime.sendMessage({ action: 'getTelemetrySummary' }, (response) => {
      const summary = response?.summary || { totalEvents: 0, recent: [] };
      const fallbackCount = summary.totalEvents || 0;
      
      const fallbacksEl = document.getElementById('telemetryFallbacks');
      if (fallbacksEl) {
        fallbacksEl.textContent = fallbackCount;
      }

      const listEl = document.getElementById('telemetryEventList');
      if (listEl) {
        listEl.innerHTML = '';
        const recentEvents = summary.recent || [];

        if (recentEvents.length === 0) {
          const emptyLi = document.createElement('li');
          emptyLi.style.color = 'var(--text-muted)';
          emptyLi.textContent = 'NO EVENTS LOGGED IN TELEMETRY DATABASE.';
          listEl.appendChild(emptyLi);
        } else {
          recentEvents.forEach(evt => {
            const li = document.createElement('li');
            const isError = evt.payload?.reason || evt.payload?.stage === 'provider-candidate-error';
            li.style.color = isError ? 'var(--arasaka-red)' : 'var(--net-cyan)';
            
            const timeStr = evt.at ? evt.at.substring(11, 19) : '--:--:--';
            const cat = evt.type ? evt.type.toUpperCase() : 'EVENT';
            const details = [
              evt.payload?.provider ? `PROVIDER: ${evt.payload.provider}` : '',
              evt.payload?.fromModel ? `MODEL: ${evt.payload.fromModel}` : '',
              evt.payload?.reason ? `REASON: ${evt.payload.reason}` : ''
            ].filter(Boolean).join(' | ');

            li.textContent = `[${timeStr}] [${cat}] ${details}`;
            listEl.appendChild(li);
          });
        }
      }
    });
  }

  aiProviderSelect?.addEventListener('change', () => {
    const selectedProvider = aiProviderSelect.value;
    currentSettings.provider = selectedProvider;
    setModelPickerOpen(false);
    toggleProviderPanels(selectedProvider);
    syncModelSelector(selectedProvider, currentSettings.models?.[selectedProvider]);
    writeToConsole(`ROUTING PATH CHANGED TO: ${selectedProvider.toUpperCase()}`);
  });

  modelPickerTrigger?.addEventListener('click', () => {
    setModelPickerOpen(Boolean(modelPickerPanel?.hidden));
  });

  modelPickerTrigger?.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setModelPickerOpen(true);
    }
  });

  modelSearchInput?.addEventListener('input', () => {
    applyModelSearchFilter();
  });

  document.addEventListener('click', (event) => {
    if (!modelPicker || modelPickerPanel?.hidden) {
      return;
    }

    if (!modelPicker.contains(event.target)) {
      setModelPickerOpen(false);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modelPickerPanel?.hidden) {
      setModelPickerOpen(false);
      modelPickerTrigger?.focus();
    }
  });

  providerModelSelect?.addEventListener('change', () => {
    const selectedProvider = aiProviderSelect.value;
    if (!supportsModelSelection(selectedProvider)) return;

    const selectedModel = String(providerModelSelect.value || '').trim();
    if (!selectedModel) return;

    currentSettings.models[selectedProvider] = selectedModel;
    renderModelMeta(selectedProvider, selectedModel);
    writeToConsole(`MODEL SELECTION RECONFIGURED: ${selectedModel}`);
  });

  for (const provider of ['gemini', 'openai', 'claude', 'openrouter']) {
    const { apiKeyInput, showHideBtn } = settingsMap[provider];
    if (apiKeyInput && showHideBtn) {
      showHideBtn.addEventListener('click', () => togglePasswordVisibility(apiKeyInput, showHideBtn));
    }
  }

  saveBtn?.addEventListener('click', saveSettings);

  resetBtn?.addEventListener('click', async () => {
    if (confirm('Are you sure you want to PURGE all access tokens and restore default configuration?')) {
      try {
        const defaults = settingsModule.createDefaultSettings();
        await settingsModule.saveSettings(defaults);
        currentSettings = defaults;
        applySettingsToUI();
        showStatus('DATA PURGED', 'success');
        writeToConsole('SYSTEM RESET INITIATED. CONFIG CLEANED.');
        chrome.runtime.sendMessage({ action: 'settingsUpdated', settings: defaults });
      } catch (error) {
        showStatus('PURGE FAILED', 'error');
      }
    }
  });

  clearTelemetryBtn?.addEventListener('click', () => {
    if (confirm('Are you sure you want to purge all telemetry logs?')) {
      chrome.runtime.sendMessage({ action: 'clearTelemetry' }, (res) => {
        if (res?.success) {
          writeToConsole('TELEMETRY EVENT HISTORY PURGED.');
          loadTelemetryData();
        }
      });
    }
  });

  loadSettings();
  writeToConsole('NEURAL CONTROL LINK ESTABLISHED.');
});
