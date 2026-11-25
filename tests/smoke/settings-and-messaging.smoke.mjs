import path from 'node:path';
import fs from 'node:fs';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';

const rootDir = process.cwd();

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function loadScript(relativePath) {
  const fullPath = path.resolve(rootDir, relativePath);
  return import(pathToFileURL(fullPath).href);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createChromeMock(options = {}) {
  const syncStore = { ...(options.syncStore || {}) };
  const localStore = { ...(options.localStore || {}) };

  const listeners = {
    onInstalled: [],
    onMessage: [],
    onContextMenuClicked: [],
    onCommand: []
  };

  const calls = {
    contextMenuRemoveAll: 0,
    contextMenuCreate: [],
    tabsQuery: [],
    tabsSendMessage: [],
    executeScript: [],
    sidePanelOpen: [],
    sidePanelClose: [],
    sidePanelSetPanelBehavior: [],
    windowsGetLastFocused: 0
  };

  function pickStoreValues(store, keys) {
    if (!keys) {
      return clone(store);
    }

    if (Array.isArray(keys)) {
      const payload = {};
      for (const key of keys) {
        payload[key] = store[key];
      }
      return payload;
    }

    if (typeof keys === 'string') {
      return { [keys]: store[keys] };
    }

    if (keys && typeof keys === 'object') {
      const payload = {};
      for (const key of Object.keys(keys)) {
        payload[key] = store[key] !== undefined ? store[key] : keys[key];
      }
      return payload;
    }

    return clone(store);
  }

  const chrome = {
    runtime: {
      getManifest: () => JSON.parse(fs.readFileSync(path.join(rootDir,'manifest.json'),'utf8')),
      id: 'test-extension-id',
      lastError: null,
      onInstalled: {
        addListener(fn) {
          listeners.onInstalled.push(fn);
        }
      },
      onMessage: {
        addListener(fn) {
          listeners.onMessage.push(fn);
        }
      }
    },
    storage: {
      sync: {
        get(keys, callback) {
          callback(pickStoreValues(syncStore, keys));
        },
        set(payload, callback) {
          Object.assign(syncStore, payload || {});
          if (typeof callback === 'function') {
            callback();
          }
        },
        remove(keys, callback) {
          const list = Array.isArray(keys) ? keys : [keys];
          for (const k of list) {
            delete syncStore[k];
          }
          if (typeof callback === 'function') {
            callback();
          }
        }
      },
      local: {
        get(keys, callback) {
          callback(pickStoreValues(localStore, keys));
        },
        set(payload, callback) {
          Object.assign(localStore, payload || {});
          if (typeof callback === 'function') {
            callback();
          }
        },
        remove(keys, callback) {
          const list = Array.isArray(keys) ? keys : [keys];
          for (const k of list) {
            delete localStore[k];
          }
          if (typeof callback === 'function') {
            callback();
          }
        }
      }
    },
    contextMenus: {
      removeAll(callback) {
        calls.contextMenuRemoveAll += 1;
        if (typeof callback === 'function') callback();
      },
      create(config, callback) {
        calls.contextMenuCreate.push(config);
        if (typeof callback === 'function') callback();
      },
      onClicked: {
        addListener(fn) {
          listeners.onContextMenuClicked.push(fn);
        }
      }
    },
    tabs: {
      query(queryInfo, callback) {
        calls.tabsQuery.push(queryInfo);
        if (queryInfo && queryInfo.url) {
          callback([{ id: 777, windowId: 1 }, { id: 888, windowId: 2 }]);
          return;
        }
        callback([{ id: 777, windowId: 1 }]);
      },
      sendMessage(tabId, message) {
        calls.tabsSendMessage.push({ tabId, message });
        return Promise.resolve({ ok: true });
      }
    },
    commands: {
      onCommand: {
        addListener(fn) {
          listeners.onCommand.push(fn);
        }
      }
    },
    sidePanel: {
      open(opts) {
        calls.sidePanelOpen.push(opts);
        return Promise.resolve();
      },
      close(opts) {
        calls.sidePanelClose.push(opts);
        return Promise.resolve();
      },
      setPanelBehavior(opts) {
        calls.sidePanelSetPanelBehavior.push(opts);
        return Promise.resolve();
      }
    },
    windows: {
      getLastFocused(cb) {
        calls.windowsGetLastFocused += 1;
        setTimeout(() => cb({ id: 99 }), 0);
      }
    },
    scripting: {
      executeScript(payload) {
        calls.executeScript.push(payload);
        return Promise.resolve([{ result: true }]);
      }
    }
  };

  return {
    chrome,
    listeners,
    calls,
    syncStore,
    localStore
  };
}

function invokeMessage(listener, message, sender = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error(`Timed out waiting for message action '${String(message?.action || '')}'.`));
      }
    }, 1200);

    function sendResponse(payload) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(payload);
    }

    try {
      const handled = listener(message, sender, sendResponse);
      if (!handled && !settled) {
        settled = true;
        clearTimeout(timer);
        resolve(undefined);
      }
    } catch (error) {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(error);
      }
    }
  });
}

