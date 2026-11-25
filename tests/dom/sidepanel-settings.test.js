/**
 * @vitest-environment jsdom
 */
const fs = require('node:fs');
const path = require('node:path');
const { createChromeMock } = require('../mocks/chrome');
const { loadScript, clearZeusGlobals } = require('../utils/runtime');

function flushAsync(ms = 30) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mountHtml(fileName) {
  const htmlPath = path.resolve(process.cwd(), fileName);
  const rawHtml = fs.readFileSync(htmlPath, 'utf8');
  const parsed = new DOMParser().parseFromString(rawHtml, 'text/html');
  parsed.querySelectorAll('script').forEach((node) => node.remove());
  document.head.replaceChildren(...Array.from(parsed.head.childNodes));
  document.body.replaceChildren(...Array.from(parsed.body.childNodes));
  return rawHtml;
}

describe('Side Panel Workbench Settings, Setup Onboarding, Security & Regression Tests', () => {
  let env;
  let domReadyListeners = [];
  const origDocAddEventListener = document.addEventListener.bind(document);
  const origWindowClose = window.close;
  const origWindowConfirm = window.confirm;

  function setupMockEnv(options = {}) {
    env = createChromeMock({
      syncStore: {
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
        ollama: {
          host: 'http://localhost:11434',
          model: ''
        },
        ...(options.syncStore || {})
      },
      localStore: {
        apiKeys: {
          gemini: '',
          openai: '',
          claude: '',
          openrouter: '',
          ...((options.localStore && options.localStore.apiKeys) || {})
        }
      }
    });

    env.calls.openOptionsPage = 0;
    env.calls.tabsCreate = [];
    env.chrome.runtime.openOptionsPage = vi.fn((cb) => {
      env.calls.openOptionsPage += 1;
      if (typeof cb === 'function') cb();
    });
    env.chrome.runtime.getURL = vi.fn((p) => `chrome-extension://${env.chrome.runtime.id}/${p}`);
    env.chrome.tabs.create = vi.fn((opts) => {
      env.calls.tabsCreate.push(opts);
      return Promise.resolve({ id: 901 });
    });

    globalThis.chrome = env.chrome;
    window.chrome = env.chrome;
  }

  async function bootSidePanel(options = {}) {
    setupMockEnv(options);
    if (typeof options.configureListeners === 'function') {
      options.configureListeners(env);
    }

    const rawHtml = mountHtml('sidepanel.html');
    [
      'core/redactor.js',
      'core/safeDom.js',
      'core/providerTransport.js',
      'model-registry.js',
      'settings/settingsStore.js',
      'settings/settings.js',
      'core/promptClient.js',
      'sidepanel.js'
    ].forEach(loadScript);

    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushAsync(30);
    return rawHtml;
  }

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
    window.close = vi.fn();
    window.confirm = vi.fn(() => true);
    if (typeof window.matchMedia !== 'function') {
      window.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} });
    }
    if (!navigator.clipboard) {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: vi.fn().mockResolvedValue(undefined) }
      });
    } else {
      navigator.clipboard.writeText = vi.fn().mockResolvedValue(undefined);
    }
  });

  afterEach(() => {
    document.addEventListener = origDocAddEventListener;
    for (const { listener, options } of domReadyListeners) {
      document.removeEventListener('DOMContentLoaded', listener, options);
    }
    domReadyListeners = [];
    window.close = origWindowClose;
    window.confirm = origWindowConfirm;
    delete globalThis.chrome;
    delete window.chrome;
    clearZeusGlobals();
    document.head.replaceChildren();
    document.body.replaceChildren();
  });

  describe('1. Header Entry Point, Navigation & Layout Contracts', () => {
    it('loads model-registry.js before settingsStore.js and keeps strictly 3 primary nav tabs with accessible Settings gear button', async () => {
      const rawHtml = await bootSidePanel();

      const regIdx = rawHtml.indexOf('<script src="model-registry.js">');
      const storeIdx = rawHtml.indexOf('<script src="settings/settingsStore.js">');
      expect(regIdx).toBeGreaterThan(-1);
      expect(storeIdx).toBeGreaterThan(regIdx);

      const navTabs = Array.from(document.querySelectorAll('.sidepanel-tabs .tab-btn'));
      expect(navTabs).toHaveLength(3);
      expect(navTabs.map((el) => el.dataset.tab)).toEqual(['editor', 'history', 'templates']);

      const settingsBtn = document.getElementById('btn-open-settings');
      expect(settingsBtn).not.toBeNull();
      expect(settingsBtn.textContent).toContain('Settings');
      expect(settingsBtn.getAttribute('aria-label')).toBe('Open Settings');
      expect(settingsBtn.getAttribute('aria-controls')).toBe('tab-settings');
      expect(settingsBtn.getAttribute('aria-expanded')).toBe('false');
    });

    it('navigates between Settings and Workbench tabs, preserves unsaved #original-input text, and avoids duplicate handlers', async () => {
      let enhanceCallCount = 0;
      await bootSidePanel({
        localStore: { apiKeys: { gemini: 'gem-valid-key' } },
        configureListeners: (mockEnv) => {
          mockEnv.listeners.runtimeOnMessage.addListener((msg, _sender, sendResponse) => {
            if (msg?.action === 'enhancePrompt') {
              enhanceCallCount += 1;
              sendResponse({ success: true, enhancedText: 'Enhanced once', warnings: [], meta: {} });
              return true;
            }
            if (msg?.type === 'sidePanel:getHistory') {
              sendResponse({ history: [] });
              return true;
            }
            if (msg?.type === 'sidePanel:getTemplates') {
              sendResponse({ templates: [] });
              return true;
            }
            if (msg?.type === 'sidePanel:saveHistory') {
              sendResponse({ success: true });
              return true;
            }
            return false;
          });
        }
      });

      const originalInput = document.getElementById('original-input');
      const settingsBtn = document.getElementById('btn-open-settings');
      const backBtn = document.getElementById('btn-back-to-enhance');
      const tabSettings = document.getElementById('tab-settings');
      const tabEditor = document.getElementById('tab-editor');

      originalInput.value = 'Unsaved draft prompt text';

      // Toggle Settings <-> Editor <-> History <-> Templates repeatedly
      for (let i = 0; i < 4; i += 1) {
        settingsBtn.click();
        expect(tabSettings.classList.contains('active')).toBe(true);
        expect(settingsBtn.getAttribute('aria-expanded')).toBe('true');

        backBtn.click();
        expect(tabEditor.classList.contains('active')).toBe(true);
        expect(tabSettings.classList.contains('active')).toBe(false);
        expect(settingsBtn.getAttribute('aria-expanded')).toBe('false');
      }

      document.querySelector('.tab-btn[data-tab="history"]').click();
      await flushAsync(10);
      settingsBtn.click();
      expect(tabSettings.classList.contains('active')).toBe(true);
      // Clicking header gear again returns to last workbench tab (history)
      settingsBtn.click();
      expect(document.getElementById('tab-history').classList.contains('active')).toBe(true);

      // Escape returns from Settings to last workbench tab
      document.querySelector('.tab-btn[data-tab="editor"]').click();
      settingsBtn.click();
      expect(tabSettings.classList.contains('active')).toBe(true);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(tabEditor.classList.contains('active')).toBe(true);

      expect(originalInput.value).toBe('Unsaved draft prompt text');

      // Re-dispatching DOMContentLoaded must not bind duplicate handlers
      document.dispatchEvent(new Event('DOMContentLoaded'));
      document.getElementById('btn-enhance').click();
      await flushAsync(30);
      expect(enhanceCallCount).toBe(1);
    });
  });

  describe('2. Provider Selection, Model Registry Rendering & Per-Provider Model Preservation', () => {
    it('supports all 6 providers in #sp-provider, renders ZeusModelRegistry labels, and preserves saved per-provider models', async () => {
      await bootSidePanel({
        syncStore: {
          provider: 'gemini',
          models: {
            gemini: 'gemini-3.5-flash-lite',
            openai: 'gpt-5.3-codex',
            claude: 'claude-opus-4.6',
            openrouter: 'deepseek/deepseek-v3.2'
          }
        },
        localStore: {
          apiKeys: { gemini: 'gem-k', openai: 'oa-k', claude: 'cl-k', openrouter: 'or-k' }
        }
      });

      const spProvider = document.getElementById('sp-provider');
      const spModel = document.getElementById('sp-model');

      const providerValues = Array.from(spProvider.options).map((o) => o.value);
      expect(providerValues).toEqual(['gemini', 'openai', 'claude', 'openrouter', 'ollama', 'auto']);

      // Gemini renders registry names and preserves saved gemini-3.5-flash-lite
      expect(spModel.value).toBe('gemini-3.5-flash-lite');
      const geminiTexts = Array.from(spModel.options).map((o) => o.textContent);
      expect(geminiTexts.some((t) => t.includes('Gemini Flash'))).toBe(true);
      expect(geminiTexts.some((t) => t.includes('Gemini 3.5 Flash-Lite'))).toBe(true);
      expect(spModel.querySelectorAll('optgroup').length).toBeGreaterThan(0);

      // Switch to OpenAI -> preserves gpt-5.3-codex and renders human-readable label
      spProvider.value = 'openai';
      spProvider.dispatchEvent(new Event('change'));
      await flushAsync(30);
      expect(spModel.value).toBe('gpt-5.3-codex');
      expect(document.getElementById('sp-model-display-name').textContent).toBe('GPT-5.3 Codex');

      // Change OpenAI model to gpt-5.4
      spModel.value = 'gpt-5.4';
      spModel.dispatchEvent(new Event('change'));
      await flushAsync(30);
      expect(env.syncStore.models.openai).toBe('gpt-5.4');
      expect(env.syncStore.models.gemini).toBe('gemini-3.5-flash-lite');

      // Switch to Ollama -> hides #sp-model-group, shows #sp-ollama-card
      spProvider.value = 'ollama';
      spProvider.dispatchEvent(new Event('change'));
      await flushAsync(30);
      expect(document.getElementById('sp-model-group').style.display).toBe('none');
      expect(document.getElementById('sp-ollama-card').style.display).toBe('block');
      expect(document.getElementById('sp-key-card').style.display).toBe('none');

      // Switch to Auto -> shows smart routing explanation & per-provider rows
      spProvider.value = 'auto';
      spProvider.dispatchEvent(new Event('change'));
      await flushAsync(30);
      expect(document.getElementById('sp-auto-explanation').style.display).toBe('block');
      expect(document.getElementById('sp-auto-card').style.display).toBe('block');
      expect(document.querySelectorAll('#sp-auto-providers .auto-provider-row')).toHaveLength(5);

      // Switch back to OpenAI -> gpt-5.4 was preserved!
      spProvider.value = 'openai';
      spProvider.dispatchEvent(new Event('change'));
      await flushAsync(30);
      expect(spModel.value).toBe('gpt-5.4');

      // Custom saved model ID outside registry is rendered and preserved
      await globalThis.ZeusSettingsStore.update({ provider: 'claude', models: { claude: 'claude-custom-snapshot-v9' } });
      await flushAsync(40);
      expect(spProvider.value).toBe('claude');
      expect(spModel.value).toBe('claude-custom-snapshot-v9');
      expect(Array.from(spModel.options).some((o) => o.value === 'claude-custom-snapshot-v9' && o.textContent.includes('(saved)'))).toBe(true);
    });
  });

  describe('3. Setup Required Card, Unconfigured Gate, Categorized Errors & Open Options', () => {
    it('toggles #setup-required-card cleanly across unconfigured, configured, and key-removed states', async () => {
      await bootSidePanel();

      const setupCard = document.getElementById('setup-required-card');
      const enhanceBtn = document.getElementById('btn-enhance');
      const errorCard = document.getElementById('enhance-error-card');

      // First run: Gemini with no key -> Setup Required visible
      expect(setupCard.style.display).toBe('block');
      expect(document.getElementById('setup-required-message').textContent).toContain('Gemini API key');

      // Unconfigured click on #btn-enhance prevents doomed enhancePrompt IPC call
      document.getElementById('original-input').value = 'Please optimize this prompt';
      enhanceBtn.click();
      await flushAsync(30);

      expect(env.calls.runtimeSendMessage.some((c) => c.message?.action === 'enhancePrompt')).toBe(false);
      expect(setupCard.style.display).toBe('block');
      expect(errorCard.style.display).toBe('none');
      const toasts = Array.from(document.querySelectorAll('#sidepanel-toast-holder .zeus-toast')).map((t) => t.textContent);
      expect(toasts.some((t) => t.includes('Configure an AI provider'))).toBe(true);
      expect(toasts.some((t) => t.includes('LINK FAILURE'))).toBe(false);

      // Configure Gemini key -> Setup Required hides
      document.getElementById('btn-setup-configure').click();
      expect(document.getElementById('tab-settings').classList.contains('active')).toBe(true);

      document.getElementById('sp-api-key').value = 'AIzaSyConfiguredSetupKey123456';
      document.getElementById('sp-btn-save-key').click();
      await flushAsync(30);
      expect(setupCard.style.display).toBe('none');

      // Remove last usable key -> Setup Required is restored
      document.getElementById('sp-btn-remove-key').click();
      expect(document.getElementById('sp-remove-key-confirm').style.display).toBe('block');
      document.getElementById('sp-btn-confirm-remove').click();
      await flushAsync(30);
      expect(setupCard.style.display).toBe('block');

      // Auto mode without usable provider shows setup card; adding Ollama model hides it
      const spProvider = document.getElementById('sp-provider');
      spProvider.value = 'auto';
      spProvider.dispatchEvent(new Event('change'));
      await flushAsync(30);
      expect(setupCard.style.display).toBe('block');

      await globalThis.ZeusSettingsStore.update({ ollama: { model: 'qwen3:8b' } });
      await flushAsync(30);
      expect(setupCard.style.display).toBe('none');

      // Removing Ollama model restores setup card in Auto mode
      await globalThis.ZeusSettingsStore.update({ ollama: { model: '' } });
      await flushAsync(30);
      expect(setupCard.style.display).toBe('block');
    });

    it('renders categorized #enhance-error-card messages on failed enhance calls and supports dismiss/retry/settings', async () => {
      let nextErrorDetail = null;
      let shouldSucceedOnRetry = false;

      await bootSidePanel({
        localStore: { apiKeys: { gemini: 'AIzaSyConfiguredKey1234567890' } },
        configureListeners: (mockEnv) => {
          mockEnv.listeners.runtimeOnMessage.addListener((msg, _sender, sendResponse) => {
            if (msg?.action === 'enhancePrompt') {
              if (shouldSucceedOnRetry) {
                sendResponse({ success: true, enhancedText: 'Recovered prompt', warnings: [], meta: {} });
              } else {
                sendResponse({
                  success: false,
                  error: nextErrorDetail.userMessage,
                  errorDetail: nextErrorDetail
                });
              }
              return true;
            }
            if (msg?.type === 'sidePanel:saveHistory') {
              sendResponse({ success: true });
              return true;
            }
            return false;
          });
        }
      });

      document.getElementById('original-input').value = 'Analyze architecture';

      const cases = [
        { code: 'AUTH_FAILED', expectedTitle: 'AUTHENTICATION FAILED', userMessage: 'Invalid Gemini API key. Please verify your key in Zeus settings.' },
        { code: 'QUOTA_EXCEEDED', expectedTitle: 'QUOTA EXCEEDED', userMessage: 'Gemini quota or credits are insufficient.' },
        { code: 'RATE_LIMITED', expectedTitle: 'RATE LIMITED', userMessage: 'Gemini rate limit exceeded. Please wait and try again.' },
        { code: 'NETWORK_UNAVAILABLE', expectedTitle: 'NETWORK UNAVAILABLE', userMessage: 'Network issue while contacting Gemini.' },
        { code: 'PROVIDER_UNAVAILABLE', expectedTitle: 'PROVIDER UNAVAILABLE', userMessage: 'Gemini is temporarily unavailable.' },
        { code: 'OLLAMA_ORIGIN_BLOCKED', expectedTitle: 'OLLAMA ORIGIN BLOCKED', userMessage: 'Ollama blocked extension origin.' }
      ];

      for (const item of cases) {
        nextErrorDetail = { code: item.code, category: item.code, provider: 'gemini', userMessage: item.userMessage };
        document.getElementById('btn-enhance').click();
        await flushAsync(30);

        const errorCard = document.getElementById('enhance-error-card');
        expect(errorCard.style.display).toBe('block');
        expect(document.getElementById('enhance-error-title').textContent).toBe(item.expectedTitle);
        expect(document.getElementById('enhance-error-message').textContent).toBe(item.userMessage);
      }

      // Open Settings button on error card navigates to Settings
      document.getElementById('btn-error-settings').click();
      expect(document.getElementById('tab-settings').classList.contains('active')).toBe(true);
      document.getElementById('btn-back-to-enhance').click();

      // Retry button recovers and hides error card
      shouldSucceedOnRetry = true;
      document.getElementById('btn-error-retry').click();
      await flushAsync(30);
      expect(document.getElementById('enhance-error-card').style.display).toBe('none');
      expect(document.getElementById('enhanced-output').value).toBe('Recovered prompt');

      // Dismiss button closes error card
      shouldSucceedOnRetry = false;
      nextErrorDetail = { code: 'TIMEOUT', category: 'TIMEOUT', provider: 'gemini', userMessage: 'Request timed out.' };
      document.getElementById('btn-enhance').click();
      await flushAsync(30);
      expect(document.getElementById('enhance-error-card').style.display).toBe('block');
      document.getElementById('btn-error-dismiss').click();
      expect(document.getElementById('enhance-error-card').style.display).toBe('none');
    });

    it('calls chrome.runtime.openOptionsPage() and falls back to chrome.tabs.create when unavailable or failing', async () => {
      await bootSidePanel();

      document.getElementById('sp-btn-open-options').click();
      expect(env.calls.openOptionsPage).toBe(1);
      expect(env.calls.tabsCreate).toHaveLength(0);

      // Fallback when openOptionsPage triggers runtime.lastError
      env.chrome.runtime.openOptionsPage = vi.fn((cb) => {
        env.chrome.runtime.lastError = new Error('Options page failed');
        if (typeof cb === 'function') cb();
        env.chrome.runtime.lastError = null;
      });
      document.getElementById('btn-setup-advanced').click();
      expect(env.calls.tabsCreate).toEqual([{ url: `chrome-extension://${env.chrome.runtime.id}/options.html` }]);

      // Fallback when openOptionsPage is unavailable
      delete env.chrome.runtime.openOptionsPage;
      document.getElementById('sp-btn-open-options').click();
      expect(env.calls.tabsCreate).toHaveLength(2);
    });
  });

  describe('4. API Key Security & Lifecycle, Storage Errors, Preferences & Ollama Discovery', () => {
    it('enforces write-only key lifecycle: save, replace, cancel/confirm removal, blank input safety, sibling preservation, and write-error handling', async () => {
      await bootSidePanel({
        syncStore: { provider: 'gemini' },
        localStore: {
          apiKeys: {
            gemini: '',
            openai: 'sk-sibling-openai-keep-me',
            claude: 'sk-sibling-claude-keep-me',
            openrouter: ''
          }
        }
      });

      const keyInput = document.getElementById('sp-api-key');
      const keyStatus = document.getElementById('sp-key-status');
      const saveKeyBtn = document.getElementById('sp-btn-save-key');
      const removeKeyBtn = document.getElementById('sp-btn-remove-key');
      const confirmBox = document.getElementById('sp-remove-key-confirm');
      const toggleKeyBtn = document.getElementById('sp-btn-toggle-key');

      // Initial state: zero raw sibling keys anywhere in DOM or getPublic()
      expect(keyInput.value).toBe('');
      expect(keyStatus.textContent).toBe('Not configured');
      expect(removeKeyBtn.style.display).toBe('none');
      const pub = await globalThis.ZeusSettingsStore.getPublic();
      expect(pub.apiKeys).toBeUndefined();
      expect(JSON.stringify(pub)).not.toContain('sk-sibling-openai-keep-me');

      // Blank input save attempt must NOT overwrite or call update
      keyInput.value = '   ';
      saveKeyBtn.click();
      await flushAsync(20);
      expect(env.localStore.apiKeys.gemini).toBe('');
      expect(env.localStore.apiKeys.openai).toBe('sk-sibling-openai-keep-me');

      // First-time save
      const firstKey = 'AIzaSyFirstGeminiKey1234567890';
      keyInput.value = firstKey;
      toggleKeyBtn.click();
      expect(keyInput.type).toBe('text');
      expect(toggleKeyBtn.textContent).toBe('Hide');

      saveKeyBtn.click();
      await flushAsync(30);

      expect(env.localStore.apiKeys.gemini).toBe(firstKey);
      expect(env.localStore.apiKeys.openai).toBe('sk-sibling-openai-keep-me');
      expect(env.localStore.apiKeys.claude).toBe('sk-sibling-claude-keep-me');
      expect(env.syncStore.apiKeys).toBeUndefined();
      expect(keyInput.value).toBe('');
      expect(keyInput.type).toBe('password');
      expect(keyStatus.textContent).toBe('API key configured');
      expect(saveKeyBtn.textContent).toBe('Replace Key');
      expect(removeKeyBtn.style.display).toBe('inline-block');

      // Replace existing key
      const secondKey = 'AIzaSyReplacedGeminiKey09876543';
      keyInput.value = secondKey;
      saveKeyBtn.click();
      await flushAsync(30);
      expect(env.localStore.apiKeys.gemini).toBe(secondKey);
      expect(keyInput.value).toBe('');

      // Cancel removal keeps saved key intact
      removeKeyBtn.click();
      expect(confirmBox.style.display).toBe('block');
      document.getElementById('sp-btn-cancel-remove').click();
      expect(confirmBox.style.display).toBe('none');
      expect(env.localStore.apiKeys.gemini).toBe(secondKey);

      // Storage write failure prevents false "saved successfully" toast
      const origLocalSet = env.chrome.storage.local.set;
      env.chrome.storage.local.set = vi.fn((_payload, cb) => {
        env.chrome.runtime.lastError = new Error('Storage quota failed');
        if (typeof cb === 'function') cb();
      });

      document.getElementById('sidepanel-toast-holder').replaceChildren();
      keyInput.value = 'AIzaSyShouldFailWrite1234567';
      saveKeyBtn.click();
      await flushAsync(30);

      const errorToasts = Array.from(document.querySelectorAll('#sidepanel-toast-holder .zeus-toast')).map((el) => el.textContent);
      expect(errorToasts.some((t) => /saved successfully/i.test(t))).toBe(false);
      expect(errorToasts.some((t) => /Storage quota failed|Failed to save/i.test(t))).toBe(true);
      expect(env.localStore.apiKeys.gemini).toBe(secondKey);
      env.chrome.storage.local.set = origLocalSet;

      // Confirm removal clears ONLY gemini key and preserves siblings
      removeKeyBtn.click();
      document.getElementById('sp-btn-confirm-remove').click();
      await flushAsync(30);

      expect(env.localStore.apiKeys.gemini).toBe('');
      expect(env.localStore.apiKeys.openai).toBe('sk-sibling-openai-keep-me');
      expect(env.localStore.apiKeys.claude).toBe('sk-sibling-claude-keep-me');
      expect(keyStatus.textContent).toBe('Not configured');
    });

    it('persists preferences controls (copilotEnabled, copilotProvider, copilotMode, copilotMaxTokens clamping, redactionEnabled, sidePanelEnabled)', async () => {
      await bootSidePanel({ localStore: { apiKeys: { gemini: 'gem-k' } } });

      const copilotEnabled = document.getElementById('sp-copilot-enabled');
      const copilotProvider = document.getElementById('sp-copilot-provider');
      const copilotMode = document.getElementById('sp-copilot-mode');
      const copilotMaxTokens = document.getElementById('sp-copilot-max-tokens');
      const redactionEnabled = document.getElementById('sp-redaction-enabled');
      const sidePanelEnabled = document.getElementById('sp-sidepanel-enabled');

      copilotEnabled.checked = true;
      copilotEnabled.dispatchEvent(new Event('change'));
      await flushAsync(20);
      expect(env.syncStore.copilotEnabled).toBe(true);

      copilotProvider.value = 'claude';
      copilotProvider.dispatchEvent(new Event('change'));
      await flushAsync(20);
      expect(env.syncStore.copilotProvider).toBe('claude');

      copilotMode.value = 'aggressive';
      copilotMode.dispatchEvent(new Event('change'));
      await flushAsync(20);
      expect(env.syncStore.copilotMode).toBe('aggressive');

      copilotMaxTokens.value = '999';
      copilotMaxTokens.dispatchEvent(new Event('change'));
      await flushAsync(20);
      expect(env.syncStore.copilotMaxTokens).toBe(250);
      expect(copilotMaxTokens.value).toBe('250');

      copilotMaxTokens.value = '2';
      copilotMaxTokens.dispatchEvent(new Event('change'));
      await flushAsync(20);
      expect(env.syncStore.copilotMaxTokens).toBe(10);
      expect(copilotMaxTokens.value).toBe('10');

      redactionEnabled.checked = false;
      redactionEnabled.dispatchEvent(new Event('change'));
      await flushAsync(20);
      expect(env.syncStore.redactionEnabled).toBe(false);

      sidePanelEnabled.checked = false;
      sidePanelEnabled.dispatchEvent(new Event('change'));
      await flushAsync(20);
      expect(env.syncStore.sidePanelEnabled).toBe(false);
    });

    it('handles Ollama model discovery, scoped CORS guidance, and Test Connection readiness states', async () => {
      let discoverResponse = {
        success: true,
        reachable: true,
        originBlocked: false,
        models: ['qwen3:8b', 'llama4']
      };
      let testConnResponse = {
        success: true,
        result: { ok: true, provider: 'ollama', state: 'verified', statusLabel: 'Connection verified' },
        readiness: {
          activeProvider: 'ollama',
          activeState: 'verified',
          usable: true,
          statusLabel: 'Connection verified',
          userMessage: 'Ollama connected.',
          providers: { ollama: { provider: 'ollama', configured: true, state: 'verified', statusLabel: 'Connection verified', usable: true } }
        }
      };

      await bootSidePanel({
        syncStore: { provider: 'ollama', ollama: { host: 'http://localhost:11434', model: '' } },
        configureListeners: (mockEnv) => {
          mockEnv.listeners.runtimeOnMessage.addListener((msg, _sender, sendResponse) => {
            if (msg?.action === 'discoverOllamaModels') {
              sendResponse(discoverResponse);
              return true;
            }
            if (msg?.action === 'testConnection') {
              sendResponse(testConnResponse);
              return true;
            }
            return false;
          });
        }
      });

      // Detect Models fills empty model input and renders chips
      document.getElementById('sp-btn-detect-ollama').click();
      await flushAsync(30);
      expect(document.getElementById('sp-ollama-model').value).toBe('qwen3:8b');
      expect(env.syncStore.ollama.model).toBe('qwen3:8b');
      expect(Array.from(document.querySelectorAll('#sp-ollama-discovered .ollama-chip')).map((c) => c.textContent)).toEqual([
        'qwen3:8b',
        'llama4'
      ]);

      // Test Connection -> Connection verified
      document.getElementById('sp-btn-test').click();
      await flushAsync(30);
      expect(document.getElementById('sp-readiness-label').textContent).toBe('Connection verified');
      expect(document.getElementById('sidepanel-readiness-text').textContent).toContain('Connection verified');

      // Origin blocked shows scoped CORS command with zero wildcard
      discoverResponse = {
        success: false,
        reachable: false,
        originBlocked: true,
        error: `Ollama blocked extension origin 'chrome-extension://${env.chrome.runtime.id}'.`
      };
      document.getElementById('sp-btn-detect-ollama').click();
      await flushAsync(30);
      expect(document.getElementById('sp-ollama-cors-help').style.display).toBe('block');
      const corsCmd = document.getElementById('sp-ollama-cors-cmd').value;
      expect(corsCmd).toContain(`chrome-extension://${env.chrome.runtime.id}`);
      expect(corsCmd).not.toContain('*');

      // Auth failed and rate limited testConnection updates readiness UI
      testConnResponse = {
        success: false,
        result: { ok: false, provider: 'ollama', state: 'error', code: 'RATE_LIMITED', statusLabel: 'Rate limited', userMessage: 'Too many requests' },
        readiness: {
          activeProvider: 'ollama',
          activeState: 'error',
          code: 'RATE_LIMITED',
          usable: true,
          statusLabel: 'Rate limited',
          userMessage: 'Too many requests',
          providers: { ollama: { provider: 'ollama', configured: true, state: 'error', code: 'RATE_LIMITED', statusLabel: 'Rate limited', usable: true } }
        }
      };
      document.getElementById('sp-btn-test').click();
      await flushAsync(30);
      expect(document.getElementById('sp-readiness-label').textContent).toBe('Rate limited');
    });

    it('preserves existing Insert, Copy, and History restore/purge functionality alongside Settings', async () => {
      const storedHistory = [
        { original: 'First draft', enhanced: 'First enhanced', timestamp: 1732530000000, url: 'https://chatgpt.com/' }
      ];

      await bootSidePanel({
        localStore: { apiKeys: { gemini: 'gem-ok' } },
        configureListeners: (mockEnv) => {
          mockEnv.listeners.runtimeOnMessage.addListener((msg, _sender, sendResponse) => {
            if (msg?.action === 'enhancePrompt') {
              sendResponse({ success: true, enhancedText: 'Enhanced output value', warnings: [], meta: {} });
              return true;
            }
            if (msg?.type === 'sidePanel:setInputValue') {
              sendResponse({ success: true });
              return true;
            }
            if (msg?.type === 'sidePanel:saveHistory') {
              storedHistory.push(msg.entry);
              sendResponse({ success: true });
              return true;
            }
            if (msg?.type === 'sidePanel:getHistory') {
              sendResponse({ history: storedHistory });
              return true;
            }
            if (msg?.type === 'sidePanel:getTemplates') {
              sendResponse({ templates: [] });
              return true;
            }
            return false;
          });
        }
      });

      document.getElementById('original-input').value = 'Draft input';
      document.getElementById('btn-enhance').click();
      await flushAsync(30);

      expect(document.getElementById('enhanced-output').value).toBe('Enhanced output value');
      document.getElementById('btn-insert').click();
      await flushAsync(20);
      expect(env.calls.runtimeSendMessage.some((c) => c.message?.type === 'sidePanel:setInputValue' && c.message?.value === 'Enhanced output value')).toBe(true);

      document.getElementById('btn-copy').click();
      await flushAsync(10);
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Enhanced output value');

      // Switch to History and restore the first entry
      document.querySelector('.tab-btn[data-tab="history"]').click();
      await flushAsync(20);
      const restoreButtons = document.querySelectorAll('#history-list .history-actions .zeus-btn-cyan');
      expect(restoreButtons.length).toBe(2);
      restoreButtons[1].click();
      expect(document.getElementById('original-input').value).toBe('First draft');
      expect(document.getElementById('enhanced-output').value).toBe('First enhanced');
      expect(document.getElementById('tab-editor').classList.contains('active')).toBe(true);
    });

    it('supports Auto-mode per-provider Configure/Test buttons, Enter-to-save key, Ctrl+Enter enhance shortcut, and Ollama chip selection with host sanitization', async () => {
      const testCalls = [];
      await bootSidePanel({
        syncStore: { provider: 'auto' },
        localStore: { apiKeys: { gemini: 'gem-auto-key', openai: '', claude: '', openrouter: '' } },
        configureListeners: (mockEnv) => {
          mockEnv.listeners.runtimeOnMessage.addListener((msg, _sender, sendResponse) => {
            if (msg?.action === 'testConnection') {
              testCalls.push(msg.provider);
              sendResponse({
                success: true,
                result: { ok: true, provider: msg.provider, state: 'verified', statusLabel: 'Connection verified' },
                readiness: {
                  activeProvider: 'auto',
                  activeState: 'verified',
                  usable: true,
                  statusLabel: 'Connection verified',
                  providers: {
                    gemini: { provider: 'gemini', configured: true, state: 'verified', statusLabel: 'Connection verified', usable: true },
                    openai: { provider: 'openai', configured: false, state: 'not_configured', statusLabel: 'Not configured', usable: false }
                  }
                }
              });
              return true;
            }
            if (msg?.action === 'enhancePrompt') {
              sendResponse({ success: true, enhancedText: 'Enhanced via Ctrl+Enter', warnings: [], meta: {} });
              return true;
            }
            if (msg?.type === 'sidePanel:saveHistory') {
              sendResponse({ success: true });
              return true;
            }
            return false;
          });
        }
      });

      document.getElementById('btn-open-settings').click();
      const rows = Array.from(document.querySelectorAll('#sp-auto-providers .auto-provider-row'));
      expect(rows).toHaveLength(5);

      // Click Test on configured Gemini row in Auto mode
      const geminiTestBtn = rows[0].querySelector('.zeus-btn-yellow');
      expect(geminiTestBtn).not.toBeNull();
      geminiTestBtn.click();
      await flushAsync(30);
      expect(testCalls).toEqual(['gemini']);

      // Click Configure on OpenAI row -> targets key card to OpenAI and Enter key saves it
      const openaiConfigBtn = rows[1].querySelector('.zeus-btn-cyan');
      openaiConfigBtn.click();
      expect(document.getElementById('sp-key-title').textContent).toContain('OPENAI API KEY');

      const keyInput = document.getElementById('sp-api-key');
      keyInput.value = 'sk-openai-auto-enter-key';
      keyInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await flushAsync(30);
      expect(env.localStore.apiKeys.openai).toBe('sk-openai-auto-enter-key');
      expect(keyInput.value).toBe('');

      // Click Configure on Ollama row in Auto mode -> opens Ollama card; invalid host normalizes to default; chip click saves model
      const ollamaConfigBtn = rows[4].querySelector('.zeus-btn-cyan');
      ollamaConfigBtn.click();
      expect(document.getElementById('sp-ollama-card').style.display).toBe('block');

      const hostInput = document.getElementById('sp-ollama-host');
      hostInput.value = 'javascript:alert(1)';
      hostInput.dispatchEvent(new Event('change'));
      await flushAsync(30);
      expect(env.syncStore.ollama.host).toBe('http://localhost:11434');

      const firstChip = document.querySelector('#sp-ollama-discovered .ollama-chip');
      expect(firstChip).not.toBeNull();
      const chipModel = firstChip.textContent;
      firstChip.click();
      await flushAsync(30);
      expect(env.syncStore.ollama.model).toBe(chipModel);

      // Ctrl+Enter in #original-input triggers enhancement
      document.getElementById('btn-back-to-enhance').click();
      const origInput = document.getElementById('original-input');
      origInput.value = 'Shortcut prompt';
      origInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
      await flushAsync(30);
      expect(document.getElementById('enhanced-output').value).toBe('Enhanced via Ctrl+Enter');
    });
  });
});
