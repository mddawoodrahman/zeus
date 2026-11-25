(function initZeusMessageHandler(globalScope) {
  const settingsModule = globalScope.ZeusSettingsStore || globalScope.ZeusSettings;
  const router = globalScope.ZeusRouter;
  const errors = globalScope.ZeusErrors;
  const telemetry = globalScope.ZeusTelemetry || null;

  const RELEVANT_LOCAL_KEYS = new Set(['apiKeys']);
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
    'customRedactionPatterns',
    'apiKeys',
    'zeus_selected_provider',
    'zeus_provider_configs'
  ]);

  function getDiagnostics() {
    return globalScope.ZeusProviderDiagnostics || null;
  }

  function composerScripts() {
    return chrome.runtime.getManifest().content_scripts.find(entry => entry.js?.includes('content.js'));
  }

  function syncSidePanelBehavior(sidePanelEnabled) {
    if (!chrome.sidePanel || typeof chrome.sidePanel.setPanelBehavior !== 'function') {
      return;
    }
    const openPanelOnActionClick = Boolean(sidePanelEnabled);
    Promise.resolve(
      chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick })
    ).catch(() => {});
  }

  function initSidePanelBehavior() {
    if (!settingsModule || typeof settingsModule.loadSettings !== 'function') {
      return;
    }
    Promise.resolve(settingsModule.loadSettings())
      .then((settings) => {
        syncSidePanelBehavior(settings?.sidePanelEnabled);
      })
      .catch(() => {});
  }

  function setupContextMenu() {
    chrome.runtime.onInstalled.addListener(() => {
      initSidePanelBehavior();
      const createMenu = () => {
        chrome.contextMenus.create({
          id: 'zeus-enhance-prompt',
          title: 'Enhance Prompt with Zeus',
          documentUrlPatterns: composerScripts().matches,
          contexts: ['editable']
        }, () => {
          void chrome.runtime?.lastError;
        });
      };

      if (typeof chrome.contextMenus.removeAll === 'function') {
        chrome.contextMenus.removeAll(createMenu);
      } else {
        createMenu();
      }
    });

    if (chrome.runtime.onStartup && typeof chrome.runtime.onStartup.addListener === 'function') {
      chrome.runtime.onStartup.addListener(() => {
        initSidePanelBehavior();
      });
    }

    chrome.contextMenus.onClicked.addListener((info, tab) => {
      if (info.menuItemId === 'zeus-enhance-prompt' && tab?.id) {
        chrome.tabs.sendMessage(tab.id, { action: 'contextEnhancePrompt' }).catch(() => {
          forceInject(tab.id, (res) => {
            if (res?.success) {
              chrome.tabs.sendMessage(tab.id, { action: 'contextEnhancePrompt' }).catch(() => {});
            }
          });
        });
      }
    });
  }

  function toPublicSettings(settingsPayload) {
    if (!settingsModule) return settingsPayload;
    if (typeof settingsModule.getPublicSettings === 'function') {
      return settingsModule.getPublicSettings(settingsPayload);
    }
    if (typeof settingsModule.serializeSettings === 'function') {
      return settingsModule.serializeSettings(settingsPayload);
    }
    return settingsPayload;
  }

  function emitRuntimeEvent(payload) {
    const sendMessage = globalScope?.chrome?.runtime?.sendMessage;
    if (typeof sendMessage !== 'function') {
      return;
    }
    try {
      Promise.resolve(sendMessage(payload)).catch(() => {});
    } catch (_) {}
  }

  function notifyTabsOfUpdate(settingsPayload) {
    const publicSettings = toPublicSettings(settingsPayload);

    const urlPatterns = composerScripts()?.matches;
    const query = Array.isArray(urlPatterns) && urlPatterns.length > 0 ? { url: urlPatterns } : {};
    chrome.tabs.query(query, (tabs) => {
      if (chrome.runtime.lastError || !Array.isArray(tabs)) return;
      for (const tab of tabs) {
        if (tab?.id !== undefined && tab?.id !== null) {
          chrome.tabs.sendMessage(tab.id, {
            action: 'settingsUpdated',
            settings: publicSettings
          }).catch(() => {});
        }
      }
    });
  }

  function isPrivilegedExtensionSender(sender) {
    if (!sender || !sender.tab) {
      return true;
    }
    const senderUrl = String(sender.url || sender.origin || '').trim();
    const extId = String(globalScope?.chrome?.runtime?.id || '').trim();
    if (extId) {
      return senderUrl.startsWith(`chrome-extension://${extId}/`) || senderUrl === `chrome-extension://${extId}`;
    }
    return /^chrome-extension:\/\//i.test(senderUrl);
  }

  function sanitizeEngineOptions(rawOptions) {
    if (!rawOptions || typeof rawOptions !== 'object') {
      return undefined;
    }
    const sanitized = {};
    if (typeof rawOptions.provider === 'string' && rawOptions.provider.trim()) {
      sanitized.provider = rawOptions.provider.trim();
    }
    if (typeof rawOptions.model === 'string' && rawOptions.model.trim()) {
      sanitized.model = rawOptions.model.trim();
    }
    if (Number.isFinite(Number(rawOptions.timeoutMs)) && Number(rawOptions.timeoutMs) > 0) {
      sanitized.timeoutMs = Number(rawOptions.timeoutMs);
    }
    return sanitized;
  }

  function buildErrorContext(error, currentSettings, options) {
    const ollamaMeta = globalScope.ZeusOllamaMeta || {};
    const provider = String(error?.provider || options?.provider || currentSettings?.provider || '').trim();
    const model = String(
      error?.model ||
      (provider && options?.model) ||
      (provider === 'ollama' ? currentSettings?.ollama?.model : currentSettings?.models?.[provider]) ||
      ''
    ).trim();

    return {
      provider,
      model,
      ollamaNotRunningMessage: ollamaMeta.OLLAMA_NOT_RUNNING_MESSAGE,
      ollamaNoModelMessage: ollamaMeta.OLLAMA_NO_MODEL_MESSAGE,
      buildOllamaOriginBlockedMessage: ollamaMeta.buildOllamaOriginBlockedMessage
    };
  }

  function classifyErrorSafe(error, errorContext) {
    if (errors && typeof errors.classifyEnhanceError === 'function') {
      return errors.classifyEnhanceError(error, errorContext);
    }
    const fallbackMessage = errors && typeof errors.normalizeEnhanceError === 'function'
      ? errors.normalizeEnhanceError(error, errorContext)
      : String(error?.message || error || 'Enhancement failed.');
    return {
      code: String(error?.code || 'UNKNOWN_ERROR'),
      category: String(error?.category || 'UNKNOWN_ERROR'),
      provider: String(error?.provider || errorContext?.provider || ''),
      model: String(error?.model || errorContext?.model || ''),
      status: Number(error?.status) || 0,
      retryable: Boolean(error?.retryable),
      userMessage: fallbackMessage
    };
  }

  function buildFallbackReadiness(settings) {
    const publicSettings = toPublicSettings(settings || {});
    const activeProvider = String(publicSettings?.provider || 'gemini').trim().toLowerCase();
    const cloudIds = ['gemini', 'openai', 'claude', 'openrouter'];
    const providers = {};

    for (const id of cloudIds) {
      const hasApiKey = Boolean(publicSettings?.hasApiKey?.[id]);
      const model = String(publicSettings?.models?.[id] || '').trim();
      providers[id] = {
        provider: id,
        configured: hasApiKey,
        hasApiKey,
        model,
        state: hasApiKey ? 'configured_untested' : 'not_configured',
        statusLabel: hasApiKey ? 'Configured, not tested' : 'Not configured',
        code: hasApiKey ? 'UNTESTED' : 'NOT_CONFIGURED',
        usable: hasApiKey
      };
    }

    const ollamaModel = String(publicSettings?.ollama?.model || '').trim();
    const ollamaConfigured = Boolean(ollamaModel);
    providers.ollama = {
      provider: 'ollama',
      configured: ollamaConfigured,
      hasApiKey: false,
      host: String(publicSettings?.ollama?.host || 'http://localhost:11434'),
      model: ollamaModel,
      state: ollamaConfigured ? 'configured_untested' : 'not_configured',
      statusLabel: ollamaConfigured ? 'Configured, not tested' : 'Not configured',
      code: ollamaConfigured ? 'UNTESTED' : 'NOT_CONFIGURED',
      usable: ollamaConfigured
    };

    const configuredProviders = Object.keys(providers).filter((id) => providers[id].configured);
    const usableProviders = Object.keys(providers).filter((id) => providers[id].usable);

    if (activeProvider === 'auto') {
      const usable = usableProviders.length > 0;
      return {
        activeProvider: 'auto',
        activeState: usable ? 'configured_untested' : 'not_configured',
        statusLabel: usable ? 'Configured, not tested' : 'Not configured',
        code: usable ? 'UNTESTED' : 'NOT_CONFIGURED',
        usable,
        configured: configuredProviders.length > 0,
        userMessage: usable
          ? `Auto mode ready (${usableProviders.join(', ')} configured).`
          : 'No AI provider is configured for Auto mode.',
        model: '',
        usableProviders,
        configuredProviders,
        providers
      };
    }

    const activeEntry = providers[activeProvider] || providers.gemini;
    return {
      activeProvider,
      activeState: activeEntry.state,
      statusLabel: activeEntry.statusLabel,
      code: activeEntry.code,
      usable: activeEntry.usable,
      configured: activeEntry.configured,
      userMessage: activeEntry.state === 'not_configured'
        ? `${activeProvider} is not configured.`
        : `${activeProvider} is configured.`,
      model: activeEntry.model || '',
      usableProviders,
      configuredProviders,
      providers
    };
  }

  async function resolveReadinessSummary(settingsInput) {
    const settings = settingsInput || (settingsModule && typeof settingsModule.loadSettings === 'function'
      ? await settingsModule.loadSettings()
      : {});
    const diagnostics = getDiagnostics();
    if (diagnostics && typeof diagnostics.getReadinessSummary === 'function') {
      return diagnostics.getReadinessSummary(settings);
    }
    return buildFallbackReadiness(settings);
  }

  function resolveTargetTab(tabIdFromSender, callback) {
    if (tabIdFromSender) {
      callback(tabIdFromSender);
      return;
    }

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      callback(tabs?.[0]?.id || null);
    });
  }

  function forceInject(tabIdFromSender, sendResponse) {
    resolveTargetTab(tabIdFromSender, (tabId) => {
      if (!tabId) {
        sendResponse({ success: false, message: 'No active tab found.' });
        return;
      }

      chrome.scripting.executeScript({ target: { tabId }, files: composerScripts().js })
        .then(() => chrome.tabs.sendMessage(tabId, { action: 'forceInjectButton' }))
        .then(() => sendResponse({ success: true }))
        .catch((error) => sendResponse({ success: false, message: String(error?.message || error) }));
    });
  }

  async function handleEnhancePrompt(message, sendResponse) {
    const prompt = String(message?.prompt || '').trim();
    const safeOptions = sanitizeEngineOptions(message?.options);

    try {
      const engine = globalScope.ZeusPromptEngine;
      const result = engine && typeof engine.execute === 'function'
        ? await engine.execute(prompt, safeOptions)
        : { enhancedText: await router.enhancePrompt(prompt), warnings: [], meta: {} };

      sendResponse({
        success: true,
        enhancedPrompt: result.enhancedText,
        enhancedText: result.enhancedText,
        warnings: result.warnings || [],
        meta: result.meta || {}
      });
    } catch (error) {
      let currentSettings = null;
      try {
        currentSettings = await settingsModule.loadSettings();
      } catch (_) {
        // If settings retrieval fails while building an error, return normalized fallback.
      }

      const errorContext = buildErrorContext(error, currentSettings, safeOptions);
      const errorDetail = classifyErrorSafe(error, errorContext);
      const userError = errors && typeof errors.normalizeEnhanceError === 'function'
        ? errors.normalizeEnhanceError(error, errorContext)
        : errorDetail.userMessage;

      sendResponse({
        success: false,
        error: userError,
        errorDetail
      });
    }
  }

  function handleGetSettings(sendResponse) {
    settingsModule.loadSettings()
      .then((settings) => {
        sendResponse({ settings: toPublicSettings(settings) });
      })
      .catch((error) => sendResponse({ error: String(error?.message || 'Failed to load settings.') }));
  }

  async function handleGetProviderReadiness(sendResponse) {
    try {
      const readiness = await resolveReadinessSummary();
      sendResponse({ success: true, readiness });
    } catch (error) {
      sendResponse({
        success: false,
        error: String(error?.message || 'Failed to load provider readiness.')
      });
    }
  }

  async function handleTestConnection(message, sender, sendResponse) {
    if (!isPrivilegedExtensionSender(sender)) {
      sendResponse({ success: false, error: 'Unauthorized sender for connection diagnostics.' });
      return;
    }

    const diagnostics = getDiagnostics();
    if (!diagnostics || typeof diagnostics.testConnection !== 'function') {
      sendResponse({ success: false, error: 'Provider diagnostics unavailable.' });
      return;
    }

    try {
      // Strictly never accept raw API keys over IPC; credentials are always read via ZeusSettingsStore in background.
      const probeOptions = {};
      if (typeof message?.provider === 'string' && message.provider.trim()) {
        probeOptions.provider = message.provider.trim();
      }
      if (typeof message?.model === 'string' && message.model.trim()) {
        probeOptions.model = message.model.trim();
      }
      if (typeof message?.host === 'string' && message.host.trim()) {
        probeOptions.host = message.host.trim();
      }

      const result = await diagnostics.testConnection(probeOptions);
      const readiness = result?.readiness || await resolveReadinessSummary();
      const { readiness: _omitReadiness, ...sanitizedResult } = result || {};

      emitRuntimeEvent({
        action: 'readinessUpdated',
        readiness,
        result: sanitizedResult,
        source: 'background'
      });

      sendResponse({
        success: Boolean(result?.ok),
        result: sanitizedResult,
        readiness,
        ...(result?.ok ? {} : { error: result?.userMessage || 'Connection test failed.' })
      });
    } catch (error) {
      sendResponse({
        success: false,
        error: String(error?.message || 'Connection test failed.')
      });
    }
  }

  async function handleDiscoverOllamaModels(message, sender, sendResponse) {
    if (!isPrivilegedExtensionSender(sender)) {
      sendResponse({ success: false, error: 'Unauthorized sender for Ollama discovery.' });
      return;
    }

    const ollamaMeta = globalScope.ZeusOllamaMeta || {};
    if (typeof ollamaMeta.discoverLocalModels !== 'function') {
      sendResponse({ success: false, error: 'Ollama model discovery is unavailable.' });
      return;
    }

    try {
      let host = typeof message?.host === 'string' && message.host.trim() ? message.host.trim() : '';
      if (!host && settingsModule && typeof settingsModule.loadSettings === 'function') {
        const settings = await settingsModule.loadSettings();
        host = String(settings?.ollama?.host || '').trim();
      }

      const discovery = await ollamaMeta.discoverLocalModels({ ollama: { host } });
      if (discovery.reachable) {
        sendResponse({
          success: true,
          reachable: true,
          originBlocked: false,
          origin: discovery.origin,
          version: discovery.version || '',
          running: discovery.running || [],
          installed: discovery.installed || [],
          models: discovery.models || []
        });
        return;
      }

      const errorMessage = discovery.error || (discovery.originBlocked
        ? ollamaMeta.buildOllamaOriginBlockedMessage?.()
        : ollamaMeta.OLLAMA_NOT_RUNNING_MESSAGE);
      const errorDetail = classifyErrorSafe(
        new Error(errorMessage || 'Ollama unavailable.'),
        {
          provider: 'ollama',
          model: '',
          ollamaNotRunningMessage: ollamaMeta.OLLAMA_NOT_RUNNING_MESSAGE,
          ollamaNoModelMessage: ollamaMeta.OLLAMA_NO_MODEL_MESSAGE,
          buildOllamaOriginBlockedMessage: ollamaMeta.buildOllamaOriginBlockedMessage
        }
      );

      sendResponse({
        success: false,
        reachable: false,
        originBlocked: Boolean(discovery.originBlocked),
        origin: discovery.origin,
        version: discovery.version || '',
        running: [],
        installed: [],
        models: [],
        error: errorDetail.userMessage,
        errorDetail
      });
    } catch (error) {
      const errorDetail = classifyErrorSafe(error, {
        provider: 'ollama',
        model: '',
        ollamaNotRunningMessage: ollamaMeta.OLLAMA_NOT_RUNNING_MESSAGE,
        ollamaNoModelMessage: ollamaMeta.OLLAMA_NO_MODEL_MESSAGE,
        buildOllamaOriginBlockedMessage: ollamaMeta.buildOllamaOriginBlockedMessage
      });
      sendResponse({
        success: false,
        reachable: false,
        originBlocked: errorDetail.code === 'OLLAMA_ORIGIN_BLOCKED',
        origin: ollamaMeta.getOllamaOrigin ? ollamaMeta.getOllamaOrigin() : '',
        running: [],
        installed: [],
        models: [],
        error: errorDetail.userMessage,
        errorDetail
      });
    }
  }

  function isSettingsStorageChange(changes, areaName) {
    if (!changes || typeof changes !== 'object') {
      return false;
    }
    const keys = Object.keys(changes);
    if (areaName === 'local') {
      return keys.some((key) => RELEVANT_LOCAL_KEYS.has(key) || /^zeus_.*_api_key$/i.test(key));
    }
    if (areaName === 'sync') {
      return keys.some((key) => RELEVANT_SYNC_KEYS.has(key) || /^zeus_.*_(?:api_key|model)$/i.test(key));
    }
    return false;
  }

  let storageRefreshChain = Promise.resolve();

  function setupStorageSyncListener() {
    const onChanged = globalScope?.chrome?.storage?.onChanged;
    if (!onChanged || typeof onChanged.addListener !== 'function') {
      return;
    }

    onChanged.addListener((changes, areaName) => {
      if ((areaName !== 'sync' && areaName !== 'local') || !isSettingsStorageChange(changes, areaName)) {
        return;
      }

      const diagnostics = getDiagnostics();
      if (diagnostics && typeof diagnostics.invalidateForStorageChange === 'function') {
        diagnostics.invalidateForStorageChange(changes, areaName);
      }

      if (settingsModule && typeof settingsModule.invalidateCache === 'function') {
        settingsModule.invalidateCache();
      }

      storageRefreshChain = storageRefreshChain.then(async () => {
        if (!settingsModule || typeof settingsModule.loadSettings !== 'function') {
          return;
        }
        const freshSettings = typeof settingsModule.get === 'function'
          ? await settingsModule.get(true)
          : await settingsModule.loadSettings();
        const publicSettings = toPublicSettings(freshSettings);
        const readiness = await resolveReadinessSummary(freshSettings);

        syncSidePanelBehavior(freshSettings?.sidePanelEnabled);
        notifyTabsOfUpdate(publicSettings);
        emitRuntimeEvent({
          action: 'settingsUpdated',
          settings: publicSettings,
          readiness,
          source: 'background'
        });
      }).catch(() => {});
    });
  }

  function setupRuntimeMessaging() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      const action = message?.action || message?.type;
      switch (action) {
        case 'sidePanel:getCurrentInput':
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (chrome.runtime.lastError || !tabs?.[0]?.id) {
              sendResponse({ value: '' });
              return;
            }
            chrome.tabs.sendMessage(tabs[0].id, { action: 'sidePanel:getCurrentInput' }, (response) => {
              if (chrome.runtime.lastError) {
                sendResponse({ value: '' });
              } else {
                sendResponse(response);
              }
            });
          });
          return true;

        case 'sidePanel:setInputValue':
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (chrome.runtime.lastError || !tabs?.[0]?.id) {
              sendResponse({ success: false });
              return;
            }
            chrome.tabs.sendMessage(tabs[0].id, { action: 'sidePanel:setInputValue', value: message.value }, (response) => {
              if (chrome.runtime.lastError) {
                sendResponse({ success: false });
              } else {
                sendResponse(response);
              }
            });
          });
          return true;

        case 'sidePanel:getHistory':
          chrome.storage.local.get(['zeus_prompt_history'], (data) => {
            const history = Array.isArray(data?.zeus_prompt_history) ? data.zeus_prompt_history : [];
            sendResponse({ history });
          });
          return true;

        case 'sidePanel:saveHistory':
          chrome.storage.local.get(['zeus_prompt_history'], (data) => {
            let history = Array.isArray(data?.zeus_prompt_history) ? data.zeus_prompt_history : [];
            if (message.entry && typeof message.entry === 'object') {
              const safeEntry = {
                original: String(message.entry.original || ''),
                enhanced: String(message.entry.enhanced || ''),
                timestamp: Number(message.entry.timestamp) || Date.now(),
                url: String(message.entry.url || '')
              };
              history.push(safeEntry);
              if (history.length > 100) {
                history.shift();
              }
              chrome.storage.local.set({ zeus_prompt_history: history }, () => {
                sendResponse({ success: true });
              });
            } else {
              sendResponse({ success: false });
            }
          });
          return true;

        case 'sidePanel:getTemplates':
          chrome.storage.sync.get(['zeus_templates'], (data) => {
            const templates = Array.isArray(data?.zeus_templates) ? data.zeus_templates : [];
            sendResponse({ templates });
          });
          return true;

        case 'sidePanel:saveTemplates':
          const templates = message.templates;
          const isValid = Array.isArray(templates) && templates.every(t => t && typeof t === 'object' && typeof t.name === 'string' && typeof t.template === 'string' && Array.isArray(t.variables));
          if (isValid) {
            chrome.storage.sync.set({ zeus_templates: templates }, () => {
              sendResponse({ success: true });
            });
          } else {
            sendResponse({ success: false, error: 'Invalid template format' });
          }
          return true;

        case 'enhancePrompt':
          handleEnhancePrompt(message, sendResponse);
          return true;

        case 'ping':
          sendResponse({ status: 'pong' });
          return true;

        case 'getSettings':
          handleGetSettings(sendResponse);
          return true;

        case 'getProviderReadiness':
          handleGetProviderReadiness(sendResponse);
          return true;

        case 'testConnection':
          handleTestConnection(message, sender, sendResponse);
          return true;

        case 'discoverOllamaModels':
          handleDiscoverOllamaModels(message, sender, sendResponse);
          return true;

        case 'settingsUpdated':
          if (message?.source === 'background') {
            sendResponse({ success: true });
            return true;
          }
          if (message?.settings && 'sidePanelEnabled' in message.settings) {
            syncSidePanelBehavior(message.settings.sidePanelEnabled);
          } else {
            initSidePanelBehavior();
          }
          notifyTabsOfUpdate(message?.settings || {});
          sendResponse({ success: true });
          return true;

        case 'readinessUpdated':
          sendResponse({ success: true });
          return true;

        case 'forceInject':
          forceInject(sender?.tab?.id, sendResponse);
          return true;

        case 'getTelemetrySummary':
          if (!telemetry || typeof telemetry.getSummary !== 'function') {
            sendResponse({ summary: { totalEvents: 0, fallbackCount: 0, byProvider: {}, byReason: {}, recent: [] } });
            return true;
          }

          telemetry.getSummary((summary) => {
            sendResponse({ summary });
          });
          return true;

        case 'clearTelemetry':
          if (telemetry && typeof telemetry.clear === 'function') {
            telemetry.clear();
          }
          sendResponse({ success: true });
          return true;

        default:
          return false;
      }
    });
  }

  let activeSidepanelPort = null;

  function setupCopilotStreamListener() {
    if (!chrome.runtime.onConnect) return;
    chrome.runtime.onConnect.addListener((port) => {
      if (port.name === 'zeus-sidepanel') {
        activeSidepanelPort = port;
        port.onDisconnect.addListener(() => {
          activeSidepanelPort = null;
        });
        return;
      }

      if (port.name !== 'copilot-stream') return;

      let abortController = null;
      let keepAliveInterval = null;

      function stopKeepAlive() {
        if (keepAliveInterval) {
          clearInterval(keepAliveInterval);
          keepAliveInterval = null;
        }
      }

      function startKeepAlive() {
        stopKeepAlive();
        keepAliveInterval = setInterval(() => {
          try {
            port.postMessage({ type: 'ping' });
          } catch (_) {
            stopKeepAlive();
          }
        }, 15000);
      }

      port.onMessage.addListener(async (msg) => {
        if (msg.type === 'copilot:abort' || msg.type === 'abort') {
          if (abortController) {
            abortController.abort();
            abortController = null;
          }
          stopKeepAlive();
          return;
        }

        if (msg.type === 'copilot:start') {
          if (abortController) {
            abortController.abort();
          }
          abortController = new AbortController();
          startKeepAlive();

          try {
            const config = await settingsModule.loadSettings();

            // Guard against sensitive data transmission over copilot streams using authoritative SettingsStore rules
            const redactorInstance = globalScope.ZeusRedactor;
            const isSensitive = redactorInstance && typeof redactorInstance.hasSensitive === 'function'
              ? redactorInstance.hasSensitive(msg.text, {
                  redactionEnabled: config?.redactionEnabled !== false,
                  customRedactionPatterns: config?.customRedactionPatterns
                })
              : false;

            if (isSensitive) {
              if (abortController) {
                abortController.abort();
                abortController = null;
              }
              stopKeepAlive();
              try {
                port.postMessage({ type: 'paused', reason: 'sensitive_data' });
              } catch (_) {}
              try {
                port.disconnect();
              } catch (_) {}
              return;
            }

            // Isolate settings from untrusted content scripts:
            // Content scripts may only customize defined copilot runtime preferences, never inject or overwrite credentials or redaction rules.
            const safeContentSettings = {};
            if (typeof msg.settings?.copilotMode === 'string' && msg.settings.copilotMode.trim()) {
              safeContentSettings.copilotMode = msg.settings.copilotMode.trim();
            }
            if (typeof msg.settings?.copilotProvider === 'string' && msg.settings.copilotProvider.trim()) {
              safeContentSettings.copilotProvider = msg.settings.copilotProvider.trim();
            }
            if (msg.settings?.copilotMaxTokens !== undefined && msg.settings?.copilotMaxTokens !== null) {
              const parsedTokens = Number(msg.settings.copilotMaxTokens);
              if (Number.isFinite(parsedTokens) && parsedTokens > 0) {
                safeContentSettings.copilotMaxTokens = settingsModule?.clampCopilotMaxTokens
                  ? settingsModule.clampCopilotMaxTokens(parsedTokens)
                  : Math.min(250, Math.max(10, Math.round(parsedTokens)));
              }
            }

            const mergedSettings = {
              ...config,
              ...safeContentSettings,
              apiKeys: config.apiKeys
            };

            const routerInstance = globalScope.ZeusRouter;
            if (!routerInstance || typeof routerInstance.streamSuggest !== 'function') {
              throw new Error('ZeusRouter streamSuggest is not available');
            }

            try {
              await routerInstance.streamSuggest(msg.text, mergedSettings, port, abortController.signal);
            } finally {
              stopKeepAlive();
            }
          } catch (err) {
            stopKeepAlive();
            try {
              port.postMessage({ type: 'error', message: err.message || 'Error processing suggestion' });
            } catch (_) {}
          }
        }
      });

      port.onDisconnect.addListener(() => {
        stopKeepAlive();
        if (abortController) {
          abortController.abort();
          abortController = null;
        }
      });
    });
  }

  function setupCommandsListener() {
    if (!chrome.commands || !chrome.commands.onCommand) return;

    const sendCommandToast = (tab, text) => {
      if (tab?.id !== undefined) {
        chrome.tabs.sendMessage(tab.id, { action: 'commands:debugToast', text }).catch(() => {});
        return;
      }
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs?.[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, { action: 'commands:debugToast', text }).catch(() => {});
        }
      });
    };

    chrome.commands.onCommand.addListener((command, tab) => {
      if (command !== 'open-side-panel') return;

      if (activeSidepanelPort) {
        sendCommandToast(tab, 'ZEUS: CLOSING WORKBENCH');

        try {
          activeSidepanelPort.postMessage({ type: 'close' });
        } catch (_) {}

        if (chrome.sidePanel && typeof chrome.sidePanel.close === 'function') {
          if (tab?.windowId !== undefined) {
            chrome.sidePanel.close({ windowId: tab.windowId }).catch(() => {});
          } else if (chrome.windows?.getLastFocused) {
            chrome.windows.getLastFocused((win) => {
              if (win?.id !== undefined) {
                chrome.sidePanel.close({ windowId: win.id }).catch(() => {});
              }
            });
          }
        }
        return;
      }

      sendCommandToast(tab, 'ZEUS: OPENING WORKBENCH');

      if (chrome.sidePanel && typeof chrome.sidePanel.open === 'function') {
        if (tab?.windowId !== undefined) {
          chrome.sidePanel.open({ windowId: tab.windowId }).catch((err) => {
            console.error('[ZEUS] Failed to open side panel via windowId:', err);
            if (tab?.id !== undefined) {
              chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
            }
          });
        } else if (tab?.id !== undefined) {
          chrome.sidePanel.open({ tabId: tab.id }).catch((err) => {
            console.error('[ZEUS] Failed to open side panel via tabId:', err);
          });
        } else if (chrome.windows?.getLastFocused) {
          chrome.windows.getLastFocused((win) => {
            if (win?.id !== undefined) {
              chrome.sidePanel.open({ windowId: win.id }).catch(() => {});
            }
          });
        }
      }
    });
  }

  initSidePanelBehavior();
  setupContextMenu();
  setupStorageSyncListener();
  setupRuntimeMessaging();
  setupCopilotStreamListener();
  setupCommandsListener();
})(typeof globalThis !== 'undefined' ? globalThis : this);