async function runSettingsMigrationSmoke() {
  const env = createChromeMock();
  globalThis.chrome = env.chrome;

  await loadScript('model-registry.js');
  await loadScript(path.join('settings', 'settings.js'));

  const legacyPayload = {
    zeus_selected_provider: 'openrouter',
    zeus_openrouter_api_key: 'legacy-openrouter-key',
    zeus_provider_configs: {
      openrouter: {
        model: 'google/gemini-3-pro'
      }
    }
  };

  const migrated = globalThis.ZeusSettings.migrateSettings(legacyPayload);
  assert(migrated.schemaVersion === 3, 'Expected migrated schemaVersion to be 3.');
  assert(migrated.provider === 'openrouter', 'Expected legacy provider to migrate to openrouter.');
  assert(migrated.apiKeys.openrouter === 'legacy-openrouter-key', 'Expected legacy OpenRouter API key migration.');
  assert(migrated.models.openrouter === 'google/gemini-3-pro', 'Expected legacy OpenRouter model migration.');

  const saveResult = await globalThis.ZeusSettings.saveSettings({
    provider: 'claude',
    apiKeys: { claude: 'claude-test-key' },
    models: { claude: 'claude-sonnet-4.6' }
  });

  assert(saveResult.settings.provider === 'claude', 'Expected saved provider to normalize as claude.');
  assert(saveResult.settings.apiKeys.claude === 'claude-test-key', 'Expected normalized settings to contain claude key.');
  assert(env.syncStore.provider === 'claude', 'Expected canonical provider key to be persisted in syncStore.');
  assert(env.syncStore.schemaVersion === 3, 'Expected schemaVersion 3 to be persisted in syncStore.');
  assert(env.syncStore.zeus_selected_provider === undefined, 'Expected legacy provider key to NOT be persisted in syncStore.');
  assert(env.syncStore.apiKeys === undefined, 'Expected apiKeys to NOT be persisted in syncStore.');
  assert(env.localStore.apiKeys?.claude === 'claude-test-key', 'Expected apiKeys to be persisted in localStore.');

  const loaded = await globalThis.ZeusSettings.loadSettings();
  assert(loaded.provider === 'claude', 'Expected loadSettings to return saved provider.');
  assert(loaded.apiKeys.claude === 'claude-test-key', 'Expected loadSettings to return saved API key from localStore.');

  // Verify updating an existing key in localStore
  const updateResult = await globalThis.ZeusSettings.saveSettings({
    apiKeys: { claude: 'updated-claude-key' }
  });
  assert(updateResult.settings.apiKeys.claude === 'updated-claude-key', 'Expected updated key in settings.');
  assert(env.localStore.apiKeys?.claude === 'updated-claude-key', 'Expected updated key in localStore.');

  // Verify clearing a key in localStore
  const clearResult = await globalThis.ZeusSettings.saveSettings({
    apiKeys: { claude: '' }
  });
  assert(clearResult.settings.apiKeys.claude === '', 'Expected cleared key in settings.');
  assert(env.localStore.apiKeys?.claude === '', 'Expected cleared key in localStore.');

  // Interrupted migration recovery test with synthetic credentials
  const interruptedEnv = createChromeMock({
    localStore: {
      apiKeys: {
        openrouter: 'synth-local-openrouter'
      }
    },
    syncStore: {
      schemaVersion: 2,
      zeus_selected_provider: 'gemini',
      zeus_gemini_api_key: 'synth-sync-gemini',
      zeus_openrouter_api_key: 'stale-sync-openrouter'
    }
  });
  globalThis.chrome = interruptedEnv.chrome;
  await loadScript(path.join('settings', 'settings.js'));

  const recovered = await globalThis.ZeusSettings.loadSettings();
  assert(recovered.schemaVersion === 3, 'Expected recovered schemaVersion to be 3.');
  assert(recovered.apiKeys.openrouter === 'synth-local-openrouter', 'Expected non-empty local key to take precedence in interrupted migration.');
  assert(recovered.apiKeys.gemini === 'synth-sync-gemini', 'Expected sync key to migrate to local.');
  assert(interruptedEnv.localStore.apiKeys.openrouter === 'synth-local-openrouter', 'Expected local openrouter key preserved.');
  assert(interruptedEnv.localStore.apiKeys.gemini === 'synth-sync-gemini', 'Expected local gemini key written.');
  assert(interruptedEnv.syncStore.schemaVersion === 3, 'Expected syncStore upgraded to schemaVersion 3.');
  assert(interruptedEnv.syncStore.zeus_gemini_api_key === undefined, 'Expected legacy sync keys purged.');
  assert(interruptedEnv.syncStore.apiKeys === undefined, 'Expected sync.apiKeys purged.');

  // Concurrent migration test with synthetic credentials
  const concurrentEnv = createChromeMock({
    syncStore: {
      schemaVersion: 2,
      zeus_selected_provider: 'claude',
      zeus_claude_api_key: 'concurrent-synth-key'
    }
  });
  globalThis.chrome = concurrentEnv.chrome;
  await loadScript(path.join('settings', 'settings.js'));

  const concurrentResults = await Promise.all([
    globalThis.ZeusSettings.loadSettings(),
    globalThis.ZeusSettings.loadSettings(),
    globalThis.ZeusSettings.loadSettings()
  ]);
  assert(concurrentResults[0].apiKeys.claude === 'concurrent-synth-key', 'Expected concurrent result 0 to have claude key.');
  assert(concurrentResults[1].apiKeys.claude === 'concurrent-synth-key', 'Expected concurrent result 1 to have claude key.');
  assert(concurrentResults[2].apiKeys.claude === 'concurrent-synth-key', 'Expected concurrent result 2 to have claude key.');
  assert(concurrentEnv.syncStore.schemaVersion === 3, 'Expected concurrent migration to finish with schemaVersion 3.');
  assert(concurrentEnv.syncStore.zeus_claude_api_key === undefined, 'Expected legacy keys purged in concurrent run.');
  assert(concurrentEnv.localStore.apiKeys.claude === 'concurrent-synth-key', 'Expected local credentials written.');
}

