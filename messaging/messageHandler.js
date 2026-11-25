(function initZeusMessageHandler(globalScope) {
  const settingsModule = globalScope.ZeusSettingsStore || globalScope.ZeusSettings;
  const router = globalScope.ZeusRouter;
  const errors = globalScope.ZeusErrors;
  const telemetry = globalScope.ZeusTelemetry || null;

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

  function notifyTabsOfUpdate(settingsPayload) {
    const publicSettings = settingsModule?.getPublicSettings
      ? settingsModule.getPublicSettings(settingsPayload)
      : (settingsModule?.serializeSettings ? settingsModule.serializeSettings(settingsPayload) : settingsPayload);

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

    try {
      const engine = globalScope.ZeusPromptEngine;
      const result = engine && typeof engine.execute === 'function'
        ? await engine.execute(prompt, message?.options)
        : { enhancedText: await router.enhancePrompt(prompt), warnings: [], meta: {} };

      sendResponse({
        success: true,
        enhancedPrompt: result.enhancedText,
        enhancedText: result.enhancedText,
        warnings: result.warnings || [],
        meta: result.meta || {}
      });
    } catch (error) {
      let provider = '';
      let model = '';

      try {
        const currentSettings = await settingsModule.loadSettings();
        provider = String(currentSettings?.provider || '').trim();
        model = String(currentSettings?.models?.[provider] || '').trim();
      } catch (_) {
        // If settings retrieval fails while building an error, return normalized fallback.
      }

      const ollamaMeta = globalScope.ZeusOllamaMeta || {};
      sendResponse({
        success: false,
        error: errors.normalizeEnhanceError(error, {
          provider,
          model,
          ollamaNotRunningMessage: ollamaMeta.OLLAMA_NOT_RUNNING_MESSAGE,
          ollamaNoModelMessage: ollamaMeta.OLLAMA_NO_MODEL_MESSAGE,
          buildOllamaOriginBlockedMessage: ollamaMeta.buildOllamaOriginBlockedMessage
        })
      });
    }
  }

  function handleGetSettings(sendResponse) {
    settingsModule.loadSettings()
      .then((settings) => {
        const publicSettings = settingsModule?.getPublicSettings
          ? settingsModule.getPublicSettings(settings)
          : settingsModule?.serializeSettings(settings);
        sendResponse({ settings: publicSettings });
      })
      .catch((error) => sendResponse({ error: String(error?.message || 'Failed to load settings.') }));
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

        case 'settingsUpdated':
          if (message?.settings && 'sidePanelEnabled' in message.settings) {
            syncSidePanelBehavior(message.settings.sidePanelEnabled);
          } else {
            initSidePanelBehavior();
          }
          notifyTabsOfUpdate(message?.settings || {});
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
  setupRuntimeMessaging();
  setupCopilotStreamListener();
  setupCommandsListener();
})(typeof globalThis !== 'undefined' ? globalThis : this);
