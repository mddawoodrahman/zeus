(function initZeusMessageHandler(globalScope) {
  const settingsModule = globalScope.ZeusSettings;
  const router = globalScope.ZeusRouter;
  const errors = globalScope.ZeusErrors;
  const telemetry = globalScope.ZeusTelemetry || null;
  const transformsModule = globalScope.ZeusTransforms || null;
  const promptLibrary = globalScope.ZeusPromptLibrary || null;
  const presetsModule = globalScope.ZeusPresets || null;
  const qualityScorer = globalScope.ZeusQualityScorer || null;
  const workflowsModule = globalScope.ZeusWorkflows || null;
  const privacyModule = globalScope.ZeusPrivacy || null;

  // Must stay in sync with manifest.json content_scripts[].js — forceInject
  // re-injects this exact set into a tab that is missing the content script.
  const CONTENT_SCRIPT_FILES = [
    'core/domUtils.js',
    'core/useFloatingPosition.js',
    'core/injector.js',
    'core/observer.js',
    'core/ghostText.js',
    'core/shortcuts.js',
    'core/transforms.js',
    'core/copilot.js',
    'adapters/chatgpt.js',
    'adapters/claude.js',
    'adapters/gemini.js',
    'adapters/grok.js',
    'adapters/deepseek.js',
    'adapters/openrouter.js',
    'adapters/generic.js',
    'core/multimodal.js',
    'content.js'
  ];

  const CONTEXT_MENU_ROOT_ID = 'zeus-enhance-prompt';
  const CONTEXT_MENU_TRANSFORM_PREFIX = 'zeus-transform:';
  const CONTEXT_MENU_DEFAULT_ID = 'zeus-enhance-default';

  function buildContextMenu() {
    // Rebuild from scratch so renamed or removed transforms never leave stale
    // entries behind. Older Chrome builds may not expose removeAll.
    if (typeof chrome.contextMenus.removeAll === 'function') {
      chrome.contextMenus.removeAll(() => createContextMenuEntries());
      return;
    }

    createContextMenuEntries();
  }

  function createContextMenuEntries() {
    chrome.contextMenus.create({
      id: CONTEXT_MENU_ROOT_ID,
      title: 'Enhance Prompt with Zeus',
      contexts: ['editable']
    });

    chrome.contextMenus.create({
      id: CONTEXT_MENU_DEFAULT_ID,
      parentId: CONTEXT_MENU_ROOT_ID,
      title: 'Full enhancement',
      contexts: ['editable']
    });

    if (!transformsModule || typeof transformsModule.loadTransforms !== 'function') {
      return;
    }

    transformsModule.loadTransforms()
      .then((transforms) => {
        for (const transform of transformsModule.getEnabledTransforms(transforms)) {
          chrome.contextMenus.create({
            id: `${CONTEXT_MENU_TRANSFORM_PREFIX}${transform.id}`,
            parentId: CONTEXT_MENU_ROOT_ID,
            title: transform.name,
            contexts: ['editable']
          });
        }
      })
      .catch(() => {});
  }

  function setupContextMenu() {
    chrome.runtime.onInstalled.addListener(() => {
      buildContextMenu();
    });

    // Rebuild when the user edits transforms so the menu never goes stale.
    if (chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'sync' || !transformsModule) return;
        if (changes[transformsModule.TRANSFORMS_STORAGE_KEY]) {
          buildContextMenu();
        }
      });
    }

    chrome.contextMenus.onClicked.addListener((info, tab) => {
      const menuItemId = String(info?.menuItemId || '');
      if (!tab?.id || !menuItemId.startsWith(CONTEXT_MENU_ROOT_ID)) {
        return;
      }

      const transformId = menuItemId.startsWith(CONTEXT_MENU_TRANSFORM_PREFIX)
        ? menuItemId.slice(CONTEXT_MENU_TRANSFORM_PREFIX.length)
        : '';

      chrome.tabs.sendMessage(tab.id, {
        action: 'contextEnhancePrompt',
        transformId
      }).catch(() => {});
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

  /**
   * Resolves the transform a request refers to. The id comes from an untrusted
   * page, so the instruction is always read from our own storage — never from the
   * message — which keeps a host page from injecting prompt text.
   */
  async function resolveTransform(transformId) {
    const wantedId = String(transformId || '').trim();
    if (!wantedId || !transformsModule) {
      return null;
    }

    try {
      const transforms = await transformsModule.loadTransforms();
      const transform = transformsModule.getTransformById(transforms, wantedId);

      // A disabled or unknown transform falls back to the default enhancement.
      return transform && transform.enabled ? transform : null;
    } catch (_) {
      return null;
    }
  }

  async function handleEnhancePrompt(message, sendResponse) {
    const prompt = String(message?.prompt || '').trim();
    const conversationContext = message?.conversationContext;
    const attachments = message?.attachments;

    try {
      const transform = await resolveTransform(message?.transformId);
      const enhancedPrompt = await router.enhancePrompt(prompt, { transform, conversationContext, attachments });
      sendResponse({ success: true, enhancedPrompt, transformId: transform?.id || '' });
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

        case 'getTransforms':
          if (!transformsModule) {
            sendResponse({ transforms: [], error: 'Transform store unavailable.' });
            return true;
          }

          transformsModule.loadTransforms()
            .then((transforms) => sendResponse({ transforms }))
            .catch((error) => sendResponse({
              transforms: [],
              error: String(error?.message || 'Failed to load transforms.')
            }));
          return true;

        case 'saveTransforms':
          if (!transformsModule) {
            sendResponse({ success: false, error: 'Transform store unavailable.' });
            return true;
          }

          if (!Array.isArray(message?.transforms)) {
            sendResponse({ success: false, error: 'Transform payload must be an array.' });
            return true;
          }

          transformsModule.saveTransforms(message.transforms)
            .then((transforms) => sendResponse({ success: true, transforms }))
            .catch((error) => sendResponse({
              success: false,
              error: String(error?.message || 'Failed to save transforms.')
            }));
          return true;

        case 'deleteTransform': {
          if (!transformsModule) {
            sendResponse({ success: false, error: 'Transform store unavailable.' });
            return true;
          }

          const targetId = String(message?.id || '').trim();
          if (!targetId) {
            sendResponse({ success: false, error: 'A transform id is required.' });
            return true;
          }

          transformsModule.loadTransforms()
            .then((transforms) => transformsModule.saveTransforms(
              transforms.filter((transform) => transform.id !== targetId)
            ))
            .then((transforms) => sendResponse({ success: true, transforms }))
            .catch((error) => sendResponse({
              success: false,
              error: String(error?.message || 'Failed to delete transform.')
            }));
          return true;
        }

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

          telemetry.getSummary()
            .then((summary) => sendResponse({ summary }))
            .catch(() => sendResponse({ summary: { totalEvents: 0, byProvider: {}, byReason: {}, recent: [] } }));
          return true;

        case 'clearTelemetry':
          if (telemetry && typeof telemetry.clear === 'function') {
            telemetry.clear();
          }
          sendResponse({ success: true });
          return true;

        case 'promptLibrary:getAll': {
          const lib = globalScope.ZeusPromptLibrary || promptLibrary;
          if (!lib) {
            sendResponse({ success: false, error: 'Prompt library unavailable.' });
            return true;
          }
          lib.loadLibrary()
            .then((prompts) => sendResponse({ success: true, prompts }))
            .catch((err) => sendResponse({ success: false, error: String(err?.message || err) }));
          return true;
        }

        case 'promptLibrary:save': {
          const lib = globalScope.ZeusPromptLibrary || promptLibrary;
          if (!lib) {
            sendResponse({ success: false, error: 'Prompt library unavailable.' });
            return true;
          }
          lib.loadLibrary()
            .then((prompts) => {
              const incoming = message?.prompt;
              if (!incoming) throw new Error('Missing prompt data.');
              let updated;
              const idx = prompts.findIndex((p) => p.id === incoming.id);
              if (idx >= 0) {
                prompts[idx] = lib.normalizePrompt({ ...prompts[idx], ...incoming });
                updated = prompts;
              } else {
                const created = lib.createPrompt(incoming);
                updated = [created, ...prompts];
              }
              return lib.saveLibrary(updated);
            })
            .then((saved) => sendResponse({ success: true, prompts: saved }))
            .catch((err) => sendResponse({ success: false, error: String(err?.message || err) }));
          return true;
        }

        case 'promptLibrary:addVersion': {
          const lib = globalScope.ZeusPromptLibrary || promptLibrary;
          if (!lib) {
            sendResponse({ success: false, error: 'Prompt library unavailable.' });
            return true;
          }
          lib.loadLibrary()
            .then((prompts) => {
              const promptId = message?.promptId;
              const versionData = message?.versionData;
              const idx = prompts.findIndex((p) => p.id === promptId);
              if (idx < 0) throw new Error(`Prompt '${promptId}' not found.`);
              prompts[idx] = lib.addVersion(prompts[idx], versionData);
              return lib.saveLibrary(prompts);
            })
            .then((saved) => sendResponse({ success: true, prompts: saved }))
            .catch((err) => sendResponse({ success: false, error: String(err?.message || err) }));
          return true;
        }

        case 'promptLibrary:revertVersion': {
          const lib = globalScope.ZeusPromptLibrary || promptLibrary;
          if (!lib) {
            sendResponse({ success: false, error: 'Prompt library unavailable.' });
            return true;
          }
          lib.loadLibrary()
            .then((prompts) => {
              const promptId = message?.promptId;
              const versionId = message?.versionId;
              const idx = prompts.findIndex((p) => p.id === promptId);
              if (idx < 0) throw new Error(`Prompt '${promptId}' not found.`);
              prompts[idx] = lib.revertVersion(prompts[idx], versionId);
              return lib.saveLibrary(prompts);
            })
            .then((saved) => sendResponse({ success: true, prompts: saved }))
            .catch((err) => sendResponse({ success: false, error: String(err?.message || err) }));
          return true;
        }

        case 'promptLibrary:delete': {
          const lib = globalScope.ZeusPromptLibrary || promptLibrary;
          if (!lib) {
            sendResponse({ success: false, error: 'Prompt library unavailable.' });
            return true;
          }
          lib.loadLibrary()
            .then((prompts) => {
              const promptId = message?.promptId || message?.id;
              const filtered = prompts.filter((p) => p.id !== promptId);
              return lib.saveLibrary(filtered);
            })
            .then((saved) => sendResponse({ success: true, prompts: saved }))
            .catch((err) => sendResponse({ success: false, error: String(err?.message || err) }));
          return true;
        }

        case 'presets:export': {
          const presetsMod = globalScope.ZeusPresets || presetsModule;
          const lib = globalScope.ZeusPromptLibrary || promptLibrary;
          if (!presetsMod) {
            sendResponse({ success: false, error: 'Presets module unavailable.' });
            return true;
          }
          Promise.all([
            transformsModule ? transformsModule.loadTransforms() : Promise.resolve([]),
            lib ? lib.loadLibrary() : Promise.resolve([]),
            settingsModule ? settingsModule.loadSettings() : Promise.resolve({})
          ])
            .then(([transforms, prompts, settings]) => {
              const bundle = presetsMod.exportPresetBundle({
                meta: message?.meta || {},
                transforms,
                prompts,
                customProviders: settings?.customProviders || [],
                smartRouterProfile: settings?.smartRouterProfile || 'balanced',
                includeApiKeys: Boolean(message?.includeApiKeys)
              });
              sendResponse({ success: true, bundle });
            })
            .catch((err) => sendResponse({ success: false, error: String(err?.message || err) }));
          return true;
        }

        case 'presets:import': {
          const presetsMod = globalScope.ZeusPresets || presetsModule;
          const lib = globalScope.ZeusPromptLibrary || promptLibrary;
          if (!presetsMod) {
            sendResponse({ success: false, error: 'Presets module unavailable.' });
            return true;
          }
          const bundle = message?.bundle;
          const options = message?.options || { mode: 'merge' };

          Promise.all([
            transformsModule ? transformsModule.loadTransforms() : Promise.resolve([]),
            lib ? lib.loadLibrary() : Promise.resolve([]),
            settingsModule ? settingsModule.loadSettings() : Promise.resolve({})
          ])
            .then(async ([transforms, prompts, settings]) => {
              const currentState = {
                transforms,
                prompts,
                customProviders: settings?.customProviders || [],
                smartRouterProfile: settings?.smartRouterProfile || 'balanced'
              };

              const result = presetsMod.importPresetBundle(bundle, currentState, options);

              if (transformsModule && result.nextState.transforms) {
                await transformsModule.saveTransforms(result.nextState.transforms);
              }

              if (lib && result.nextState.prompts) {
                await lib.saveLibrary(result.nextState.prompts);
              }

              if (settingsModule) {
                const nextSettings = settingsModule.normalizeSettings({
                  ...settings,
                  customProviders: result.nextState.customProviders,
                  smartRouterProfile: result.nextState.smartRouterProfile
                });
                await settingsModule.saveSettings(nextSettings);
                notifyTabsOfUpdate(nextSettings);
              }

              sendResponse({ success: true, stats: result.stats, nextState: result.nextState });
            })
            .catch((err) => sendResponse({ success: false, error: String(err?.message || err) }));
          return true;
        }

        case 'quality:evaluate': {
          const scorer = globalScope.ZeusQualityScorer || qualityScorer;
          if (!scorer) {
            sendResponse({ success: false, error: 'Quality scorer unavailable.' });
            return true;
          }
          try {
            const evaluation = scorer.evaluateQuality(message?.prompt);
            sendResponse({ success: true, evaluation });
          } catch (err) {
            sendResponse({ success: false, error: String(err?.message || err) });
          }
          return true;
        }

        case 'quality:compare': {
          const scorer = globalScope.ZeusQualityScorer || qualityScorer;
          if (!scorer) {
            sendResponse({ success: false, error: 'Quality scorer unavailable.' });
            return true;
          }
          try {
            const comparison = scorer.compareVariants(message?.promptA, message?.promptB, message?.options);
            sendResponse({ success: true, comparison });
          } catch (err) {
            sendResponse({ success: false, error: String(err?.message || err) });
          }
          return true;
        }

        case 'ab:getExperiments': {
          const scorer = globalScope.ZeusQualityScorer || qualityScorer;
          if (!scorer) {
            sendResponse({ success: false, error: 'Quality scorer unavailable.' });
            return true;
          }
          scorer.loadExperiments()
            .then((experiments) => sendResponse({ success: true, experiments }))
            .catch((err) => sendResponse({ success: false, error: String(err?.message || err) }));
          return true;
        }

        case 'ab:saveExperiment': {
          const scorer = globalScope.ZeusQualityScorer || qualityScorer;
          if (!scorer) {
            sendResponse({ success: false, error: 'Quality scorer unavailable.' });
            return true;
          }
          scorer.loadExperiments()
            .then((experiments) => {
              const record = message?.experiment?.id
                ? message.experiment
                : scorer.createExperimentRecord(message?.experiment || {});
              const updated = [record, ...experiments.filter((e) => e.id !== record.id)];
              return scorer.saveExperiments(updated);
            })
            .then((saved) => sendResponse({ success: true, experiments: saved }))
            .catch((err) => sendResponse({ success: false, error: String(err?.message || err) }));
          return true;
        }

        case 'ab:deleteExperiment': {
          const scorer = globalScope.ZeusQualityScorer || qualityScorer;
          if (!scorer) {
            sendResponse({ success: false, error: 'Quality scorer unavailable.' });
            return true;
          }
          scorer.deleteExperiment(message?.id)
            .then((experiments) => sendResponse({ success: true, experiments }))
            .catch((err) => sendResponse({ success: false, error: String(err?.message || err) }));
          return true;
        }

        case 'workflow:getAll': {
          const mod = globalScope.ZeusWorkflows || workflowsModule;
          if (!mod) {
            sendResponse({ success: false, error: 'Workflows module unavailable.' });
            return true;
          }
          mod.getAllWorkflows()
            .then((workflows) => sendResponse({ success: true, workflows }))
            .catch((err) => sendResponse({ success: false, error: String(err?.message || err) }));
          return true;
        }

        case 'workflow:save': {
          const mod = globalScope.ZeusWorkflows || workflowsModule;
          if (!mod) {
            sendResponse({ success: false, error: 'Workflows module unavailable.' });
            return true;
          }
          mod.saveWorkflow(message?.workflow)
            .then((workflow) => sendResponse({ success: true, workflow }))
            .catch((err) => sendResponse({ success: false, error: String(err?.message || err) }));
          return true;
        }

        case 'workflow:delete': {
          const mod = globalScope.ZeusWorkflows || workflowsModule;
          if (!mod) {
            sendResponse({ success: false, error: 'Workflows module unavailable.' });
            return true;
          }
          mod.deleteWorkflow(message?.id || message?.workflowId)
            .then(() => sendResponse({ success: true }))
            .catch((err) => sendResponse({ success: false, error: String(err?.message || err) }));
          return true;
        }

        case 'workflow:execute': {
          const mod = globalScope.ZeusWorkflows || workflowsModule;
          if (!mod) {
            sendResponse({ success: false, error: 'Workflows module unavailable.' });
            return true;
          }
          const prompt = String(message?.prompt || '').trim();
          let workflow = message?.workflow;
          const workflowId = message?.workflowId;

          const run = (wf) => {
            mod.executeWorkflow(prompt, wf, {
              router,
              conversationContext: message?.conversationContext,
              attachments: message?.attachments
            })
              .then((result) => sendResponse(result))
              .catch((err) => sendResponse({ success: false, error: String(err?.message || err) }));
          };

          if (!workflow && workflowId) {
            mod.getAllWorkflows()
              .then((workflows) => {
                const found = workflows.find((w) => w.id === workflowId);
                if (!found) throw new Error(`Workflow with ID '${workflowId}' not found.`);
                run(found);
              })
              .catch((err) => sendResponse({ success: false, error: String(err?.message || err) }));
          } else {
            run(workflow);
          }
          return true;
        }

        case 'privacy:scan': {
          const mod = globalScope.ZeusPrivacy || privacyModule;
          if (!mod) {
            sendResponse({ success: false, error: 'Privacy module unavailable.' });
            return true;
          }
          try {
            const scanResult = mod.scanPromptForPII(message?.text, message?.options);
            sendResponse({ success: true, ...scanResult });
          } catch (err) {
            sendResponse({ success: false, error: String(err?.message || err) });
          }
          return true;
        }

        case 'privacy:redact': {
          const mod = globalScope.ZeusPrivacy || privacyModule;
          if (!mod) {
            sendResponse({ success: false, error: 'Privacy module unavailable.' });
            return true;
          }
          try {
            const red = mod.redactPrompt(message?.text, message?.options);
            sendResponse({ success: true, ...red });
          } catch (err) {
            sendResponse({ success: false, error: String(err?.message || err) });
          }
          return true;
        }

        case 'privacy:restore': {
          const mod = globalScope.ZeusPrivacy || privacyModule;
          if (!mod) {
            sendResponse({ success: false, error: 'Privacy module unavailable.' });
            return true;
          }
          try {
            const report = mod.restorePromptWithReport(message?.text, message?.tokenMap);
            sendResponse({ success: true, ...report });
          } catch (err) {
            sendResponse({ success: false, error: String(err?.message || err) });
          }
          return true;
        }

        case 'privacy:getStats': {
          const mod = globalScope.ZeusPrivacy || privacyModule;
          if (!mod) {
            sendResponse({ success: false, error: 'Privacy module unavailable.' });
            return true;
          }
          mod.getPrivacyStats()
            .then((stats) => sendResponse({ success: true, stats }))
            .catch((err) => sendResponse({ success: false, error: String(err?.message || err) }));
          return true;
        }

        case 'privacy:resetStats': {
          const mod = globalScope.ZeusPrivacy || privacyModule;
          if (!mod) {
            sendResponse({ success: false, error: 'Privacy module unavailable.' });
            return true;
          }
          mod.resetPrivacyStats()
            .then(() => sendResponse({ success: true }))
            .catch((err) => sendResponse({ success: false, error: String(err?.message || err) }));
          return true;
        }

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
