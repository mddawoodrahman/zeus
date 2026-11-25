(function initZeusSidePanel(globalScope) {
  'use strict';

  const CLOUD_PROVIDERS = ['gemini', 'openai', 'claude', 'openrouter'];
  const ALL_PROVIDERS = ['gemini', 'openai', 'claude', 'openrouter', 'ollama'];
  const PROVIDER_LABELS = {
    gemini: 'Gemini',
    openai: 'OpenAI',
    claude: 'Claude',
    openrouter: 'OpenRouter',
    ollama: 'Ollama',
    auto: 'Auto (Smart Routing)'
  };
  const PROVIDER_FALLBACK_HELPERS = {
    gemini: 'Google Gemini models for fast rewrites and reasoning.',
    openai: 'OpenAI GPT and Codex models.',
    claude: 'Anthropic Claude models for structured, long-form prompts.',
    openrouter: 'One API key across multiple cloud model families.',
    ollama: 'Local models served by Ollama on your machine.',
    auto: 'Smart prompt-aware routing across your configured providers.'
  };
  const GROUP_ORDER = ['recommended', 'fast-cheap', 'high-intelligence', 'coding-agents'];

  let safeDOM = globalScope.ZeusSafeDOM;
  if (!safeDOM && typeof require !== 'undefined') {
    try {
      const path = typeof require === 'function' ? require('node:path') : null;
      if (path) {
        safeDOM = require(path.resolve(process.cwd(), 'core/safeDom.js'));
      }
    } catch (_) {
      try {
        safeDOM = require('./core/safeDom.js');
      } catch (_2) {}
    }
  }

  function renderDiff(original, enhanced, targetElement) {
    if (safeDOM && typeof safeDOM.renderDiff === 'function') {
      return safeDOM.renderDiff(original, enhanced, targetElement);
    }
  }

  if (!globalScope.ZeusSafeDOM && safeDOM) {
    globalScope.ZeusSafeDOM = safeDOM;
  }

  if (typeof document === 'undefined') {
    return;
  }

  function getSettingsStore() {
    return globalScope.ZeusSettingsStore ||
      (typeof window !== 'undefined' && window.ZeusSettingsStore) ||
      globalScope.ZeusSettings ||
      (typeof window !== 'undefined' && window.ZeusSettings) ||
      null;
  }

  function getModelRegistry() {
    return globalScope.ZeusModelRegistry ||
      (typeof window !== 'undefined' && window.ZeusModelRegistry) ||
      null;
  }

  function getPromptClient() {
    return (typeof window !== 'undefined' && window.ZeusPromptClient) ||
      globalScope.ZeusPromptClient ||
      null;
  }

  let domBooted = false;
  document.addEventListener('DOMContentLoaded', () => {
    if (domBooted) return;
    domBooted = true;
    // Primary Navigation & Views
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabSections = document.querySelectorAll('.tab-section');
    const btnClosePanel = document.getElementById('btn-close-panel');
    const btnOpenSettings = document.getElementById('btn-open-settings');
    const btnBackToEnhance = document.getElementById('btn-back-to-enhance');
    const readinessPill = document.getElementById('sidepanel-readiness-pill');
    const readinessPillText = document.getElementById('sidepanel-readiness-text');

    // Editor Elements
    const originalInput = document.getElementById('original-input');
    const btnCapture = document.getElementById('btn-capture');
    const btnEnhance = document.getElementById('btn-enhance');
    const diffCard = document.getElementById('diff-card');
    const enhancedOutput = document.getElementById('enhanced-output');
    const editorEmptyGuidance = document.getElementById('editor-empty-guidance');
    const btnInsert = document.getElementById('btn-insert');
    const btnCopy = document.getElementById('btn-copy');

    // Editor Status, Setup & Error Cards
    const stripProvider = document.getElementById('strip-provider');
    const stripModel = document.getElementById('strip-model');
    const stripStatus = document.getElementById('strip-status');
    const btnStripSettings = document.getElementById('btn-strip-settings');
    const setupRequiredCard = document.getElementById('setup-required-card');
    const setupRequiredMessage = document.getElementById('setup-required-message');
    const btnSetupConfigure = document.getElementById('btn-setup-configure');
    const btnSetupAdvanced = document.getElementById('btn-setup-advanced');
    const enhanceErrorCard = document.getElementById('enhance-error-card');
    const enhanceErrorTitle = document.getElementById('enhance-error-title');
    const enhanceErrorMessage = document.getElementById('enhance-error-message');
    const btnErrorSettings = document.getElementById('btn-error-settings');
    const btnErrorRetry = document.getElementById('btn-error-retry');
    const btnErrorDismiss = document.getElementById('btn-error-dismiss');

    // History Elements
    const historyList = document.getElementById('history-list');

    // Template Elements
    const templatesListView = document.getElementById('templates-list-view');
    const templatesEditorView = document.getElementById('templates-editor-view');
    const templateList = document.getElementById('template-list');
    const btnNewTemplate = document.getElementById('btn-new-template');
    const templateNameInput = document.getElementById('template-name');
    const templateTextInput = document.getElementById('template-text');
    const btnSaveTemplate = document.getElementById('btn-save-template');
    const btnDeleteTemplate = document.getElementById('btn-delete-template');
    const btnCancelTemplate = document.getElementById('btn-cancel-template');

    // Modal Elements
    const modalFillVariables = document.getElementById('modal-fill-variables');
    const modalVariablesInputs = document.getElementById('modal-variables-inputs');
    const btnModalFill = document.getElementById('btn-modal-fill');
    const btnModalClose = document.getElementById('btn-modal-close');

    // Settings Elements
    const spReadinessDot = document.getElementById('sp-readiness-dot');
    const spReadinessLabel = document.getElementById('sp-readiness-label');
    const spReadinessDetail = document.getElementById('sp-readiness-detail');
    const spBtnTest = document.getElementById('sp-btn-test');
    const spProviderSelect = document.getElementById('sp-provider');
    const spProviderHelper = document.getElementById('sp-provider-helper');
    const spModelGroup = document.getElementById('sp-model-group');
    const spModelSelect = document.getElementById('sp-model');
    const spModelEmpty = document.getElementById('sp-model-empty');
    const spModelMeta = document.getElementById('sp-model-meta');
    const spModelDisplayName = document.getElementById('sp-model-display-name');
    const spModelBadge = document.getElementById('sp-model-badge');
    const spModelTags = document.getElementById('sp-model-tags');
    const spAutoExplanation = document.getElementById('sp-auto-explanation');
    const spAutoCard = document.getElementById('sp-auto-card');
    const spAutoProviders = document.getElementById('sp-auto-providers');

    // API Key Card Elements
    const spKeyCard = document.getElementById('sp-key-card');
    const spKeyTitle = document.getElementById('sp-key-title');
    const spKeyStatus = document.getElementById('sp-key-status');
    const spApiKeyInput = document.getElementById('sp-api-key');
    const spBtnToggleKey = document.getElementById('sp-btn-toggle-key');
    const spBtnSaveKey = document.getElementById('sp-btn-save-key');
    const spBtnRemoveKey = document.getElementById('sp-btn-remove-key');
    const spRemoveKeyConfirm = document.getElementById('sp-remove-key-confirm');
    const spRemoveConfirmText = document.getElementById('sp-remove-confirm-text');
    const spBtnConfirmRemove = document.getElementById('sp-btn-confirm-remove');
    const spBtnCancelRemove = document.getElementById('sp-btn-cancel-remove');

    // Ollama Card Elements
    const spOllamaCard = document.getElementById('sp-ollama-card');
    const spOllamaHostInput = document.getElementById('sp-ollama-host');
    const spOllamaModelInput = document.getElementById('sp-ollama-model');
    const spBtnDetectOllama = document.getElementById('sp-btn-detect-ollama');
    const spBtnSaveOllama = document.getElementById('sp-btn-save-ollama');
    const spBtnOllamaTest = document.getElementById('sp-btn-ollama-test');
    const spOllamaModelsLabel = document.getElementById('sp-ollama-models-label');
    const spOllamaDiscovered = document.getElementById('sp-ollama-discovered');
    const spOllamaCorsHelp = document.getElementById('sp-ollama-cors-help');
    const spOllamaCorsText = document.getElementById('sp-ollama-cors-text');
    const spOllamaCorsCmd = document.getElementById('sp-ollama-cors-cmd');
    const spBtnCopyCors = document.getElementById('sp-btn-copy-cors');

    // Preferences Elements
    const spCopilotEnabled = document.getElementById('sp-copilot-enabled');
    const spCopilotProvider = document.getElementById('sp-copilot-provider');
    const spCopilotMode = document.getElementById('sp-copilot-mode');
    const spCopilotMaxTokens = document.getElementById('sp-copilot-max-tokens');
    const spRedactionEnabled = document.getElementById('sp-redaction-enabled');
    const spSidePanelEnabled = document.getElementById('sp-sidepanel-enabled');
    const spBtnOpenOptions = document.getElementById('sp-btn-open-options');

    // Toast holder
    const toastHolder = document.getElementById('sidepanel-toast-holder');

    // State
    let currentTemplates = [];
    let editingTemplateIndex = -1;
    let currentFillingTemplateText = '';
    let lastModalTriggerEl = null;
    let capturedSourceUrl = '';
    let activeTab = 'editor';
    let lastWorkbenchTab = 'editor';
    let currentPublicSettings = null;
    let currentReadiness = null;
    let hasBackendReadiness = false;
    let keyTargetProvider = 'gemini';
    let showOllamaInAuto = false;
    let discoveredOllamaModels = [];
    let isTestingConnection = false;
    let internalSaveDepth = 0;
    let settingsSyncSeq = 0;
    let externalSyncInFlight = false;
    let pendingExternalSync = false;

    const dirtyFields = {
      apiKey: false,
      ollamaHost: false,
      ollamaModel: false,
      copilotMaxTokens: false
    };

    // Close panel button
    if (btnClosePanel) {
      btnClosePanel.addEventListener('click', () => {
        window.close();
      });
    }

    // Long-lived port to background script
    if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.connect === 'function') {
      const sidepanelPort = chrome.runtime.connect({ name: 'zeus-sidepanel' });
      if (sidepanelPort && sidepanelPort.onMessage && typeof sidepanelPort.onMessage.addListener === 'function') {
        sidepanelPort.onMessage.addListener((msg) => {
          if (msg && msg.type === 'close') {
            window.close();
          }
        });
      }
    }

    if (originalInput) {
      originalInput.addEventListener('input', () => {
        if (!originalInput.value.trim()) {
          capturedSourceUrl = '';
        }
      });
      originalInput.addEventListener('keydown', (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          event.preventDefault();
          btnEnhance?.click();
        }
      });
    }

    function sendRuntimeMessage(message) {
      return new Promise((resolve) => {
        if (typeof chrome === 'undefined' || !chrome.runtime || typeof chrome.runtime.sendMessage !== 'function') {
          resolve(null);
          return;
        }
        try {
          chrome.runtime.sendMessage(message, (response) => {
            if (chrome.runtime.lastError) {
              void chrome.runtime.lastError;
              resolve(null);
              return;
            }
            resolve(response ?? null);
          });
        } catch (_) {
          resolve(null);
        }
      });
    }

    function openAdvancedSettings() {
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        if (typeof chrome.runtime.openOptionsPage === 'function') {
          try {
            const maybePromise = chrome.runtime.openOptionsPage(() => {
              if (chrome.runtime.lastError) {
                void chrome.runtime.lastError;
                openOptionsTabFallback();
              }
            });
            if (maybePromise && typeof maybePromise.catch === 'function') {
              maybePromise.catch(() => openOptionsTabFallback());
            }
            return;
          } catch (_) {}
        }
        openOptionsTabFallback();
      }
    }

    function openOptionsTabFallback() {
      if (typeof chrome !== 'undefined' && chrome.tabs && typeof chrome.tabs.create === 'function' && chrome.runtime?.getURL) {
        chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
      }
    }

    function clampTokens(value) {
      const store = getSettingsStore();
      if (store && typeof store.clampCopilotMaxTokens === 'function') {
        return store.clampCopilotMaxTokens(value, 60);
      }
      const num = Number(value);
      if (!Number.isFinite(num) || num <= 0) return 60;
      return Math.min(250, Math.max(10, Math.round(num)));
    }

    function normalizeOllamaHostValue(value) {
      const store = getSettingsStore();
      if (store && typeof store.normalizeOllamaHost === 'function') {
        return store.normalizeOllamaHost(value);
      }
      const raw = String(value || '').trim().replace(/\/+$/, '');
      if (!raw) return 'http://localhost:11434';
      try {
        const parsed = new URL(raw);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          return 'http://localhost:11434';
        }
        const cleanPath = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, '');
        return `${parsed.origin}${cleanPath}`;
      } catch (_) {
        return 'http://localhost:11434';
      }
    }

    function getScopedOllamaOrigin() {
      const id = (typeof chrome !== 'undefined' && chrome.runtime?.id) || '<YOUR_EXTENSION_ID>';
      return `chrome-extension://${id}`;
    }

    function buildScopedOllamaCommand() {
      const origin = getScopedOllamaOrigin();
      const isWin = typeof navigator !== 'undefined' && /win/i.test(navigator.platform || navigator.userAgent || '');
      if (isWin) {
        return `$env:OLLAMA_ORIGINS="${origin}"; ollama serve`;
      }
      return `OLLAMA_ORIGINS="${origin}" ollama serve`;
    }

    // Toast helper
    function showToast(message, type = 'info', durationMs = 3000) {
      if (!toastHolder) return null;
      const toast = document.createElement('div');
      toast.className = `zeus-toast ${type}`;
      toast.textContent = `> ${message}`;
      toastHolder.appendChild(toast);

      const dismiss = () => {
        if (!toast.isConnected) return;
        toast.style.opacity = '0';
        setTimeout(() => {
          toast.remove();
        }, 300);
      };

      if (Number(durationMs) > 0) {
        setTimeout(dismiss, durationMs);
      }

      return { element: toast, dismiss };
    }

    // Tab switching
    function switchTab(tabName, options = {}) {
      const isSettings = tabName === 'settings';
      if (!isSettings && ['editor', 'history', 'templates'].includes(tabName)) {
        lastWorkbenchTab = tabName;
      }
      activeTab = tabName;

      tabButtons.forEach((btn) => {
        const isActive = !isSettings && btn.dataset.tab === tabName;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });

      tabSections.forEach((sec) => {
        sec.classList.toggle('active', sec.id === `tab-${tabName}`);
      });

      if (btnOpenSettings) {
        btnOpenSettings.classList.toggle('active', isSettings);
        btnOpenSettings.setAttribute('aria-expanded', isSettings ? 'true' : 'false');
      }

      if (tabName === 'history') {
        loadHistory();
      } else if (tabName === 'templates') {
        loadTemplates();
        cancelTemplateEdit();
      } else if (isSettings && options.focusTarget) {
        options.focusTarget.focus();
      }
    }

    tabButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        switchTab(btn.dataset.tab);
      });
    });

    if (btnOpenSettings) {
      btnOpenSettings.addEventListener('click', () => {
        if (activeTab === 'settings') {
          switchTab(lastWorkbenchTab || 'editor');
        } else {
          switchTab('settings', { focusTarget: btnBackToEnhance || spProviderSelect });
        }
      });
    }

    if (btnBackToEnhance) {
      btnBackToEnhance.addEventListener('click', () => {
        switchTab('editor');
        originalInput?.focus();
      });
    }

    if (readinessPill) {
      readinessPill.addEventListener('click', () => {
        switchTab('settings', { focusTarget: spBtnTest || spProviderSelect });
      });
    }

    if (btnStripSettings) {
      btnStripSettings.addEventListener('click', () => {
        switchTab('settings', { focusTarget: spProviderSelect });
      });
    }

    if (btnSetupConfigure) {
      btnSetupConfigure.addEventListener('click', () => {
        const provider = currentPublicSettings?.provider || 'gemini';
        const focusTarget = CLOUD_PROVIDERS.includes(provider)
          ? spApiKeyInput
          : (provider === 'ollama' ? spOllamaModelInput : spProviderSelect);
        switchTab('settings', { focusTarget });
      });
    }

    if (btnSetupAdvanced) {
      btnSetupAdvanced.addEventListener('click', openAdvancedSettings);
    }

    if (spBtnOpenOptions) {
      spBtnOpenOptions.addEventListener('click', openAdvancedSettings);
    }

    if (btnErrorSettings) {
      btnErrorSettings.addEventListener('click', () => {
        switchTab('settings', { focusTarget: spBtnTest || spProviderSelect });
      });
    }

    if (btnErrorDismiss) {
      btnErrorDismiss.addEventListener('click', hideEnhanceErrorCard);
    }

    if (btnErrorRetry) {
      btnErrorRetry.addEventListener('click', () => {
        hideEnhanceErrorCard();
        btnEnhance?.click();
      });
    }

    function hideEnhanceErrorCard() {
      if (enhanceErrorCard) {
        enhanceErrorCard.style.display = 'none';
      }
    }

    function inferErrorCodeFromMessage(message) {
      const text = String(message || '');
      if (!text) return '';
      if (/ollama blocked extension origin/i.test(text)) return 'OLLAMA_ORIGIN_BLOCKED';
      if (/missing .* api key|no local ollama model|not configured|configure an ai provider/i.test(text)) return 'NOT_CONFIGURED';
      if (/invalid .* api key|authentication|unauthorized/i.test(text)) return 'AUTH_FAILED';
      if (/quota|credits|billing|resource[_\s-]?exhausted/i.test(text)) return 'QUOTA_EXCEEDED';
      if (/rate[_\s-]?limit|too many requests/i.test(text)) return 'RATE_LIMITED';
      if (/timed?\s*out|timeout/i.test(text)) return 'TIMEOUT';
      if (/network|failed to fetch|not running|econnrefused/i.test(text)) return 'NETWORK_UNAVAILABLE';
      if (/temporarily unavailable|model .* not be available|provider unavailable/i.test(text)) return 'PROVIDER_UNAVAILABLE';
      return '';
    }

    function showEnhanceErrorCard(detail) {
      if (!enhanceErrorCard || !enhanceErrorTitle || !enhanceErrorMessage) return;
      const userMsg = String(detail?.userMessage || detail?.message || 'Prompt enhancement failed.');
      const code = String(detail?.code || detail?.category || inferErrorCodeFromMessage(userMsg)).toUpperCase();
      enhanceErrorTitle.textContent = mapErrorCodeToTitle(code);
      enhanceErrorMessage.textContent = userMsg;
      enhanceErrorCard.style.display = 'block';
    }

    function mapErrorCodeToTitle(code) {
      switch (code) {
        case 'NOT_CONFIGURED':
          return 'NOT CONFIGURED';
        case 'AUTH_FAILED':
        case 'AUTHENTICATION_ERROR':
        case 'AUTHORIZATION_ERROR':
          return 'AUTHENTICATION FAILED';
        case 'QUOTA_EXCEEDED':
          return 'QUOTA EXCEEDED';
        case 'RATE_LIMITED':
        case 'RATE_LIMIT_ERROR':
          return 'RATE LIMITED';
        case 'NETWORK_UNAVAILABLE':
        case 'NETWORK_ERROR':
        case 'TIMEOUT':
          return 'NETWORK UNAVAILABLE';
        case 'MODEL_UNAVAILABLE':
        case 'MODEL_NOT_FOUND':
        case 'PROVIDER_UNAVAILABLE':
        case 'SERVER_ERROR':
          return 'PROVIDER UNAVAILABLE';
        case 'OLLAMA_ORIGIN_BLOCKED':
          return 'OLLAMA ORIGIN BLOCKED';
        default:
          return 'REQUEST FAILED';
      }
    }

    function mapStateAndCodeToLabel(state, code, fallbackLabel) {
      if (fallbackLabel) return String(fallbackLabel);
      const upperCode = String(code || '').toUpperCase();
      if (state === 'testing') return 'Testing';
      if (state === 'verified') return 'Connection verified';
      if (state === 'configured_untested') return 'Configured, not tested';
      if (state === 'not_configured') return 'Not configured';

      switch (upperCode) {
        case 'AUTH_FAILED':
        case 'AUTHENTICATION_ERROR':
        case 'AUTHORIZATION_ERROR':
          return 'Authentication failed';
        case 'QUOTA_EXCEEDED':
          return 'Quota exceeded';
        case 'RATE_LIMITED':
        case 'RATE_LIMIT_ERROR':
          return 'Rate limited';
        case 'NETWORK_UNAVAILABLE':
        case 'NETWORK_ERROR':
        case 'TIMEOUT':
          return 'Network unavailable';
        case 'PROVIDER_UNAVAILABLE':
        case 'SERVER_ERROR':
          return 'Provider unavailable';
        case 'MODEL_UNAVAILABLE':
        case 'MODEL_NOT_FOUND':
          return 'Model unavailable';
        case 'OLLAMA_ORIGIN_BLOCKED':
          return 'Origin blocked';
        default:
          return 'Request failed';
      }
    }

    function getStateCssClass(state) {
      switch (state) {
        case 'verified':
          return 'state-verified';
        case 'configured_untested':
          return 'state-untested';
        case 'testing':
          return 'state-testing';
        case 'error':
          return 'state-error';
        default:
          return 'state-unconfigured';
      }
    }

    function normalizeProviderEntry(id, entry, settings) {
      const hasSettings = Boolean(settings && typeof settings === 'object');
      const hasKey = Boolean(settings?.hasApiKey?.[id]);
      const ollamaModel = String(settings?.ollama?.model || '').trim();
      const baseConfigured = id === 'ollama' ? Boolean(ollamaModel) : hasKey;

      if (!entry || typeof entry !== 'object') {
        const state = baseConfigured ? 'configured_untested' : 'not_configured';
        const code = baseConfigured ? '' : 'NOT_CONFIGURED';
        return {
          provider: id,
          configured: baseConfigured,
          state,
          code,
          usable: baseConfigured,
          statusLabel: mapStateAndCodeToLabel(state, code),
          userMessage: '',
          originBlocked: false,
          models: []
        };
      }

      const rawState = String(entry.state || entry.status || (baseConfigured ? 'configured_untested' : 'not_configured'));
      if (hasSettings && !baseConfigured && (
        rawState === 'verified' ||
        (CLOUD_PROVIDERS.includes(id) && (entry.configured || rawState !== 'not_configured'))
      )) {
        return {
          provider: id,
          configured: false,
          state: 'not_configured',
          code: 'NOT_CONFIGURED',
          usable: false,
          statusLabel: 'Not configured',
          userMessage: id === 'ollama'
            ? 'No local Ollama model configured. Detect or enter a local model in Zeus settings.'
            : `Missing ${PROVIDER_LABELS[id] || id} API key. Add your key in Zeus settings.`,
          originBlocked: false,
          models: []
        };
      }

      const configured = hasSettings
        ? baseConfigured
        : (entry.configured !== undefined ? Boolean(entry.configured) : baseConfigured);
      const state = rawState;
      const code = String(entry.code || (configured ? '' : 'NOT_CONFIGURED'));
      const usable = (hasSettings && !baseConfigured && state === 'not_configured')
        ? false
        : (entry.usable !== undefined ? Boolean(entry.usable) : (state !== 'not_configured' && configured));
      const statusLabel = mapStateAndCodeToLabel(state, code, entry.statusLabel || entry.label);
      const userMessage = String(entry.userMessage || entry.message || '');

      return {
        provider: id,
        configured,
        state,
        code,
        usable,
        statusLabel,
        userMessage,
        originBlocked: Boolean(entry.originBlocked || code === 'OLLAMA_ORIGIN_BLOCKED'),
        models: Array.isArray(entry.models) ? entry.models : []
      };
    }

    function deriveFallbackReadiness(settings) {
      const safeSettings = settings || {};
      const activeProvider = String(safeSettings.provider || 'gemini').toLowerCase();
      const providers = {};

      for (const id of ALL_PROVIDERS) {
        providers[id] = normalizeProviderEntry(id, null, safeSettings);
      }

      if (activeProvider === 'auto') {
        const usableList = ALL_PROVIDERS.filter((id) => providers[id].usable);
        const usable = usableList.length > 0;
        const activeState = usable ? 'configured_untested' : 'not_configured';
        return {
          activeProvider: 'auto',
          activeState,
          usable,
          statusLabel: usable ? 'Configured, not tested' : 'Not configured',
          userMessage: usable
            ? `Auto routing ready (${usableList.map((id) => PROVIDER_LABELS[id] || id).join(', ')}).`
            : 'Configure at least one cloud API key or local Ollama model for Auto mode.',
          code: usable ? '' : 'NOT_CONFIGURED',
          providers
        };
      }

      const activeEntry = providers[activeProvider] || normalizeProviderEntry(activeProvider, null, safeSettings);
      return {
        activeProvider,
        activeState: activeEntry.state,
        usable: activeEntry.usable,
        statusLabel: activeEntry.statusLabel,
        userMessage: activeEntry.userMessage || (activeEntry.usable
          ? `${PROVIDER_LABELS[activeProvider] || activeProvider} is configured. Run Test Connection to verify.`
          : `Configure ${PROVIDER_LABELS[activeProvider] || activeProvider} before optimizing prompts.`),
        code: activeEntry.code,
        providers
      };
    }

    function normalizeReadiness(rawResponse, settings) {
      const candidate = rawResponse && typeof rawResponse === 'object'
        ? (rawResponse.readiness && typeof rawResponse.readiness === 'object' ? rawResponse.readiness : rawResponse)
        : null;

      if (!candidate || (!('activeState' in candidate) && !('providers' in candidate))) {
        return { readiness: deriveFallbackReadiness(settings), fromBackend: false };
      }

      const hasSettings = Boolean(settings && typeof settings === 'object');
      const activeProvider = String(candidate.activeProvider || settings?.provider || 'gemini').toLowerCase();
      const providers = {};
      for (const id of ALL_PROVIDERS) {
        providers[id] = normalizeProviderEntry(id, candidate.providers?.[id], settings);
      }

      if (activeProvider === 'auto') {
        const usableList = ALL_PROVIDERS.filter((id) => providers[id].usable);
        const usable = usableList.length > 0;
        const verifiedList = usableList.filter((id) => providers[id].state === 'verified');
        const testingAny = usableList.some((id) => providers[id].state === 'testing');

        let activeState = String(candidate.activeState || candidate.state || (usable ? 'configured_untested' : 'not_configured'));
        let code = String(candidate.code || '');
        let statusLabel = mapStateAndCodeToLabel(activeState, code, candidate.statusLabel || candidate.label);
        let userMessage = String(candidate.userMessage || candidate.message || '');

        if (hasSettings) {
          if (!usable) {
            const configuredList = ALL_PROVIDERS.filter((id) => providers[id].configured);
            if (configuredList.length > 0) {
              const first = providers[configuredList[0]];
              activeState = first.state;
              code = first.code;
              statusLabel = first.statusLabel;
              userMessage = first.userMessage;
            } else {
              activeState = 'not_configured';
              code = 'NOT_CONFIGURED';
              statusLabel = 'Not configured';
              userMessage = 'No AI provider is configured for Auto mode. Add a cloud API key or configure a local Ollama model.';
            }
          } else if (testingAny) {
            activeState = 'testing';
            code = 'TESTING';
            statusLabel = 'Testing';
            if (!userMessage) userMessage = 'Testing configured Auto mode providers...';
          } else if (verifiedList.length > 0) {
            activeState = 'verified';
            code = 'OK';
            statusLabel = 'Connection verified';
            userMessage = `Auto mode ready via ${verifiedList.map((id) => PROVIDER_LABELS[id] || id).join(', ')}.`;
          } else {
            activeState = 'configured_untested';
            code = 'UNTESTED';
            statusLabel = 'Configured, not tested';
            userMessage = `Auto mode ready (${usableList.map((id) => PROVIDER_LABELS[id] || id).join(', ')} configured, not yet tested).`;
          }
        }

        return {
          readiness: {
            activeProvider: 'auto',
            activeState,
            usable: hasSettings ? usable : Boolean(candidate.usable ?? usable),
            statusLabel,
            userMessage,
            code,
            providers
          },
          fromBackend: true
        };
      }

      const activeEntry = providers[activeProvider];
      const useEntryOverride = Boolean(
        hasSettings &&
        activeEntry &&
        activeEntry.state === 'not_configured' &&
        (candidate.activeState === 'verified' || candidate.state === 'verified' || !activeEntry.configured)
      );
      const activeState = useEntryOverride
        ? activeEntry.state
        : String(
          candidate.activeState ||
          candidate.state ||
          activeEntry?.state ||
          (candidate.usable ? 'configured_untested' : 'not_configured')
        );
      const code = useEntryOverride ? activeEntry.code : String(candidate.code || activeEntry?.code || '');
      const usable = useEntryOverride
        ? activeEntry.usable
        : (candidate.usable !== undefined ? Boolean(candidate.usable) : Boolean(activeEntry?.usable));
      const statusLabel = useEntryOverride
        ? activeEntry.statusLabel
        : mapStateAndCodeToLabel(activeState, code, candidate.statusLabel || candidate.label);
      const userMessage = useEntryOverride
        ? activeEntry.userMessage
        : String(candidate.userMessage || candidate.message || activeEntry?.userMessage || '');

      return {
        readiness: {
          activeProvider,
          activeState,
          usable,
          statusLabel,
          userMessage,
          code,
          providers
        },
        fromBackend: true
      };
    }

    async function fetchPublicSettings() {
      const store = getSettingsStore();
      if (store && typeof store.getPublic === 'function') {
        try {
          const pub = await store.getPublic();
          if (pub) return pub;
        } catch (_) {}
      } else if (store && typeof store.getPublicSettings === 'function') {
        try {
          const pub = await store.getPublicSettings();
          if (pub) return pub;
        } catch (_) {}
      }

      const client = getPromptClient();
      if (client && typeof client.dispatchMessage === 'function') {
        const res = await client.dispatchMessage({ action: 'getSettings' }, 3000).catch(() => null);
        if (res?.settings) return res.settings;
      }

      const directRes = await sendRuntimeMessage({ action: 'getSettings' });
      return directRes?.settings || null;
    }

    function arePublicSettingsEqual(a, b) {
      if (!a || !b) return false;
      if (
        String(a.provider || '') !== String(b.provider || '') ||
        Boolean(a.sidePanelEnabled) !== Boolean(b.sidePanelEnabled) ||
        Boolean(a.copilotEnabled) !== Boolean(b.copilotEnabled) ||
        String(a.copilotMode || '') !== String(b.copilotMode || '') ||
        String(a.copilotProvider || '') !== String(b.copilotProvider || '') ||
        Number(a.copilotMaxTokens ?? 60) !== Number(b.copilotMaxTokens ?? 60) ||
        Boolean(a.redactionEnabled !== false) !== Boolean(b.redactionEnabled !== false)
      ) {
        return false;
      }

      const patternsA = Array.isArray(a.customRedactionPatterns) ? a.customRedactionPatterns : [];
      const patternsB = Array.isArray(b.customRedactionPatterns) ? b.customRedactionPatterns : [];
      if (patternsA.length !== patternsB.length || patternsA.some((val, idx) => val !== patternsB[idx])) {
        return false;
      }

      for (const p of CLOUD_PROVIDERS) {
        if (String(a.models?.[p] || '') !== String(b.models?.[p] || '')) return false;
        if (Boolean(a.hasApiKey?.[p]) !== Boolean(b.hasApiKey?.[p])) return false;
      }

      if (
        String(a.ollama?.host || '') !== String(b.ollama?.host || '') ||
        String(a.ollama?.model || '') !== String(b.ollama?.model || '')
      ) {
        return false;
      }

      return true;
    }

    function toPublicSnapshot(settingsObj) {
      if (!settingsObj || typeof settingsObj !== 'object') return null;
      const store = getSettingsStore();
      if (store && typeof store.getPublicSettings === 'function') {
        return store.getPublicSettings(settingsObj);
      }
      return settingsObj;
    }

    async function persistSettingsDiff(diff) {
      const store = getSettingsStore();
      if (!store || typeof store.update !== 'function') {
        throw new Error('Settings store unavailable.');
      }

      internalSaveDepth += 1;
      settingsSyncSeq += 1;
      try {
        const result = await store.update(diff);
        if (!result || !result.settings) {
          throw new Error('Failed to verify persisted settings.');
        }

        const publicSettings = toPublicSnapshot(result.settings);
        currentPublicSettings = publicSettings;

        await sendRuntimeMessage({ action: 'settingsUpdated', settings: publicSettings });
        return publicSettings;
      } finally {
        internalSaveDepth = Math.max(0, internalSaveDepth - 1);
      }
    }

    function getActiveModelSummary(settings) {
      const provider = String(settings?.provider || 'gemini').toLowerCase();
      if (provider === 'auto') return 'Smart Routing';
      if (provider === 'ollama') {
        return String(settings?.ollama?.model || '').trim() || 'No model set';
      }
      const modelId = String(settings?.models?.[provider] || '').trim();
      const registry = getModelRegistry();
      const modelObj = registry?.getModel?.(provider, modelId);
      return modelObj?.label || modelId || 'Default';
    }

    function renderReadinessAndStatus() {
      const settings = currentPublicSettings;
      const readiness = currentReadiness || deriveFallbackReadiness(settings);
      const provider = String(readiness.activeProvider || settings?.provider || 'gemini').toLowerCase();
      const providerLabel = PROVIDER_LABELS[provider] || provider;
      const stateClass = getStateCssClass(readiness.activeState);
      const statusText = isTestingConnection ? 'Testing' : readiness.statusLabel;
      const effectiveStateClass = isTestingConnection ? 'state-testing' : stateClass;

      if (readinessPill && readinessPillText) {
        readinessPill.className = `readiness-pill ${effectiveStateClass}`;
        readinessPillText.textContent = `${providerLabel} • ${statusText}`;
      }

      if (stripProvider) {
        stripProvider.textContent = provider === 'auto' ? 'Auto' : providerLabel;
      }
      if (stripModel) {
        stripModel.textContent = getActiveModelSummary(settings);
      }
      if (stripStatus) {
        stripStatus.textContent = statusText;
        stripStatus.className = `strip-value strip-status-value ${effectiveStateClass}`;
      }

      if (setupRequiredCard) {
        const shouldShowSetup = Boolean(settings) && readiness.activeState === 'not_configured' && !readiness.usable;
        setupRequiredCard.style.display = shouldShowSetup ? 'block' : 'none';
        if (setupRequiredMessage && shouldShowSetup) {
          setupRequiredMessage.textContent = provider === 'ollama'
            ? 'Configure an Ollama local model before optimizing prompts.'
            : (provider === 'auto'
              ? 'Configure at least one AI provider before optimizing prompts.'
              : `Configure a ${providerLabel} API key before optimizing prompts.`);
        }
      }

      if (spReadinessDot) {
        spReadinessDot.className = `readiness-dot ${effectiveStateClass}`;
      }
      if (spReadinessLabel) {
        spReadinessLabel.textContent = statusText;
        spReadinessLabel.className = `readiness-state-label ${effectiveStateClass}`;
      }
      if (spReadinessDetail) {
        spReadinessDetail.textContent = isTestingConnection
          ? `Verifying ${providerLabel} connection...`
          : (readiness.userMessage || '');
      }
      if (spBtnTest) {
        spBtnTest.disabled = isTestingConnection;
        spBtnTest.textContent = isTestingConnection ? 'TESTING...' : 'TEST CONNECTION';
      }
      if (spBtnOllamaTest) {
        spBtnOllamaTest.disabled = isTestingConnection;
      }

      renderAutoProviderRows(readiness);
    }

    function renderAutoProviderRows(readiness) {
      if (!spAutoProviders) return;
      spAutoProviders.replaceChildren();

      for (const id of ALL_PROVIDERS) {
        const entry = readiness?.providers?.[id] || normalizeProviderEntry(id, null, currentPublicSettings);
        const row = document.createElement('div');
        row.className = 'auto-provider-row';

        const info = document.createElement('div');
        info.className = 'auto-provider-info';

        const nameEl = document.createElement('span');
        nameEl.className = 'auto-provider-name';
        nameEl.textContent = PROVIDER_LABELS[id] || id;

        const stateEl = document.createElement('span');
        stateEl.className = `auto-provider-state ${getStateCssClass(entry.state)}`;
        stateEl.textContent = entry.statusLabel;

        info.appendChild(nameEl);
        info.appendChild(stateEl);

        const actions = document.createElement('div');
        actions.className = 'auto-provider-actions';

        const configBtn = document.createElement('button');
        configBtn.type = 'button';
        configBtn.className = 'zeus-btn zeus-btn-cyan mini-action-btn';
        configBtn.textContent = entry.configured ? 'Edit' : 'Configure';
        configBtn.addEventListener('click', () => {
          if (CLOUD_PROVIDERS.includes(id)) {
            if (keyTargetProvider !== id) {
              keyTargetProvider = id;
              clearApiKeyDraft();
            }
            showOllamaInAuto = false;
            renderKeyCard(currentPublicSettings);
            renderOllamaCardVisibility(currentPublicSettings?.provider || 'auto');
            spApiKeyInput?.focus();
          } else if (id === 'ollama') {
            showOllamaInAuto = true;
            renderOllamaCardVisibility(currentPublicSettings?.provider || 'auto');
            spOllamaModelInput?.focus();
          }
        });

        actions.appendChild(configBtn);

        if (entry.configured) {
          const testBtn = document.createElement('button');
          testBtn.type = 'button';
          testBtn.className = 'zeus-btn zeus-btn-yellow mini-action-btn';
          testBtn.textContent = 'Test';
          testBtn.disabled = isTestingConnection;
          testBtn.addEventListener('click', () => runConnectionTest(id));
          actions.appendChild(testBtn);
        }

        row.appendChild(info);
        row.appendChild(actions);
        spAutoProviders.appendChild(row);
      }
    }

    function populateModelSelector(provider, selectedModel) {
      if (!spModelSelect || !spModelGroup) return;

      const registry = getModelRegistry();
      const isAuto = provider === 'auto';
      const isOllama = provider === 'ollama';

      if (spAutoExplanation) {
        spAutoExplanation.style.display = isAuto ? 'block' : 'none';
      }

      if (isAuto || isOllama) {
        spModelGroup.style.display = 'none';
        return;
      }

      spModelGroup.style.display = 'block';
      spModelSelect.replaceChildren();

      const groupedModels = registry?.getGroupedModels?.(provider) || {};
      const groupLabels = registry?.getGroupLabels?.() || {
        recommended: 'Recommended (Latest)',
        'fast-cheap': 'Fast / Cheap',
        'high-intelligence': 'High Intelligence',
        'coding-agents': 'Coding / Agents'
      };

      const normalizedSelected = provider === 'gemini' && registry?.normalizeGeminiModel
        ? registry.normalizeGeminiModel(selectedModel)
        : String(selectedModel || '').trim();

      let totalOptions = 0;
      const optionValues = [];

      for (const groupKey of GROUP_ORDER) {
        const models = Array.isArray(groupedModels[groupKey]) ? groupedModels[groupKey] : [];
        if (models.length === 0) continue;

        const optgroup = document.createElement('optgroup');
        optgroup.label = groupLabels[groupKey] || groupKey;

        for (const model of models) {
          const option = document.createElement('option');
          option.value = model.id;
          option.textContent = model.badge ? `${model.label || model.id} (${model.badge})` : (model.label || model.id);
          optgroup.appendChild(option);
          optionValues.push(model.id);
          totalOptions += 1;
        }

        spModelSelect.appendChild(optgroup);
      }

      if (normalizedSelected && !optionValues.includes(normalizedSelected)) {
        const customOpt = document.createElement('option');
        customOpt.value = normalizedSelected;
        customOpt.textContent = `${normalizedSelected} (saved)`;
        spModelSelect.appendChild(customOpt);
        optionValues.push(normalizedSelected);
        totalOptions += 1;
      }

      if (totalOptions === 0) {
        spModelSelect.style.display = 'none';
        if (spModelEmpty) spModelEmpty.style.display = 'block';
        if (spModelMeta) spModelMeta.style.display = 'none';
        return;
      }

      spModelSelect.style.display = 'block';
      if (spModelEmpty) spModelEmpty.style.display = 'none';

      spModelSelect.value = normalizedSelected && optionValues.includes(normalizedSelected)
        ? normalizedSelected
        : optionValues[0];

      renderSelectedModelMeta(provider, spModelSelect.value);
    }

    function renderSelectedModelMeta(provider, modelId) {
      if (!spModelMeta || !spModelDisplayName || !spModelBadge || !spModelTags) return;
      const model = getModelRegistry()?.getModel?.(provider, modelId);
      if (!model) {
        spModelMeta.style.display = 'none';
        return;
      }

      spModelMeta.style.display = 'block';
      spModelDisplayName.textContent = model.label || model.id;
      spModelBadge.textContent = model.badge || '';
      spModelBadge.style.display = model.badge ? 'inline-block' : 'none';
      const details = [
        model.speed ? `Speed: ${model.speed}` : '',
        model.cost ? `Cost: ${model.cost}` : '',
        model.bestFor?.length ? `Best for: ${model.bestFor.join(', ')}` : ''
      ].filter(Boolean);
      spModelTags.textContent = details.join(' • ');
    }

    function clearApiKeyDraft() {
      if (spApiKeyInput) {
        spApiKeyInput.value = '';
        spApiKeyInput.type = 'password';
      }
      if (spBtnToggleKey) {
        spBtnToggleKey.textContent = 'Show';
        spBtnToggleKey.setAttribute('aria-pressed', 'false');
      }
      if (spRemoveKeyConfirm) {
        spRemoveKeyConfirm.style.display = 'none';
      }
      dirtyFields.apiKey = false;
    }

    function renderKeyCard(settings) {
      if (!spKeyCard) return;
      const activeProvider = String(settings?.provider || 'gemini').toLowerCase();
      const hasKeyDraft = Boolean(dirtyFields.apiKey || spApiKeyInput?.value?.length > 0);

      if (CLOUD_PROVIDERS.includes(activeProvider) && !hasKeyDraft) {
        keyTargetProvider = activeProvider;
      }

      const showCard = CLOUD_PROVIDERS.includes(activeProvider) ||
        activeProvider === 'auto' ||
        (hasKeyDraft && CLOUD_PROVIDERS.includes(keyTargetProvider));
      spKeyCard.style.display = showCard ? 'block' : 'none';
      if (!showCard) return;

      const target = CLOUD_PROVIDERS.includes(keyTargetProvider) ? keyTargetProvider : 'gemini';
      const isConfigured = Boolean(settings?.hasApiKey?.[target]);
      const label = PROVIDER_LABELS[target] || target;

      if (spKeyTitle) {
        spKeyTitle.textContent = activeProvider === 'auto'
          ? `/// ${label.toUpperCase()} API KEY (AUTO)`
          : `/// ${label.toUpperCase()} API KEY`;
      }

      if (spKeyStatus) {
        spKeyStatus.textContent = isConfigured ? 'API key configured' : 'Not configured';
        spKeyStatus.className = `key-status-pill ${isConfigured ? 'configured' : 'unconfigured'}`;
      }

      if (spApiKeyInput) {
        spApiKeyInput.placeholder = isConfigured
          ? `Enter new ${label} key to replace saved key`
          : `Enter ${label} API key...`;
      }

      if (spBtnSaveKey) {
        spBtnSaveKey.textContent = isConfigured ? 'Replace Key' : 'Save Key';
      }

      if (spBtnRemoveKey) {
        spBtnRemoveKey.style.display = isConfigured ? 'inline-block' : 'none';
      }

      if (spRemoveConfirmText) {
        spRemoveConfirmText.textContent = `Remove saved ${label} API key? Requests using ${label} will fail until a new key is saved.`;
      }

      if (!isConfigured && spRemoveKeyConfirm) {
        spRemoveKeyConfirm.style.display = 'none';
      }
    }

    function renderOllamaCardVisibility(provider) {
      if (!spOllamaCard) return;
      const shouldShow = provider === 'ollama' || (provider === 'auto' && showOllamaInAuto);
      spOllamaCard.style.display = shouldShow ? 'block' : 'none';
    }

    function renderOllamaModelChips() {
      if (!spOllamaDiscovered) return;
      spOllamaDiscovered.replaceChildren();

      const registry = getModelRegistry();
      const suggested = registry?.providers?.ollama?.suggestedLocalModels || ['llama4', 'qwen3:8b', 'mistral-large', 'deepseek-coder-v2'];
      const modelsToShow = discoveredOllamaModels.length > 0 ? discoveredOllamaModels : suggested;
      const activeModel = String(spOllamaModelInput?.value || currentPublicSettings?.ollama?.model || '').trim();

      if (spOllamaModelsLabel) {
        spOllamaModelsLabel.textContent = discoveredOllamaModels.length > 0
          ? 'DETECTED LOCAL MODELS'
          : 'SUGGESTED LOCAL MODELS';
      }

      for (const modelName of modelsToShow) {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = `ollama-chip${activeModel === modelName ? ' active' : ''}`;
        chip.textContent = modelName;
        chip.addEventListener('click', async () => {
          if (spOllamaModelInput) {
            spOllamaModelInput.value = modelName;
            dirtyFields.ollamaModel = false;
          }
          await saveOllamaFields({ model: modelName });
        });
        spOllamaDiscovered.appendChild(chip);
      }
    }

    function showOllamaCorsGuidance(customMessage) {
      if (!spOllamaCorsHelp || !spOllamaCorsText || !spOllamaCorsCmd) return;
      const origin = getScopedOllamaOrigin();
      spOllamaCorsText.textContent = customMessage || `Ollama blocked extension origin '${origin}'. Start Ollama with your scoped extension origin and retry.`;
      spOllamaCorsCmd.value = buildScopedOllamaCommand();
      spOllamaCorsHelp.style.display = 'block';
    }

    function hideOllamaCorsGuidance() {
      if (spOllamaCorsHelp) {
        spOllamaCorsHelp.style.display = 'none';
      }
    }

    function applyPublicSettingsToUI(settings, options = {}) {
      if (!settings) return;
      const prevProvider = currentPublicSettings?.provider;
      currentPublicSettings = settings;
      const provider = String(settings.provider || 'gemini').toLowerCase();

      if (prevProvider && prevProvider !== provider && !options.preserveKeyDraft) {
        clearApiKeyDraft();
      }

      if (spProviderSelect) {
        spProviderSelect.value = provider;
      }

      if (spProviderHelper) {
        const helper = getModelRegistry()?.getProviderHelper?.(provider) || PROVIDER_FALLBACK_HELPERS[provider] || '';
        spProviderHelper.textContent = helper;
      }

      populateModelSelector(provider, settings.models?.[provider]);

      if (spAutoCard) {
        spAutoCard.style.display = provider === 'auto' ? 'block' : 'none';
      }

      renderKeyCard(settings);
      renderOllamaCardVisibility(provider);

      if (spOllamaHostInput && !dirtyFields.ollamaHost) {
        spOllamaHostInput.value = settings.ollama?.host || 'http://localhost:11434';
      }
      if (spOllamaModelInput && !dirtyFields.ollamaModel) {
        spOllamaModelInput.value = settings.ollama?.model || '';
      }
      renderOllamaModelChips();

      if (spCopilotEnabled) {
        spCopilotEnabled.checked = Boolean(settings.copilotEnabled);
      }
      if (spCopilotProvider) {
        spCopilotProvider.value = settings.copilotProvider || 'auto';
      }
      if (spCopilotMode) {
        spCopilotMode.value = settings.copilotMode || 'conservative';
      }
      if (spCopilotMaxTokens && !dirtyFields.copilotMaxTokens) {
        spCopilotMaxTokens.value = String(clampTokens(settings.copilotMaxTokens));
      }
      if (spRedactionEnabled) {
        spRedactionEnabled.checked = settings.redactionEnabled !== false;
      }
      if (spSidePanelEnabled) {
        spSidePanelEnabled.checked = settings.sidePanelEnabled !== false;
      }
    }

    async function refreshReadinessFromBackend(settingsOverride) {
      const seq = settingsSyncSeq;
      const settings = settingsOverride || currentPublicSettings;
      const response = await sendRuntimeMessage({ action: 'getProviderReadiness' });
      if (seq !== settingsSyncSeq) return currentReadiness;
      const { readiness, fromBackend } = normalizeReadiness(response, settings);
      hasBackendReadiness = fromBackend;
      currentReadiness = readiness;
      renderReadinessAndStatus();
      return readiness;
    }

    async function bootstrapSettingsAndReadiness() {
      const seq = ++settingsSyncSeq;
      const settings = await fetchPublicSettings();
      if (seq !== settingsSyncSeq) return;
      if (settings) {
        applyPublicSettingsToUI(settings);
      }
      await refreshReadinessFromBackend(settings);
    }

    // Settings event handlers
    if (spProviderSelect) {
      spProviderSelect.addEventListener('change', async () => {
        const nextProvider = spProviderSelect.value;
        showOllamaInAuto = false;
        clearApiKeyDraft();
        try {
          const updated = await persistSettingsDiff({ provider: nextProvider });
          applyPublicSettingsToUI(updated);
          await refreshReadinessFromBackend(updated);
          showToast(`Provider set to ${PROVIDER_LABELS[nextProvider] || nextProvider}`, 'success', 2000);
        } catch (err) {
          showToast(err?.message || 'Failed to save provider selection', 'error', 3000);
        }
      });
    }

    if (spModelSelect) {
      spModelSelect.addEventListener('change', async () => {
        const provider = spProviderSelect?.value || currentPublicSettings?.provider || 'gemini';
        const modelId = spModelSelect.value;
        if (!modelId || !CLOUD_PROVIDERS.includes(provider)) return;
        renderSelectedModelMeta(provider, modelId);
        try {
          const updated = await persistSettingsDiff({ models: { [provider]: modelId } });
          applyPublicSettingsToUI(updated, { preserveKeyDraft: true });
          await refreshReadinessFromBackend(updated);
          showToast('Model saved successfully', 'success', 1800);
        } catch (err) {
          showToast(err?.message || 'Failed to save model', 'error', 3000);
        }
      });
    }

    if (spApiKeyInput) {
      spApiKeyInput.addEventListener('input', () => {
        const wasDirty = dirtyFields.apiKey;
        dirtyFields.apiKey = spApiKeyInput.value.length > 0;
        if (wasDirty && !dirtyFields.apiKey && currentPublicSettings) {
          renderKeyCard(currentPublicSettings);
        }
      });
      spApiKeyInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          spBtnSaveKey?.click();
        }
      });
    }

    if (spBtnToggleKey && spApiKeyInput) {
      spBtnToggleKey.addEventListener('click', () => {
        const reveal = spApiKeyInput.type === 'password';
        spApiKeyInput.type = reveal ? 'text' : 'password';
        spBtnToggleKey.textContent = reveal ? 'Hide' : 'Show';
        spBtnToggleKey.setAttribute('aria-pressed', reveal ? 'true' : 'false');
      });
    }

    if (spBtnSaveKey) {
      spBtnSaveKey.addEventListener('click', async () => {
        const target = CLOUD_PROVIDERS.includes(keyTargetProvider)
          ? keyTargetProvider
          : (currentPublicSettings?.provider || 'gemini');
        if (!CLOUD_PROVIDERS.includes(target)) return;

        const keyVal = String(spApiKeyInput?.value || '').trim();
        if (!keyVal) {
          showToast('Enter an API key first — existing keys are never cleared by blank input', 'warning', 2800);
          spApiKeyInput?.focus();
          return;
        }

        spBtnSaveKey.disabled = true;
        try {
          const updated = await persistSettingsDiff({ apiKeys: { [target]: keyVal } });
          clearApiKeyDraft();
          applyPublicSettingsToUI(updated);
          await refreshReadinessFromBackend(updated);
          hideEnhanceErrorCard();
          showToast(`${PROVIDER_LABELS[target] || target} API key saved successfully`, 'success', 2200);
        } catch (err) {
          showToast(err?.message || 'Failed to save API key', 'error', 3000);
        } finally {
          spBtnSaveKey.disabled = false;
        }
      });
    }

    if (spBtnRemoveKey) {
      spBtnRemoveKey.addEventListener('click', () => {
        if (spRemoveKeyConfirm) {
          spRemoveKeyConfirm.style.display = 'block';
          spBtnConfirmRemove?.focus();
        }
      });
    }

    if (spBtnCancelRemove) {
      spBtnCancelRemove.addEventListener('click', () => {
        if (spRemoveKeyConfirm) {
          spRemoveKeyConfirm.style.display = 'none';
        }
        spBtnRemoveKey?.focus();
      });
    }

    if (spBtnConfirmRemove) {
      spBtnConfirmRemove.addEventListener('click', async () => {
        const target = CLOUD_PROVIDERS.includes(keyTargetProvider)
          ? keyTargetProvider
          : (currentPublicSettings?.provider || 'gemini');
        if (!CLOUD_PROVIDERS.includes(target)) return;

        spBtnConfirmRemove.disabled = true;
        try {
          const updated = await persistSettingsDiff({ apiKeys: { [target]: '' } });
          clearApiKeyDraft();
          applyPublicSettingsToUI(updated);
          await refreshReadinessFromBackend(updated);
          showToast(`${PROVIDER_LABELS[target] || target} API key removed`, 'success', 2200);
        } catch (err) {
          showToast(err?.message || 'Failed to remove API key', 'error', 3000);
        } finally {
          spBtnConfirmRemove.disabled = false;
        }
      });
    }

    async function saveOllamaFields(overrides = {}) {
      const host = normalizeOllamaHostValue(overrides.host !== undefined ? overrides.host : spOllamaHostInput?.value);
      const model = String(overrides.model !== undefined ? overrides.model : (spOllamaModelInput?.value || '')).trim();
      try {
        const updated = await persistSettingsDiff({ ollama: { host, model } });
        dirtyFields.ollamaHost = false;
        dirtyFields.ollamaModel = false;
        applyPublicSettingsToUI(updated, { preserveKeyDraft: true });
        await refreshReadinessFromBackend(updated);
        showToast('Ollama settings saved', 'success', 1800);
      } catch (err) {
        showToast(err?.message || 'Failed to save Ollama settings', 'error', 3000);
      }
    }

    if (spOllamaHostInput) {
      spOllamaHostInput.addEventListener('input', () => {
        dirtyFields.ollamaHost = true;
      });
      spOllamaHostInput.addEventListener('change', () => {
        saveOllamaFields();
      });
    }

    if (spOllamaModelInput) {
      spOllamaModelInput.addEventListener('input', () => {
        dirtyFields.ollamaModel = true;
      });
      spOllamaModelInput.addEventListener('change', () => {
        saveOllamaFields();
      });
    }

    if (spBtnSaveOllama) {
      spBtnSaveOllama.addEventListener('click', () => saveOllamaFields());
    }

    if (spBtnDetectOllama) {
      spBtnDetectOllama.addEventListener('click', async () => {
        const host = normalizeOllamaHostValue(spOllamaHostInput?.value);
        spBtnDetectOllama.disabled = true;
        spBtnDetectOllama.textContent = 'DETECTING...';
        hideOllamaCorsGuidance();

        try {
          const res = await sendRuntimeMessage({ action: 'discoverOllamaModels', host });
          if (!res || (!('reachable' in res) && !Array.isArray(res.models) && !res.originBlocked)) {
            showToast('Ollama discovery unavailable in this context', 'warning', 2500);
            return;
          }

          if (res.originBlocked) {
            showOllamaCorsGuidance(res.error || res.errorDetail?.userMessage);
            showToast('Ollama blocked extension origin — see CORS guidance', 'error', 3500);
            return;
          }

          if (!res.reachable) {
            showToast(res.error || `Ollama unreachable at ${host}`, 'error', 3200);
            return;
          }

          discoveredOllamaModels = Array.isArray(res.models) ? res.models : [];
          if (discoveredOllamaModels.length > 0) {
            if (spOllamaModelInput && !spOllamaModelInput.value.trim()) {
              spOllamaModelInput.value = discoveredOllamaModels[0];
              await saveOllamaFields({ host, model: discoveredOllamaModels[0] });
            }
            renderOllamaModelChips();
            showToast(`Detected ${discoveredOllamaModels.length} Ollama model(s)`, 'success', 2200);
          } else {
            renderOllamaModelChips();
            showToast('Ollama reachable, but no local models installed', 'warning', 3000);
          }
        } finally {
          spBtnDetectOllama.disabled = false;
          spBtnDetectOllama.textContent = 'Detect Models';
        }
      });
    }

    if (spBtnCopyCors && spOllamaCorsCmd) {
      spBtnCopyCors.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(spOllamaCorsCmd.value);
          showToast('Copied OLLAMA_ORIGINS command', 'success', 1800);
        } catch (_) {
          showToast('Clipboard access denied', 'error', 2200);
        }
      });
    }

    async function runConnectionTest(explicitProvider) {
      if (isTestingConnection) return;

      const provider = explicitProvider || spProviderSelect?.value || currentPublicSettings?.provider || 'gemini';

      if (CLOUD_PROVIDERS.includes(provider) && spApiKeyInput?.value?.trim() && keyTargetProvider === provider) {
        showToast('Save your new API key before testing connection', 'warning', 2800);
        return;
      }

      isTestingConnection = true;
      hideOllamaCorsGuidance();
      renderReadinessAndStatus();

      try {
        const payload = { action: 'testConnection', provider };
        let hasUnsavedOverride = false;
        if (provider === 'ollama') {
          payload.host = normalizeOllamaHostValue(spOllamaHostInput?.value || currentPublicSettings?.ollama?.host);
          const modelVal = String(spOllamaModelInput?.value || currentPublicSettings?.ollama?.model || '').trim();
          if (modelVal) payload.model = modelVal;
          const savedHost = normalizeOllamaHostValue(currentPublicSettings?.ollama?.host);
          const savedModel = String(currentPublicSettings?.ollama?.model || '').trim();
          hasUnsavedOverride = payload.host !== savedHost || modelVal !== savedModel;
        } else if (CLOUD_PROVIDERS.includes(provider)) {
          const modelVal = String(
            (provider === spProviderSelect?.value ? spModelSelect?.value : '') ||
            currentPublicSettings?.models?.[provider] ||
            ''
          ).trim();
          if (modelVal) payload.model = modelVal;
          const savedModel = String(currentPublicSettings?.models?.[provider] || '').trim();
          hasUnsavedOverride = Boolean(modelVal && modelVal !== savedModel);
        }

        const res = await sendRuntimeMessage(payload);
        if (!res || (!res.readiness && !res.result && !('ok' in res))) {
          showToast('Connection test requires background runtime handler', 'warning', 2600);
          return;
        }

        const { readiness, fromBackend } = normalizeReadiness(res, currentPublicSettings);
        const targetResult = res.result || res;

        if (hasUnsavedOverride && provider !== 'auto' && targetResult && typeof targetResult === 'object') {
          const overrideState = String(targetResult.state || (targetResult.ok ? 'verified' : 'error'));
          const overrideCode = String(targetResult.code || (overrideState === 'verified' ? 'OK' : ''));
          const overrideEntry = {
            ...(readiness.providers?.[provider] || {}),
            ...targetResult,
            state: overrideState,
            code: overrideCode,
            statusLabel: mapStateAndCodeToLabel(overrideState, overrideCode, targetResult.statusLabel),
            usable: targetResult.usable !== undefined ? Boolean(targetResult.usable) : overrideState === 'verified',
            userMessage: String(targetResult.userMessage || targetResult.message || '')
          };
          readiness.providers[provider] = overrideEntry;
          if (readiness.activeProvider === provider) {
            readiness.activeState = overrideEntry.state;
            readiness.statusLabel = overrideEntry.statusLabel;
            readiness.code = overrideEntry.code;
            readiness.usable = overrideEntry.usable;
            readiness.userMessage = overrideEntry.userMessage;
          }
        }

        if (fromBackend || hasUnsavedOverride) {
          hasBackendReadiness = fromBackend;
          currentReadiness = readiness;
        }

        const targetEntry = readiness.providers?.[provider];
        const originBlocked = Boolean(targetResult?.originBlocked || targetEntry?.originBlocked || targetResult?.code === 'OLLAMA_ORIGIN_BLOCKED');

        if (provider === 'ollama' && originBlocked) {
          showOllamaCorsGuidance(targetResult?.userMessage || targetEntry?.userMessage);
        }

        if (res.success && (targetResult?.ok !== false) && readiness.activeState !== 'error') {
          hideEnhanceErrorCard();
          showToast(targetResult?.statusLabel || readiness.statusLabel || 'Connection verified', 'success', 2400);
        } else {
          const errMsg = targetResult?.userMessage || targetEntry?.userMessage || readiness.userMessage || readiness.statusLabel;
          const toastType = (targetResult?.state === 'not_configured' && targetResult?.reachable) ? 'warning' : 'error';
          showToast(errMsg, toastType, 3500);
        }
      } finally {
        isTestingConnection = false;
        renderReadinessAndStatus();
      }
    }

    if (spBtnTest) {
      spBtnTest.addEventListener('click', () => runConnectionTest());
    }
    if (spBtnOllamaTest) {
      spBtnOllamaTest.addEventListener('click', () => runConnectionTest('ollama'));
    }

    // Preferences handlers
    async function savePreferencePatch(patch, message) {
      try {
        const updated = await persistSettingsDiff(patch);
        applyPublicSettingsToUI(updated, { preserveKeyDraft: true });
        await refreshReadinessFromBackend(updated);
        if (message) showToast(message, 'success', 1800);
      } catch (err) {
        showToast(err?.message || 'Failed to save preference', 'error', 2800);
      }
    }

    if (spCopilotEnabled) {
      spCopilotEnabled.addEventListener('change', () => {
        savePreferencePatch({ copilotEnabled: spCopilotEnabled.checked }, 'Copilot setting saved');
      });
    }
    if (spCopilotProvider) {
      spCopilotProvider.addEventListener('change', () => {
        savePreferencePatch({ copilotProvider: spCopilotProvider.value }, 'Copilot provider saved');
      });
    }
    if (spCopilotMode) {
      spCopilotMode.addEventListener('change', () => {
        savePreferencePatch({ copilotMode: spCopilotMode.value }, 'Copilot mode saved');
      });
    }
    if (spCopilotMaxTokens) {
      spCopilotMaxTokens.addEventListener('input', () => {
        dirtyFields.copilotMaxTokens = true;
      });
      spCopilotMaxTokens.addEventListener('change', () => {
        const clamped = clampTokens(spCopilotMaxTokens.value);
        spCopilotMaxTokens.value = String(clamped);
        dirtyFields.copilotMaxTokens = false;
        savePreferencePatch({ copilotMaxTokens: clamped }, 'Copilot token bound saved');
      });
    }
    if (spRedactionEnabled) {
      spRedactionEnabled.addEventListener('change', () => {
        savePreferencePatch({ redactionEnabled: spRedactionEnabled.checked }, 'Redaction setting saved');
      });
    }
    if (spSidePanelEnabled) {
      spSidePanelEnabled.addEventListener('change', () => {
        savePreferencePatch({ sidePanelEnabled: spSidePanelEnabled.checked }, 'Toolbar click preference saved');
      });
    }

    // Capture input from page
    if (btnCapture) {
      btnCapture.addEventListener('click', () => {
        btnCapture.disabled = true;
        showToast('CAPTURING COMPOSER INPUT...', 'info', 1500);

        chrome.runtime.sendMessage({ type: 'sidePanel:getCurrentInput' }, (response) => {
          void chrome.runtime?.lastError;
          btnCapture.disabled = false;
          if (response && response.value !== undefined) {
            capturedSourceUrl = typeof response.url === 'string' ? response.url : '';
            if (originalInput) originalInput.value = response.value;
            if (response.value) {
              showToast('INPUT RETRIEVED SUCCESSFULLY', 'success', 2000);
            } else {
              showToast('COMPOSER IS EMPTY', 'error', 2500);
            }
          } else {
            showToast('NO ACTIVE COMPOSER DETECTED', 'error', 2500);
          }
        });
      });
    }

    // Enhance prompt
    if (btnEnhance) {
      btnEnhance.addEventListener('click', async () => {
        const text = originalInput?.value?.trim() || '';
        if (!text) {
          showToast('INPUT DETECTED AS VOID', 'error', 2000);
          return;
        }

        hideEnhanceErrorCard();
        btnEnhance.disabled = true;
        btnEnhance.textContent = 'ESTABLISHING NEURAL LINK...';
        let loadingToast = null;

        try {
          const promptClient = getPromptClient();
          if (!promptClient || typeof promptClient.enhance !== 'function') {
            throw new Error('ZeusPromptClient is not available');
          }

          const loadedSettings = await fetchPublicSettings();
          if (loadedSettings) {
            currentPublicSettings = loadedSettings;
            const fallbackReadiness = deriveFallbackReadiness(loadedSettings);
            const activeProv = fallbackReadiness.activeProvider;
            const cloudMissing = CLOUD_PROVIDERS.includes(activeProv) && !loadedSettings.hasApiKey?.[activeProv];
            const canUseCachedBackend = Boolean(
              hasBackendReadiness &&
              currentReadiness &&
              currentReadiness.activeProvider === activeProv &&
              !cloudMissing
            );
            const effectiveReadiness = canUseCachedBackend ? currentReadiness : fallbackReadiness;
            currentReadiness = effectiveReadiness;
            renderReadinessAndStatus();

            if (effectiveReadiness.activeState === 'not_configured' && !effectiveReadiness.usable) {
              if (setupRequiredCard) {
                setupRequiredCard.style.display = 'block';
              }
              showToast('Configure an AI provider before optimizing prompts', 'warning', 3200);
              return;
            }
          }

          const enhanceOptions = { timeoutMs: 20000 };
          if (loadedSettings) {
            enhanceOptions.redactionEnabled = loadedSettings.redactionEnabled;
            enhanceOptions.customRedactionPatterns = loadedSettings.customRedactionPatterns;
          }

          loadingToast = showToast('ROUTING TO COGNITIVE LOADOUT...', 'info', 0);
          const result = await promptClient.enhance(text, enhanceOptions);

          loadingToast?.dismiss();
          showToast('INJECTION COMPLETE', 'success', 2000);

          const actionableWarnings = (result.warnings || []).filter((w) => !/^NOTICE:/i.test(String(w || '').trim()));
          if (actionableWarnings.length > 0) {
            showToast('WARNING: SOME SENSITIVE TOKENS WERE OMITTED BY AI', 'warning', 4000);
          }

          if (enhancedOutput) {
            enhancedOutput.value = result.enhancedText;
          }
          if (editorEmptyGuidance) {
            editorEmptyGuidance.style.display = 'none';
          }
          if (diffCard) {
            diffCard.style.display = 'block';
          }
          renderDiff(text, result.enhancedText);

          const historyOriginal = result.meta?.hasRedactions ? (result.meta?.scrubbedOriginal || text) : text;
          const historyEnhanced = result.meta?.hasRedactions ? (result.meta?.scrubbedEnhanced || result.enhancedText) : result.enhancedText;
          saveCurrentToHistory(historyOriginal, historyEnhanced);
        } catch (err) {
          loadingToast?.dismiss();
          const userMsg = String(err?.errorDetail?.userMessage || err?.message || 'Prompt enhancement failed.');
          const inferredCode = String(err?.errorDetail?.code || err?.code || inferErrorCodeFromMessage(userMsg)).toUpperCase();
          const detail = {
            ...(err?.errorDetail || {}),
            code: inferredCode,
            category: err?.errorDetail?.category || err?.category || inferredCode,
            provider: err?.errorDetail?.provider || err?.provider,
            userMessage: userMsg
          };
          if (detail.code === 'NOT_CONFIGURED') {
            if (setupRequiredCard) setupRequiredCard.style.display = 'block';
            showToast(userMsg, 'warning', 3500);
          } else {
            showEnhanceErrorCard(detail);
            showToast(userMsg, 'error', 3500);
          }
          console.error('Enhance failed:', err);
        } finally {
          loadingToast?.dismiss();
          btnEnhance.disabled = false;
          btnEnhance.textContent = 'OPTIMIZE PROMPT';
        }
      });
    }

    // Insert into Chat
    if (btnInsert) {
      btnInsert.addEventListener('click', () => {
        const text = enhancedOutput?.value?.trim() || '';
        if (!text) {
          showToast('NO OPTIMIZED LOADOUT YET', 'error', 2000);
          return;
        }

        btnInsert.disabled = true;
        chrome.runtime.sendMessage({ type: 'sidePanel:setInputValue', value: text }, (response) => {
          void chrome.runtime?.lastError;
          btnInsert.disabled = false;
          if (response && response.success) {
            showToast('INJECTED INTO ACTIVE SESSION', 'success', 2000);
          } else {
            showToast('INJECTION FAILED. COMPOSER OUT OF FOCUS.', 'error', 3000);
          }
        });
      });
    }

    // Copy to Clipboard
    if (btnCopy) {
      btnCopy.addEventListener('click', () => {
        const text = enhancedOutput?.value?.trim() || '';
        if (!text) {
          showToast('NO OUTPUT TO COPY', 'error', 2000);
          return;
        }

        navigator.clipboard.writeText(text).then(() => {
          showToast('COPIED TO MEMORY BUFFER', 'success', 2000);
        }).catch(() => {
          showToast('CLIPBOARD ACCESS DENIED', 'error', 2500);
        });
      });
    }

    // History Archiving
    function loadHistory() {
      if (!historyList || typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return;
      chrome.runtime.sendMessage({ type: 'sidePanel:getHistory' }, (response) => {
        void chrome.runtime?.lastError;
        const list = response?.history || [];
        historyList.replaceChildren();

        if (list.length === 0) {
          const emptyMsg = document.createElement('p');
          emptyMsg.style.color = 'var(--text-muted)';
          emptyMsg.style.textAlign = 'center';
          emptyMsg.style.marginTop = '16px';
          emptyMsg.textContent = 'ARCHIVE EMPTY. Enhanced prompts are recorded here automatically.';
          historyList.appendChild(emptyMsg);
          return;
        }

        list.slice().reverse().forEach((item, index) => {
          const actualIndex = list.length - 1 - index;
          const div = document.createElement('div');
          div.className = 'history-item';

          const meta = document.createElement('div');
          meta.className = 'history-meta';
          const dateStr = new Date(item.timestamp).toLocaleString();
          let site = 'DIRECT';
          try {
            if (item.url) site = new URL(item.url).hostname;
          } catch (_) {}

          const spanDate = document.createElement('span');
          spanDate.textContent = dateStr;
          const spanSite = document.createElement('span');
          spanSite.textContent = site;
          meta.appendChild(spanDate);
          meta.appendChild(spanSite);

          const preview = document.createElement('div');
          preview.className = 'history-text-preview';
          preview.textContent = item.original;

          const actions = document.createElement('div');
          actions.className = 'history-actions';

          const btnRestore = document.createElement('button');
          btnRestore.type = 'button';
          btnRestore.className = 'zeus-btn zeus-btn-cyan';
          btnRestore.textContent = 'RESTORE';
          btnRestore.addEventListener('click', () => {
            if (originalInput) originalInput.value = item.original;
            if (enhancedOutput) enhancedOutput.value = item.enhanced;
            if (editorEmptyGuidance) editorEmptyGuidance.style.display = 'none';
            if (diffCard) diffCard.style.display = 'block';
            renderDiff(item.original, item.enhanced);
            switchTab('editor');
            showToast('ENTRY RESTORED TO EDITOR', 'success', 2000);
          });

          const btnDelete = document.createElement('button');
          btnDelete.type = 'button';
          btnDelete.className = 'zeus-btn zeus-btn-red';
          btnDelete.textContent = 'PURGE';
          btnDelete.addEventListener('click', () => {
            list.splice(actualIndex, 1);
            chrome.storage.local.set({ zeus_prompt_history: list }, () => {
              showToast('ENTRY PURGED', 'success', 1500);
              loadHistory();
            });
          });

          actions.appendChild(btnRestore);
          actions.appendChild(btnDelete);

          div.appendChild(meta);
          div.appendChild(preview);
          div.appendChild(actions);

          historyList.appendChild(div);
        });
      });
    }

    function saveCurrentToHistory(original, enhanced) {
      const entry = {
        original,
        enhanced,
        timestamp: Date.now(),
        url: capturedSourceUrl
      };

      chrome.runtime.sendMessage({ type: 'sidePanel:saveHistory', entry }, () => {
        void chrome.runtime?.lastError;
      });
    }

    // Templates Management
    function loadTemplates() {
      if (!templateList || typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return;
      chrome.runtime.sendMessage({ type: 'sidePanel:getTemplates' }, (response) => {
        void chrome.runtime?.lastError;
        currentTemplates = response?.templates || [];
        templateList.replaceChildren();

        if (currentTemplates.length === 0) {
          const emptyMsg = document.createElement('p');
          emptyMsg.style.color = 'var(--text-muted)';
          emptyMsg.style.textAlign = 'center';
          emptyMsg.style.padding = '16px';
          emptyMsg.textContent = 'NO CONFIGURED PATTERNS. Create reusable {{variable}} prompt templates below.';
          templateList.appendChild(emptyMsg);
          return;
        }

        currentTemplates.forEach((tpl, index) => {
          const div = document.createElement('div');
          div.className = 'template-item';
          div.tabIndex = 0;

          const head = document.createElement('div');
          head.className = 'template-item-head';

          const title = document.createElement('div');
          title.className = 'template-title';
          title.textContent = tpl.name;

          const editBtn = document.createElement('button');
          editBtn.type = 'button';
          editBtn.className = 'template-edit-btn';
          editBtn.textContent = 'EDIT';
          editBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            startTemplateEdit(index);
          });

          head.appendChild(title);
          head.appendChild(editBtn);

          const preview = document.createElement('div');
          preview.className = 'template-preview';
          preview.textContent = tpl.template;

          div.appendChild(head);
          div.appendChild(preview);

          div.addEventListener('click', () => {
            executeTemplate(tpl, div);
          });

          div.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              executeTemplate(tpl, div);
            }
          });

          div.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            startTemplateEdit(index);
          });

          templateList.appendChild(div);
        });
      });
    }

    function closeFillVariablesModal() {
      if (modalFillVariables) {
        modalFillVariables.style.display = 'none';
      }
      if (lastModalTriggerEl && lastModalTriggerEl.isConnected && typeof lastModalTriggerEl.focus === 'function') {
        lastModalTriggerEl.focus();
      }
      lastModalTriggerEl = null;
    }

    function executeTemplate(tpl, triggerEl) {
      const varsRegex = /{{\s*([\w]+)\s*}}/g;
      const variables = [];
      let match;

      while ((match = varsRegex.exec(tpl.template)) !== null) {
        if (!variables.includes(match[1])) {
          variables.push(match[1]);
        }
      }

      if (variables.length === 0) {
        capturedSourceUrl = '';
        if (originalInput) originalInput.value = tpl.template;
        switchTab('editor');
        showToast('PATTERN INJECTED INTO INPUT', 'success', 2000);
        return;
      }

      lastModalTriggerEl = triggerEl || (document.activeElement instanceof HTMLElement ? document.activeElement : null);
      currentFillingTemplateText = tpl.template;
      modalVariablesInputs.replaceChildren();

      variables.forEach((v) => {
        const div = document.createElement('div');
        div.className = 'form-group';

        const label = document.createElement('label');
        label.className = 'zeus-label';
        label.textContent = v.toUpperCase();

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'zeus-input';
        input.dataset.variable = v;
        input.placeholder = `Enter value for ${v}...`;

        div.appendChild(label);
        div.appendChild(input);
        modalVariablesInputs.appendChild(div);
      });

      if (modalFillVariables) {
        modalFillVariables.style.display = 'flex';
        modalVariablesInputs.querySelector('input')?.focus();
      }
    }

    if (btnModalFill) {
      btnModalFill.addEventListener('click', () => {
        let text = currentFillingTemplateText;
        const inputs = modalVariablesInputs?.querySelectorAll('input') || [];

        inputs.forEach((input) => {
          const variable = input.dataset.variable;
          const value = input.value.trim();
          const regex = new RegExp(`{{\\s*${variable}\\s*}}`, 'g');
          text = text.replace(regex, () => value);
        });

        capturedSourceUrl = '';
        if (originalInput) originalInput.value = text;
        if (modalFillVariables) modalFillVariables.style.display = 'none';
        lastModalTriggerEl = null;
        switchTab('editor');
        showToast('PATTERN VARIABLES COMPILED & INJECTED', 'success', 2000);
      });
    }

    if (btnModalClose) {
      btnModalClose.addEventListener('click', closeFillVariablesModal);
    }

    if (btnNewTemplate) {
      btnNewTemplate.addEventListener('click', () => {
        editingTemplateIndex = -1;
        if (templateNameInput) templateNameInput.value = '';
        if (templateTextInput) templateTextInput.value = '';
        if (btnDeleteTemplate) btnDeleteTemplate.style.display = 'none';
        if (templatesListView) templatesListView.style.display = 'none';
        if (templatesEditorView) templatesEditorView.style.display = 'block';
      });
    }

    function startTemplateEdit(index) {
      const tpl = currentTemplates[index];
      editingTemplateIndex = index;
      if (templateNameInput) templateNameInput.value = tpl?.name || '';
      if (templateTextInput) templateTextInput.value = tpl?.template || '';
      if (btnDeleteTemplate) btnDeleteTemplate.style.display = 'inline-block';
      if (templatesListView) templatesListView.style.display = 'none';
      if (templatesEditorView) templatesEditorView.style.display = 'block';
    }

    function cancelTemplateEdit() {
      if (templatesEditorView) templatesEditorView.style.display = 'none';
      if (templatesListView) templatesListView.style.display = 'block';
    }

    if (btnCancelTemplate) {
      btnCancelTemplate.addEventListener('click', cancelTemplateEdit);
    }

    if (btnSaveTemplate) {
      btnSaveTemplate.addEventListener('click', () => {
        const name = templateNameInput?.value?.trim() || '';
        const template = templateTextInput?.value?.trim() || '';

        if (!name || !template) {
          showToast('FIELDS CANNOT BE EMPTY', 'error', 2000);
          return;
        }

        const varsRegex = /{{\s*([\w]+)\s*}}/g;
        const variables = [];
        let match;
        while ((match = varsRegex.exec(template)) !== null) {
          if (!variables.includes(match[1])) {
            variables.push(match[1]);
          }
        }

        const tplObject = { name, template, variables };

        if (editingTemplateIndex === -1) {
          currentTemplates.push(tplObject);
        } else {
          currentTemplates[editingTemplateIndex] = tplObject;
        }

        saveTemplates();
      });
    }

    if (btnDeleteTemplate) {
      btnDeleteTemplate.addEventListener('click', () => {
        if (editingTemplateIndex >= 0) {
          currentTemplates.splice(editingTemplateIndex, 1);
          saveTemplates();
        }
      });
    }

    function saveTemplates() {
      chrome.runtime.sendMessage({
        type: 'sidePanel:saveTemplates',
        templates: currentTemplates
      }, (response) => {
        void chrome.runtime?.lastError;
        if (response && response.success) {
          showToast('PATTERN BUFFER COMMITTED', 'success', 2000);
          cancelTemplateEdit();
          loadTemplates();
        } else {
          showToast('FAILED TO COMMIT PATTERN', 'error', 3000);
        }
      });
    }

    // Keyboard Escape handling for modal and Settings view
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (modalFillVariables && modalFillVariables.style.display === 'flex') {
        closeFillVariablesModal();
        return;
      }
      if (spRemoveKeyConfirm && spRemoveKeyConfirm.style.display === 'block') {
        spRemoveKeyConfirm.style.display = 'none';
        spBtnRemoveKey?.focus();
        return;
      }
      if (activeTab === 'settings') {
        switchTab(lastWorkbenchTab || 'editor');
        btnOpenSettings?.focus();
      }
    });

    function hasAnyDirtySettingsInput() {
      return Boolean(
        dirtyFields.apiKey ||
        dirtyFields.ollamaHost ||
        dirtyFields.ollamaModel ||
        dirtyFields.copilotMaxTokens
      );
    }

    async function handleExternalSettingsChange() {
      if (internalSaveDepth > 0) return;
      if (externalSyncInFlight) {
        pendingExternalSync = true;
        return;
      }

      externalSyncInFlight = true;
      try {
        do {
          pendingExternalSync = false;
          const seq = ++settingsSyncSeq;
          const store = getSettingsStore();
          if (store && typeof store.invalidateCache === 'function') {
            store.invalidateCache();
          }

          const updated = await fetchPublicSettings();
          if (seq !== settingsSyncSeq || !updated) {
            continue;
          }

          const changed = !arePublicSettingsEqual(currentPublicSettings, updated);
          applyPublicSettingsToUI(updated, { preserveKeyDraft: true });
          if (changed && activeTab === 'settings' && hasAnyDirtySettingsInput()) {
            showToast('External settings updated — unsaved input draft preserved', 'info', 2500);
          }
          await refreshReadinessFromBackend(updated);
        } while (pendingExternalSync);
      } catch (_) {
      } finally {
        externalSyncInFlight = false;
      }
    }

    // Cross-UI live sync listeners (preserve unsaved editor text and dirty settings inputs)
    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged && typeof chrome.storage.onChanged.addListener === 'function') {
      const RELEVANT_SYNC_KEYS = new Set([
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
      ]);

      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'sync' && areaName !== 'local') return;
        const keys = Object.keys(changes || {});
        const isRelevant = areaName === 'local'
          ? keys.includes('apiKeys')
          : keys.some((k) => RELEVANT_SYNC_KEYS.has(k));

        if (!isRelevant || internalSaveDepth > 0) return;
        handleExternalSettingsChange();
      });
    }

    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage && typeof chrome.runtime.onMessage.addListener === 'function') {
      chrome.runtime.onMessage.addListener((message) => {
        const action = message?.action || message?.type;
        if (action === 'settingsUpdated') {
          if (internalSaveDepth > 0) return false;
          if (externalSyncInFlight) {
            pendingExternalSync = true;
            return false;
          }
          settingsSyncSeq += 1;
          if (message?.settings && typeof message.settings === 'object') {
            const merged = currentPublicSettings && !message.settings.hasApiKey
              ? { ...currentPublicSettings, ...message.settings }
              : message.settings;
            const publicSettings = toPublicSnapshot(merged);
            applyPublicSettingsToUI(publicSettings, { preserveKeyDraft: true });
            if (message.readiness) {
              const normalized = normalizeReadiness(message.readiness, publicSettings);
              hasBackendReadiness = normalized.fromBackend;
              currentReadiness = normalized.readiness;
              renderReadinessAndStatus();
            } else {
              refreshReadinessFromBackend(publicSettings);
            }
          } else {
            handleExternalSettingsChange();
          }
        } else if (action === 'readinessUpdated' && message?.readiness) {
          const normalized = normalizeReadiness(message.readiness, currentPublicSettings);
          hasBackendReadiness = normalized.fromBackend;
          currentReadiness = normalized.readiness;
          renderReadinessAndStatus();
        }
        return false;
      });
    }

    // Boot initial public settings and readiness
    bootstrapSettingsAndReadiness();
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
