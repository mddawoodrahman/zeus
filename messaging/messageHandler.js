(function initZeusMessageHandler(globalScope) {
  const settingsModule = globalScope.ZeusSettings;
  const router = globalScope.ZeusRouter;
  const errors = globalScope.ZeusErrors;
  const telemetry = globalScope.ZeusTelemetry || null;

  const CONTENT_SCRIPT_FILES = [
    'core/domUtils.js',
    'core/injector.js',
    'core/observer.js',
    'adapters/chatgpt.js',
    'adapters/claude.js',
    'adapters/grok.js',
    'adapters/deepseek.js',
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
      switch (message?.action) {
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

  setupContextMenu();
  setupRuntimeMessaging();
})(typeof globalThis !== 'undefined' ? globalThis : this);