async function runMessageActionSmoke() {
  const env = createChromeMock({
    syncStore: {
      schemaVersion: 3,
      provider: 'gemini',
      models: { gemini: 'gemini-3-flash' },
      ollama: { model: '' }
    },
    localStore: {
      apiKeys: { gemini: 'g-key', openai: '', claude: '', openrouter: '' }
    }
  });

  globalThis.chrome = env.chrome;

  await loadScript('model-registry.js');
  await loadScript(path.join('settings', 'settings.js'));

  let telemetryCleared = false;

  globalThis.ZeusRouter = {
    async enhancePrompt(prompt) {
      return `enhanced:${String(prompt || '').trim()}`;
    }
  };

  globalThis.ZeusErrors = {
    normalizeEnhanceError(error) {
      return String(error?.message || error || 'unknown');
    },
    looksLikeOllamaConnectionError() {
      return false;
    }
  };

  globalThis.ZeusTelemetry = {
    getSummary(callback) {
      callback({ totalEvents: 2, byProvider: { openai: 1, claude: 1 }, byReason: { quota: 2 }, recent: [] });
    },
    clear() {
      telemetryCleared = true;
    }
  };

  globalThis.ZeusOllamaMeta = {
    OLLAMA_NOT_RUNNING_MESSAGE: 'not-running',
    OLLAMA_NO_MODEL_MESSAGE: 'no-model',
    buildOllamaOriginBlockedMessage() {
      return 'origin-blocked';
    }
  };

  await loadScript(path.join('messaging', 'messageHandler.js'));
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert(
    env.calls.sidePanelSetPanelBehavior.some((entry) => entry?.openPanelOnActionClick === true),
    'Expected startup initialization to sync sidePanelEnabled behavior.'
  );

  assert(env.listeners.onInstalled.length === 1, 'Expected onInstalled listener registration.');
  env.listeners.onInstalled[0]();
  assert(env.calls.contextMenuRemoveAll === 1, 'Expected contextMenus.removeAll to clear menus before create.');
  assert(env.calls.contextMenuCreate.length === 1, 'Expected context menu to be created on install.');

  // Synchronous command invocation must call sidePanel.open immediately with tab.windowId without waiting on async getLastFocused
  assert(env.listeners.onCommand.length === 1, 'Expected commands.onCommand listener registration.');
  env.listeners.onCommand[0]('open-side-panel', { id: 777, windowId: 42 });
  assert(
    env.calls.sidePanelOpen.length === 1 && env.calls.sidePanelOpen[0]?.windowId === 42,
    'Expected sidePanel.open to be called synchronously with tab.windowId.'
  );

  const messageListener = env.listeners.onMessage[0];
  assert(typeof messageListener === 'function', 'Expected runtime onMessage listener registration.');

  const ping = await invokeMessage(messageListener, { action: 'ping' });
  assert(ping?.status === 'pong', 'Expected ping response.');

  const settingsResponse = await invokeMessage(messageListener, { action: 'getSettings' });
  assert(settingsResponse?.settings?.provider === 'gemini', 'Expected getSettings to return provider from storage.');
  assert(settingsResponse?.settings?.apiKeys === undefined, 'Expected getSettings to NEVER expose raw apiKeys to content scripts.');
  assert(settingsResponse?.settings?.zeus_gemini_api_key === undefined, 'Expected getSettings to NEVER expose legacy api keys.');
  assert(settingsResponse?.settings?.hasApiKey?.gemini === true, 'Expected getSettings to return hasApiKey boolean.');

  const enhanced = await invokeMessage(messageListener, { action: 'enhancePrompt', prompt: '  hello  ' });
  assert(enhanced?.success === true, 'Expected enhancePrompt to succeed.');
  assert(enhanced?.enhancedPrompt === 'enhanced:hello', 'Expected enhancedPrompt payload from router.');

  const updateAck = await invokeMessage(messageListener, {
    action: 'settingsUpdated',
    settings: { provider: 'openai', sidePanelEnabled: false }
  });
  assert(updateAck?.success === true, 'Expected settingsUpdated acknowledgment.');
  const updatedTabIds = env.calls.tabsSendMessage
    .filter((entry) => entry?.message?.action === 'settingsUpdated' && entry?.message?.settings?.apiKeys === undefined)
    .map((entry) => entry.tabId);
  assert(
    updatedTabIds.includes(777) && updatedTabIds.includes(888),
    'Expected settingsUpdated to broadcast across all matching composer tabs across windows.'
  );
  assert(
    env.calls.sidePanelSetPanelBehavior.at(-1)?.openPanelOnActionClick === false,
    'Expected settingsUpdated to sync sidePanelEnabled=false to sidePanel.setPanelBehavior.'
  );

  const forceInject = await invokeMessage(
    messageListener,
    { action: 'forceInject' },
    { tab: { id: 800 } }
  );
  assert(forceInject?.success === true, 'Expected forceInject to succeed.');
  assert(env.calls.executeScript.length === 1, 'Expected forceInject to call executeScript.');
  assert(
    env.calls.tabsSendMessage.some((entry) => entry?.message?.action === 'forceInjectButton'),
    'Expected forceInject to request content refresh.'
  );

  const telemetrySummary = await invokeMessage(messageListener, { action: 'getTelemetrySummary' });
  assert(telemetrySummary?.summary?.totalEvents === 2, 'Expected telemetry summary payload.');

  const clearTelemetry = await invokeMessage(messageListener, { action: 'clearTelemetry' });
  assert(clearTelemetry?.success === true, 'Expected clearTelemetry acknowledgment.');
  assert(telemetryCleared, 'Expected telemetry clear hook to be invoked.');
}

