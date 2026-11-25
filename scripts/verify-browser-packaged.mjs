import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import WebSocket from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const extPath = path.join(projectRoot, 'dist', 'extension');

// Candidate Chrome executable paths on Windows
const CHROME_PATHS = [
  process.env.ZEUS_CHROME || '',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe')
].filter(Boolean);

const VIEWPORTS = [
  { name: 'narrow', width: 360, height: 760 },
  { name: 'desktop', width: 1280, height: 800 }
];

const EXPECTED_GOOGLE_FONTS = ['Inter', 'JetBrains Mono', 'Orbitron', 'Rajdhani'];

function findChromeExecutable() {
  for (const p of CHROME_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function sendCDPCommand(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1000000) + 1;
    const handler = (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.id === id) {
          ws.off('message', handler);
          if (msg.error) {
            reject(new Error(msg.error.message || JSON.stringify(msg.error)));
          } else {
            resolve(msg.result);
          }
        }
      } catch (_) {}
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

function buildSyntheticChromeScript(manifest) {
  return `
    (() => {
      window.__ZEUS_CSP_VIOLATIONS__ = [];
      window.__ZEUS_WINDOW_ERRORS__ = [];
      window.__ZEUS_OPEN_OPTIONS_CALLS__ = 0;

      window.addEventListener('securitypolicyviolation', (e) => {
        window.__ZEUS_CSP_VIOLATIONS__.push({
          blockedURI: e.blockedURI,
          violatedDirective: e.violatedDirective,
          effectiveDirective: e.effectiveDirective
        });
      });

      window.addEventListener('error', (e) => {
        window.__ZEUS_WINDOW_ERRORS__.push({
          type: 'error',
          message: String(e.message || 'Unknown window error'),
          filename: e.filename || ''
        });
      });

      window.addEventListener('unhandledrejection', (e) => {
        window.__ZEUS_WINDOW_ERRORS__.push({
          type: 'unhandledrejection',
          message: String(e.reason?.message || e.reason || 'Unhandled rejection')
        });
      });

      const DEFAULT_SYNC = {
        schemaVersion: 3,
        provider: 'gemini',
        sidePanelEnabled: true,
        copilotEnabled: false,
        copilotMode: 'conservative',
        copilotProvider: 'auto',
        copilotMaxTokens: 60,
        redactionEnabled: true,
        customRedactionPatterns: [],
        models: {
          gemini: 'gemini-flash-latest',
          openai: 'gpt-5.4-mini',
          claude: 'claude-sonnet-4.6',
          openrouter: 'openai/gpt-5.4'
        },
        ollama: {
          host: 'http://localhost:11434',
          model: ''
        },
        zeus_templates: []
      };

      const DEFAULT_LOCAL = {
        apiKeys: {
          gemini: '',
          openai: '',
          claude: '',
          openrouter: ''
        },
        zeus_prompt_history: []
      };

      const clone = (val) => (val === undefined ? undefined : JSON.parse(JSON.stringify(val)));
      let syncStore = clone(DEFAULT_SYNC);
      let localStore = clone(DEFAULT_LOCAL);
      const testedProviders = new Map();

      const storageListeners = new Set();
      const runtimeMessageListeners = new Set();

      function emitStorageChange(changes, areaName) {
        if (!changes || Object.keys(changes).length === 0) return;
        const snapshot = clone(changes);
        setTimeout(() => {
          for (const listener of Array.from(storageListeners)) {
            try {
              listener(snapshot, areaName);
            } catch (_) {}
          }
        }, 0);
      }

      function emitRuntimeMessage(payload) {
        const snapshot = clone(payload);
        setTimeout(() => {
          for (const listener of Array.from(runtimeMessageListeners)) {
            try {
              listener(snapshot, { id: 'zeus-synthetic-verified-id' }, () => {});
            } catch (_) {}
          }
        }, 0);
      }

      function createStorageArea(areaName, getStore, setStore) {
        return {
          get: (keys, cb) => {
            const store = getStore();
            let result = {};
            if (keys === null || keys === undefined) {
              result = clone(store);
            } else if (typeof keys === 'string') {
              if (keys in store) result[keys] = clone(store[keys]);
            } else if (Array.isArray(keys)) {
              for (const k of keys) {
                if (k in store) result[k] = clone(store[k]);
              }
            } else if (typeof keys === 'object') {
              for (const [k, fallback] of Object.entries(keys)) {
                result[k] = k in store ? clone(store[k]) : clone(fallback);
              }
            }
            if (typeof cb === 'function') setTimeout(() => cb(result), 0);
            return Promise.resolve(result);
          },
          set: (items, cb) => {
            const store = getStore();
            const changes = {};
            for (const [k, nextVal] of Object.entries(items || {})) {
              const oldVal = store[k];
              const clonedNext = clone(nextVal);
              if (JSON.stringify(oldVal) !== JSON.stringify(clonedNext)) {
                changes[k] = { oldValue: clone(oldVal), newValue: clone(clonedNext) };
              }
              store[k] = clonedNext;
            }
            setStore(store);
            if (areaName === 'local' && changes.apiKeys) {
              for (const p of ['gemini', 'openai', 'claude', 'openrouter']) {
                testedProviders.delete(p);
              }
            }
            if (areaName === 'sync' && (changes.models || changes.ollama)) {
              for (const p of ['gemini', 'openai', 'claude', 'openrouter', 'ollama']) {
                testedProviders.delete(p);
              }
            }
            emitStorageChange(changes, areaName);
            if (typeof cb === 'function') setTimeout(() => cb(), 0);
            return Promise.resolve();
          },
          remove: (keys, cb) => {
            const store = getStore();
            const keyList = Array.isArray(keys) ? keys : [keys];
            const changes = {};
            for (const k of keyList) {
              if (k in store) {
                changes[k] = { oldValue: clone(store[k]), newValue: undefined };
                delete store[k];
              }
            }
            setStore(store);
            emitStorageChange(changes, areaName);
            if (typeof cb === 'function') setTimeout(() => cb(), 0);
            return Promise.resolve();
          },
          clear: (cb) => {
            const store = getStore();
            const changes = {};
            for (const k of Object.keys(store)) {
              changes[k] = { oldValue: clone(store[k]), newValue: undefined };
            }
            setStore({});
            emitStorageChange(changes, areaName);
            if (typeof cb === 'function') setTimeout(() => cb(), 0);
            return Promise.resolve();
          }
        };
      }

      function buildPublicSettings() {
        const apiKeys = localStore.apiKeys || {};
        return {
          schemaVersion: 3,
          provider: syncStore.provider || 'gemini',
          sidePanelEnabled: syncStore.sidePanelEnabled !== false,
          copilotEnabled: Boolean(syncStore.copilotEnabled),
          copilotMode: syncStore.copilotMode || 'conservative',
          copilotProvider: syncStore.copilotProvider || 'auto',
          copilotMaxTokens: Number(syncStore.copilotMaxTokens) || 60,
          redactionEnabled: syncStore.redactionEnabled !== false,
          customRedactionPatterns: Array.isArray(syncStore.customRedactionPatterns)
            ? clone(syncStore.customRedactionPatterns)
            : [],
          models: clone(syncStore.models || DEFAULT_SYNC.models),
          ollama: clone(syncStore.ollama || DEFAULT_SYNC.ollama),
          hasApiKey: {
            gemini: Boolean(String(apiKeys.gemini || '').trim()),
            openai: Boolean(String(apiKeys.openai || '').trim()),
            claude: Boolean(String(apiKeys.claude || '').trim()),
            openrouter: Boolean(String(apiKeys.openrouter || '').trim())
          }
        };
      }

      function buildReadinessSummary() {
        const pub = buildPublicSettings();
        const cloudProviders = ['gemini', 'openai', 'claude', 'openrouter'];
        const providers = {};

        for (const p of cloudProviders) {
          const configured = Boolean(pub.hasApiKey[p]);
          const tested = testedProviders.get(p);
          if (!configured) {
            providers[p] = {
              provider: p,
              configured: false,
              hasApiKey: false,
              model: pub.models[p] || '',
              state: 'not_configured',
              statusLabel: 'Not configured',
              code: 'NOT_CONFIGURED',
              usable: false,
              userMessage: 'Add an API key in Zeus settings.'
            };
          } else if (tested) {
            providers[p] = { ...clone(tested), model: pub.models[p] || '', configured: true, hasApiKey: true };
          } else {
            providers[p] = {
              provider: p,
              configured: true,
              hasApiKey: true,
              model: pub.models[p] || '',
              state: 'configured_untested',
              statusLabel: 'Configured, not tested',
              code: 'UNTESTED',
              usable: true,
              userMessage: 'API key saved (not yet tested).'
            };
          }
        }

        const ollamaModel = String(pub.ollama?.model || '').trim();
        const ollamaTested = testedProviders.get('ollama');
        if (!ollamaModel) {
          providers.ollama = {
            provider: 'ollama',
            configured: false,
            hasApiKey: false,
            host: pub.ollama?.host || 'http://localhost:11434',
            model: '',
            state: 'not_configured',
            statusLabel: 'Not configured',
            code: 'NOT_CONFIGURED',
            usable: false,
            userMessage: 'No local Ollama model configured.'
          };
        } else if (ollamaTested) {
          providers.ollama = { ...clone(ollamaTested), configured: true, model: ollamaModel };
        } else {
          providers.ollama = {
            provider: 'ollama',
            configured: true,
            hasApiKey: false,
            host: pub.ollama?.host || 'http://localhost:11434',
            model: ollamaModel,
            state: 'configured_untested',
            statusLabel: 'Configured, not tested',
            code: 'UNTESTED',
            usable: true,
            userMessage: 'Ollama model configured (not yet tested).'
          };
        }

        const activeProvider = pub.provider || 'gemini';
        const allIds = [...cloudProviders, 'ollama'];
        const configuredProviders = allIds.filter((id) => providers[id].configured);
        const usableProviders = allIds.filter((id) => providers[id].usable);

        if (activeProvider === 'auto') {
          const usable = usableProviders.length > 0;
          const verified = usableProviders.some((id) => providers[id].state === 'verified');
          return {
            activeProvider: 'auto',
            activeState: !usable ? 'not_configured' : (verified ? 'verified' : 'configured_untested'),
            statusLabel: !usable ? 'Not configured' : (verified ? 'Connection verified' : 'Configured, not tested'),
            code: !usable ? 'NOT_CONFIGURED' : (verified ? 'OK' : 'UNTESTED'),
            usable,
            configured: configuredProviders.length > 0,
            userMessage: usable ? 'Auto routing configured.' : 'Configure at least one provider.',
            configuredProviders,
            usableProviders,
            providers
          };
        }

        const active = providers[activeProvider] || providers.gemini;
        return {
          activeProvider,
          activeState: active.state,
          statusLabel: active.statusLabel,
          code: active.code,
          usable: active.usable,
          configured: active.configured,
          userMessage: active.userMessage,
          model: active.model || '',
          configuredProviders,
          usableProviders,
          providers
        };
      }

      window.__ZEUS_TEST_INSPECT_STORAGE__ = () => ({
        sync: clone(syncStore),
        local: clone(localStore),
        openOptionsCalls: window.__ZEUS_OPEN_OPTIONS_CALLS__
      });

      function handleMessage(msg) {
        const action = msg?.action || msg?.type || '';
        switch (action) {
          case 'ping':
            return { status: 'pong' };
          case 'getSettings':
            return { settings: buildPublicSettings() };
          case 'getProviderReadiness':
            return { success: true, readiness: buildReadinessSummary() };
          case 'testConnection': {
            const pub = buildPublicSettings();
            const target = String(msg?.provider || pub.provider || 'gemini').toLowerCase();
            const readinessBefore = buildReadinessSummary();
            const entry = readinessBefore.providers[target];
            if (target !== 'auto' && !entry?.configured) {
              return {
                success: false,
                result: {
                  ok: false,
                  provider: target,
                  state: 'not_configured',
                  statusLabel: 'Not configured',
                  code: 'NOT_CONFIGURED',
                  userMessage: 'Provider is not configured.'
                },
                readiness: readinessBefore
              };
            }
            const verifiedEntry = {
              provider: target,
              configured: true,
              hasApiKey: target !== 'ollama' && target !== 'auto',
              model: target === 'ollama' ? pub.ollama?.model : pub.models?.[target],
              state: 'verified',
              statusLabel: 'Connection verified',
              code: 'OK',
              usable: true,
              userMessage: target + ' connection verified (synthetic).'
            };
            if (target !== 'auto') {
              testedProviders.set(target, verifiedEntry);
            }
            const readiness = buildReadinessSummary();
            emitRuntimeMessage({ action: 'readinessUpdated', readiness, result: { ok: true, ...verifiedEntry }, source: 'background' });
            return { success: true, result: { ok: true, ...verifiedEntry }, readiness };
          }
          case 'discoverOllamaModels':
            return {
              success: true,
              reachable: true,
              originBlocked: false,
              origin: 'chrome-extension://zeus-synthetic-verified-id',
              version: '0.6.0',
              running: ['qwen3:8b'],
              installed: ['qwen3:8b', 'llama4'],
              models: ['qwen3:8b', 'llama4']
            };
          case 'settingsUpdated':
            return { success: true };
          case 'getTelemetrySummary':
            return { summary: { totalEvents: 0, fallbackCount: 0, byProvider: {}, byReason: {}, recent: [] } };
          case 'clearTelemetry':
            return { success: true };
          case 'sidePanel:getHistory':
            return { history: clone(localStore.zeus_prompt_history || []) };
          case 'sidePanel:saveHistory':
            if (msg?.entry) {
              localStore.zeus_prompt_history = [...(localStore.zeus_prompt_history || []), clone(msg.entry)];
            }
            return { success: true };
          case 'sidePanel:getTemplates':
            return { templates: clone(syncStore.zeus_templates || []) };
          case 'sidePanel:saveTemplates':
            syncStore.zeus_templates = clone(msg?.templates || []);
            return { success: true };
          default:
            return { success: true };
        }
      }

      window.chrome = {
        runtime: {
          id: 'zeus-synthetic-verified-id',
          lastError: null,
          getManifest: () => (${JSON.stringify(manifest)}),
          getURL: (rel) => new URL(String(rel || '').replace(/^\\/+/, ''), window.location.origin + '/').href,
          openOptionsPage: (cb) => {
            window.__ZEUS_OPEN_OPTIONS_CALLS__ += 1;
            if (typeof cb === 'function') setTimeout(() => cb(), 0);
            return Promise.resolve();
          },
          connect: (info) => ({
            name: info?.name || '',
            onMessage: { addListener: () => {}, removeListener: () => {} },
            onDisconnect: { addListener: () => {}, removeListener: () => {} },
            postMessage: () => {},
            disconnect: () => {}
          }),
          sendMessage: (msg, cb) => {
            const res = handleMessage(msg);
            if (typeof cb === 'function') setTimeout(() => cb(res), 0);
            return Promise.resolve(res);
          },
          onMessage: {
            addListener: (fn) => runtimeMessageListeners.add(fn),
            removeListener: (fn) => runtimeMessageListeners.delete(fn),
            hasListener: (fn) => runtimeMessageListeners.has(fn)
          }
        },
        storage: {
          sync: createStorageArea('sync', () => syncStore, (s) => { syncStore = s; }),
          local: createStorageArea('local', () => localStore, (s) => { localStore = s; }),
          onChanged: {
            addListener: (fn) => storageListeners.add(fn),
            removeListener: (fn) => storageListeners.delete(fn),
            hasListener: (fn) => storageListeners.has(fn)
          }
        },
        tabs: {
          query: (_q, cb) => {
            const res = [{ id: 1, url: 'https://chatgpt.com/' }];
            if (typeof cb === 'function') setTimeout(() => cb(res), 0);
            return Promise.resolve(res);
          },
          sendMessage: (_id, _msg, cb) => {
            if (typeof cb === 'function') setTimeout(() => cb({ success: true }), 0);
            return Promise.resolve({ success: true });
          },
          create: (_opts, cb) => {
            if (typeof cb === 'function') setTimeout(() => cb({ id: 2 }), 0);
            return Promise.resolve({ id: 2 });
          }
        },
        sidePanel: {
          open: () => Promise.resolve(),
          setPanelBehavior: () => Promise.resolve()
        }
      };
    })();
  `;
}

async function setViewport(ws, viewport) {
  await sendCDPCommand(ws, 'Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.width <= 480
  });
  await new Promise((r) => setTimeout(r, 150));
}

