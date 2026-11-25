document.addEventListener('DOMContentLoaded', () => {
  const popupRoot = document.querySelector('.zeus-popup');
  if (popupRoot?.dataset?.zeusBound === 'true') return;
  if (popupRoot) popupRoot.dataset.zeusBound = 'true';

  const registry = globalThis.ZeusModelRegistry || null;
  function getSettingsModule() {
    return globalThis.ZeusSettingsStore || globalThis.ZeusSettings || null;
  }
  const settingsModule = getSettingsModule();

  const CLOUD_PROVIDERS = ['gemini', 'openai', 'claude', 'openrouter'];
  const ALL_READINESS_PROVIDERS = ['gemini', 'openai', 'claude', 'openrouter', 'ollama'];

  const PROVIDER_LABELS = {
    gemini: 'Gemini',
    openai: 'OpenAI',
    claude: 'Claude',
    openrouter: 'OpenRouter',
    ollama: 'Ollama',
    auto: 'Auto'
  };

  const FIELD_LABELS = {
    provider: 'Provider',
    ollamaHost: 'Ollama Host',
    ollamaModel: 'Ollama Model',
    sidePanelEnabled: 'Side Panel toggle',
    copilotEnabled: 'Copilot toggle',
    'apiKey:gemini': 'Gemini API key draft',
    'apiKey:openai': 'OpenAI API key draft',
    'apiKey:claude': 'Claude API key draft',
    'apiKey:openrouter': 'OpenRouter API key draft',
    'model:gemini': 'Gemini model',
    'model:openai': 'OpenAI model',
    'model:claude': 'Claude model',
    'model:openrouter': 'OpenRouter model'
  };

  const CODE_TO_LABEL = {
    NOT_CONFIGURED: 'Not configured',
    AUTH_FAILED: 'Authentication failed',
    AUTHENTICATION_ERROR: 'Authentication failed',
    AUTHORIZATION_ERROR: 'Authentication failed',
    RATE_LIMITED: 'Rate limited',
    RATE_LIMIT_ERROR: 'Rate limited',
    QUOTA_EXCEEDED: 'Quota exceeded',
    NETWORK_UNAVAILABLE: 'Network unavailable',
    NETWORK_ERROR: 'Network unavailable',
    TIMEOUT: 'Network unavailable',
    PROVIDER_UNAVAILABLE: 'Provider unavailable',
    SERVER_ERROR: 'Provider unavailable',
    MODEL_UNAVAILABLE: 'Provider unavailable',
    MODEL_NOT_FOUND: 'Provider unavailable',
    OLLAMA_ORIGIN_BLOCKED: 'Origin blocked',
    INVALID_REQUEST: 'Request failed',
    UNKNOWN_ERROR: 'Request failed'
  };

  const STATE_TO_LABEL = {
    not_configured: 'Not configured',
    configured_untested: 'Configured, not tested',
    testing: 'Testing',
    verified: 'Connection verified',
    error: 'Request failed'
  };

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
  const keySection = document.getElementById('key-section');
  const ollamaHostInput = document.getElementById('ollamaHost');
  const ollamaModelInput = document.getElementById('ollamaModel');
  const ollamaSuggestions = document.getElementById('ollama-suggestions');
  const ollamaDiscoveredModels = document.getElementById('ollamaDiscoveredModels');
  const testOllamaBtn = document.getElementById('testOllamaBtn');
  const detectOllamaModelsBtn = document.getElementById('detectOllamaModelsBtn');
  const autoReadinessList = document.getElementById('autoReadinessList');
  const saveBtn = document.getElementById('saveBtn');
  const resetBtn = document.getElementById('resetBtn');
  const statusEl = document.getElementById('status');
  const sidePanelEnabledCheckbox = document.getElementById('sidePanelEnabled');
  const copilotEnabledCheckbox = document.getElementById('copilotEnabled');
  const openOptionsBtn = document.getElementById('openOptionsBtn');

  const popupReadinessBadge = document.getElementById('popupReadinessBadge');
  const popupStatusText = document.getElementById('popupStatusText');
  const activeReadinessPill = document.getElementById('activeReadinessPill');
  const activeReadinessDetail = document.getElementById('activeReadinessDetail');
  const testActiveConnectionBtn = document.getElementById('testActiveConnectionBtn');

  const syncNotice = document.getElementById('syncNotice');
  const syncNoticeText = document.getElementById('syncNoticeText');
  const syncReloadBtn = document.getElementById('syncReloadBtn');
  const syncDismissBtn = document.getElementById('syncDismissBtn');

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
      showHideBtn: document.getElementById('showHideGemini'),
      keyStatusBadge: document.getElementById('geminiKeyStatus'),
      saveKeyBtn: document.getElementById('saveGeminiKeyBtn'),
      removeKeyBtn: document.getElementById('removeGeminiKeyBtn'),
      testBtn: document.getElementById('testGeminiBtn'),
      readinessPill: document.getElementById('readiness-gemini'),
      readinessDetail: document.getElementById('readiness-detail-gemini')
    },
    openai: {
      settingsDiv: document.getElementById('openai-settings'),
      apiKeyInput: document.getElementById('openaiApiKey'),
      showHideBtn: document.getElementById('showHideOpenAI'),
      keyStatusBadge: document.getElementById('openaiKeyStatus'),
      saveKeyBtn: document.getElementById('saveOpenAIKeyBtn'),
      removeKeyBtn: document.getElementById('removeOpenAIKeyBtn'),
      testBtn: document.getElementById('testOpenAIBtn'),
      readinessPill: document.getElementById('readiness-openai'),
      readinessDetail: document.getElementById('readiness-detail-openai')
    },
    claude: {
      settingsDiv: document.getElementById('claude-settings'),
      apiKeyInput: document.getElementById('claudeApiKey'),
      showHideBtn: document.getElementById('showHideClaude'),
      keyStatusBadge: document.getElementById('claudeKeyStatus'),
      saveKeyBtn: document.getElementById('saveClaudeKeyBtn'),
      removeKeyBtn: document.getElementById('removeClaudeKeyBtn'),
      testBtn: document.getElementById('testClaudeBtn'),
      readinessPill: document.getElementById('readiness-claude'),
      readinessDetail: document.getElementById('readiness-detail-claude')
    },
    openrouter: {
      settingsDiv: document.getElementById('openrouter-settings'),
      apiKeyInput: document.getElementById('openrouterApiKey'),
      showHideBtn: document.getElementById('showHideOpenRouter'),
      keyStatusBadge: document.getElementById('openrouterKeyStatus'),
      saveKeyBtn: document.getElementById('saveOpenRouterKeyBtn'),
      removeKeyBtn: document.getElementById('removeOpenRouterKeyBtn'),
      testBtn: document.getElementById('testOpenRouterBtn'),
      readinessPill: document.getElementById('readiness-openrouter'),
      readinessDetail: document.getElementById('readiness-detail-openrouter')
    },
    ollama: {
      settingsDiv: document.getElementById('ollama-settings'),
      readinessPill: document.getElementById('readiness-ollama'),
      readinessDetail: document.getElementById('readiness-detail-ollama')
    },
    auto: {
      settingsDiv: document.getElementById('auto-settings')
    }
  };

  function toPublicSettings(raw) {
    const base = settingsModule?.createDefaultSettings
      ? settingsModule.createDefaultSettings()
      : {
          schemaVersion: 3,
          provider: 'gemini',
          sidePanelEnabled: true,
          copilotEnabled: false,
          copilotMode: 'conservative',
          copilotProvider: 'auto',
          copilotMaxTokens: 60,
          redactionEnabled: true,
          customRedactionPatterns: [],
          models: { gemini: '', openai: '', claude: '', openrouter: '' },
          ollama: { host: 'http://localhost:11434', model: '' }
        };

    const normalized = settingsModule?.getPublicSettings
      ? settingsModule.getPublicSettings({ ...base, ...(raw || {}) })
      : {
          schemaVersion: Number(raw?.schemaVersion) || 3,
          provider: String(raw?.provider || base.provider || 'gemini'),
          sidePanelEnabled: raw?.sidePanelEnabled !== undefined ? Boolean(raw.sidePanelEnabled) : Boolean(base.sidePanelEnabled),
          copilotEnabled: raw?.copilotEnabled !== undefined ? Boolean(raw.copilotEnabled) : Boolean(base.copilotEnabled),
          copilotMode: String(raw?.copilotMode || base.copilotMode || 'conservative'),
          copilotProvider: String(raw?.copilotProvider || base.copilotProvider || 'auto'),
          copilotMaxTokens: Number(raw?.copilotMaxTokens) || base.copilotMaxTokens || 60,
          redactionEnabled: raw?.redactionEnabled !== undefined ? Boolean(raw.redactionEnabled) : true,
          customRedactionPatterns: Array.isArray(raw?.customRedactionPatterns) ? raw.customRedactionPatterns.slice() : [],
          models: { ...(base.models || {}), ...(raw?.models || {}) },
          ollama: {
            host: String(raw?.ollama?.host || base.ollama?.host || 'http://localhost:11434'),
            model: String(raw?.ollama?.model || '')
          },
          hasApiKey: {
            gemini: raw?.hasApiKey?.gemini !== undefined ? Boolean(raw.hasApiKey.gemini) : Boolean(String(raw?.apiKeys?.gemini || '').trim()),
            openai: raw?.hasApiKey?.openai !== undefined ? Boolean(raw.hasApiKey.openai) : Boolean(String(raw?.apiKeys?.openai || '').trim()),
            claude: raw?.hasApiKey?.claude !== undefined ? Boolean(raw.hasApiKey.claude) : Boolean(String(raw?.apiKeys?.claude || '').trim()),
            openrouter: raw?.hasApiKey?.openrouter !== undefined ? Boolean(raw.hasApiKey.openrouter) : Boolean(String(raw?.apiKeys?.openrouter || '').trim())
          }
        };

    delete normalized.apiKeys;
    return normalized;
  }

  function clonePublic(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  let currentSettings = toPublicSettings({});
  let lastAppliedSettings = clonePublic(currentSettings);
  let draftModels = { ...(currentSettings.models || {}) };
  let readinessSummary = null;
  let testingProviders = new Set();
  const dirtyFields = new Set();
  let isApplyingLocalSave = false;
  let isSelfBroadcasting = false;
  let externalSyncInFlight = false;
  let pendingExternalSync = false;

  function resolveReadinessLabel(entry) {
    if (!entry || typeof entry !== 'object') return 'Not configured';
    const rawLabel = String(entry.statusLabel || entry.label || '').trim();
    if (rawLabel) return rawLabel;
    const state = String(entry.state || 'not_configured');
    if (state === 'error' && entry.code && CODE_TO_LABEL[entry.code]) {
      return CODE_TO_LABEL[entry.code];
    }
    return STATE_TO_LABEL[state] || 'Not configured';
  }

  function deriveFallbackReadiness(publicSettings) {
    const pub = publicSettings || currentSettings;
    const providers = {};

    for (const p of CLOUD_PROVIDERS) {
      const configured = Boolean(pub?.hasApiKey?.[p]);
      providers[p] = {
        provider: p,
        state: configured ? 'configured_untested' : 'not_configured',
        statusLabel: configured ? 'Configured, not tested' : 'Not configured',
        usable: configured,
        code: configured ? '' : 'NOT_CONFIGURED',
        userMessage: configured ? '' : `Add a ${PROVIDER_LABELS[p]} API key to enable requests.`,
        model: pub?.models?.[p] || ''
      };
    }

    const ollamaModel = String(pub?.ollama?.model || '').trim();
    const ollamaConfigured = Boolean(ollamaModel);
    providers.ollama = {
      provider: 'ollama',
      state: ollamaConfigured ? 'configured_untested' : 'not_configured',
      statusLabel: ollamaConfigured ? 'Configured, not tested' : 'Not configured',
      usable: ollamaConfigured,
      code: ollamaConfigured ? '' : 'NOT_CONFIGURED',
      userMessage: ollamaConfigured ? '' : 'Enter an Ollama model ID or detect installed local models.',
      model: ollamaModel
    };

    const usableCandidates = ALL_READINESS_PROVIDERS.filter((p) => providers[p].usable);
    const anyUsable = usableCandidates.length > 0;
    providers.auto = {
      provider: 'auto',
      state: anyUsable ? 'configured_untested' : 'not_configured',
      statusLabel: anyUsable ? 'Configured, not tested' : 'Not configured',
      usable: anyUsable,
      code: anyUsable ? '' : 'NOT_CONFIGURED',
      userMessage: anyUsable
        ? `${usableCandidates.length} provider(s) configured for smart routing.`
        : 'Configure at least one cloud API key or Ollama model for Auto mode.'
    };

    const activeProvider = pub?.provider || 'gemini';
    const activeEntry = providers[activeProvider] || providers.gemini;
    return {
      activeProvider,
      activeState: activeEntry.state,
      usable: Boolean(activeEntry.usable),
      statusLabel: activeEntry.statusLabel,
      providers
    };
  }

  function normalizeReadinessPayload(rawReadiness, publicSettings) {
    const fallback = deriveFallbackReadiness(publicSettings);
    if (!rawReadiness || typeof rawReadiness !== 'object') {
      return fallback;
    }

    const sourceProviders = rawReadiness.providers || {};
    const providers = {};

    for (const p of ALL_READINESS_PROVIDERS) {
      const baseEntry = fallback.providers[p];
      const rawEntry = sourceProviders[p];
      if (!rawEntry || typeof rawEntry !== 'object') {
        providers[p] = baseEntry;
        continue;
      }
      const state = String(rawEntry.state || baseEntry.state || 'not_configured');
      const invalidatedCloud = CLOUD_PROVIDERS.includes(p) && baseEntry.state === 'not_configured' && state === 'verified';
      providers[p] = invalidatedCloud
        ? baseEntry
        : {
            ...baseEntry,
            ...rawEntry,
            state,
            statusLabel: resolveReadinessLabel({ ...rawEntry, state }),
            usable: rawEntry.usable !== undefined ? Boolean(rawEntry.usable) : baseEntry.usable,
            userMessage: String(rawEntry.userMessage || rawEntry.message || '').trim()
          };
    }

    if (sourceProviders.auto && typeof sourceProviders.auto === 'object') {
      const autoState = String(sourceProviders.auto.state || fallback.providers.auto.state);
      providers.auto = {
        ...fallback.providers.auto,
        ...sourceProviders.auto,
        state: autoState,
        statusLabel: resolveReadinessLabel({ ...sourceProviders.auto, state: autoState })
      };
    } else if (rawReadiness.activeProvider === 'auto' && rawReadiness.activeState) {
      const autoState = String(rawReadiness.activeState);
      providers.auto = {
        ...fallback.providers.auto,
        state: autoState,
        statusLabel: resolveReadinessLabel({
          state: autoState,
          statusLabel: rawReadiness.statusLabel,
          code: rawReadiness.code
        }),
        usable: rawReadiness.usable !== undefined ? Boolean(rawReadiness.usable) : fallback.providers.auto.usable,
        userMessage: String(rawReadiness.userMessage || fallback.providers.auto.userMessage || '').trim()
      };
    } else {
      const usableList = ALL_READINESS_PROVIDERS.filter((id) => providers[id]?.usable);
      const verifiedList = usableList.filter((id) => providers[id]?.state === 'verified');
      const testingAny = usableList.some((id) => providers[id]?.state === 'testing');
      if (testingAny) {
        providers.auto = { ...fallback.providers.auto, state: 'testing', statusLabel: 'Testing', usable: true };
      } else if (verifiedList.length > 0) {
        providers.auto = { ...fallback.providers.auto, state: 'verified', statusLabel: 'Connection verified', usable: true };
      } else if (usableList.length > 0) {
        providers.auto = { ...fallback.providers.auto, state: 'configured_untested', statusLabel: 'Configured, not tested', usable: true };
      } else {
        providers.auto = fallback.providers.auto;
      }
    }

    const activeProvider = String(
      aiProviderSelect?.value || rawReadiness.activeProvider || rawReadiness.provider || publicSettings?.provider || 'gemini'
    );
    const activeEntry = providers[activeProvider] || fallback.providers[activeProvider] || providers.gemini;

    const topState = testingProviders.has(activeProvider)
      ? 'testing'
      : String(activeEntry.state || rawReadiness.activeState || 'not_configured');

    return {
      activeProvider,
      activeState: topState,
      usable: activeEntry.usable !== undefined ? Boolean(activeEntry.usable) : Boolean(rawReadiness.usable),
      statusLabel: testingProviders.has(activeProvider)
        ? 'Testing'
        : resolveReadinessLabel({ ...activeEntry, state: topState }),
      providers
    };
  }

  function getProviderReadinessEntry(provider) {
    const summary = readinessSummary || deriveFallbackReadiness(currentSettings);
    const base = summary.providers?.[provider] || deriveFallbackReadiness(currentSettings).providers[provider];
    if (testingProviders.has(provider)) {
      return {
        ...base,
        state: 'testing',
        statusLabel: 'Testing',
        userMessage: `Testing ${PROVIDER_LABELS[provider] || provider} connection...`
      };
    }
    return base;
  }

  function renderReadinessPill(el, entry) {
    if (!el || !entry) return;
    const state = String(entry.state || 'not_configured');
    el.dataset.state = state;
    el.textContent = resolveReadinessLabel(entry);
  }

  function renderReadinessDetail(el, entry) {
    if (!el) return;
    const msg = String(entry?.userMessage || entry?.message || '').trim();
    const show = Boolean(msg) && (entry?.state === 'error' || entry?.state === 'testing' || entry?.state === 'verified');
    el.hidden = !show;
    el.textContent = show ? msg : '';
    el.classList.toggle('is-error', entry?.state === 'error');
  }

  function renderAutoReadinessList() {
    if (!autoReadinessList) return;
    autoReadinessList.replaceChildren();

    for (const p of ALL_READINESS_PROVIDERS) {
      const entry = getProviderReadinessEntry(p);
      const row = document.createElement('div');
      row.className = 'auto-readiness-row';

      const name = document.createElement('span');
      name.textContent = PROVIDER_LABELS[p] || p;

      const pill = document.createElement('span');
      pill.className = 'readiness-pill';
      renderReadinessPill(pill, entry);

      row.appendChild(name);
      row.appendChild(pill);
      autoReadinessList.appendChild(row);
    }
  }

  function renderReadinessUI() {
    const activeProvider = aiProviderSelect?.value || currentSettings.provider || 'gemini';
    const activeEntry = getProviderReadinessEntry(activeProvider);

    if (popupReadinessBadge && popupStatusText) {
      popupReadinessBadge.dataset.state = activeEntry.state;
      popupStatusText.textContent = resolveReadinessLabel(activeEntry);
    }

    renderReadinessPill(activeReadinessPill, activeEntry);
    renderReadinessDetail(activeReadinessDetail, activeEntry);

    for (const p of CLOUD_PROVIDERS) {
      const cfg = settingsMap[p];
      const entry = getProviderReadinessEntry(p);
      renderReadinessPill(cfg.readinessPill, entry);
      renderReadinessDetail(cfg.readinessDetail, entry);
    }

    const ollamaEntry = getProviderReadinessEntry('ollama');
    renderReadinessPill(settingsMap.ollama.readinessPill, ollamaEntry);
    renderReadinessDetail(settingsMap.ollama.readinessDetail, ollamaEntry);

    renderAutoReadinessList();
  }

  function sendRuntimeMessage(message, timeoutMs = 1500) {
    return new Promise((resolve) => {
      const runtime = globalThis.chrome?.runtime;
      if (!runtime || typeof runtime.sendMessage !== 'function') {
        resolve(null);
        return;
      }

      let settled = false;
      let timer = null;
      const done = (value) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        resolve(value || null);
      };

      if (timeoutMs > 0) {
        timer = setTimeout(() => done(null), timeoutMs);
      }

      try {
        const maybePromise = runtime.sendMessage(message, (response) => {
          if (runtime.lastError) {
            runtime.lastError = null;
            done(null);
            return;
          }
          done(response);
        });
        if (maybePromise && typeof maybePromise.then === 'function') {
          maybePromise.then(done).catch(() => done(null));
        }
      } catch (_) {
        done(null);
      }
    });
  }

  async function refreshReadiness() {
    const response = await sendRuntimeMessage({ action: 'getProviderReadiness' }, 1500);
    if (response?.readiness) {
      readinessSummary = normalizeReadinessPayload(response.readiness, currentSettings);
    } else if (response && response.providers) {
      readinessSummary = normalizeReadinessPayload(response, currentSettings);
    } else {
      readinessSummary = deriveFallbackReadiness(currentSettings);
    }
    renderReadinessUI();
  }

  function applyReadinessPayload(rawReadiness) {
    readinessSummary = normalizeReadinessPayload(rawReadiness, currentSettings);
    renderReadinessUI();
  }

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
      const isCloudKeySection = CLOUD_PROVIDERS.includes(provider);
      section.style.display = (provider === selectedProvider || (selectedProvider === 'auto' && isCloudKeySection))
        ? 'block'
        : 'none';
    }

    if (keySection) {
      keySection.style.display = selectedProvider === 'ollama' ? 'none' : 'block';
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

  function syncModelDirtyFlag(provider, modelId) {
    const baseline = String(lastAppliedSettings.models?.[provider] || '').trim();
    const next = String(modelId || '').trim();
    if (next && next !== baseline) {
      dirtyFields.add(`model:${provider}`);
    } else {
      dirtyFields.delete(`model:${provider}`);
    }
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
      draftModels[provider] = model.id;
      syncModelDirtyFlag(provider, model.id);
      syncSelectedModelOptionState(model.id);
      updateSelectedModelHeader(provider, model.id);
      renderModelMeta(provider, model.id);
      setModelPickerOpen(false);
    });

    return button;
  }

  function populateModelOptions(provider, selectedModel) {
    if (!providerModelSelect || !modelOptionGroups) return;

    providerModelSelect.replaceChildren();
    modelOptionGroups.replaceChildren();
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
      modelTags.replaceChildren();
      return;
    }

    modelMeta.style.display = 'block';
    modelDisplayName.textContent = model.label || model.id;
    modelBadge.textContent = model.badge || 'Model';

    const providerHint = registry?.getProviderHelper?.(provider) || '';
    const modelHint = model.bestFor?.length ? `Best for: ${model.bestFor.join(', ')}` : '';
    modelHelpText.textContent = [providerHint, modelHint].filter(Boolean).join(' ');

    modelTags.replaceChildren();
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
    button.setAttribute('aria-pressed', toText ? 'true' : 'false');
  }

  let statusTimeout = null;
  function showStatus(message, type) {
    if (!statusEl) return;
    clearTimeout(statusTimeout);
    statusEl.textContent = message;
    statusEl.className = `status ${type || ''}`;
    statusTimeout = setTimeout(() => {
      if (statusEl) {
        statusEl.textContent = '';
        statusEl.className = 'status';
      }
    }, 4000);
  }

  function updateTelemetryStatusBar() {
    const latencyEl = document.getElementById('latency');
    const fallbackCountEl = document.getElementById('fallbackCount');

    if (latencyEl && globalThis.chrome?.storage?.local?.get) {
      chrome.storage.local.get(['zeus_last_latency'], (data) => {
        const latency = data?.zeus_last_latency;
        latencyEl.textContent = (latency !== undefined && latency !== null) ? latency : '--';
      });
    }

    if (fallbackCountEl && globalThis.chrome?.runtime?.sendMessage) {
      try {
        chrome.runtime.sendMessage({ action: 'getTelemetrySummary' }, (response) => {
          if (chrome.runtime?.lastError) {
            chrome.runtime.lastError = null;
            return;
          }
          const summary = response?.summary;
          const fallbackEvents = summary?.fallbackCount !== undefined ? summary.fallbackCount : (summary?.totalEvents || 0);
          fallbackCountEl.textContent = fallbackEvents;
        });
      } catch (_) {}
    }
  }

  function getEffectiveDirtyFields() {
    const effective = new Set(dirtyFields);

    if (aiProviderSelect && aiProviderSelect.value !== lastAppliedSettings.provider) {
      effective.add('provider');
    }

    for (const p of CLOUD_PROVIDERS) {
      const input = settingsMap[p].apiKeyInput;
      if (input && input.value.length > 0) {
        effective.add(`apiKey:${p}`);
      }
      if (draftModels[p] && draftModels[p] !== (lastAppliedSettings.models?.[p] || '')) {
        effective.add(`model:${p}`);
      }
    }

    const activeProv = aiProviderSelect?.value || lastAppliedSettings.provider;
    if (supportsModelSelection(activeProv) && providerModelSelect) {
      const domModel = String(providerModelSelect.value || '').trim();
      if (domModel && domModel !== (lastAppliedSettings.models?.[activeProv] || '')) {
        effective.add(`model:${activeProv}`);
      }
    }

    if (ollamaHostInput) {
      const curHost = ollamaHostInput.value.trim();
      const baseHost = String(lastAppliedSettings.ollama?.host || '').trim();
      if (curHost !== baseHost) effective.add('ollamaHost');
    }
    if (ollamaModelInput) {
      const curModel = ollamaModelInput.value.trim();
      const baseModel = String(lastAppliedSettings.ollama?.model || '').trim();
      if (curModel !== baseModel) effective.add('ollamaModel');
    }

    if (sidePanelEnabledCheckbox && Boolean(sidePanelEnabledCheckbox.checked) !== Boolean(lastAppliedSettings.sidePanelEnabled)) {
      effective.add('sidePanelEnabled');
    }
    if (copilotEnabledCheckbox && Boolean(copilotEnabledCheckbox.checked) !== Boolean(lastAppliedSettings.copilotEnabled)) {
      effective.add('copilotEnabled');
    }

    return effective;
  }

  function updateCloudKeyControlStates(publicSettings) {
    for (const p of CLOUD_PROVIDERS) {
      const cfg = settingsMap[p];
      const hasKey = Boolean(publicSettings?.hasApiKey?.[p]);

      if (cfg.keyStatusBadge) {
        cfg.keyStatusBadge.textContent = hasKey ? 'API key configured' : 'Not configured';
        cfg.keyStatusBadge.dataset.configured = hasKey ? 'true' : 'false';
      }
      if (cfg.apiKeyInput) {
        cfg.apiKeyInput.placeholder = hasKey
          ? 'Enter new key to replace saved key'
          : 'Enter API key';
      }
      if (cfg.saveKeyBtn) {
        cfg.saveKeyBtn.textContent = hasKey ? 'Replace Key' : 'Save Key';
      }
      if (cfg.removeKeyBtn) {
        cfg.removeKeyBtn.hidden = !hasKey;
        cfg.removeKeyBtn.disabled = !hasKey;
      }
    }
  }

  function clearKeyInputField(provider) {
    const cfg = settingsMap[provider];
    if (!cfg) return;
    if (cfg.apiKeyInput) {
      cfg.apiKeyInput.value = '';
      cfg.apiKeyInput.type = 'password';
    }
    if (cfg.showHideBtn) {
      cfg.showHideBtn.textContent = 'Show';
      cfg.showHideBtn.setAttribute('aria-pressed', 'false');
    }
    dirtyFields.delete(`apiKey:${provider}`);
  }

  function applyPublicSettingsToUI(publicSettings, { preserveDirty = true } = {}) {
    const nextPublic = toPublicSettings(publicSettings);
    const effectiveDirty = preserveDirty ? getEffectiveDirtyFields() : new Set();

    currentSettings = nextPublic;

    if (!effectiveDirty.has('provider') && aiProviderSelect) {
      aiProviderSelect.value = nextPublic.provider;
      lastAppliedSettings.provider = nextPublic.provider;
    }

    for (const p of CLOUD_PROVIDERS) {
      if (!effectiveDirty.has(`model:${p}`)) {
        draftModels[p] = nextPublic.models?.[p] || '';
        if (!lastAppliedSettings.models) lastAppliedSettings.models = {};
        lastAppliedSettings.models[p] = nextPublic.models?.[p] || '';
      }
      if (!effectiveDirty.has(`apiKey:${p}`)) {
        clearKeyInputField(p);
      }
    }

    lastAppliedSettings.hasApiKey = { ...(nextPublic.hasApiKey || {}) };
    updateCloudKeyControlStates(nextPublic);

    if (!effectiveDirty.has('ollamaHost') && ollamaHostInput) {
      const nextHost = nextPublic.ollama?.host || settingsModule?.DEFAULT_OLLAMA_HOST || 'http://localhost:11434';
      ollamaHostInput.value = nextHost;
      if (!lastAppliedSettings.ollama) lastAppliedSettings.ollama = {};
      lastAppliedSettings.ollama.host = nextHost;
    }

    if (!effectiveDirty.has('ollamaModel') && ollamaModelInput) {
      const nextOllamaModel = nextPublic.ollama?.model || '';
      ollamaModelInput.value = nextOllamaModel;
      if (!lastAppliedSettings.ollama) lastAppliedSettings.ollama = {};
      lastAppliedSettings.ollama.model = nextOllamaModel;
    }

    if (!effectiveDirty.has('sidePanelEnabled') && sidePanelEnabledCheckbox) {
      sidePanelEnabledCheckbox.checked = Boolean(nextPublic.sidePanelEnabled);
      lastAppliedSettings.sidePanelEnabled = Boolean(nextPublic.sidePanelEnabled);
    }

    if (!effectiveDirty.has('copilotEnabled') && copilotEnabledCheckbox) {
      copilotEnabledCheckbox.checked = Boolean(nextPublic.copilotEnabled);
      lastAppliedSettings.copilotEnabled = Boolean(nextPublic.copilotEnabled);
    }

    const activeProvider = aiProviderSelect ? aiProviderSelect.value : nextPublic.provider;
    toggleProviderPanels(activeProvider);

    const activeModel = draftModels[activeProvider] || nextPublic.models?.[activeProvider] || '';
    syncModelSelector(activeProvider, activeModel);

    if (!readinessSummary) {
      readinessSummary = deriveFallbackReadiness(currentSettings);
    } else {
      readinessSummary = normalizeReadinessPayload(readinessSummary, currentSettings);
    }
    renderReadinessUI();
    updateTelemetryStatusBar();

    return effectiveDirty;
  }

  function showSyncNotice(dirtySet) {
    if (!syncNotice || !syncNoticeText) return;
    const labels = Array.from(dirtySet)
      .map((k) => FIELD_LABELS[k] || k)
      .filter(Boolean);
    syncNoticeText.textContent = labels.length
      ? `Settings updated externally. Unsaved edits preserved in: ${labels.join(', ')}.`
      : 'Settings updated externally.';
    syncNotice.hidden = false;
  }

  function hideSyncNotice() {
    if (syncNotice) syncNotice.hidden = true;
  }

  async function fetchPublicSettings() {
    if (!settingsModule) return null;
    if (typeof settingsModule.getPublic === 'function') {
      const pub = await settingsModule.getPublic();
      return toPublicSettings(pub);
    }
    if (typeof settingsModule.loadSettings === 'function') {
      const full = await settingsModule.loadSettings();
      return toPublicSettings(full);
    }
    return null;
  }

  async function loadSettings({ preserveDirty = false } = {}) {
    if (!settingsModule) return;
    try {
      const loaded = await fetchPublicSettings();
      if (!loaded) return;
      applyPublicSettingsToUI(loaded, { preserveDirty });
      await refreshReadiness();
    } catch (_) {
      showStatus('Failed to load settings', 'error');
    }
  }

  async function handleExternalSettingsChange() {
    if (!settingsModule || isApplyingLocalSave) return;
    if (externalSyncInFlight) {
      pendingExternalSync = true;
      return;
    }

    externalSyncInFlight = true;
    try {
      do {
        pendingExternalSync = false;
        settingsModule.invalidateCache?.();
        const loaded = await fetchPublicSettings();
        if (!loaded) break;
        const preserved = applyPublicSettingsToUI(loaded, { preserveDirty: true });
        if (preserved.size > 0) {
          showSyncNotice(preserved);
        } else {
          hideSyncNotice();
        }
        await refreshReadiness();
      } while (pendingExternalSync);
    } catch (_) {
    } finally {
      externalSyncInFlight = false;
    }
  }

  function handleExternalSettingsMessage(incomingSettings) {
    if (isSelfBroadcasting || isApplyingLocalSave) return;
    const merged = toPublicSettings({
      ...currentSettings,
      ...(incomingSettings || {}),
      models: { ...(currentSettings.models || {}), ...(incomingSettings?.models || {}) },
      ollama: { ...(currentSettings.ollama || {}), ...(incomingSettings?.ollama || {}) },
      hasApiKey: { ...(currentSettings.hasApiKey || {}), ...(incomingSettings?.hasApiKey || {}) }
    });
    const preserved = applyPublicSettingsToUI(merged, { preserveDirty: true });
    if (preserved.size > 0) {
      showSyncNotice(preserved);
    } else {
      hideSyncNotice();
    }
  }

  function notifySettingsUpdated(publicSettings) {
    const runtime = globalThis.chrome?.runtime;
    if (!runtime || typeof runtime.sendMessage !== 'function') return;
    isSelfBroadcasting = true;
    try {
      const res = runtime.sendMessage({ action: 'settingsUpdated', settings: publicSettings }, () => {
        if (runtime.lastError) {
          runtime.lastError = null;
        }
      });
      if (res && typeof res.catch === 'function') {
        res.catch(() => {});
      }
    } catch (_) {
    } finally {
      isSelfBroadcasting = false;
    }
  }

  function buildPendingDiff() {
    const diff = {};
    const provider = aiProviderSelect ? aiProviderSelect.value : currentSettings.provider;
    if (provider !== lastAppliedSettings.provider) {
      diff.provider = provider;
    }

    if (sidePanelEnabledCheckbox && Boolean(sidePanelEnabledCheckbox.checked) !== Boolean(lastAppliedSettings.sidePanelEnabled)) {
      diff.sidePanelEnabled = Boolean(sidePanelEnabledCheckbox.checked);
    }
    if (copilotEnabledCheckbox && Boolean(copilotEnabledCheckbox.checked) !== Boolean(lastAppliedSettings.copilotEnabled)) {
      diff.copilotEnabled = Boolean(copilotEnabledCheckbox.checked);
    }

    const modelDiff = {};
    for (const p of CLOUD_PROVIDERS) {
      const candidate = p === provider && supportsModelSelection(p) && providerModelSelect
        ? String(providerModelSelect.value || draftModels[p] || '').trim()
        : String(draftModels[p] || '').trim();
      const baseModel = String(lastAppliedSettings.models?.[p] || '').trim();
      if (candidate && candidate !== baseModel) {
        modelDiff[p] = candidate;
      }
    }
    if (Object.keys(modelDiff).length > 0) {
      diff.models = modelDiff;
    }

    const apiKeysDiff = {};
    for (const p of CLOUD_PROVIDERS) {
      const typed = String(settingsMap[p].apiKeyInput?.value || '').trim();
      if (typed.length > 0) {
        apiKeysDiff[p] = typed;
      }
    }
    if (Object.keys(apiKeysDiff).length > 0) {
      diff.apiKeys = apiKeysDiff;
    }

    const ollamaDiff = {};
    if (ollamaHostInput) {
      const hostVal = ollamaHostInput.value.trim();
      const baseHost = String(lastAppliedSettings.ollama?.host || '').trim();
      if (dirtyFields.has('ollamaHost') || hostVal !== baseHost) {
        ollamaDiff.host = hostVal;
      }
    }
    if (ollamaModelInput) {
      const modelVal = ollamaModelInput.value.trim();
      const baseOllamaModel = String(lastAppliedSettings.ollama?.model || '').trim();
      if (dirtyFields.has('ollamaModel') || modelVal !== baseOllamaModel) {
        ollamaDiff.model = modelVal;
      }
    }
    if (Object.keys(ollamaDiff).length > 0) {
      diff.ollama = ollamaDiff;
    }

    return diff;
  }

  async function persistDiff(diff, { clearKeyInputs = [], successMessage = 'Saved', preserveOtherDirty = false } = {}) {
    if (!settingsModule) {
      throw new Error('Settings store unavailable');
    }

    const updater = settingsModule.update || settingsModule.saveSettings;
    if (typeof updater !== 'function') {
      throw new Error('Settings update method unavailable');
    }

    isApplyingLocalSave = true;
    try {
      const updateResult = await updater(diff);
      if (!updateResult || !updateResult.settings) {
        throw new Error('Settings persistence could not be verified');
      }

      const publicSettings = settingsModule.getPublicSettings
        ? toPublicSettings(settingsModule.getPublicSettings(updateResult.settings))
        : toPublicSettings(updateResult.settings);

      for (const p of clearKeyInputs) {
        clearKeyInputField(p);
      }
      if (diff?.apiKeys) {
        for (const p of Object.keys(diff.apiKeys)) {
          clearKeyInputField(p);
        }
      }

      if (diff?.apiKeys && readinessSummary?.providers) {
        const fallback = deriveFallbackReadiness(publicSettings);
        for (const p of Object.keys(diff.apiKeys)) {
          readinessSummary.providers[p] = fallback.providers[p];
        }
      }
      if (diff?.ollama && readinessSummary?.providers) {
        const fallback = deriveFallbackReadiness(publicSettings);
        readinessSummary.providers.ollama = fallback.providers.ollama;
      }

      if (!preserveOtherDirty) {
        dirtyFields.clear();
        lastAppliedSettings = clonePublic(publicSettings);
        draftModels = { ...(publicSettings.models || {}) };
        hideSyncNotice();
        applyPublicSettingsToUI(publicSettings, { preserveDirty: false });
      } else {
        applyPublicSettingsToUI(publicSettings, { preserveDirty: true });
      }

      showStatus(successMessage, 'success');
      notifySettingsUpdated(publicSettings);
      await refreshReadiness();
      return publicSettings;
    } finally {
      isApplyingLocalSave = false;
    }
  }

  async function saveSettings() {
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'SAVING...';
    }

    try {
      const diff = buildPendingDiff();
      await persistDiff(diff, { successMessage: 'Saved', preserveOtherDirty: false });
    } catch (_) {
      showStatus('Save failed', 'error');
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'EXECUTE CONFIG';
      }
    }
  }

  async function saveProviderKey(provider) {
    const cfg = settingsMap[provider];
    const typed = String(cfg?.apiKeyInput?.value || '').trim();
    if (!typed) {
      showStatus(`Enter a ${PROVIDER_LABELS[provider]} API key first.`, 'warning');
      cfg?.apiKeyInput?.focus();
      return;
    }

    const btn = cfg.saveKeyBtn;
    const origText = btn ? btn.textContent : 'Save Key';
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Saving...';
    }

    try {
      await persistDiff(
        { apiKeys: { [provider]: typed } },
        { clearKeyInputs: [provider], successMessage: 'Saved', preserveOtherDirty: true }
      );
    } catch (_) {
      showStatus(`Failed to save ${PROVIDER_LABELS[provider]} key`, 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = currentSettings?.hasApiKey?.[provider] ? 'Replace Key' : origText;
      }
    }
  }

  async function removeProviderKey(provider) {
    const label = PROVIDER_LABELS[provider] || provider;
    if (!confirm(`Remove the saved ${label} API key from local storage?`)) {
      return;
    }

    const cfg = settingsMap[provider];
    const btn = cfg?.removeKeyBtn;
    if (btn) btn.disabled = true;

    try {
      await persistDiff(
        { apiKeys: { [provider]: '' } },
        { clearKeyInputs: [provider], successMessage: `${label} key removed — Saved`, preserveOtherDirty: true }
      );
    } catch (_) {
      showStatus(`Failed to remove ${label} key`, 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function runTestConnection(targetProvider) {
    const provider = targetProvider || (aiProviderSelect ? aiProviderSelect.value : currentSettings.provider);

    if (CLOUD_PROVIDERS.includes(provider)) {
      const unsavedKey = String(settingsMap[provider]?.apiKeyInput?.value || '').trim();
      if (unsavedKey) {
        showStatus(`Save the new ${PROVIDER_LABELS[provider]} key first before testing connection.`, 'warning');
        return;
      }
    }

    testingProviders.add(provider);
    renderReadinessUI();

    const payload = { action: 'testConnection', provider };
    if (supportsModelSelection(provider)) {
      const selectedModel = provider === (aiProviderSelect?.value || '') && providerModelSelect?.value
        ? String(providerModelSelect.value).trim()
        : String(draftModels[provider] || currentSettings.models?.[provider] || '').trim();
      if (selectedModel) payload.model = selectedModel;
    }
    if (provider === 'ollama') {
      if (ollamaHostInput?.value?.trim()) payload.host = ollamaHostInput.value.trim();
      if (ollamaModelInput?.value?.trim()) payload.model = ollamaModelInput.value.trim();
    }

    try {
      const response = await sendRuntimeMessage(payload, 10000);
      testingProviders.delete(provider);

      if (response?.readiness) {
        applyReadinessPayload(response.readiness);
      } else if (response?.result) {
        const currentSummary = readinessSummary || deriveFallbackReadiness(currentSettings);
        const resultEntry = {
          ...(currentSummary.providers?.[provider] || {}),
          ...response.result,
          state: response.result.state || (response.success ? 'verified' : 'error')
        };
        currentSummary.providers[provider] = {
          ...resultEntry,
          statusLabel: resolveReadinessLabel(resultEntry)
        };
        applyReadinessPayload(currentSummary);
      } else if (response && response.success === true) {
        const currentSummary = readinessSummary || deriveFallbackReadiness(currentSettings);
        currentSummary.providers[provider] = {
          ...(currentSummary.providers?.[provider] || {}),
          state: 'verified',
          statusLabel: 'Connection verified',
          usable: true,
          userMessage: ''
        };
        applyReadinessPayload(currentSummary);
      } else {
        const currentSummary = readinessSummary || deriveFallbackReadiness(currentSettings);
        const baseEntry = currentSummary.providers?.[provider];
        if (baseEntry && baseEntry.state === 'not_configured') {
          applyReadinessPayload(currentSummary);
        } else {
          currentSummary.providers[provider] = {
            ...(baseEntry || {}),
            state: 'error',
            code: 'PROVIDER_UNAVAILABLE',
            statusLabel: 'Provider unavailable',
            userMessage: 'Connection test service unavailable.'
          };
          applyReadinessPayload(currentSummary);
        }
      }

      const finalEntry = getProviderReadinessEntry(provider);
      const label = resolveReadinessLabel(finalEntry);
      showStatus(`${PROVIDER_LABELS[provider] || provider}: ${label}`, finalEntry.state === 'verified' ? 'success' : (finalEntry.state === 'error' ? 'error' : 'info'));
    } catch (_) {
      testingProviders.delete(provider);
      renderReadinessUI();
      showStatus('Connection test failed', 'error');
    }
  }

  async function runDiscoverOllamaModels() {
    if (!detectOllamaModelsBtn) return;
    detectOllamaModelsBtn.disabled = true;
    detectOllamaModelsBtn.textContent = 'Detecting...';

    try {
      const host = ollamaHostInput?.value?.trim() || currentSettings.ollama?.host || 'http://localhost:11434';
      const response = await sendRuntimeMessage({ action: 'discoverOllamaModels', host }, 8000);

      if (ollamaDiscoveredModels) {
        ollamaDiscoveredModels.replaceChildren();
        ollamaDiscoveredModels.hidden = true;
      }

      if (!response) {
        showStatus('Ollama discovery unavailable in this context', 'warning');
        return;
      }

      if (response.originBlocked) {
        const detail = response.error || 'Ollama blocked extension origin. Open Advanced Settings for OLLAMA_ORIGINS commands.';
        if (settingsMap.ollama.readinessDetail) {
          settingsMap.ollama.readinessDetail.hidden = false;
          settingsMap.ollama.readinessDetail.textContent = detail;
          settingsMap.ollama.readinessDetail.classList.add('is-error');
        }
        showStatus('Ollama blocked extension origin', 'error');
        return;
      }

      const models = Array.isArray(response.models)
        ? response.models
        : (Array.isArray(response.installed) ? response.installed : []);

      if (models.length > 0 && ollamaDiscoveredModels) {
        ollamaDiscoveredModels.hidden = false;
        for (const modelName of models) {
          const nameStr = typeof modelName === 'string' ? modelName : String(modelName?.name || modelName?.model || '').trim();
          if (!nameStr) continue;
          const chip = document.createElement('button');
          chip.type = 'button';
          chip.className = 'ollama-chip';
          chip.textContent = nameStr;
          chip.addEventListener('click', () => {
            if (ollamaModelInput) {
              ollamaModelInput.value = nameStr;
              dirtyFields.add('ollamaModel');
            }
          });
          ollamaDiscoveredModels.appendChild(chip);
        }
        if (ollamaModelInput && !ollamaModelInput.value.trim()) {
          const firstChip = ollamaDiscoveredModels.querySelector('.ollama-chip');
          if (firstChip) {
            ollamaModelInput.value = firstChip.textContent;
            dirtyFields.add('ollamaModel');
          }
        }
        showStatus(`Detected ${models.length} local Ollama model(s)`, 'success');
      } else if (response.reachable) {
        showStatus('Ollama reachable, no local models installed', 'warning');
      } else {
        showStatus(response.error || 'Ollama unreachable at configured host', 'error');
      }
    } finally {
      detectOllamaModelsBtn.disabled = false;
      detectOllamaModelsBtn.textContent = 'Detect Models';
    }
  }

  function openOptionsPage() {
    const runtime = globalThis.chrome?.runtime;
    const fallbackOpenTab = () => {
      if (globalThis.chrome?.tabs?.create && runtime?.getURL) {
        try {
          globalThis.chrome.tabs.create({ url: runtime.getURL('options.html') });
        } catch (_) {}
      }
    };

    if (runtime && typeof runtime.openOptionsPage === 'function') {
      try {
        const res = runtime.openOptionsPage();
        if (res && typeof res.catch === 'function') {
          res.catch(fallbackOpenTab);
        }
        return;
      } catch (_) {}
    }
    fallbackOpenTab();
  }

  aiProviderSelect?.addEventListener('change', () => {
    const selectedProvider = aiProviderSelect.value;
    if (selectedProvider !== lastAppliedSettings.provider) {
      dirtyFields.add('provider');
    } else {
      dirtyFields.delete('provider');
    }
    setModelPickerOpen(false);
    toggleProviderPanels(selectedProvider);
    syncModelSelector(selectedProvider, draftModels[selectedProvider] || currentSettings.models?.[selectedProvider]);
    renderReadinessUI();
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

    draftModels[selectedProvider] = selectedModel;
    syncModelDirtyFlag(selectedProvider, selectedModel);
    syncSelectedModelOptionState(selectedModel);
    updateSelectedModelHeader(selectedProvider, selectedModel);
    renderModelMeta(selectedProvider, selectedModel);
  });

  for (const provider of CLOUD_PROVIDERS) {
    const cfg = settingsMap[provider];
    if (cfg.apiKeyInput && cfg.showHideBtn) {
      cfg.showHideBtn.addEventListener('click', () => togglePasswordVisibility(cfg.apiKeyInput, cfg.showHideBtn));
    }
    cfg.apiKeyInput?.addEventListener('input', () => {
      if (cfg.apiKeyInput.value.length > 0) {
        dirtyFields.add(`apiKey:${provider}`);
      } else {
        dirtyFields.delete(`apiKey:${provider}`);
      }
    });
    cfg.saveKeyBtn?.addEventListener('click', () => saveProviderKey(provider));
    cfg.removeKeyBtn?.addEventListener('click', () => removeProviderKey(provider));
    cfg.testBtn?.addEventListener('click', () => runTestConnection(provider));
  }

  ollamaHostInput?.addEventListener('input', () => {
    if (ollamaHostInput.value.trim() !== String(lastAppliedSettings.ollama?.host || '').trim()) {
      dirtyFields.add('ollamaHost');
    } else {
      dirtyFields.delete('ollamaHost');
    }
  });

  ollamaModelInput?.addEventListener('input', () => {
    if (ollamaModelInput.value.trim() !== String(lastAppliedSettings.ollama?.model || '').trim()) {
      dirtyFields.add('ollamaModel');
    } else {
      dirtyFields.delete('ollamaModel');
    }
  });

  sidePanelEnabledCheckbox?.addEventListener('change', () => {
    if (Boolean(sidePanelEnabledCheckbox.checked) !== Boolean(lastAppliedSettings.sidePanelEnabled)) {
      dirtyFields.add('sidePanelEnabled');
    } else {
      dirtyFields.delete('sidePanelEnabled');
    }
  });

  copilotEnabledCheckbox?.addEventListener('change', () => {
    if (Boolean(copilotEnabledCheckbox.checked) !== Boolean(lastAppliedSettings.copilotEnabled)) {
      dirtyFields.add('copilotEnabled');
    } else {
      dirtyFields.delete('copilotEnabled');
    }
  });

  testActiveConnectionBtn?.addEventListener('click', () => runTestConnection());
  testOllamaBtn?.addEventListener('click', () => runTestConnection('ollama'));
  detectOllamaModelsBtn?.addEventListener('click', runDiscoverOllamaModels);
  openOptionsBtn?.addEventListener('click', openOptionsPage);

  syncReloadBtn?.addEventListener('click', () => {
    dirtyFields.clear();
    for (const p of CLOUD_PROVIDERS) {
      clearKeyInputField(p);
    }
    hideSyncNotice();
    loadSettings({ preserveDirty: false });
  });

  syncDismissBtn?.addEventListener('click', hideSyncNotice);

  saveBtn?.addEventListener('click', saveSettings);

  resetBtn?.addEventListener('click', async () => {
    if (!settingsModule) return;
    if (confirm('Are you sure you want to PURGE all access tokens and restore default configuration?')) {
      try {
        const defaults = settingsModule.createDefaultSettings();
        await persistDiff(defaults, {
          clearKeyInputs: CLOUD_PROVIDERS,
          successMessage: 'Data purged — Saved',
          preserveOtherDirty: false
        });
      } catch (_) {
        showStatus('Purge failed', 'error');
      }
    }
  });

  if (globalThis.chrome?.storage?.onChanged?.addListener) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'sync' && areaName !== 'local') return;
      if (areaName === 'local' && changes?.zeus_last_latency) {
        updateTelemetryStatusBar();
      }
      const syncKeys = settingsModule?.SYNC_STORAGE_KEYS || [
        'schemaVersion',
        'provider',
        'models',
        'ollama',
        'sidePanelEnabled',
        'copilotEnabled',
        'copilotMode',
        'copilotProvider',
        'copilotMaxTokens',
        'redactionEnabled',
        'customRedactionPatterns'
      ];
      const relevant =
        (areaName === 'local' && Boolean(changes?.apiKeys)) ||
        (areaName === 'sync' && Object.keys(changes || {}).some((k) => syncKeys.includes(k)));
      if (relevant) {
        handleExternalSettingsChange();
      }
    });
  }

  if (globalThis.chrome?.runtime?.onMessage?.addListener) {
    chrome.runtime.onMessage.addListener((message) => {
      const action = message?.action || message?.type;
      if (action === 'settingsUpdated') {
        if (message?.settings && typeof message.settings === 'object') {
          handleExternalSettingsMessage(message.settings);
        } else {
          handleExternalSettingsChange();
        }
        if (message?.readiness) {
          applyReadinessPayload(message.readiness);
        } else {
          refreshReadiness();
        }
      } else if (action === 'readinessUpdated') {
        if (message?.readiness) {
          applyReadinessPayload(message.readiness);
        } else {
          refreshReadiness();
        }
      }
    });
  }

  loadSettings();
});
