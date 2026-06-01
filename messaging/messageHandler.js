(function initZeusMessageHandler(globalScope) {
  const settingsModule = globalScope.ZeusSettings;
  const router = globalScope.ZeusRouter;
  const errors = globalScope.ZeusErrors;
  const telemetry = globalScope.ZeusTelemetry || null;

  const CONTENT_SCRIPT_FILES = [
    'core/domUtils.js',
    'core/useFloatingPosition.js',
    'core/injector.js',
    'core/observer.js',
    'core/ghostText.js',
    'core/copilot.js',
    'adapters/chatgpt.js',
    'adapters/claude.js',
    'adapters/gemini.js',
    'adapters/grok.js',
    'adapters/deepseek.js',
    'adapters/openrouter.js',
    'adapters/generic.js',
    'content.js'
  ];

  function setupContextMenu() {
    chrome.runtime.onInstalled.addListener(() => {
      chrome.contextMenus.create({
        id: 'zeus-enhance-prompt',
        title: 'Enhance Prompt with Zeus',
        contexts: ['editable']
      });
    });

    chrome.contextMenus.onClicked.addListener((info, tab) => {
      if (info.menuItemId === 'zeus-enhance-prompt' && tab?.id) {
        chrome.tabs.sendMessage(tab.id, { action: 'contextEnhancePrompt' }).catch(() => {});
      }
    });
  }

  function notifyTabsOfUpdate(settingsPayload) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) return;
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'settingsUpdated',
          settings: settingsPayload
        }).catch(() => {});
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

      chrome.scripting.executeScript({ target: { tabId }, files: CONTENT_SCRIPT_FILES })
        .then(() => chrome.tabs.sendMessage(tabId, { action: 'forceInjectButton' }))
        .then(() => sendResponse({ success: true }))
        .catch((error) => sendResponse({ success: false, message: String(error?.message || error) }));
    });
  }

  async function handleEnhancePrompt(message, sendResponse) {
    const prompt = String(message?.prompt || '').trim();

    try {
      const enhancedPrompt = await router.enhancePrompt(prompt);
      sendResponse({ success: true, enhancedPrompt });
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
      .then((settings) => sendResponse({ settings: settingsModule.serializeSettings(settings) }))
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
            if (message.entry) {
              history.push(message.entry);
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
          notifyTabsOfUpdate(message?.settings || {});
          sendResponse({ success: true });
          return true;

        case 'forceInject':
          forceInject(sender?.tab?.id, sendResponse);
          return true;

        case 'getTelemetrySummary':
          if (!telemetry || typeof telemetry.getSummary !== 'function') {
            sendResponse({ summary: { totalEvents: 0, byProvider: {}, byReason: {}, recent: [] } });
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
        if (msg.type === 'copilot:start') {
          if (abortController) {
            abortController.abort();
          }
          abortController = new AbortController();
          startKeepAlive();

          try {
            const config = await settingsModule.loadSettings();
            
            const mergedSettings = {
              ...config,
              ...msg.settings
            };

            const routerInstance = globalScope.ZeusRouter;
            if (!routerInstance || typeof routerInstance.streamSuggest !== 'function') {
              throw new Error('ZeusRouter streamSuggest is not available');
            }

            await routerInstance.streamSuggest(msg.text, mergedSettings, port, abortController.signal);
          } catch (err) {
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

    chrome.commands.onCommand.addListener((command, tab) => {
      if (command === 'open-side-panel') {
        if (activeSidepanelPort) {
          // Send a visual debug notification to the active tab to confirm command execution
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs?.[0]?.id) {
              chrome.tabs.sendMessage(tabs[0].id, { action: 'commands:debugToast', text: 'ZEUS: CLOSING WORKBENCH' }).catch(() => {});
            }
          });

          // Close the side panel if it's currently open
          try {
            activeSidepanelPort.postMessage({ type: 'close' });
          } catch (_) {}

          // Fallback close call for newer Chrome versions (Chrome 121+)
          if (chrome.sidePanel && typeof chrome.sidePanel.close === 'function') {
            chrome.windows.getLastFocused((window) => {
              const targetWindowId = window?.id || tab?.windowId;
              if (targetWindowId !== undefined) {
                chrome.sidePanel.close({ windowId: targetWindowId }).catch(() => {});
              }
            });
          }
        } else {
          // Send a visual debug notification to the active tab to confirm command execution
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs?.[0]?.id) {
              chrome.tabs.sendMessage(tabs[0].id, { action: 'commands:debugToast', text: 'ZEUS: OPENING WORKBENCH' }).catch(() => {});
            }
          });

          if (chrome.sidePanel && typeof chrome.sidePanel.open === 'function') {
            // Open the side panel inside the currently focused active window
            chrome.windows.getLastFocused((window) => {
              const targetWindowId = window?.id || tab?.windowId;
              if (targetWindowId !== undefined) {
                chrome.sidePanel.open({ windowId: targetWindowId }).catch((err) => {
                  console.error('[ZEUS] Failed to open side panel via windowId:', err);
                  // Secondary fallback using tabId
                  if (tab && tab.id) {
                    chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
                  }
                });
              } else if (tab && tab.id) {
                chrome.sidePanel.open({ tabId: tab.id }).catch((err) => {
                  console.error('[ZEUS] Failed to open side panel via tabId:', err);
                });
              } else {
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                  if (tabs?.[0]?.id) {
                    chrome.sidePanel.open({ tabId: tabs[0].id }).catch(() => {});
                  }
                });
              }
            });
          }
        }
      }
    });
  }

  setupContextMenu();
  setupRuntimeMessaging();
  setupCopilotStreamListener();
  setupCommandsListener();
})(typeof globalThis !== 'undefined' ? globalThis : this);