async function inspectPageState(ws, selector) {
  const evalRes = await sendCDPCommand(ws, 'Runtime.evaluate', {
    expression: `
      (async () => {
        try { await document.fonts.ready; } catch (_) {}
        const fonts = [];
        for (const f of document.fonts) {
          fonts.push({ family: f.family.replace(/^["']|["']$/g, ''), status: f.status, weight: f.weight });
        }
        const docEl = document.documentElement;
        const body = document.body;
        return {
          title: document.title,
          rendered: Boolean(document.querySelector('${selector}')),
          scrollWidth: docEl.scrollWidth,
          clientWidth: docEl.clientWidth,
          bodyScrollWidth: body ? body.scrollWidth : 0,
          bodyClientWidth: body ? body.clientWidth : 0,
          overflow: docEl.scrollWidth > docEl.clientWidth,
          violations: window.__ZEUS_CSP_VIOLATIONS__ || [],
          windowErrors: window.__ZEUS_WINDOW_ERRORS__ || [],
          fonts
        };
      })()
    `,
    awaitPromise: true,
    returnByValue: true
  });
  return evalRes?.result?.value || {};
}

async function evalInPage(ws, expression) {
  const res = await sendCDPCommand(ws, 'Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (res?.exceptionDetails) {
    throw new Error(res.exceptionDetails.text || JSON.stringify(res.exceptionDetails));
  }
  return res?.result?.value;
}

