import path from 'node:path';
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
    onContextMenuClicked: []
  };

  const calls = {
    contextMenuCreate: [],
    tabsQuery: [],
    tabsSendMessage: [],
    executeScript: []
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
      create(config) {
        calls.contextMenuCreate.push(config);
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
        callback([{ id: 777 }]);
      },
      sendMessage(tabId, message) {
        calls.tabsSendMessage.push({ tabId, message });
        return Promise.resolve({ ok: true });
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

  assert(env.listeners.onInstalled.length === 1, 'Expected onInstalled listener registration.');
  env.listeners.onInstalled[0]();
  assert(env.calls.contextMenuCreate.length === 1, 'Expected context menu to be created on install.');

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
    settings: { provider: 'openai' }
  });
  assert(updateAck?.success === true, 'Expected settingsUpdated acknowledgment.');
  assert(
    env.calls.tabsSendMessage.some((entry) => entry?.message?.action === 'settingsUpdated' && entry?.message?.settings?.apiKeys === undefined),
    'Expected settingsUpdated to notify active tab with sanitized settings.'
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

(async () => {
  await runSettingsMigrationSmoke();
  await runMessageActionSmoke();
  console.log('Smoke tests passed: settings migration and message actions.');
})();
