/**
 * @vitest-environment node
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

function flushAsync(ms = 40) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function copy(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function pickStoreValues(store, keys) {
  if (!keys) return copy(store);
  if (Array.isArray(keys)) {
    const out = {};
    for (const key of keys) {
      out[key] = store[key] !== undefined ? copy(store[key]) : undefined;
    }
    return out;
  }
  if (typeof keys === 'string') {
    return { [keys]: store[keys] !== undefined ? copy(store[keys]) : undefined };
  }
  if (typeof keys === 'object') {
    const out = {};
    for (const key of Object.keys(keys)) {
      out[key] = store[key] !== undefined ? copy(store[key]) : copy(keys[key]);
    }
    return out;
  }
  return copy(store);
}

function createSharedExtensionBus(initialSync = {}, initialLocal = {}) {
  const syncStore = copy(initialSync);
  const localStore = copy(initialLocal);
  const storageListeners = [];
  const contexts = new Map();
  const calls = {
    runtimeSendMessage: [],
    tabsSendMessage: [],
    openOptionsPage: 0,
    tabsCreate: [],
    sidePanelSetPanelBehavior: []
  };

  let fetchHandler = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => ({ ok: true })
  });

  function emitStorageChanges(changes, areaName) {
    if (!Object.keys(changes).length) return;
    for (const fn of storageListeners.slice()) {
      try {
        fn(copy(changes), areaName);
      } catch (_) {}
    }
  }

  function makeStorageArea(store, areaName, runtimeObj) {
    return {
      get(keys, callback) {
        const result = pickStoreValues(store, keys);
        if (typeof callback === 'function') {
          callback(result);
          return;
        }
        return Promise.resolve(result);
      },
      set(payload, callback) {
        if (areaName === 'local' && bus.failNextLocalSet) {
          const errMsg = typeof bus.failNextLocalSet === 'string'
            ? bus.failNextLocalSet
            : 'Simulated local storage write error';
          bus.failNextLocalSet = false;
          runtimeObj.lastError = new Error(errMsg);
          if (typeof callback === 'function') {
            callback();
            return;
          }
          return Promise.reject(runtimeObj.lastError);
        }

        const changes = {};
        if (payload && typeof payload === 'object') {
          for (const [key, value] of Object.entries(payload)) {
            changes[key] = { oldValue: copy(store[key]), newValue: copy(value) };
          }
        }
        Object.assign(store, copy(payload || {}));
        emitStorageChanges(changes, areaName);
        if (typeof callback === 'function') {
          callback();
          return;
        }
        return Promise.resolve();
      },
      remove(keys, callback) {
        const list = Array.isArray(keys) ? keys : [keys];
        const changes = {};
        for (const key of list) {
          if (key in store) {
            changes[key] = { oldValue: copy(store[key]), newValue: undefined };
            delete store[key];
          }
        }
        emitStorageChanges(changes, areaName);
        if (typeof callback === 'function') {
          callback();
          return;
        }
        return Promise.resolve();
      }
    };
  }

  function makeChrome(contextName) {
    const onMessageListeners = [];
    contexts.set(contextName, onMessageListeners);

    const runtimeObj = {
      id: 'zeus-cross-ui-ext',
      lastError: null,
      getManifest: () => JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'manifest.json'), 'utf8')),
      getURL: (p) => `chrome-extension://zeus-cross-ui-ext/${p}`,
      openOptionsPage: (cb) => {
        calls.openOptionsPage += 1;
        if (typeof cb === 'function') cb();
      },
      onInstalled: { addListener: () => {} },
      onStartup: { addListener: () => {} },
      onConnect: { addListener: () => {} },
      connect: () => ({
        onMessage: { addListener: () => {} },
        onDisconnect: { addListener: () => {} },
        postMessage: () => {},
        disconnect: () => {}
      }),
      onMessage: {
        addListener(fn) {
          onMessageListeners.push(fn);
        },
        removeListener(fn) {
          const idx = onMessageListeners.indexOf(fn);
          if (idx >= 0) onMessageListeners.splice(idx, 1);
        }
      },
      sendMessage(message, callback) {
        calls.runtimeSendMessage.push({ from: contextName, message: copy(message) });
        const sender = contextName === 'background'
          ? { id: 'zeus-cross-ui-ext' }
          : { id: 'zeus-cross-ui-ext', url: `chrome-extension://zeus-cross-ui-ext/${contextName}.html` };

        let settled = false;
        let resolvePromise;
        const promise = new Promise((resolve) => {
          resolvePromise = resolve;
        });

        const sendResponse = (payload) => {
          if (settled) return;
          settled = true;
          const cloned = copy(payload);
          if (typeof callback === 'function') callback(cloned);
          resolvePromise(cloned);
        };

        let asyncExpected = false;
        for (const [targetName, listeners] of contexts.entries()) {
          if (targetName === contextName) continue;
          for (const listener of listeners.slice()) {
            try {
              const handled = listener(copy(message), sender, sendResponse);
              if (handled === true) {
                asyncExpected = true;
              }
            } catch (_) {}
          }
        }

        if (!asyncExpected && !settled) {
          settled = true;
          if (typeof callback === 'function') callback(undefined);
          resolvePromise(undefined);
        }

        return promise;
      }
    };

    return {
      runtime: runtimeObj,
      storage: {
        sync: makeStorageArea(syncStore, 'sync', runtimeObj),
        local: makeStorageArea(localStore, 'local', runtimeObj),
        onChanged: {
          addListener(fn) {
            storageListeners.push(fn);
          },
          removeListener(fn) {
            const idx = storageListeners.indexOf(fn);
            if (idx >= 0) storageListeners.splice(idx, 1);
          }
        }
      },
      contextMenus: {
        removeAll: (cb) => { if (cb) cb(); },
        create: (_cfg, cb) => { if (cb) cb(); },
        onClicked: { addListener: () => {} }
      },
      tabs: {
        query: (_q, cb) => cb([{ id: 777, windowId: 1 }]),
        sendMessage: (tabId, msg) => {
          calls.tabsSendMessage.push({ tabId, message: copy(msg) });
          return Promise.resolve({ ok: true });
        },
        create: (opts) => {
          calls.tabsCreate.push(opts);
          return Promise.resolve({ id: 902 });
        }
      },
      sidePanel: {
        open: () => Promise.resolve(),
        close: () => Promise.resolve(),
        setPanelBehavior: (opts) => {
          calls.sidePanelSetPanelBehavior.push(opts);
          return Promise.resolve();
        }
      },
      commands: { onCommand: { addListener: () => {} } },
      windows: { getLastFocused: (cb) => cb({ id: 1 }) },
      scripting: { executeScript: () => Promise.resolve([{ result: true }]) }
    };
  }

  const bus = {
    syncStore,
    localStore,
    calls,
    failNextLocalSet: false,
    makeChrome,
    setFetchHandler(fn) {
      fetchHandler = fn;
    },
    fetch: (...args) => fetchHandler(...args)
  };
  return bus;
}

function bootBackgroundWorker(bus) {
  const bgGlobals = {
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
    chrome: bus.makeChrome('background'),
    fetch: (...args) => bus.fetch(...args),
    LOG_PREFIX: { info: '[ZEUS]', warn: '[ZEUS]', error: '[ZEUS]', success: '[ZEUS]' },
    LOG_STYLE: { info: '', warn: '', error: '', success: '' }
  };
  bgGlobals.globalThis = bgGlobals;
  const ctx = vm.createContext(bgGlobals);

  const bgScripts = [
    'model-registry.js',
    'settings/settingsStore.js',
    'settings/settings.js',
    'core/retry.js',
    'core/prompts.js',
    'core/errors.js',
    'core/telemetry.js',
    'core/providerTransport.js',
    'providers/utils.js',
    'providers/gemini.js',
    'providers/openai.js',
    'providers/claude.js',
    'providers/openrouter.js',
    'providers/ollama.js',
    'core/redactor.js',
    'core/router.js',
    'core/promptEngine.js',
    'core/providerDiagnostics.js',
    'messaging/messageHandler.js'
  ];

  for (const rel of bgScripts) {
    const full = path.resolve(process.cwd(), rel);
    const code = fs.readFileSync(full, 'utf8');
    vm.runInContext(code, ctx, { filename: full });
  }

  return ctx;
}

async function bootPageInJsdom(pageName, htmlFile, scripts, bus, confirmImpl = () => true) {
  const htmlPath = path.resolve(process.cwd(), htmlFile);
  const rawHtml = fs.readFileSync(htmlPath, 'utf8');
  const dom = new JSDOM(rawHtml, {
    url: `chrome-extension://zeus-cross-ui-ext/${htmlFile}`,
    runScripts: 'outside-only'
  });

  const win = dom.window;
  win.chrome = bus.makeChrome(pageName);
  win.confirm = confirmImpl;
  win.close = () => {};
  win.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} });
  Object.defineProperty(win.navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async () => {} }
  });

  const vmCtx = dom.getInternalVMContext();
  for (const rel of scripts) {
    const full = path.resolve(process.cwd(), rel);
    const code = fs.readFileSync(full, 'utf8');
    vm.runInContext(code, vmCtx, { filename: full });
  }

  win.document.dispatchEvent(new win.Event('DOMContentLoaded'));
  await flushAsync(40);
  return dom;
}

describe('Cross-UI Live Sync & Popup/Options API Key Security Lifecycle', () => {
  let openDoms = [];

  afterEach(() => {
    for (const dom of openDoms) {
      try {
        dom.window.close();
      } catch (_) {}
    }
    openDoms = [];
  });

  describe('1. Popup & Options Write-Only API Key Security, Sibling Preservation & Error Handling', () => {
    it('enforces write-only key lifecycle, confirm/cancel removal, blank input safety, sibling preservation, and write-error protection in Popup & Options', async () => {
      const bus = createSharedExtensionBus(
        {
          schemaVersion: 3,
          provider: 'gemini',
          models: {
            gemini: 'gemini-flash-latest',
            openai: 'gpt-5.4-mini',
            claude: 'claude-sonnet-4.6',
            openrouter: 'openai/gpt-5.4'
          },
          ollama: { host: 'http://localhost:11434', model: '' }
        },
        {
          apiKeys: {
            gemini: '',
            openai: 'sk-existing-openai-secret-1234',
            claude: 'sk-existing-claude-secret-5678',
            openrouter: ''
          }
        }
      );
      bootBackgroundWorker(bus);

      let confirmResult = false;
      const popupDom = await bootPageInJsdom(
        'popup',
        'popup.html',
        ['model-registry.js', 'settings/settingsStore.js', 'settings/settings.js', 'popup.js'],
        bus,
        () => confirmResult
      );
      openDoms.push(popupDom);

      const pDoc = popupDom.window.document;
      const gemInput = pDoc.getElementById('geminiApiKey');
      const oaInput = pDoc.getElementById('openaiApiKey');
      const gemBadge = pDoc.getElementById('geminiKeyStatus');
      const oaBadge = pDoc.getElementById('openaiKeyStatus');

      // Zero raw keys populated into DOM password inputs on load
      expect(gemInput.value).toBe('');
      expect(oaInput.value).toBe('');
      expect(gemBadge.textContent).toBe('Not configured');
      expect(oaBadge.textContent).toBe('API key configured');

      // Untouched blank password inputs on saveBtn click NEVER erase existing OpenAI/Claude keys
      pDoc.getElementById('aiProvider').value = 'openai';
      pDoc.getElementById('aiProvider').dispatchEvent(new popupDom.window.Event('change'));
      pDoc.getElementById('saveBtn').click();
      await flushAsync(40);
      expect(bus.localStore.apiKeys.openai).toBe('sk-existing-openai-secret-1234');
      expect(bus.localStore.apiKeys.claude).toBe('sk-existing-claude-secret-5678');
      expect(bus.syncStore.apiKeys).toBeUndefined();

      // First-time save for Gemini key
      const firstGemKey = 'AIzaSyPopupFirstKey1234567890';
      pDoc.getElementById('aiProvider').value = 'gemini';
      pDoc.getElementById('aiProvider').dispatchEvent(new popupDom.window.Event('change'));
      gemInput.value = firstGemKey;
      pDoc.getElementById('saveGeminiKeyBtn').click();
      await flushAsync(40);

      expect(bus.localStore.apiKeys.gemini).toBe(firstGemKey);
      expect(bus.localStore.apiKeys.openai).toBe('sk-existing-openai-secret-1234');
      expect(gemInput.value).toBe('');
      expect(gemBadge.textContent).toBe('API key configured');
      expect(pDoc.getElementById('status').textContent).toBe('Saved');

      // Storage write failure prevents false "Saved" status and preserves typed draft
      bus.failNextLocalSet = 'Simulated disk error';
      gemInput.value = 'AIzaSyShouldFailWrite12345678';
      pDoc.getElementById('saveGeminiKeyBtn').click();
      await flushAsync(40);
      expect(pDoc.getElementById('status').textContent).not.toBe('Saved');
      expect(pDoc.getElementById('status').textContent).toContain('Failed to save Gemini key');
      expect(bus.localStore.apiKeys.gemini).toBe(firstGemKey);

      // Cancelled Remove Key (confirm() returns false) keeps saved key
      confirmResult = false;
      pDoc.getElementById('removeGeminiKeyBtn').click();
      await flushAsync(30);
      expect(bus.localStore.apiKeys.gemini).toBe(firstGemKey);

      // Confirmed Remove Key (confirm() returns true) clears only Gemini key
      confirmResult = true;
      pDoc.getElementById('removeGeminiKeyBtn').click();
      await flushAsync(40);
      expect(bus.localStore.apiKeys.gemini).toBe('');
      expect(bus.localStore.apiKeys.openai).toBe('sk-existing-openai-secret-1234');
      expect(gemBadge.textContent).toBe('Not configured');

      // Popup Open Advanced Settings button calls openOptionsPage and falls back when unavailable
      pDoc.getElementById('openOptionsBtn').click();
      expect(bus.calls.openOptionsPage).toBe(1);
      delete popupDom.window.chrome.runtime.openOptionsPage;
      pDoc.getElementById('openOptionsBtn').click();
      expect(bus.calls.tabsCreate).toEqual([{ url: 'chrome-extension://zeus-cross-ui-ext/options.html' }]);

      // Options page: verify write-only masking, replace, cancel/confirm removal, and write error protection
      const optionsDom = await bootPageInJsdom(
        'options',
        'options.html',
        ['model-registry.js', 'settings/settingsStore.js', 'settings/settings.js', 'options.js'],
        bus,
        () => confirmResult
      );
      openDoms.push(optionsDom);
      const oDoc = optionsDom.window.document;
      expect(oDoc.getElementById('openaiApiKey').value).toBe('');
      expect(oDoc.getElementById('openaiKeyStatus').textContent).toBe('API key configured');

      const replacedOpenAI = 'sk-replaced-openai-from-options';
      oDoc.getElementById('openaiApiKey').value = replacedOpenAI;
      oDoc.getElementById('saveOpenAIKeyBtn').click();
      await flushAsync(40);
      expect(bus.localStore.apiKeys.openai).toBe(replacedOpenAI);
      expect(oDoc.getElementById('openaiApiKey').value).toBe('');

      // Storage write failure in Options prevents false "Saved" status and preserves existing key
      bus.failNextLocalSet = 'Options write failed';
      oDoc.getElementById('openaiApiKey').value = 'sk-should-not-overwrite-options';
      oDoc.getElementById('saveOpenAIKeyBtn').click();
      await flushAsync(40);
      expect(oDoc.getElementById('status').textContent).not.toBe('Saved');
      expect(oDoc.getElementById('status').textContent).toContain('Failed to save OpenAI key');
      expect(bus.localStore.apiKeys.openai).toBe(replacedOpenAI);

      confirmResult = false;
      oDoc.getElementById('removeOpenAIKeyBtn').click();
      await flushAsync(30);
      expect(bus.localStore.apiKeys.openai).toBe(replacedOpenAI);

      confirmResult = true;
      oDoc.getElementById('removeOpenAIKeyBtn').click();
      await flushAsync(40);
      expect(bus.localStore.apiKeys.openai).toBe('');
      expect(bus.localStore.apiKeys.claude).toBe('sk-existing-claude-secret-5678');

      // Zero raw keys leaked to syncStore or runtime/tab broadcasts
      const syncJson = JSON.stringify(bus.syncStore);
      const ipcJson = JSON.stringify(bus.calls.runtimeSendMessage) + JSON.stringify(bus.calls.tabsSendMessage);
      for (const secret of [firstGemKey, 'sk-existing-openai-secret-1234', replacedOpenAI, 'sk-existing-claude-secret-5678']) {
        expect(syncJson).not.toContain(secret);
        expect(ipcJson).not.toContain(secret);
      }
    });
  });

  describe('2. Multi-Window Live Sync Across Side Panel, Popup & Options', () => {
    it('syncs Side Panel -> Popup & Options live, Options -> Side Panel live, readinessUpdated across all 3 views, and preserves dirty drafts', async () => {
      const bus = createSharedExtensionBus(
        {
          schemaVersion: 3,
          provider: 'gemini',
          sidePanelEnabled: true,
          copilotEnabled: false,
          copilotProvider: 'auto',
          copilotMode: 'conservative',
          copilotMaxTokens: 60,
          redactionEnabled: true,
          models: {
            gemini: 'gemini-flash-latest',
            openai: 'gpt-5.4-mini',
            claude: 'claude-sonnet-4.6',
            openrouter: 'openai/gpt-5.4'
          },
          ollama: { host: 'http://localhost:11434', model: '' }
        },
        {
          apiKeys: {
            gemini: '',
            openai: '',
            claude: '',
            openrouter: ''
          }
        }
      );

      bus.setFetchHandler(async (url) => {
        if (String(url).includes('api.openai.com/v1/models')) {
          return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ id: 'gpt-5.4' }) };
        }
        return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ ok: true }) };
      });

      bootBackgroundWorker(bus);

      const sidepanelDom = await bootPageInJsdom(
        'sidepanel',
        'sidepanel.html',
        [
          'core/redactor.js',
          'core/safeDom.js',
          'core/providerTransport.js',
          'model-registry.js',
          'settings/settingsStore.js',
          'settings/settings.js',
          'core/promptClient.js',
          'sidepanel.js'
        ],
        bus
      );
      const popupDom = await bootPageInJsdom(
        'popup',
        'popup.html',
        ['model-registry.js', 'settings/settingsStore.js', 'settings/settings.js', 'popup.js'],
        bus
      );
      const optionsDom = await bootPageInJsdom(
        'options',
        'options.html',
        ['model-registry.js', 'settings/settingsStore.js', 'settings/settings.js', 'options.js'],
        bus
      );
      openDoms.push(sidepanelDom, popupDom, optionsDom);

      const spDoc = sidepanelDom.window.document;
      const pDoc = popupDom.window.document;
      const oDoc = optionsDom.window.document;

      // Initial state across all 3 interfaces
      expect(spDoc.getElementById('setup-required-card').style.display).toBe('block');
      expect(pDoc.getElementById('popupStatusText').textContent).toBe('Not configured');
      expect(oDoc.getElementById('optionsHeaderReadiness').textContent).toBe('Not configured');

      // 1. User types unsaved prompt in Side Panel editor AND opens Settings to save OpenAI provider/model/key
      spDoc.getElementById('original-input').value = 'Keep this unsaved prompt intact';
      spDoc.getElementById('btn-open-settings').click();

      spDoc.getElementById('sp-provider').value = 'openai';
      spDoc.getElementById('sp-provider').dispatchEvent(new sidepanelDom.window.Event('change'));
      await flushAsync(50);

      spDoc.getElementById('sp-model').value = 'gpt-5.4';
      spDoc.getElementById('sp-model').dispatchEvent(new sidepanelDom.window.Event('change'));
      await flushAsync(50);

      spDoc.getElementById('sp-api-key').value = 'sk-sidepanel-live-sync-key-1234';
      spDoc.getElementById('sp-btn-save-key').click();
      await flushAsync(60);

      // Verify Popup & Options updated LIVE without any raw key leak
      expect(pDoc.getElementById('aiProvider').value).toBe('openai');
      expect(pDoc.getElementById('providerModel').value).toBe('gpt-5.4');
      expect(pDoc.getElementById('openaiKeyStatus').textContent).toBe('API key configured');
      expect(pDoc.getElementById('openaiApiKey').value).toBe('');
      expect(pDoc.getElementById('popupStatusText').textContent).toBe('Configured, not tested');

      expect(oDoc.getElementById('aiProvider').value).toBe('openai');
      expect(oDoc.getElementById('providerModel').value).toBe('gpt-5.4');
      expect(oDoc.getElementById('openaiKeyStatus').textContent).toBe('API key configured');
      expect(oDoc.getElementById('openaiApiKey').value).toBe('');
      expect(oDoc.getElementById('optionsHeaderReadiness').textContent).toBe('Configured, not tested');
      expect(spDoc.getElementById('setup-required-card').style.display).toBe('none');

      // Verify settingsUpdated was broadcast (both UI -> background and background -> UIs) without apiKeys
      const settingsMsgs = bus.calls.runtimeSendMessage.filter((c) => c.message?.action === 'settingsUpdated');
      expect(settingsMsgs.length).toBeGreaterThan(0);
      expect(settingsMsgs.every((c) => c.message?.settings?.apiKeys === undefined)).toBe(true);

      // 2. Test Connection in Side Panel -> emits readinessUpdated -> Popup & Options become "Connection verified"
      spDoc.getElementById('sp-btn-test').click();
      await flushAsync(60);
      expect(spDoc.getElementById('sp-readiness-label').textContent).toBe('Connection verified');
      expect(pDoc.getElementById('popupStatusText').textContent).toBe('Connection verified');
      expect(oDoc.getElementById('optionsHeaderReadiness').textContent).toBe('Connection verified');
      expect(bus.calls.runtimeSendMessage.some((c) => c.message?.action === 'readinessUpdated')).toBe(true);

      // 3. Edit settings in Options while Side Panel has dirty #sp-api-key draft + unsaved #original-input
      spDoc.getElementById('sp-api-key').value = 'sk-unsaved-draft-in-sidepanel';
      spDoc.getElementById('sp-api-key').dispatchEvent(new sidepanelDom.window.Event('input'));

      oDoc.getElementById('aiProvider').value = 'claude';
      oDoc.getElementById('aiProvider').dispatchEvent(new optionsDom.window.Event('change'));
      oDoc.getElementById('copilotEnabled').checked = true;
      oDoc.getElementById('copilotEnabled').dispatchEvent(new optionsDom.window.Event('change'));
      oDoc.getElementById('claudeApiKey').value = 'sk-ant-options-live-key-5678';
      oDoc.getElementById('saveBtn').click();
      await flushAsync(60);

      // Side Panel reflects Options changes live while preserving unsaved prompt & dirty key draft (keeping keyTargetProvider pinned to OpenAI while draft is non-empty!)
      expect(spDoc.getElementById('sp-provider').value).toBe('claude');
      expect(spDoc.getElementById('sp-copilot-enabled').checked).toBe(true);
      expect(spDoc.getElementById('sp-key-title').textContent).toContain('OPENAI API KEY');
      expect(spDoc.getElementById('sp-key-status').textContent).toBe('API key configured');
      expect(spDoc.getElementById('strip-provider').textContent).toBe('Claude');
      expect(spDoc.getElementById('setup-required-card').style.display).toBe('none');
      expect(spDoc.getElementById('original-input').value).toBe('Keep this unsaved prompt intact');
      expect(spDoc.getElementById('sp-api-key').value).toBe('sk-unsaved-draft-in-sidepanel');

      // 4. Dirty inputs in Popup & Options are NOT overwritten when Side Panel saves externally; #syncNotice appears
      pDoc.getElementById('ollamaHost').value = 'http://127.0.0.1:22434';
      pDoc.getElementById('ollamaHost').dispatchEvent(new popupDom.window.Event('input'));
      oDoc.getElementById('copilotMaxTokens').value = '180';
      oDoc.getElementById('copilotMaxTokens').dispatchEvent(new optionsDom.window.Event('input'));

      spDoc.getElementById('sp-redaction-enabled').checked = false;
      spDoc.getElementById('sp-redaction-enabled').dispatchEvent(new sidepanelDom.window.Event('change'));
      await flushAsync(60);

      expect(pDoc.getElementById('ollamaHost').value).toBe('http://127.0.0.1:22434');
      expect(pDoc.getElementById('syncNotice').hidden).toBe(false);
      expect(oDoc.getElementById('copilotMaxTokens').value).toBe('180');
      expect(oDoc.getElementById('syncNotice').hidden).toBe(false);

      // Clicking Reload All in Options reloads external values and clears notice
      oDoc.getElementById('syncReloadBtn').click();
      await flushAsync(50);
      expect(oDoc.getElementById('syncNotice').hidden).toBe(true);
      expect(oDoc.getElementById('copilotMaxTokens').value).toBe('60');

      // 5. Clear the Side Panel key draft so keyTargetProvider retargets to Claude, then remove Claude key in Options -> restores #setup-required-card live in Side Panel
      // (while preserving dirty #sp-ollama-model and #sp-copilot-max-tokens drafts in Side Panel)
      spDoc.getElementById('sp-api-key').value = '';
      spDoc.getElementById('sp-api-key').dispatchEvent(new sidepanelDom.window.Event('input'));
      spDoc.getElementById('sp-ollama-model').value = 'dirty-local-model';
      spDoc.getElementById('sp-ollama-model').dispatchEvent(new sidepanelDom.window.Event('input'));
      spDoc.getElementById('sp-copilot-max-tokens').value = '145';
      spDoc.getElementById('sp-copilot-max-tokens').dispatchEvent(new sidepanelDom.window.Event('input'));

      oDoc.getElementById('removeClaudeKeyBtn').click();
      await flushAsync(60);
      expect(spDoc.getElementById('sp-key-title').textContent).toContain('CLAUDE API KEY');
      expect(spDoc.getElementById('sp-key-status').textContent).toBe('Not configured');
      expect(spDoc.getElementById('setup-required-card').style.display).toBe('block');
      expect(spDoc.getElementById('sp-ollama-model').value).toBe('dirty-local-model');
      expect(spDoc.getElementById('sp-copilot-max-tokens').value).toBe('145');

      // Verify zero raw keys anywhere in syncStore or IPC broadcasts
      const allBroadcastJson = JSON.stringify(bus.syncStore) + JSON.stringify(bus.calls.runtimeSendMessage) + JSON.stringify(bus.calls.tabsSendMessage);
      expect(allBroadcastJson).not.toContain('sk-sidepanel-live-sync-key-1234');
      expect(allBroadcastJson).not.toContain('sk-ant-options-live-key-5678');

      // 6. Options health indicators & readiness pills reflect provider testConnection errors/verified states
      bus.setFetchHandler(async (url) => {
        if (String(url).includes('api.openai.com')) {
          return { ok: false, status: 401, headers: { get: () => 'application/json' }, json: async () => ({ error: { message: 'Bad key' } }) };
        }
        return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ ok: true }) };
      });
      oDoc.getElementById('testOpenAIBtn').click();
      await flushAsync(60);
      expect(oDoc.getElementById('readiness-openai').textContent).toBe('Authentication failed');
      expect(oDoc.getElementById('health-openai').className).toContain('offline');
      expect(pDoc.getElementById('readiness-openai').textContent).toBe('Authentication failed');

      // 7. Testing an unsaved model override in Popup preserves fresh result instead of being clobbered by saved readiness
      bus.setFetchHandler(async (url) => {
        if (String(url).includes('api.openai.com/v1/models/gpt-5.4-nano')) {
          return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ id: 'gpt-5.4-nano' }) };
        }
        return { ok: false, status: 404, headers: { get: () => 'application/json' }, json: async () => ({}) };
      });
      pDoc.getElementById('aiProvider').value = 'openai';
      pDoc.getElementById('aiProvider').dispatchEvent(new popupDom.window.Event('change'));
      pDoc.getElementById('providerModel').value = 'gpt-5.4-nano';
      pDoc.getElementById('providerModel').dispatchEvent(new popupDom.window.Event('change'));
      pDoc.getElementById('testActiveConnectionBtn').click();
      await flushAsync(60);
      expect(pDoc.getElementById('activeReadinessPill').textContent).toBe('Connection verified');
      expect(pDoc.getElementById('popupStatusText').textContent).toBe('Connection verified');

      // 8. Enter key on Popup API key input saves key cleanly
      const enterKeyVal = 'sk-ant-saved-via-enter-key';
      pDoc.getElementById('aiProvider').value = 'claude';
      pDoc.getElementById('aiProvider').dispatchEvent(new popupDom.window.Event('change'));
      pDoc.getElementById('claudeApiKey').value = enterKeyVal;
      pDoc.getElementById('claudeApiKey').dispatchEvent(new popupDom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await flushAsync(60);
      expect(bus.localStore.apiKeys.claude).toBe(enterKeyVal);
      expect(pDoc.getElementById('claudeApiKey').value).toBe('');

      // Copilot preferences saved in Options sync live to Side Panel
      oDoc.getElementById('copilotProvider').value = 'gemini';
      oDoc.getElementById('copilotProvider').dispatchEvent(new optionsDom.window.Event('change'));
      oDoc.getElementById('copilotMode').value = 'aggressive';
      oDoc.getElementById('copilotMode').dispatchEvent(new optionsDom.window.Event('change'));
      oDoc.getElementById('copilotMaxTokens').value = '999';
      oDoc.getElementById('copilotMaxTokens').dispatchEvent(new optionsDom.window.Event('input'));
      oDoc.getElementById('saveBtn').click();
      await flushAsync(60);

      expect(bus.syncStore.copilotMaxTokens).toBe(250);
      expect(spDoc.getElementById('sp-copilot-provider').value).toBe('gemini');
      expect(spDoc.getElementById('sp-copilot-mode').value).toBe('aggressive');
      expect(spDoc.getElementById('sp-copilot-max-tokens').value).toBe('145'); // Dirty draft still preserved!
    });
  });
});