async function runDiagnosticsAndLiveSyncSmoke() {
  const savedChrome = globalThis.chrome;
  const savedFetch = globalThis.fetch;
  const savedRouter = globalThis.ZeusRouter;
  const savedErrors = globalThis.ZeusErrors;
  const savedTelemetry = globalThis.ZeusTelemetry;
  const savedOllamaMeta = globalThis.ZeusOllamaMeta;

  try {
    const syncStore = {
      schemaVersion: 3,
      provider: 'gemini',
      sidePanelEnabled: true,
      models: {
        gemini: 'gemini-flash-latest',
        openai: 'gpt-5.4-mini',
        claude: 'claude-sonnet-4.6',
        openrouter: 'openai/gpt-5.4'
      },
      ollama: { host: 'http://localhost:11434', model: '' }
    };
    const localStore = {
      apiKeys: { gemini: '', openai: '', claude: '', openrouter: '' }
    };

    const listeners = {
      onInstalled: [],
      onMessage: [],
      onContextMenuClicked: [],
      onCommand: [],
      storageOnChanged: []
    };
    const calls = {
      runtimeSendMessage: [],
      tabsSendMessage: [],
      sidePanelSetPanelBehavior: []
    };

    const safeClone = (value) => (value === undefined ? undefined : clone(value));
    const emitStorage = (changes, areaName) => {
      if (!Object.keys(changes).length) return;
      for (const fn of listeners.storageOnChanged) {
        fn(safeClone(changes), areaName);
      }
    };

    const makeArea = (store, areaName) => ({
      get(keys, cb) {
        let res;
        if (!keys) res = safeClone(store);
        else if (Array.isArray(keys)) {
          res = {};
          for (const k of keys) res[k] = safeClone(store[k]);
        } else if (typeof keys === 'string') {
          res = { [keys]: safeClone(store[keys]) };
        } else {
          res = {};
          for (const k of Object.keys(keys)) res[k] = store[k] !== undefined ? safeClone(store[k]) : safeClone(keys[k]);
        }
        if (typeof cb === 'function') {
          cb(res);
          return;
        }
        return Promise.resolve(res);
      },
      set(payload, cb) {
        const changes = {};
        for (const [k, v] of Object.entries(payload || {})) {
          changes[k] = { oldValue: safeClone(store[k]), newValue: safeClone(v) };
        }
        Object.assign(store, safeClone(payload || {}));
        emitStorage(changes, areaName);
        if (typeof cb === 'function') {
          cb();
          return;
        }
        return Promise.resolve();
      },
      remove(keys, cb) {
        const list = Array.isArray(keys) ? keys : [keys];
        const changes = {};
        for (const k of list) {
          if (k in store) {
            changes[k] = { oldValue: safeClone(store[k]), newValue: undefined };
            delete store[k];
          }
        }
        emitStorage(changes, areaName);
        if (typeof cb === 'function') {
          cb();
          return;
        }
        return Promise.resolve();
      }
    });

    const chromeMock = {
      runtime: {
        id: 'smoke-ext-id',
        lastError: null,
        getManifest: () => JSON.parse(fs.readFileSync(path.join(rootDir, 'manifest.json'), 'utf8')),
        onInstalled: { addListener: (fn) => listeners.onInstalled.push(fn) },
        onMessage: { addListener: (fn) => listeners.onMessage.push(fn) },
        sendMessage(message, cb) {
          calls.runtimeSendMessage.push(clone(message));
          if (typeof cb === 'function') {
            const listener = listeners.onMessage[listeners.onMessage.length - 1];
            if (listener) {
              const handled = listener(message, {}, (res) => cb(res));
              if (!handled) cb(undefined);
            } else {
              cb(undefined);
            }
          }
          return Promise.resolve();
        }
      },
      storage: {
        sync: makeArea(syncStore, 'sync'),
        local: makeArea(localStore, 'local'),
        onChanged: { addListener: (fn) => listeners.storageOnChanged.push(fn) }
      },
      contextMenus: {
        removeAll: (cb) => { if (cb) cb(); },
        create: (_c, cb) => { if (cb) cb(); },
        onClicked: { addListener: (fn) => listeners.onContextMenuClicked.push(fn) }
      },
      tabs: {
        query: (_q, cb) => cb([{ id: 101, windowId: 1 }]),
        sendMessage: (tabId, msg) => {
          calls.tabsSendMessage.push({ tabId, message: clone(msg) });
          return Promise.resolve({ ok: true });
        }
      },
      commands: { onCommand: { addListener: (fn) => listeners.onCommand.push(fn) } },
      sidePanel: {
        open: () => Promise.resolve(),
        close: () => Promise.resolve(),
        setPanelBehavior: (opts) => {
          calls.sidePanelSetPanelBehavior.push(opts);
          return Promise.resolve();
        }
      }
    };

    globalThis.chrome = chromeMock;
    globalThis.fetch = async (url, init) => {
      if (String(url).includes('generativelanguage.googleapis.com/v1beta/models/')) {
        assert(!String(url).includes('smoke-gem-key'), 'Gemini probe URL must never include API key.');
        assert(init?.headers?.['x-goog-api-key'] === 'smoke-gem-key', 'Gemini probe must send x-goog-api-key header.');
        return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ name: 'models/gemini-flash-latest' }) };
      }
      if (String(url).endsWith('/api/version')) {
        return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ version: '0.6.4' }) };
      }
      if (String(url).endsWith('/api/ps')) {
        return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ models: [{ model: 'qwen3:8b' }] }) };
      }
      if (String(url).endsWith('/api/tags')) {
        return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ models: [{ name: 'qwen3:8b' }] }) };
      }
      return { ok: false, status: 404, headers: { get: () => 'application/json' }, json: async () => ({}) };
    };

    const vmGlobals = {
      console,
      setTimeout,
      clearTimeout,
      URL,
      TextEncoder,
      TextDecoder,
      AbortController,
      AbortSignal,
      Error,
      TypeError,
      Promise,
      JSON,
      Object,
      Array,
      Map,
      Set,
      Math,
      Date,
      Number,
      String,
      Boolean,
      RegExp,
      chrome: chromeMock,
      fetch: globalThis.fetch,
      LOG_PREFIX: { info: '[ZEUS]', warn: '[ZEUS]', error: '[ZEUS]', success: '[ZEUS]' },
      LOG_STYLE: { info: '', warn: '', error: '', success: '' }
    };
    vmGlobals.globalThis = vmGlobals;
    const vmCtx = vm.createContext(vmGlobals);

    const runInCtx = (rel) => {
      const fullPath = path.resolve(rootDir, rel);
      const code = fs.readFileSync(fullPath, 'utf8');
      vm.runInContext(code, vmCtx, { filename: fullPath });
    };

    runInCtx('model-registry.js');
    runInCtx(path.join('settings', 'settingsStore.js'));
    runInCtx(path.join('core', 'retry.js'));
    runInCtx(path.join('core', 'prompts.js'));
    runInCtx(path.join('core', 'errors.js'));
    runInCtx(path.join('core', 'telemetry.js'));
    runInCtx(path.join('core', 'providerTransport.js'));
    runInCtx(path.join('providers', 'utils.js'));
    runInCtx(path.join('providers', 'gemini.js'));
    runInCtx(path.join('providers', 'openai.js'));
    runInCtx(path.join('providers', 'claude.js'));
    runInCtx(path.join('providers', 'openrouter.js'));
    runInCtx(path.join('providers', 'ollama.js'));
    runInCtx(path.join('core', 'redactor.js'));
    runInCtx(path.join('core', 'router.js'));
    runInCtx(path.join('core', 'promptEngine.js'));
    runInCtx(path.join('core', 'providerDiagnostics.js'));
    runInCtx(path.join('core', 'promptClient.js'));
    runInCtx(path.join('messaging', 'messageHandler.js'));

    await new Promise((r) => setTimeout(r, 15));
    const messageListener = listeners.onMessage[listeners.onMessage.length - 1];

    // 1. Unconfigured readiness & PromptClient gate
    const initialReadiness = await invokeMessage(messageListener, { action: 'getProviderReadiness' });
    assert(initialReadiness?.success === true && initialReadiness.readiness.activeState === 'not_configured', 'Expected initial readiness to be not_configured.');

    let clientNotConfiguredErr = null;
    try {
      await vmCtx.ZeusPromptClient.enhance('Test unconfigured prompt');
    } catch (err) {
      clientNotConfiguredErr = err;
    }
    assert(
      clientNotConfiguredErr?.code === 'NOT_CONFIGURED',
      `Expected PromptClient.enhance to throw NOT_CONFIGURED when unconfigured, got: ${clientNotConfiguredErr?.code} / ${clientNotConfiguredErr?.message}`
    );

    // 2. Live storage update triggers background settingsUpdated without apiKeys
    calls.runtimeSendMessage.length = 0;
    calls.tabsSendMessage.length = 0;
    await vmCtx.ZeusSettingsStore.update({ apiKeys: { gemini: 'smoke-gem-key' }, sidePanelEnabled: false });
    await new Promise((r) => setTimeout(r, 25));

    const settingsUpdateEvent = calls.runtimeSendMessage.find((m) => m?.action === 'settingsUpdated' && m?.source === 'background');
    assert(Boolean(settingsUpdateEvent), 'Expected background storage.onChanged listener to emit settingsUpdated.');
    assert(settingsUpdateEvent.settings.apiKeys === undefined, 'Expected settingsUpdated broadcast to never include apiKeys.');
    assert(settingsUpdateEvent.settings.hasApiKey?.gemini === true, 'Expected settingsUpdated broadcast to include hasApiKey.gemini=true.');
    assert(settingsUpdateEvent.readiness?.activeState === 'configured_untested', 'Expected readiness to transition to configured_untested.');
    assert(calls.sidePanelSetPanelBehavior.at(-1)?.openPanelOnActionClick === false, 'Expected sidePanelEnabled=false to sync via storage.onChanged.');

    // 3. Sender guard and testConnection -> readinessUpdated -> verified
    const untrustedTest = await invokeMessage(messageListener, { action: 'testConnection', provider: 'gemini' }, { tab: { id: 1 }, url: 'https://chatgpt.com/' });
    assert(untrustedTest?.success === false, 'Expected untrusted tab sender to be rejected for testConnection.');

    const verifiedTest = await invokeMessage(messageListener, { action: 'testConnection', provider: 'gemini' });
    assert(verifiedTest?.success === true && verifiedTest.readiness?.activeState === 'verified', 'Expected testConnection to verify Gemini via header.');
    assert(calls.runtimeSendMessage.some((m) => m?.action === 'readinessUpdated' && m?.readiness?.activeState === 'verified'), 'Expected readinessUpdated broadcast.');

    // 4. discoverOllamaModels
    const ollamaDisc = await invokeMessage(messageListener, { action: 'discoverOllamaModels' });
    assert(ollamaDisc?.success === true && ollamaDisc.models?.includes('qwen3:8b'), 'Expected discoverOllamaModels to return local models.');

    // 5. Removing key invalidates readiness back to not_configured
    await vmCtx.ZeusSettingsStore.update({ apiKeys: { gemini: '' } });
    await new Promise((r) => setTimeout(r, 25));
    const clearedReadiness = await invokeMessage(messageListener, { action: 'getProviderReadiness' });
    assert(clearedReadiness?.readiness?.activeState === 'not_configured', 'Expected cleared key to revert readiness to not_configured.');
  } finally {
    globalThis.chrome = savedChrome;
    globalThis.fetch = savedFetch;
    globalThis.ZeusRouter = savedRouter;
    globalThis.ZeusErrors = savedErrors;
    globalThis.ZeusTelemetry = savedTelemetry;
    globalThis.ZeusOllamaMeta = savedOllamaMeta;
  }
}

(async () => {
  await runSettingsMigrationSmoke();
  await runMessageActionSmoke();
  await runDiagnosticsAndLiveSyncSmoke();
  console.log('Smoke tests passed: settings migration, diagnostics, live sync, and message actions.');
})();
