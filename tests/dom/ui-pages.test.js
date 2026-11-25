/**
 * @vitest-environment jsdom
 */
const fs = require('node:fs');
const path = require('node:path');
const { createChromeMock } = require('../mocks/chrome');
const { loadScript, clearZeusGlobals } = require('../utils/runtime');

function mountHtml(fileName) {
  const htmlPath = path.resolve(process.cwd(), fileName);
  const rawHtml = fs.readFileSync(htmlPath, 'utf8');
  const parsed = new DOMParser().parseFromString(rawHtml, 'text/html');
  parsed.querySelectorAll('script').forEach((node) => node.remove());
  document.head.replaceChildren(...Array.from(parsed.head.childNodes));
  document.body.replaceChildren(...Array.from(parsed.body.childNodes));
}

async function bootUiPage(htmlFile, scripts) {
  mountHtml(htmlFile);
  scripts.forEach(loadScript);
  document.dispatchEvent(new Event('DOMContentLoaded'));
  await new Promise((r) => setTimeout(r, 20));
}

describe('Extension UI Page Controller Seam (Popup, Options, Side Panel)', () => {
  let env;
  let domReadyListeners = [];
  const origDocAddEventListener = document.addEventListener.bind(document);

  beforeEach(() => {
    clearZeusGlobals();
    document.head.replaceChildren();
    document.body.replaceChildren();
    domReadyListeners = [];
    document.addEventListener = (type, listener, options) => {
      if (type === 'DOMContentLoaded') {
        domReadyListeners.push({ listener, options });
      }
      return origDocAddEventListener(type, listener, options);
    };
    env = createChromeMock({
      syncStore: {
        schemaVersion: 3,
        provider: 'ollama',
        ollama: { host: 'http://127.0.0.1:11435', model: 'qwen3:8b' },
        copilotEnabled: true,
        copilotMaxTokens: 60
      },
      localStore: {
        apiKeys: { gemini: 'gem-key', openai: 'oa-key', claude: 'cl-key', openrouter: 'or-key' }
      }
    });

    if (typeof window.matchMedia !== 'function') {
      window.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} });
    }
    if (typeof window.confirm !== 'function') {
      window.confirm = () => true;
    }

    globalThis.chrome = env.chrome;
    window.chrome = env.chrome;
  });

  afterEach(() => {
    document.addEventListener = origDocAddEventListener;
    for (const { listener, options } of domReadyListeners) {
      document.removeEventListener('DOMContentLoaded', listener, options);
    }
    domReadyListeners = [];
    delete globalThis.chrome;
    delete window.chrome;
    clearZeusGlobals();
    document.head.replaceChildren();
    document.body.replaceChildren();
  });

  it('Popup UI loads, edits, and persists ollama.host via SettingsStore', async () => {
    await bootUiPage('popup.html', [
      'model-registry.js',
      'settings/settingsStore.js',
      'settings/settings.js',
      'popup.js'
    ]);

    const hostInput = document.getElementById('ollamaHost');
    expect(hostInput.value).toBe('http://127.0.0.1:11435');

    hostInput.value = 'http://127.0.0.1:11440/';
    document.getElementById('saveBtn').click();
    await new Promise((r) => setTimeout(r, 20));

    expect(env.syncStore.ollama.host).toBe('http://127.0.0.1:11440');
    expect(
      env.calls.runtimeSendMessage.some(
        (entry) => entry?.message?.action === 'settingsUpdated' && entry?.message?.settings?.ollama?.host === 'http://127.0.0.1:11440'
      )
    ).toBe(true);
  });

  it('Options Dashboard loads, edits, and persists ollama.host via SettingsStore', async () => {
    await bootUiPage('options.html', [
      'model-registry.js',
      'settings/settingsStore.js',
      'settings/settings.js',
      'options.js'
    ]);

    const hostInput = document.getElementById('ollamaHost');
    expect(hostInput.value).toBe('http://127.0.0.1:11435');

    hostInput.value = 'http://localhost:22434/';
    document.getElementById('saveBtn').click();
    await new Promise((r) => setTimeout(r, 20));

    expect(env.syncStore.ollama.host).toBe('http://localhost:22434');
    expect(
      env.calls.runtimeSendMessage.some(
        (entry) => entry?.message?.action === 'settingsUpdated' && entry?.message?.settings?.ollama?.host === 'http://localhost:22434'
      )
    ).toBe(true);
  });

  it('Popup UI keeps cloud API key panels accessible in auto mode and avoids dead darkModeToggle storage calls', async () => {
    const syncGetSpy = vi.spyOn(env.chrome.storage.sync, 'get');

    await bootUiPage('popup.html', [
      'model-registry.js',
      'settings/settingsStore.js',
      'settings/settings.js',
      'popup.js'
    ]);

    const providerSelect = document.getElementById('aiProvider');
    providerSelect.value = 'auto';
    providerSelect.dispatchEvent(new Event('change'));

    for (const id of ['gemini-settings', 'openai-settings', 'claude-settings', 'openrouter-settings']) {
      expect(document.getElementById(id).style.display).toBe('block');
    }

    const touchedDarkMode = syncGetSpy.mock.calls.some(
      ([keys]) => Array.isArray(keys) ? keys.includes('zeus_dark_mode_preference') : keys === 'zeus_dark_mode_preference'
    );
    expect(touchedDarkMode).toBe(false);
  });

  it('Options Dashboard clamps copilotMaxTokens and displays true fallback counts newest-first', async () => {
    env.listeners.runtimeOnMessage.addListener((msg, _sender, sendResponse) => {
      if (msg?.action === 'getTelemetrySummary') {
        sendResponse({
          summary: {
            totalEvents: 3,
            fallbackCount: 1,
            recent: [
              { type: 'enhance', at: '2026-11-25T10:00:01Z', payload: { provider: 'gemini' } },
              { type: 'fallback', at: '2026-11-25T10:00:02Z', payload: { provider: 'openai', reason: '503' } },
              { type: 'enhance', at: '2026-11-25T10:00:03Z', payload: { provider: 'claude' } }
            ]
          }
        });
        return true;
      }
      return false;
    });

    await bootUiPage('options.html', [
      'model-registry.js',
      'settings/settingsStore.js',
      'settings/settings.js',
      'options.js'
    ]);

    const maxTokensInput = document.getElementById('copilotMaxTokens');
    maxTokensInput.value = '500';
    document.getElementById('saveBtn').click();
    await new Promise((r) => setTimeout(r, 20));

    expect(env.syncStore.copilotMaxTokens).toBe(250);
    expect(maxTokensInput.value).toBe('250');

    const telemetryNav = document.querySelector('.options-nav-item[data-target="telemetry-section"]');
    telemetryNav.click();
    await new Promise((r) => setTimeout(r, 20));

    expect(document.getElementById('telemetryFallbacks').textContent).toBe('1');
    const items = [...document.querySelectorAll('#telemetryEventList li')].map((li) => li.textContent);
    expect(items[0]).toContain('10:00:03');
    expect(items[1]).toContain('10:00:02');
    expect(items[2]).toContain('10:00:01');
  });

  it('Side Panel Workbench reads public settings without calling loadSettings, forwards timeout/redaction, saves captured URL, and keeps sticky loading toasts', async () => {
    env.syncStore.redactionEnabled = true;
    env.syncStore.customRedactionPatterns = ['SECRET_PROJ_CODE'];

    let resolveEnhance;
    env.listeners.runtimeOnMessage.addListener((msg, _sender, sendResponse) => {
      if (msg?.type === 'sidePanel:getCurrentInput') {
        sendResponse({ value: 'Draft with SECRET_PROJ_CODE', url: 'https://claude.ai/chat/abc', site: 'claude' });
        return true;
      }
      if (msg?.action === 'enhancePrompt') {
        resolveEnhance = () => sendResponse({
          success: true,
          enhancedText: `ENHANCED:\n${msg.prompt}`,
          warnings: [],
          meta: {}
        });
        return true;
      }
      if (msg?.type === 'sidePanel:saveHistory') {
        sendResponse({ success: true });
        return true;
      }
      if (msg?.type === 'sidePanel:getTemplates') {
        sendResponse({ templates: [] });
        return true;
      }
      if (msg?.type === 'sidePanel:getHistory') {
        sendResponse({ history: [] });
        return true;
      }
      return false;
    });

    await bootUiPage('sidepanel.html', [
      'core/redactor.js',
      'core/safeDom.js',
      'settings/settingsStore.js',
      'settings/settings.js',
      'core/promptClient.js',
      'sidepanel.js'
    ]);

    const origStore = globalThis.ZeusSettingsStore;
    const getPublicSpy = vi.fn((...args) => origStore.getPublic(...args));
    const loadSettingsSpy = vi.fn((...args) => origStore.loadSettings(...args));
    const storeProxy = { ...origStore, getPublic: getPublicSpy, loadSettings: loadSettingsSpy };
    globalThis.ZeusSettingsStore = storeProxy;
    window.ZeusSettingsStore = storeProxy;

    document.getElementById('btn-capture').click();
    await new Promise((r) => setTimeout(r, 10));
    expect(document.getElementById('original-input').value).toBe('Draft with SECRET_PROJ_CODE');

    document.getElementById('btn-enhance').click();
    await new Promise((r) => setTimeout(r, 350));

    const stickyToasts = [...document.querySelectorAll('#sidepanel-toast-holder .zeus-toast.info')]
      .map((el) => el.textContent);
    expect(stickyToasts.some((t) => t.includes('ROUTING TO COGNITIVE LOADOUT'))).toBe(true);

    resolveEnhance();
    await new Promise((r) => setTimeout(r, 30));

    expect(getPublicSpy).toHaveBeenCalledTimes(1);
    expect(loadSettingsSpy).not.toHaveBeenCalled();
    const enhanceCall = env.calls.runtimeSendMessage.find((e) => e.message?.action === 'enhancePrompt')?.message;
    expect(enhanceCall.prompt).toContain('[[ZEUS_SECRET_1]]');
    expect(enhanceCall.prompt).not.toContain('SECRET_PROJ_CODE');
    expect(enhanceCall.options?.timeoutMs).toBeGreaterThan(0);
    expect(enhanceCall.options?.apiKeys).toBeUndefined();

    const historyCall = env.calls.runtimeSendMessage.find((e) => e.message?.type === 'sidePanel:saveHistory')?.message;
    expect(historyCall.entry.url).toBe('https://claude.ai/chat/abc');
  });

  it('Side Panel Workbench preserves literal $&, $$, and $100 when filling templates', async () => {
    env.listeners.runtimeOnMessage.addListener((msg, _sender, sendResponse) => {
      if (msg?.type === 'sidePanel:getTemplates') {
        sendResponse({
          templates: [
            { name: 'Price Template', template: 'Quote {{amount}} now', variables: ['amount'] }
          ]
        });
        return true;
      }
      if (msg?.type === 'sidePanel:getHistory') {
        sendResponse({ history: [] });
        return true;
      }
      return false;
    });

    await bootUiPage('sidepanel.html', [
      'core/redactor.js',
      'core/safeDom.js',
      'settings/settingsStore.js',
      'settings/settings.js',
      'core/promptClient.js',
      'sidepanel.js'
    ]);

    document.querySelector('.tab-btn[data-tab="templates"]').click();
    await new Promise((r) => setTimeout(r, 20));
    document.querySelector('.template-item').click();
    const varInput = document.querySelector('#modal-variables-inputs input');
    varInput.value = '$& $$100';
    document.getElementById('btn-modal-fill').click();
    expect(document.getElementById('original-input').value).toBe('Quote $& $$100 now');
  });

  it('Side Panel Workbench filters out NOTICE audit entries and styles actionable warning toasts via sidepanel.css', async () => {
    let warningsToReturn = ['NOTICE: Defense-in-depth scrubbing occurred server-side.'];
    env.listeners.runtimeOnMessage.addListener((msg, _sender, sendResponse) => {
      if (msg?.action === 'enhancePrompt') {
        sendResponse({
          success: true,
          enhancedText: `ENHANCED:\n${msg.prompt}`,
          warnings: warningsToReturn,
          meta: {}
        });
        return true;
      }
      if (msg?.type === 'sidePanel:saveHistory') {
        sendResponse({ success: true });
        return true;
      }
      if (msg?.type === 'sidePanel:getTemplates') {
        sendResponse({ templates: [] });
        return true;
      }
      if (msg?.type === 'sidePanel:getHistory') {
        sendResponse({ history: [] });
        return true;
      }
      return false;
    });

    await bootUiPage('sidepanel.html', [
      'core/redactor.js',
      'core/safeDom.js',
      'settings/settingsStore.js',
      'settings/settings.js',
      'core/promptClient.js',
      'sidepanel.js'
    ]);

    const sidepanelCss = fs.readFileSync(path.resolve(process.cwd(), 'sidepanel.css'), 'utf8');
    const styleEl = document.createElement('style');
    styleEl.textContent = sidepanelCss;
    document.head.appendChild(styleEl);

    document.getElementById('original-input').value = 'Draft prompt';
    document.getElementById('btn-enhance').click();
    await new Promise((r) => setTimeout(r, 30));
    expect(document.querySelectorAll('#sidepanel-toast-holder .zeus-toast.warning').length).toBe(0);

    warningsToReturn = ['Sensitive token [[ZEUS_SECRET_1]] was omitted'];
    document.getElementById('btn-enhance').click();
    await new Promise((r) => setTimeout(r, 30));

    const warningToast = document.querySelector('#sidepanel-toast-holder .zeus-toast.warning');
    expect(warningToast).not.toBeNull();
    expect(warningToast.textContent).toContain('WARNING: SOME SENSITIVE TOKENS WERE OMITTED BY AI');
    const rules = Array.from(styleEl.sheet?.cssRules || []);
    expect(rules.some((rule) => String(rule.selectorText || '').includes('.zeus-toast.warning'))).toBe(true);
  });
});
