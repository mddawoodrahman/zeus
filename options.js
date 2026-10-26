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
  const contextAwareEnabledCheckbox = document.getElementById('contextAwareEnabled');
  const contextMaxTurnsSelect = document.getElementById('contextMaxTurns');
  const smartRouterSettingsDiv = document.getElementById('smart-router-settings');
  const smartRouterProfileSelect = document.getElementById('smartRouterProfile');
  const multimodalEnabledCheckbox = document.getElementById('multimodalEnabled');
  const visionOptimizationPresetSelect = document.getElementById('visionOptimizationPreset');
  const multimodalConfigsDiv = document.getElementById('multimodal-configs');
  const privacyModeEnabledCheckbox = document.getElementById('privacyModeEnabled');
  const privacyConfigsDiv = document.getElementById('privacy-configs');
  const privacyCatEmail = document.getElementById('privacy_cat_email');
  const privacyCatPhone = document.getElementById('privacy_cat_phone');
  const privacyCatCreditCard = document.getElementById('privacy_cat_creditCard');
  const privacyCatSsn = document.getElementById('privacy_cat_ssn');
  const privacyCatIp = document.getElementById('privacy_cat_ip');
  const privacyCatApiKey = document.getElementById('privacy_cat_apiKey');
  const privacyCatCustom = document.getElementById('privacy_cat_custom');
  const privacyAutoRestoreCheckbox = document.getElementById('privacyAutoRestore');
  const privacyCustomPatternsInput = document.getElementById('privacyCustomPatterns');
  const privacyTotalProtectedEl = document.getElementById('privacyTotalProtected');
  const btnResetPrivacyStats = document.getElementById('btn-reset-privacy-stats');
  const commandPaletteEnabledCheckbox = document.getElementById('commandPaletteEnabled');
  const commandPaletteShortcutInput = document.getElementById('commandPaletteShortcut');
  const keyboardShortcutsEnabledCheckbox = document.getElementById('keyboardShortcutsEnabled');

  copilotEnabledCheckbox?.addEventListener('change', () => {
    if (copilotConfigsDiv) {
      copilotConfigsDiv.style.display = copilotEnabledCheckbox.checked ? 'flex' : 'none';
    }
  });

  multimodalEnabledCheckbox?.addEventListener('change', () => {
    if (multimodalConfigsDiv) {
      multimodalConfigsDiv.style.display = multimodalEnabledCheckbox.checked ? 'flex' : 'none';
    }
  });

  privacyModeEnabledCheckbox?.addEventListener('change', () => {
    if (privacyConfigsDiv) {
      privacyConfigsDiv.style.display = privacyModeEnabledCheckbox.checked ? 'flex' : 'none';
    }
  });

  btnResetPrivacyStats?.addEventListener('click', async () => {
    try {
      await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'privacy:resetStats' }, resolve);
      });
      if (privacyTotalProtectedEl) privacyTotalProtectedEl.textContent = '0';
      writeToConsole('PRIVACY AUDIT STATS RESET.');
    } catch (_) {}
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
      } else if (targetId === 'presets-section') {
        loadAbExperiments();
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

    if (smartRouterSettingsDiv) {
      smartRouterSettingsDiv.style.display = selectedProvider === 'auto' ? 'block' : 'none';
    }

    if (providerHelpText) {
      providerHelpText.textContent = registry?.getProviderHelper?.(selectedProvider) || '';
    }

    if (selectedProvider === 'ollama' && ollamaSuggestions) {
      const suggestions = registry?.providers?.ollama?.suggestedLocalModels || [];
      ollamaSuggestions.textContent = suggestions.length
        ? `Suggested local models: ${suggestions.join(', ')}`
        : '';
    } else if (selectedProvider?.startsWith('custom') && providerHelpText) {
      providerHelpText.textContent = 'OpenAI-compatible custom endpoint runtime.';
    }
  }

  const customProvidersList = document.getElementById('custom-providers-list');
  const btnAddCustomProvider = document.getElementById('btnAddCustomProvider');
  const customProviderForm = document.getElementById('custom-provider-form');
  const customProviderId = document.getElementById('customProviderId');
  const customProviderName = document.getElementById('customProviderName');
  const customProviderModel = document.getElementById('customProviderModel');
  const customProviderBaseUrl = document.getElementById('customProviderBaseUrl');
  const customProviderApiKey = document.getElementById('customProviderApiKey');
  const btnSaveCustomProvider = document.getElementById('btnSaveCustomProvider');
  const btnCancelCustomProvider = document.getElementById('btnCancelCustomProvider');

  function syncCustomProviderSelectOptions() {
    if (!aiProviderSelect) return;
    const existing = aiProviderSelect.querySelectorAll('option[data-custom="true"]');
    existing.forEach(opt => opt.remove());

    const list = currentSettings.customProviders || [];
    list.forEach(cp => {
      const opt = document.createElement('option');
      opt.value = `custom-${cp.id}`;
      opt.textContent = `${cp.name} (Custom)`;
      opt.dataset.custom = 'true';
      aiProviderSelect.appendChild(opt);
    });
  }

  function renderCustomProvidersList() {
    if (!customProvidersList) return;
    customProvidersList.innerHTML = '';
    const list = currentSettings.customProviders || [];

    if (list.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.style.color = 'var(--text-muted)';
      emptyDiv.style.fontSize = '11px';
      emptyDiv.style.padding = '8px 0';
      emptyDiv.textContent = 'NO CUSTOM RUNTIMES CONFIGURED. CLICK + ADD PROVIDER TO CONFIGURE.';
      customProvidersList.appendChild(emptyDiv);
      return;
    }

    list.forEach(cp => {
      const item = document.createElement('div');
      item.className = 'custom-provider-item';
      item.style.cssText = 'display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); padding: 8px 12px; border-radius: 4px;';

      const info = document.createElement('div');
      info.style.cssText = 'display: flex; flex-direction: column; gap: 2px;';
      
      const title = document.createElement('span');
      title.style.cssText = 'font-weight: 600; font-size: 12px; color: var(--electric-cyan);';
      title.textContent = cp.name;

      const meta = document.createElement('span');
      meta.style.cssText = 'font-size: 10px; color: var(--text-muted); font-family: monospace;';
      meta.textContent = `${cp.baseUrl || cp.endpoint} | Model: ${cp.defaultModel || cp.model || 'auto'}`;

      info.appendChild(title);
      info.appendChild(meta);

      const actions = document.createElement('div');
      actions.style.cssText = 'display: flex; gap: 6px;';

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'zeus-btn zeus-btn-ghost';
      editBtn.style.cssText = 'padding: 3px 8px; font-size: 10px;';
      editBtn.textContent = 'EDIT';
      editBtn.addEventListener('click', () => {
        openCustomProviderForm(cp);
      });

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'zeus-btn zeus-btn-ghost';
      delBtn.style.cssText = 'padding: 3px 8px; font-size: 10px; color: var(--arasaka-red);';
      delBtn.textContent = 'DELETE';
      delBtn.addEventListener('click', async () => {
        if (confirm(`Remove custom runtime "${cp.name}"?`)) {
          const filtered = (currentSettings.customProviders || []).filter(item => item.id !== cp.id);
          currentSettings.customProviders = filtered;
          if (currentSettings.provider === `custom-${cp.id}` || currentSettings.provider === cp.id) {
            currentSettings.provider = 'gemini';
          }
          await saveSettings();
          renderCustomProvidersList();
          syncCustomProviderSelectOptions();
        }
      });

      actions.appendChild(editBtn);
      actions.appendChild(delBtn);

      item.appendChild(info);
      item.appendChild(actions);
      customProvidersList.appendChild(item);
    });
  }

  function openCustomProviderForm(cp = null) {
    if (!customProviderForm) return;
    customProviderForm.style.display = 'block';
    if (cp) {
      if (customProviderId) customProviderId.value = cp.id;
      if (customProviderName) customProviderName.value = cp.name;
      if (customProviderModel) customProviderModel.value = cp.defaultModel || cp.model || '';
      if (customProviderBaseUrl) customProviderBaseUrl.value = cp.baseUrl || cp.endpoint || '';
      if (customProviderApiKey) customProviderApiKey.value = cp.apiKey || '';
    } else {
      if (customProviderId) customProviderId.value = '';
      if (customProviderName) customProviderName.value = '';
      if (customProviderModel) customProviderModel.value = '';
      if (customProviderBaseUrl) customProviderBaseUrl.value = 'http://localhost:1234/v1';
      if (customProviderApiKey) customProviderApiKey.value = '';
    }
  }

  function closeCustomProviderForm() {
    if (customProviderForm) {
      customProviderForm.style.display = 'none';
    }
  }

  btnAddCustomProvider?.addEventListener('click', () => {
    openCustomProviderForm();
  });

  btnCancelCustomProvider?.addEventListener('click', () => {
    closeCustomProviderForm();
  });

  btnSaveCustomProvider?.addEventListener('click', async () => {
    const id = customProviderId?.value.trim() || `custom_${Date.now()}`;
    const name = customProviderName?.value.trim() || 'Custom Provider';
    const baseUrl = customProviderBaseUrl?.value.trim();
    const model = customProviderModel?.value.trim() || 'default';
    const apiKey = customProviderApiKey?.value.trim() || '';

    if (!baseUrl) {
      alert('Base URL is required.');
      return;
    }

    const providerObj = {
      id,
      name,
      baseUrl,
      defaultModel: model,
      apiKey
    };

    const list = [...(currentSettings.customProviders || [])];
    const existingIndex = list.findIndex(p => p.id === id);
    if (existingIndex >= 0) {
      list[existingIndex] = providerObj;
    } else {
      list.push(providerObj);
    }
    currentSettings.customProviders = list;

    closeCustomProviderForm();
    await saveSettings();
    renderCustomProvidersList();
    syncCustomProviderSelectOptions();
  });

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
    syncCustomProviderSelectOptions();
    renderCustomProvidersList();

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
    if (contextAwareEnabledCheckbox) {
      contextAwareEnabledCheckbox.checked = Boolean(currentSettings.contextAwareEnabled);
    }
    if (contextMaxTurnsSelect) {
      contextMaxTurnsSelect.value = String(currentSettings.contextMaxTurns || 4);
    }
    if (smartRouterProfileSelect) {
      smartRouterProfileSelect.value = currentSettings.smartRouterProfile || 'balanced';
    }
    if (multimodalEnabledCheckbox) {
      multimodalEnabledCheckbox.checked = currentSettings.multimodalEnabled !== false;
    }
    if (multimodalConfigsDiv) {
      multimodalConfigsDiv.style.display = currentSettings.multimodalEnabled !== false ? 'flex' : 'none';
    }
    if (visionOptimizationPresetSelect) {
      visionOptimizationPresetSelect.value = currentSettings.visionOptimizationPreset || 'auto';
    }

    if (privacyModeEnabledCheckbox) {
      privacyModeEnabledCheckbox.checked = Boolean(currentSettings.privacyModeEnabled);
    }
    if (privacyConfigsDiv) {
      privacyConfigsDiv.style.display = currentSettings.privacyModeEnabled ? 'flex' : 'none';
    }
    const cats = currentSettings.privacyCategories || {};
    if (privacyCatEmail) privacyCatEmail.checked = cats.email !== false;
    if (privacyCatPhone) privacyCatPhone.checked = cats.phone !== false;
    if (privacyCatCreditCard) privacyCatCreditCard.checked = cats.creditCard !== false;
    if (privacyCatSsn) privacyCatSsn.checked = cats.ssn !== false;
    if (privacyCatIp) privacyCatIp.checked = cats.ip !== false;
    if (privacyCatApiKey) privacyCatApiKey.checked = cats.apiKey !== false;
    if (privacyCatCustom) privacyCatCustom.checked = cats.custom !== false;
    if (privacyAutoRestoreCheckbox) {
      privacyAutoRestoreCheckbox.checked = currentSettings.privacyAutoRestore !== false;
    }
    if (privacyCustomPatternsInput) {
      privacyCustomPatternsInput.value = Array.isArray(currentSettings.privacyCustomPatterns)
        ? currentSettings.privacyCustomPatterns.join('\n')
        : '';
    }
    if (commandPaletteEnabledCheckbox) {
      commandPaletteEnabledCheckbox.checked = currentSettings.commandPaletteEnabled !== false;
    }
    if (commandPaletteShortcutInput) {
      commandPaletteShortcutInput.value = currentSettings.commandPaletteShortcut || 'Ctrl+K';
    }
    if (keyboardShortcutsEnabledCheckbox) {
      keyboardShortcutsEnabledCheckbox.checked = currentSettings.keyboardShortcutsEnabled !== false;
    }
    loadPrivacyStats();

    toggleProviderPanels(provider);
    syncModelSelector(provider, currentSettings.models?.[provider]);
    updateHealthIndicators();
  }

  function loadPrivacyStats() {
    chrome.runtime.sendMessage({ action: 'privacy:getStats' }, (response) => {
      if (privacyTotalProtectedEl) {
        const count = response?.stats?.totalRedacted || 0;
        privacyTotalProtectedEl.textContent = String(count);
      }
    });
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
        contextAwareEnabled: contextAwareEnabledCheckbox ? contextAwareEnabledCheckbox.checked : currentSettings.contextAwareEnabled,
        contextMaxTurns: contextMaxTurnsSelect ? (Number(contextMaxTurnsSelect.value) || 4) : currentSettings.contextMaxTurns,
        smartRouterProfile: smartRouterProfileSelect ? smartRouterProfileSelect.value : currentSettings.smartRouterProfile,
        multimodalEnabled: multimodalEnabledCheckbox ? multimodalEnabledCheckbox.checked : currentSettings.multimodalEnabled,
        visionOptimizationPreset: visionOptimizationPresetSelect ? visionOptimizationPresetSelect.value : currentSettings.visionOptimizationPreset,
        privacyModeEnabled: privacyModeEnabledCheckbox ? privacyModeEnabledCheckbox.checked : currentSettings.privacyModeEnabled,
        privacyCategories: {
          email: privacyCatEmail ? privacyCatEmail.checked : true,
          phone: privacyCatPhone ? privacyCatPhone.checked : true,
          creditCard: privacyCatCreditCard ? privacyCatCreditCard.checked : true,
          ssn: privacyCatSsn ? privacyCatSsn.checked : true,
          ip: privacyCatIp ? privacyCatIp.checked : true,
          apiKey: privacyCatApiKey ? privacyCatApiKey.checked : true,
          custom: privacyCatCustom ? privacyCatCustom.checked : true
        },
        privacyAutoRestore: privacyAutoRestoreCheckbox ? privacyAutoRestoreCheckbox.checked : true,
        privacyCustomPatterns: privacyCustomPatternsInput
          ? privacyCustomPatternsInput.value.split('\n').map((s) => s.trim()).filter(Boolean)
          : currentSettings.privacyCustomPatterns,
        privacyAuditLogEnabled: currentSettings.privacyAuditLogEnabled !== false,
        commandPaletteEnabled: commandPaletteEnabledCheckbox ? commandPaletteEnabledCheckbox.checked : currentSettings.commandPaletteEnabled,
        commandPaletteShortcut: commandPaletteShortcutInput ? commandPaletteShortcutInput.value.trim() : currentSettings.commandPaletteShortcut,
        keyboardShortcutsEnabled: keyboardShortcutsEnabledCheckbox ? keyboardShortcutsEnabledCheckbox.checked : currentSettings.keyboardShortcutsEnabled,
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

  // Preset Bundle Export and Import
  const exportPresetName = document.getElementById('exportPresetName');
  const exportPresetAuthor = document.getElementById('exportPresetAuthor');
  const exportPresetDesc = document.getElementById('exportPresetDesc');
  const btnExportPresetDownload = document.getElementById('btnExportPresetDownload');
  const btnExportPresetCopy = document.getElementById('btnExportPresetCopy');
  const presetFileInput = document.getElementById('presetFileInput');
  const presetJsonInput = document.getElementById('presetJsonInput');
  const btnImportPresetExecute = document.getElementById('btnImportPresetExecute');
  const presetImportFeedback = document.getElementById('presetImportFeedback');

  function getExportMetadata() {
    return {
      name: exportPresetName?.value.trim() || 'Team Presets',
      author: exportPresetAuthor?.value.trim() || 'Zeus Team',
      description: exportPresetDesc?.value.trim() || ''
    };
  }

  btnExportPresetDownload?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'presets:export', meta: getExportMetadata() }, (res) => {
      if (!res?.success || !res?.bundle) {
        showStatus('EXPORT FAILED', 'error');
        return;
      }
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(res.bundle, null, 2));
      const downloadAnchor = document.createElement('a');
      const filename = (res.bundle.meta?.name || 'zeus-presets').toLowerCase().replace(/[^a-z0-9_-]/g, '-') + '.json';
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', filename);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      writeToConsole(`PRESET BUNDLE EXPORTED: ${filename}`);
      showStatus('BUNDLE EXPORTED', 'success');
    });
  });

  btnExportPresetCopy?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'presets:export', meta: getExportMetadata() }, (res) => {
      if (!res?.success || !res?.bundle) {
        showStatus('EXPORT FAILED', 'error');
        return;
      }
      const jsonText = JSON.stringify(res.bundle, null, 2);
      if (navigator.clipboard) {
        navigator.clipboard.writeText(jsonText).then(() => {
          showStatus('COPIED TO CLIPBOARD', 'success');
          writeToConsole('PRESET BUNDLE COPIED TO CLIPBOARD.');
        });
      }
    });
  });

  presetFileInput?.addEventListener('change', (evt) => {
    const file = evt.target?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      if (presetJsonInput) {
        presetJsonInput.value = e.target?.result || '';
      }
    };
    reader.readAsText(file);
  });

  btnImportPresetExecute?.addEventListener('click', () => {
    const rawJson = presetJsonInput?.value.trim();
    if (!rawJson) {
      if (presetImportFeedback) {
        presetImportFeedback.style.color = 'var(--arasaka-red)';
        presetImportFeedback.textContent = 'NO JSON PAYLOAD DETECTED.';
      }
      return;
    }

    let parsedBundle;
    try {
      parsedBundle = JSON.parse(rawJson);
    } catch (e) {
      if (presetImportFeedback) {
        presetImportFeedback.style.color = 'var(--arasaka-red)';
        presetImportFeedback.textContent = `INVALID JSON: ${e.message}`;
      }
      return;
    }

    const mode = document.querySelector('input[name="importMergeMode"]:checked')?.value || 'merge';

    if (presetImportFeedback) {
      presetImportFeedback.style.color = 'var(--net-cyan)';
      presetImportFeedback.textContent = 'APPLYING PRESET PACK...';
    }

    chrome.runtime.sendMessage({ action: 'presets:import', bundle: parsedBundle, options: { mode } }, (res) => {
      if (res?.success) {
        const stats = res.stats || {};
        if (presetImportFeedback) {
          presetImportFeedback.style.color = 'var(--acid-green)';
          presetImportFeedback.textContent = `SUCCESS: Imported ${stats.transformsCount || 0} transforms, ${stats.promptsCount || 0} prompts, ${stats.customProvidersCount || 0} providers.`;
        }
        showStatus('PRESETS APPLIED', 'success');
        writeToConsole(`PRESET PACK IMPORTED (${mode.toUpperCase()})`);
        loadSettings();
      } else {
        if (presetImportFeedback) {
          presetImportFeedback.style.color = 'var(--arasaka-red)';
          presetImportFeedback.textContent = `ERROR: ${res?.error || 'Failed to apply presets.'}`;
        }
        showStatus('IMPORT FAILED', 'error');
      }
    });
  });

  // A/B Experiment History in Options
  const abExperimentsList = document.getElementById('ab-experiments-list');
  const btnClearExperimentsBtn = document.getElementById('btnClearExperimentsBtn');

  function loadAbExperiments() {
    if (!abExperimentsList) return;
    chrome.runtime.sendMessage({ action: 'ab:getExperiments' }, (res) => {
      const list = res?.experiments || [];
      abExperimentsList.innerHTML = '';
      if (list.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.style.color = 'var(--text-muted)';
        emptyDiv.style.fontSize = '11px';
        emptyDiv.style.padding = '8px 0';
        emptyDiv.textContent = 'NO A/B EXPERIMENTS RECORDED YET. RUN A/B COMPARISON IN SIDE PANEL.';
        abExperimentsList.appendChild(emptyDiv);
        return;
      }

      list.slice(0, 10).forEach((exp) => {
        const item = document.createElement('div');
        item.style.cssText = 'background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); padding: 8px 12px; border-radius: 4px; display: flex; justify-content: space-between; align-items: center;';
        
        const info = document.createElement('div');
        info.style.cssText = 'display: flex; flex-direction: column; gap: 2px;';
        
        const title = document.createElement('span');
        title.style.cssText = 'font-weight: 600; font-size: 12px; color: var(--net-cyan);';
        title.textContent = exp.title || 'Comparison Run';

        const stats = document.createElement('span');
        stats.style.cssText = 'font-size: 10px; color: var(--text-muted); font-family: monospace;';
        const delta = exp.comparison?.delta || 0;
        const sign = delta > 0 ? '+' : '';
        stats.textContent = `Delta: ${sign}${delta} pts | Winner: Variant ${exp.userWinner || exp.comparison?.winner || 'N/A'}`;

        info.appendChild(title);
        info.appendChild(stats);

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'zeus-btn zeus-btn-ghost';
        delBtn.style.cssText = 'padding: 2px 6px; font-size: 10px; color: var(--arasaka-red);';
        delBtn.textContent = '✕';
        delBtn.addEventListener('click', () => {
          chrome.runtime.sendMessage({ action: 'ab:deleteExperiment', id: exp.id }, () => {
            loadAbExperiments();
          });
        });

        item.appendChild(info);
        item.appendChild(delBtn);
        abExperimentsList.appendChild(item);
      });
    });
  }

  btnClearExperimentsBtn?.addEventListener('click', () => {
    if (confirm('Clear all A/B experiment history logs?')) {
      chrome.storage.local.set({ zeus_ab_experiments: [] }, () => {
        loadAbExperiments();
        writeToConsole('A/B EXPERIMENT HISTORY PURGED.');
      });
    }
  });

  // ---------------------------------------------------------------------------
  // Transforms HUD Management in Options
  // ---------------------------------------------------------------------------
  const transformsModule = globalThis.ZeusTransforms || null;
  const shortcutsModule = globalThis.ZeusShortcuts || null;
  const optionsTransformsList = document.getElementById('options-transforms-list');
  const btnOptionsAddTransform = document.getElementById('btnOptionsAddTransform');
  const btnOptionsSaveTransforms = document.getElementById('btnOptionsSaveTransforms');
  const optionsTransformsFeedback = document.getElementById('optionsTransformsFeedback');

  let optionsTransforms = [];
  let optionsRecorders = [];

  function setOptionsTransformsFeedback(text, color) {
    if (!optionsTransformsFeedback) return;
    optionsTransformsFeedback.textContent = text || '';
    optionsTransformsFeedback.style.color = color || 'var(--cyber-yellow)';
  }

  function renderOptionsTransforms() {
    if (!optionsTransformsList || !transformsModule || !shortcutsModule) return;

    optionsRecorders.forEach(entry => entry.destroy());
    optionsRecorders = [];
    optionsTransformsList.innerHTML = '';

    if (optionsTransforms.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'helper-text';
      empty.textContent = 'No transforms configured. Click NEW TRANSFORM to create one.';
      optionsTransformsList.appendChild(empty);
      return;
    }

    optionsTransforms.forEach((transform, index) => {
      const card = document.createElement('div');
      card.className = 'transform-card';
      card.style.cssText = 'background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); padding: 12px; border-radius: 4px; display: flex; flex-direction: column; gap: 8px;';

      const topRow = document.createElement('div');
      topRow.style.cssText = 'display: flex; justify-content: space-between; align-items: center; gap: 10px;';

      const titleWrap = document.createElement('div');
      titleWrap.style.cssText = 'display: flex; align-items: center; gap: 8px; flex: 1;';

      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'zeus-input';
      nameInput.value = transform.name || '';
      nameInput.placeholder = 'Transform Name';
      nameInput.style.cssText = 'font-weight: 600; font-family: Orbitron, sans-serif; font-size: 11px; max-width: 200px;';
      nameInput.addEventListener('input', (e) => {
        optionsTransforms[index].name = e.target.value.trim();
      });

      const builtinBadge = document.createElement('span');
      if (transform.builtin) {
        builtinBadge.textContent = 'BUILTIN';
        builtinBadge.style.cssText = 'font-size: 9px; padding: 1px 6px; border-radius: 2px; background: rgba(0,255,255,0.15); color: var(--net-cyan); font-family: monospace;';
      }

      titleWrap.appendChild(nameInput);
      if (transform.builtin) titleWrap.appendChild(builtinBadge);

      const shortcutWrap = document.createElement('div');
      shortcutWrap.style.cssText = 'display: flex; align-items: center; gap: 6px;';

      const shortcutLabel = document.createElement('span');
      shortcutLabel.textContent = 'KEY:';
      shortcutLabel.style.cssText = 'font-size: 10px; color: var(--text-muted); font-family: monospace;';

      const shortcutBox = document.createElement('div');
      shortcutBox.className = 'zeus-input';
      shortcutBox.style.cssText = 'cursor: pointer; text-align: center; font-size: 11px; font-family: monospace; min-width: 140px; padding: 4px 8px;';

      const recorder = shortcutsModule.createRecorder(shortcutBox, {
        onCommit: (combo) => {
          optionsTransforms[index].shortcut = combo;
          const duplicate = shortcutsModule.findDuplicateShortcut(optionsTransforms, combo, transform.id);
          if (duplicate) {
            setOptionsTransformsFeedback(`Warning: "${combo}" collides with "${duplicate.name}". Duplicate will be unbound on save.`, 'var(--arasaka-red)');
          } else {
            setOptionsTransformsFeedback(`Shortcut set: ${shortcutsModule.formatCombo(combo) || 'None'}`, 'var(--acid-green)');
          }
        },
        onReject: (reason) => {
          setOptionsTransformsFeedback(reason, 'var(--arasaka-red)');
        }
      });
      recorder.setCombo(transform.shortcut || '');
      optionsRecorders.push(recorder);

      const clearShortcutBtn = document.createElement('button');
      clearShortcutBtn.type = 'button';
      clearShortcutBtn.className = 'zeus-btn zeus-btn-ghost';
      clearShortcutBtn.style.cssText = 'padding: 2px 6px; font-size: 10px; color: var(--text-muted);';
      clearShortcutBtn.textContent = 'CLR';
      clearShortcutBtn.title = 'Clear shortcut';
      clearShortcutBtn.addEventListener('click', () => {
        recorder.setCombo('');
        optionsTransforms[index].shortcut = '';
        setOptionsTransformsFeedback('Shortcut cleared. Remember to save.', 'var(--cyber-yellow)');
      });

      shortcutWrap.appendChild(shortcutLabel);
      shortcutWrap.appendChild(shortcutBox);
      shortcutWrap.appendChild(clearShortcutBtn);

      const enabledLabel = document.createElement('label');
      enabledLabel.style.cssText = 'font-size: 10px; font-family: monospace; display: flex; align-items: center; gap: 4px; cursor: pointer;';
      const enabledCheckbox = document.createElement('input');
      enabledCheckbox.type = 'checkbox';
      enabledCheckbox.checked = transform.enabled !== false;
      enabledCheckbox.addEventListener('change', (e) => {
        optionsTransforms[index].enabled = e.target.checked;
      });
      enabledLabel.appendChild(enabledCheckbox);
      enabledLabel.appendChild(document.createTextNode('ACTIVE'));

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'zeus-btn zeus-btn-ghost';
      delBtn.style.cssText = 'padding: 2px 8px; font-size: 11px; color: var(--arasaka-red);';
      delBtn.textContent = '✕';
      delBtn.title = transform.builtin ? 'Built-in transforms cannot be deleted' : 'Delete transform';
      if (transform.builtin) {
        delBtn.disabled = true;
        delBtn.style.opacity = '0.3';
      } else {
        delBtn.addEventListener('click', () => {
          optionsTransforms.splice(index, 1);
          renderOptionsTransforms();
          setOptionsTransformsFeedback('Transform removed. Remember to save.', 'var(--cyber-yellow)');
        });
      }

      topRow.appendChild(titleWrap);
      topRow.appendChild(shortcutWrap);
      topRow.appendChild(enabledLabel);
      topRow.appendChild(delBtn);

      const instructionArea = document.createElement('textarea');
      instructionArea.className = 'zeus-input';
      instructionArea.rows = 2;
      instructionArea.placeholder = 'System instructions for prompt rewriting...';
      instructionArea.value = transform.instruction || '';
      instructionArea.style.cssText = 'font-family: monospace; font-size: 11px; resize: vertical;';
      instructionArea.addEventListener('input', (e) => {
        optionsTransforms[index].instruction = e.target.value;
      });

      card.appendChild(topRow);
      card.appendChild(instructionArea);
      optionsTransformsList.appendChild(card);
    });
  }

  async function loadOptionsTransforms() {
    if (!transformsModule) return;
    try {
      optionsTransforms = await transformsModule.loadTransforms();
      renderOptionsTransforms();
    } catch (err) {
      setOptionsTransformsFeedback('Failed to load transforms.', 'var(--arasaka-red)');
    }
  }

  btnOptionsAddTransform?.addEventListener('click', () => {
    if (!transformsModule) return;
    const newId = transformsModule.createTransformId('Custom');
    optionsTransforms.push({
      id: newId,
      name: 'Custom Transform',
      description: '',
      instruction: 'Rewrite this prompt to be clear, precise, and structured.',
      template: '',
      variables: [],
      shortcut: '',
      enabled: true,
      builtin: false
    });
    renderOptionsTransforms();
    setOptionsTransformsFeedback('New transform added. Configure and click SAVE.', 'var(--cyber-yellow)');
  });

  btnOptionsSaveTransforms?.addEventListener('click', async () => {
    if (!transformsModule) return;
    try {
      optionsTransforms = await transformsModule.saveTransforms(optionsTransforms);
      renderOptionsTransforms();
      setOptionsTransformsFeedback('TRANSFORMS SAVED SUCCESSFULLY', 'var(--acid-green)');
      writeToConsole('TRANSFORMS STORE SYNCHRONIZED.');
    } catch (err) {
      setOptionsTransformsFeedback(err.message || 'Failed to save transforms.', 'var(--arasaka-red)');
    }
  });

  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area === 'sync' && changes.zeus_transforms) {
      loadOptionsTransforms();
    }
  });

  loadSettings();
  loadAbExperiments();
  loadOptionsTransforms();
  writeToConsole('NEURAL CONTROL LINK ESTABLISHED.');
});