async function verifyInteractiveFlows(ws, pageFile) {
  if (pageFile === 'sidepanel.html') {
    return evalInPage(ws, `(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const setupCard = document.getElementById('setup-required-card');
      const setupInitiallyVisible = Boolean(setupCard && getComputedStyle(setupCard).display !== 'none');
      if (!setupInitiallyVisible) {
        return { ok: false, reason: 'Expected #setup-required-card to be visible in unconfigured v3 default state' };
      }

      document.getElementById('btn-setup-configure')?.click();
      await wait(120);
      const settingsActive = document.getElementById('tab-settings')?.classList.contains('active');
      if (!settingsActive) {
        return { ok: false, reason: 'Clicking #btn-setup-configure did not activate #tab-settings' };
      }

      const providerSel = document.getElementById('sp-provider');
      providerSel.value = 'openai';
      providerSel.dispatchEvent(new Event('change', { bubbles: true }));
      await wait(200);

      const modelSel = document.getElementById('sp-model');
      const hasGpt54 = Array.from(modelSel?.options || []).some((o) => o.value === 'gpt-5.4');
      if (!hasGpt54) {
        return { ok: false, reason: 'OpenAI model options did not populate gpt-5.4' };
      }
      modelSel.value = 'gpt-5.4';
      modelSel.dispatchEvent(new Event('change', { bubbles: true }));
      await wait(200);

      // Exercise local.apiKeys + storage.onChanged + testConnection
      const apiInput = document.getElementById('sp-api-key');
      apiInput.value = 'sk-synthetic-v3-test-key';
      apiInput.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('sp-btn-save-key')?.click();
      await wait(200);
      const keyStatusAfterSave = document.getElementById('sp-key-status')?.textContent?.trim();
      const inputBlankAfterSave = document.getElementById('sp-api-key')?.value === '';

      document.getElementById('sp-btn-test')?.click();
      await wait(200);
      const readinessAfterTest = document.getElementById('sp-readiness-label')?.textContent?.trim();

      // Verify storage.onChanged external update syncs provider -> ollama and discoverOllamaModels renders chips
      await window.chrome.storage.sync.set({
        ...(window.__ZEUS_TEST_INSPECT_STORAGE__().sync),
        provider: 'ollama'
      });
      await wait(220);
      const providerAfterOnChanged = document.getElementById('sp-provider')?.value;
      document.getElementById('sp-btn-detect-ollama')?.click();
      await wait(200);
      const discoveredChips = document.querySelectorAll('#sp-ollama-discovered .ollama-chip').length;

      // Restore openai so strip metrics can be verified cleanly
      providerSel.value = 'openai';
      providerSel.dispatchEvent(new Event('change', { bubbles: true }));
      await wait(200);

      document.getElementById('sp-btn-open-options')?.click();
      await wait(80);
      const storageState = window.__ZEUS_TEST_INSPECT_STORAGE__();

      const settingsOverflow = document.documentElement.scrollWidth > document.documentElement.clientWidth;

      document.getElementById('btn-back-to-enhance')?.click();
      await wait(100);
      const editorActive = document.getElementById('tab-editor')?.classList.contains('active');
      const stripProvider = document.getElementById('strip-provider')?.textContent?.trim();
      const stripModel = document.getElementById('strip-model')?.textContent?.trim();
      const setupHiddenAfterKey = getComputedStyle(setupCard).display === 'none';

      return {
        ok: Boolean(
          setupInitiallyVisible &&
          settingsActive &&
          !settingsOverflow &&
          editorActive &&
          keyStatusAfterSave === 'API key configured' &&
          inputBlankAfterSave &&
          readinessAfterTest === 'Connection verified' &&
          providerAfterOnChanged === 'ollama' &&
          discoveredChips >= 2 &&
          setupHiddenAfterKey &&
          storageState?.sync?.provider === 'openai' &&
          storageState?.sync?.models?.openai === 'gpt-5.4' &&
          storageState?.local?.apiKeys?.openai === 'sk-synthetic-v3-test-key' &&
          !('apiKeys' in (storageState?.sync || {})) &&
          storageState?.sync?.schemaVersion === 3 &&
          storageState?.openOptionsCalls >= 1 &&
          stripProvider === 'OpenAI' &&
          stripModel === 'GPT-5.4'
        ),
        setupInitiallyVisible,
        settingsActive,
        settingsOverflow,
        editorActive,
        keyStatusAfterSave,
        inputBlankAfterSave,
        readinessAfterTest,
        providerAfterOnChanged,
        discoveredChips,
        setupHiddenAfterKey,
        stripProvider,
        stripModel,
        openOptionsCalls: storageState?.openOptionsCalls,
        storedProvider: storageState?.sync?.provider,
        storedModel: storageState?.sync?.models?.openai
      };
    })()`);
  }

  if (pageFile === 'popup.html') {
    return evalInPage(ws, `(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const badgeState = document.getElementById('popupReadinessBadge')?.dataset?.state;
      const aiProvider = document.getElementById('aiProvider');
      aiProvider.value = 'openai';
      aiProvider.dispatchEvent(new Event('change', { bubbles: true }));
      await wait(150);

      const trigger = document.getElementById('modelPickerTrigger');
      trigger?.click();
      await wait(80);
      const pickerOpen = !document.getElementById('modelPickerPanel')?.hidden;
      const gpt54Opt = document.querySelector('#modelOptionGroups .model-option[data-value="gpt-5.4"]');
      gpt54Opt?.click();
      await wait(100);

      document.getElementById('openOptionsBtn')?.click();
      await wait(80);
      const storageState = window.__ZEUS_TEST_INSPECT_STORAGE__();

      return {
        ok: Boolean(
          badgeState === 'not_configured' &&
          pickerOpen &&
          document.getElementById('providerModel')?.value === 'gpt-5.4' &&
          storageState?.openOptionsCalls >= 1
        ),
        badgeState,
        pickerOpen,
        selectedModel: document.getElementById('providerModel')?.value,
        openOptionsCalls: storageState?.openOptionsCalls
      };
    })()`);
  }

  if (pageFile === 'options.html') {
    return evalInPage(ws, `(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const telemetryNav = document.querySelector('.options-nav-item[data-target="telemetry-section"]');
      const configNav = document.querySelector('.options-nav-item[data-target="config-section"]');
      telemetryNav?.click();
      await wait(120);
      const telemetryVisible = getComputedStyle(document.getElementById('telemetry-section')).display !== 'none';
      configNav?.click();
      await wait(120);
      const configVisible = getComputedStyle(document.getElementById('config-section')).display !== 'none';

      const aiProvider = document.getElementById('aiProvider');
      aiProvider.value = 'openai';
      aiProvider.dispatchEvent(new Event('change', { bubbles: true }));
      await wait(150);
      const hasOpenAiModel = Array.from(document.getElementById('providerModel')?.options || []).some((o) => o.value === 'gpt-5.4');

      return {
        ok: Boolean(telemetryVisible && configVisible && hasOpenAiModel),
        telemetryVisible,
        configVisible,
        hasOpenAiModel
      };
    })()`);
  }

  return { ok: true };
}

