const { createChromeMock } = require('../mocks/chrome');
const { loadScript, clearZeusGlobals } = require('../utils/runtime');

function makeJsonResponse(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => data
  };
}

function sendBackgroundMessage(listener, message, sender = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error(`Timed out waiting for ${message?.action || message?.type}`));
      }
    }, 1500);

    const sendResponse = (payload) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(payload);
    };

    const handled = listener(message, sender, sendResponse);
    if (!handled && !settled) {
      settled = true;
      clearTimeout(timer);
      resolve(undefined);
    }
  });
}

describe('Diagnostics, MessageHandler, PromptEngine & PromptClient Integration', () => {
  let env;

  beforeEach(() => {
    clearZeusGlobals();
    env = createChromeMock({
      syncStore: {
        schemaVersion: 3,
        provider: 'gemini',
        sidePanelEnabled: true,
        models: {
          gemini: 'gemini-flash-latest',
          openai: 'gpt-5.4-mini',
          claude: 'claude-sonnet-4.6',
          openrouter: 'openai/gpt-5.4'
        },
        ollama: {
          host: 'http://localhost:11434',
          model: ''
        }
      },
      localStore: {
        apiKeys: {
          gemini: '',
          openai: '',
          claude: '',
          openrouter: ''
        }
      }
    });
    env.calls.sidePanelSetPanelBehavior = [];
    env.chrome.sidePanel = {
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      setPanelBehavior: vi.fn((opts) => {
        env.calls.sidePanelSetPanelBehavior.push(opts);
        return Promise.resolve();
      })
    };
    env.chrome.contextMenus.removeAll = vi.fn((cb) => { if (cb) cb(); });
    env.chrome.commands = { onCommand: { addListener: vi.fn() } };

    globalThis.chrome = env.chrome;
    globalThis.fetch = vi.fn();

    loadScript('model-registry.js');
    loadScript('settings/settingsStore.js');
    loadScript('core/retry.js');
    loadScript('core/prompts.js');
    loadScript('core/errors.js');
    loadScript('core/telemetry.js');
    loadScript('core/providerTransport.js');
    loadScript('providers/utils.js');
    loadScript('providers/gemini.js');
    loadScript('providers/openai.js');
    loadScript('providers/claude.js');
    loadScript('providers/openrouter.js');
    loadScript('providers/ollama.js');
    loadScript('core/redactor.js');
    loadScript('core/router.js');
    loadScript('core/promptEngine.js');
    loadScript('core/providerDiagnostics.js');
    loadScript('core/promptClient.js');
    loadScript('messaging/messageHandler.js');
  });

  afterEach(() => {
    globalThis.ZeusProviderDiagnostics?.clearAllStatuses?.();
    delete globalThis.fetch;
    delete globalThis.chrome;
    clearZeusGlobals();
  });

  it('enforces privileged sender guard on testConnection and discoverOllamaModels', async () => {
    const bgListener = env.listeners.runtimeOnMessage.listeners[0];
    const untrustedTabSender = { tab: { id: 42 }, url: 'https://chatgpt.com/c/123' };

    const deniedTest = await sendBackgroundMessage(bgListener, { action: 'testConnection', provider: 'gemini' }, untrustedTabSender);
    expect(deniedTest.success).toBe(false);
    expect(deniedTest.error).toMatch(/unauthorized/i);

    const deniedDiscover = await sendBackgroundMessage(bgListener, { action: 'discoverOllamaModels' }, untrustedTabSender);
    expect(deniedDiscover.success).toBe(false);
    expect(deniedDiscover.error).toMatch(/unauthorized/i);

    const extensionTabSender = {
      tab: { id: 99 },
      url: `chrome-extension://${env.chrome.runtime.id}/options.html`
    };
    const allowedReadiness = await sendBackgroundMessage(bgListener, { action: 'testConnection', provider: 'gemini' }, extensionTabSender);
    expect(allowedReadiness.success).toBe(false);
    expect(allowedReadiness.result.code).toBe('NOT_CONFIGURED');
  });

  it('flows getProviderReadiness, testConnection (x-goog-api-key header + readinessUpdated), and discoverOllamaModels end-to-end', async () => {
    const bgListener = env.listeners.runtimeOnMessage.listeners[0];
    const secretGemKey = 'AIzaSyIntegrationTestKey1234567890';

    // 1. Initial readiness -> not_configured
    const initial = await sendBackgroundMessage(bgListener, { action: 'getProviderReadiness' });
    expect(initial.success).toBe(true);
    expect(initial.readiness.activeState).toBe('not_configured');
    expect(initial.readiness.usable).toBe(false);

    // 2. Save key via SettingsStore -> configured_untested
    await globalThis.ZeusSettingsStore.update({ apiKeys: { gemini: secretGemKey } });
    await new Promise((r) => setTimeout(r, 15));

    const configured = await sendBackgroundMessage(bgListener, { action: 'getProviderReadiness' });
    expect(configured.success).toBe(true);
    expect(configured.readiness.activeState).toBe('configured_untested');
    expect(configured.readiness.usable).toBe(true);
    expect(JSON.stringify(configured)).not.toContain(secretGemKey);

    // 3. testConnection -> probes Gemini via header, emits readinessUpdated, zero leaked key
    globalThis.fetch.mockResolvedValueOnce(makeJsonResponse(200, { name: 'models/gemini-flash-latest' }));
    const testRes = await sendBackgroundMessage(bgListener, {
      action: 'testConnection',
      provider: 'gemini',
      apiKey: 'attacker-override-ignored'
    });

    expect(testRes.success).toBe(true);
    expect(testRes.result.state).toBe('verified');
    expect(testRes.readiness.activeState).toBe('verified');
    expect(JSON.stringify(testRes)).not.toContain(secretGemKey);
    expect(globalThis.fetch.mock.calls[0][0]).not.toContain(secretGemKey);
    expect(globalThis.fetch.mock.calls[0][1].headers['x-goog-api-key']).toBe(secretGemKey);

    const readinessBroadcast = env.calls.runtimeSendMessage.find(
      (entry) => entry.message?.action === 'readinessUpdated'
    )?.message;
    expect(readinessBroadcast).toBeDefined();
    expect(readinessBroadcast.readiness.activeState).toBe('verified');
    expect(JSON.stringify(readinessBroadcast)).not.toContain(secretGemKey);

    // 4. discoverOllamaModels -> returns models on success, OLLAMA_ORIGIN_BLOCKED errorDetail on 403
    globalThis.fetch
      .mockResolvedValueOnce(makeJsonResponse(200, { version: '0.6.3' }))
      .mockResolvedValueOnce(makeJsonResponse(200, { models: [{ model: 'qwen3:8b' }] }))
      .mockResolvedValueOnce(makeJsonResponse(200, { models: [{ name: 'qwen3:8b' }, { name: 'llama4' }] }));

    const ollamaDisc = await sendBackgroundMessage(bgListener, { action: 'discoverOllamaModels' });
    expect(ollamaDisc.success).toBe(true);
    expect(ollamaDisc.models).toEqual(['qwen3:8b', 'llama4']);

    globalThis.fetch.mockResolvedValueOnce(makeJsonResponse(403, { error: 'Origin denied' }));
    const ollamaBlocked = await sendBackgroundMessage(bgListener, { action: 'discoverOllamaModels' });
    expect(ollamaBlocked.success).toBe(false);
    expect(ollamaBlocked.originBlocked).toBe(true);
    expect(ollamaBlocked.errorDetail.code).toBe('OLLAMA_ORIGIN_BLOCKED');
  });

  it('propagates NOT_CONFIGURED and AUTH_FAILED errorDetail from PromptEngine through messageHandler to PromptClient.enhance()', async () => {
    // 1. Unconfigured Gemini -> NOT_CONFIGURED
    let caught = null;
    try {
      await globalThis.ZeusPromptClient.enhance('Rewrite my prompt');
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    expect(caught.code).toBe('NOT_CONFIGURED');
    expect(caught.provider).toBe('gemini');
    expect(caught.errorDetail?.code).toBe('NOT_CONFIGURED');
    expect(globalThis.fetch).not.toHaveBeenCalled();

    // 2. Configured invalid key -> 401 AUTH_FAILED without leaking key
    const invalidKey = 'AIzaSyWrongKeyMustNeverLeak123456';
    await globalThis.ZeusSettingsStore.update({ apiKeys: { gemini: invalidKey } });
    globalThis.fetch.mockResolvedValueOnce(
      makeJsonResponse(401, { error: { message: `API key ${invalidKey} rejected` } })
    );

    let authErr = null;
    try {
      await globalThis.ZeusPromptClient.enhance('Rewrite my prompt');
    } catch (err) {
      authErr = err;
    }

    expect(authErr).toBeInstanceOf(Error);
    expect(authErr.code).toBe('AUTH_FAILED');
    expect(authErr.provider).toBe('gemini');
    expect(authErr.retryable).toBe(false);
    expect(authErr.errorDetail?.code).toBe('AUTH_FAILED');
    expect(authErr.message).not.toContain(invalidKey);
    expect(JSON.stringify(authErr.errorDetail)).not.toContain(invalidKey);
  });

  it('invalidates diagnostics/settings cache on chrome.storage.onChanged, syncs sidePanelEnabled, notifies tabs without apiKeys, and ignores unrelated keys', async () => {
    const bgListener = env.listeners.runtimeOnMessage.listeners[0];
    const secretKey = 'AIzaSyLiveStorageChangeSecret1234';

    await globalThis.ZeusSettingsStore.update({ apiKeys: { gemini: secretKey } });
    globalThis.fetch.mockResolvedValueOnce(makeJsonResponse(200, { name: 'models/gemini-flash-latest' }));
    await sendBackgroundMessage(bgListener, { action: 'testConnection', provider: 'gemini' });
    expect((await globalThis.ZeusProviderDiagnostics.getReadinessSummary()).activeState).toBe('verified');

    env.calls.runtimeSendMessage.length = 0;
    env.calls.tabsSendMessage.length = 0;

    // Trigger unrelated local key change (history) -> must NOT invalidate readiness or broadcast settingsUpdated
    await env.chrome.storage.local.set({ zeus_prompt_history: [{ original: 'hi', enhanced: 'hello' }] });
    await new Promise((r) => setTimeout(r, 15));
    expect((await globalThis.ZeusProviderDiagnostics.getReadinessSummary()).activeState).toBe('verified');
    expect(env.calls.runtimeSendMessage.some((e) => e.message?.action === 'settingsUpdated')).toBe(false);

    // Trigger relevant sync key change -> invalidates readiness / updates sidePanelEnabled / broadcasts without apiKeys
    await env.chrome.storage.sync.set({
      provider: 'openai',
      sidePanelEnabled: false,
      models: {
        gemini: 'gemini-3.5-flash-lite',
        openai: 'gpt-5.4-mini',
        claude: 'claude-sonnet-4.6',
        openrouter: 'openai/gpt-5.4'
      }
    });
    await new Promise((r) => setTimeout(r, 25));

    expect(env.calls.sidePanelSetPanelBehavior.at(-1)).toEqual({ openPanelOnActionClick: false });
    const bgBroadcast = env.calls.runtimeSendMessage.find((e) => e.message?.action === 'settingsUpdated')?.message;
    expect(bgBroadcast).toBeDefined();
    expect(bgBroadcast.source).toBe('background');
    expect(bgBroadcast.settings.provider).toBe('openai');
    expect(bgBroadcast.settings.apiKeys).toBeUndefined();
    expect(bgBroadcast.settings.hasApiKey.gemini).toBe(true);
    expect(bgBroadcast.readiness.providers.gemini.state).toBe('configured_untested');
    expect(JSON.stringify(bgBroadcast)).not.toContain(secretKey);

    const tabBroadcast = env.calls.tabsSendMessage.find((e) => e.message?.action === 'settingsUpdated')?.message;
    expect(tabBroadcast).toBeDefined();
    expect(tabBroadcast.settings.apiKeys).toBeUndefined();
    expect(JSON.stringify(tabBroadcast)).not.toContain(secretKey);

    // Re-receiving source: 'background' settingsUpdated in messageHandler must NOT recurse into notifyTabsOfUpdate
    const tabCountBefore = env.calls.tabsSendMessage.length;
    await sendBackgroundMessage(bgListener, bgBroadcast);
    expect(env.calls.tabsSendMessage.length).toBe(tabCountBefore);
  });
});