async function runBrowserVerification() {
  const chromePath = findChromeExecutable();
  if (!chromePath) {
    console.error('CONCRETE BLOCKER: Google Chrome executable not found on host.');
    process.exit(1);
  }

  const manifestPath = path.join(extPath, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.error('CONCRETE BLOCKER: Packaged build missing in dist/extension. Run npm run build first.');
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const extensionCSP = manifest.content_security_policy?.extension_pages;

  // Spin up an isolated HTTP server delivering packaged extension assets with the exact extension CSP
  const server = http.createServer((req, res) => {
    const cleanUrl = (req.url || '/').split('?')[0].replace(/^\/+/, '') || 'popup.html';
    if (cleanUrl === 'favicon.ico') {
      res.writeHead(204);
      res.end();
      return;
    }

    const targetFile = path.resolve(extPath, cleanUrl);
    if (!targetFile.startsWith(extPath + path.sep) && targetFile !== extPath) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    if (!fs.existsSync(targetFile) || fs.statSync(targetFile).isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }

    let contentType = 'text/plain';
    if (targetFile.endsWith('.html')) contentType = 'text/html; charset=utf-8';
    else if (targetFile.endsWith('.js')) contentType = 'application/javascript; charset=utf-8';
    else if (targetFile.endsWith('.css')) contentType = 'text/css; charset=utf-8';
    else if (targetFile.endsWith('.png')) contentType = 'image/png';
    else if (targetFile.endsWith('.svg')) contentType = 'image/svg+xml';
    else if (targetFile.endsWith('.json')) contentType = 'application/json; charset=utf-8';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Security-Policy': extensionCSP
    });
    res.end(fs.readFileSync(targetFile));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  const tempProfileDir = path.join(os.tmpdir(), `zeus-test-profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  fs.mkdirSync(tempProfileDir, { recursive: true });

  const cdpPort = await getFreePort();
  console.log(`[Browser Harness] Launching isolated Chrome (CDP port: ${cdpPort}, HTTP port: ${port})`);

  const chromeArgs = [
    '--headless=new',
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${tempProfileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-sync'
  ];

  const chromeProc = spawn(chromePath, chromeArgs, { stdio: 'ignore' });

  const cleanup = () => {
    try {
      if (chromeProc.pid) {
        spawnSync('taskkill', ['/pid', String(chromeProc.pid), '/t', '/f'], { stdio: 'ignore' });
      }
    } catch (_) {}
    try {
      chromeProc.kill();
    } catch (_) {}
    try {
      fs.rmSync(tempProfileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch (_) {}
    try {
      server.close();
    } catch (_) {}
  };

  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(1); });

  try {
    let versionInfo = null;
    let pageTarget = null;

    for (let i = 0; i < 25; i++) {
      await new Promise((r) => setTimeout(r, 350));
      try {
        const vRes = await fetch(`http://127.0.0.1:${cdpPort}/json/version`);
        versionInfo = await vRes.json();
        const tRes = await fetch(`http://127.0.0.1:${cdpPort}/json`);
        const targets = await tRes.json();
        pageTarget = targets.find((t) => t.type === 'page');
        if (versionInfo && pageTarget) break;
      } catch (_) {}
    }

    if (!versionInfo || !pageTarget) {
      throw new Error('Failed to connect to isolated Chrome instance over CDP.');
    }

    console.log(`[Browser Harness] Connected to ${versionInfo.Browser}`);

    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });

    await sendCDPCommand(ws, 'Page.enable');
    await sendCDPCommand(ws, 'Runtime.enable');
    await sendCDPCommand(ws, 'Network.enable');
    await sendCDPCommand(ws, 'Log.enable');

    let activeConsoleErrors = [];
    let activePageExceptions = [];
    let activeLogErrors = [];

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error') {
          const text = (msg.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ').trim();
          activeConsoleErrors.push(text || 'console.error');
        } else if (msg.method === 'Runtime.exceptionThrown') {
          const ex = msg.params?.exceptionDetails;
          activePageExceptions.push(ex?.exception?.description || ex?.text || 'Uncaught exception');
        } else if (msg.method === 'Log.entryAdded' && msg.params?.entry?.level === 'error') {
          activeLogErrors.push(`${msg.params.entry.source || 'log'}: ${msg.params.entry.text || ''}`);
        }
      } catch (_) {}
    });

    await sendCDPCommand(ws, 'Page.addScriptToEvaluateOnNewDocument', {
      source: buildSyntheticChromeScript(manifest)
    });

    const pagesToTest = [
      { name: 'Popup', file: 'popup.html', selector: '.zeus-popup' },
      { name: 'Options', file: 'options.html', selector: '.options-container' },
      { name: 'Side Panel', file: 'sidepanel.html', selector: '.sidepanel-container' }
    ];

    const results = [];

    for (const p of pagesToTest) {
      const pageUrl = `http://127.0.0.1:${port}/${p.file}`;
      const viewportResults = [];

      for (const vp of VIEWPORTS) {
        console.log(`[Browser Harness] Testing ${p.name} (${pageUrl}) @ ${vp.width}x${vp.height}...`);
        activeConsoleErrors = [];
        activePageExceptions = [];
        activeLogErrors = [];

        await setViewport(ws, vp);
        await sendCDPCommand(ws, 'Page.navigate', { url: pageUrl });
        await new Promise((r) => setTimeout(r, 2000));

        const state = await inspectPageState(ws, p.selector);
        const interactive = await verifyInteractiveFlows(ws, p.file);
        const postState = await inspectPageState(ws, p.selector);

        const loadedFamilies = [...new Set(
          (postState.fonts || state.fonts || [])
            .filter((f) => f.status === 'loaded')
            .map((f) => f.family)
        )];

        const allViolations = [...(state.violations || []), ...(postState.violations || [])];
        const allWindowErrors = [...(state.windowErrors || []), ...(postState.windowErrors || [])];
        const allConsoleErrors = [...activeConsoleErrors, ...activePageExceptions, ...activeLogErrors];

        viewportResults.push({
          viewport: vp,
          title: state.title || '',
          rendered: Boolean(state.rendered),
          scrollWidth: state.scrollWidth,
          clientWidth: state.clientWidth,
          postScrollWidth: postState.scrollWidth,
          postClientWidth: postState.clientWidth,
          overflow: Boolean(state.overflow || postState.overflow),
          cspViolations: allViolations,
          consoleErrors: allConsoleErrors,
          windowErrors: allWindowErrors,
          loadedFamilies,
          interactive
        });
      }

      results.push({ ...p, viewports: viewportResults });
    }

    ws.close();

    console.log('\n============================================================');
    console.log('       ZEUS PACKAGED BROWSER VERIFICATION REPORT            ');
    console.log('============================================================\n');

    let allPassed = true;

    for (const r of results) {
      console.log(`--- [PAGE] ${r.name} (${r.file}) ---`);
      for (const vr of r.viewports) {
        const missingFonts = EXPECTED_GOOGLE_FONTS.filter((f) => !vr.loadedFamilies.includes(f));
        const fontsOk = vr.loadedFamilies.length > 0 && missingFonts.length === 0;
        const errorsCount = vr.consoleErrors.length + vr.windowErrors.length;
        const vpOk = Boolean(
          vr.rendered &&
          !vr.overflow &&
          vr.cspViolations.length === 0 &&
          errorsCount === 0 &&
          fontsOk &&
          vr.interactive?.ok
        );
        if (!vpOk) allPassed = false;

        console.log(`  [${vr.viewport.name} ${vr.viewport.width}x${vr.viewport.height}] ${vpOk ? 'PASS' : 'FAIL'}`);
        console.log(`    Title:            "${vr.title}"`);
        console.log(`    DOM Render:       ${vr.rendered ? 'PASS (Found ' + r.selector + ')' : 'FAIL'}`);
        console.log(`    Overflow Check:   scrollWidth=${vr.scrollWidth}/${vr.postScrollWidth} <= clientWidth=${vr.clientWidth} -> ${vr.overflow ? 'FAIL' : 'PASS'}`);
        console.log(`    CSP Violations:   ${vr.cspViolations.length === 0 ? '0 (CLEAN)' : 'FAIL (' + JSON.stringify(vr.cspViolations) + ')'}`);
        console.log(`    Console/Page Err: ${errorsCount === 0 ? '0 (CLEAN)' : 'FAIL (' + JSON.stringify({ console: vr.consoleErrors, window: vr.windowErrors }) + ')'}`);
        console.log(`    Loaded Fonts:     ${vr.loadedFamilies.join(', ') || 'none'}${missingFonts.length ? ' (Missing: ' + missingFonts.join(', ') + ')' : ''}`);
        console.log(`    Interactive Flow: ${vr.interactive?.ok ? 'PASS' : 'FAIL'} ${JSON.stringify(vr.interactive)}`);
      }
      console.log('');
    }

    console.log('============================================================');
    console.log(`BROWSER ENGINE: ${versionInfo.Browser}`);
    console.log('ENVIRONMENT NOTE ON UNPACKED EXTENSION CLI SIDELOADING:');
    console.log('Google Chrome >= 137 strictly blocks CLI flags --load-extension');
    console.log('and --disable-extensions-except on official builds for malware');
    console.log('sideload prevention. Packaged assets were therefore verified');
    console.log('in isolated headless Chrome under the exact declared Manifest CSP');
    console.log('with synthetic v3 ZeusSettingsStore storage and messaging fixtures.');
    console.log('============================================================');
    console.log(allPassed
      ? 'STATUS: ALL BROWSER RENDER, FONT, OVERFLOW, CSP & FLOW CHECKS PASSED.'
      : 'STATUS: VERIFICATION FAILED.');
    console.log('============================================================\n');

    process.exit(allPassed ? 0 : 1);
  } finally {
    cleanup();
  }
}

runBrowserVerification().catch((err) => {
  console.error('Verification error:', err);
  process.exit(1);
});
