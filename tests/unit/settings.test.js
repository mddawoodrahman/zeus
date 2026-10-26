const { createChromeMock } = require('../mocks/chrome');
const { loadScript, clearZeusGlobals } = require('../utils/runtime');

describe('ZeusSettings', () => {
  let env;

  beforeEach(() => {
    clearZeusGlobals();
    env = createChromeMock();
    globalThis.chrome = env.chrome;

    loadScript('model-registry.js');
    loadScript('settings/settings.js');
  });

  afterEach(() => {
    delete globalThis.chrome;
    clearZeusGlobals();
  });

  it('migrates legacy storage keys into canonical settings', () => {
    const migrated = globalThis.ZeusSettings.migrateSettings({
      zeus_selected_provider: 'openrouter',
      zeus_openrouter_api_key: 'legacy-openrouter-key',
      zeus_provider_configs: {
        openrouter: {
          model: 'google/gemini-3-pro'
        }
      }
    });

    expect(migrated.provider).toBe('openrouter');
    expect(migrated.apiKeys.openrouter).toBe('legacy-openrouter-key');
    expect(migrated.models.openrouter).toBe('google/gemini-3-pro');
  });

  it('normalizes unsupported providers to defaults', () => {
    const normalized = globalThis.ZeusSettings.normalizeSettings({
      provider: 'unsupported-provider',
      models: {
        openai: ''
      }
    });

    expect(normalized.provider).toBe('gemini');
    expect(normalized.models.openai).toBe(globalThis.ZeusModelRegistry.getDefaultModel('openai'));
  });

  it('serializes canonical and legacy-compatible non-sensitive keys while scrubbing credentials by default', () => {
    const payload = globalThis.ZeusSettings.serializeSettings({
      provider: 'claude',
      apiKeys: {
        claude: 'claude-test-key'
      },
      models: {
        claude: 'claude-sonnet-4.6'
      },
      customProviders: [
        { id: 'cp-test', name: 'Custom', baseUrl: 'http://localhost:8000', apiKey: 'custom-secret' }
      ]
    });

    expect(payload.provider).toBe('claude');
    expect(payload.zeus_selected_provider).toBe('claude');
    expect(payload.models.claude).toBe('claude-sonnet-4.6');
    expect(payload.zeus_claude_model).toBe('claude-sonnet-4.6');

    // Sensitive credentials must be stripped in sync serialization
    expect(payload.apiKeys.claude).toBe('');
    expect(payload.zeus_claude_api_key).toBeUndefined();
    expect(payload.customProviders[0].apiKey).toBe('');

    // Explicit opt-in supports in-memory credential serialization when requested
    const fullPayload = globalThis.ZeusSettings.serializeSettings({
      provider: 'claude',
      apiKeys: {
        claude: 'claude-test-key'
      },
      models: {
        claude: 'claude-sonnet-4.6'
      }
    }, { includeCredentials: true });

    expect(fullPayload.apiKeys.claude).toBe('claude-test-key');
    expect(fullPayload.zeus_claude_api_key).toBe('claude-test-key');
  });

  it('saveSettings does not mirror credentials into sync storage and stores them exclusively in local storage', async () => {
    const saveResult = await globalThis.ZeusSettings.saveSettings({
      provider: 'openai',
      apiKeys: {
        openai: 'sk-secret-openai-key'
      },
      models: {
        openai: 'gpt-5.4-mini'
      },
      customProviders: [
        { id: 'custom-local', name: 'Local LM', baseUrl: 'http://localhost:1234', apiKey: 'bearer-token-123' }
      ]
    });

    // In-memory returned settings retain access
    expect(saveResult.settings.apiKeys.openai).toBe('sk-secret-openai-key');
    expect(saveResult.settings.customProviders[0].apiKey).toBe('bearer-token-123');

    // Sync storage must NEVER contain API keys
    const syncData = await new Promise((resolve) => env.chrome.storage.sync.get(null, resolve));
    expect(syncData.zeus_openai_api_key).toBeUndefined();
    expect(syncData.apiKeys.openai).toBe('');
    expect(syncData.customProviders[0].apiKey).toBe('');
    expect(syncData.provider).toBe('openai');
    expect(syncData.models.openai).toBe('gpt-5.4-mini');

    // Local storage must contain the secure credentials
    const localData = await new Promise((resolve) => env.chrome.storage.local.get([globalThis.ZeusSettings.CREDENTIALS_KEY], resolve));
    const creds = localData[globalThis.ZeusSettings.CREDENTIALS_KEY];
    expect(creds.apiKeys.openai).toBe('sk-secret-openai-key');
    expect(creds.customApiKeys['custom-local']).toBe('bearer-token-123');
  });

  it('safely migrates existing legacy sync credentials to local storage and purges sync copies after verification', async () => {
    // Seed legacy credentials in sync storage
    env.sync.__seed({
      provider: 'gemini',
      zeus_gemini_api_key: 'legacy-gemini-token',
      zeus_selected_provider: 'gemini',
      models: { gemini: 'gemini-3-flash' },
      customProviders: [
        { id: 'cp-migrated', name: 'Custom vLLM', baseUrl: 'http://localhost:8000', apiKey: 'vllm-secret-key' }
      ]
    });

    const loaded = await globalThis.ZeusSettings.loadSettings();

    // Loaded settings received the migrated keys
    expect(loaded.apiKeys.gemini).toBe('legacy-gemini-token');
    expect(loaded.customProviders[0].apiKey).toBe('vllm-secret-key');

    // Local storage has them verified and persisted
    const localData = await new Promise((resolve) => env.chrome.storage.local.get([globalThis.ZeusSettings.CREDENTIALS_KEY], resolve));
    const creds = localData[globalThis.ZeusSettings.CREDENTIALS_KEY];
    expect(creds.apiKeys.gemini).toBe('legacy-gemini-token');
    expect(creds.customApiKeys['cp-migrated']).toBe('vllm-secret-key');

    // Sync storage has been scrubbed of the legacy credentials
    const syncData = await new Promise((resolve) => env.chrome.storage.sync.get(null, resolve));
    expect(syncData.zeus_gemini_api_key).toBeUndefined();
    expect(syncData.customProviders[0].apiKey).toBeFalsy();
  });

  it('repeated migration is idempotent and retains credentials', async () => {
    env.sync.__seed({
      provider: 'claude',
      zeus_claude_api_key: 'claude-secret-1',
      models: { claude: 'claude-sonnet-4.6' }
    });

    const firstLoad = await globalThis.ZeusSettings.loadSettings();
    expect(firstLoad.apiKeys.claude).toBe('claude-secret-1');

    const secondLoad = await globalThis.ZeusSettings.loadSettings();
    expect(secondLoad.apiKeys.claude).toBe('claude-secret-1');

    const localData = await new Promise((resolve) => env.chrome.storage.local.get([globalThis.ZeusSettings.CREDENTIALS_KEY], resolve));
    expect(localData[globalThis.ZeusSettings.CREDENTIALS_KEY].apiKeys.claude).toBe('claude-secret-1');

    const syncData = await new Promise((resolve) => env.chrome.storage.sync.get(null, resolve));
    expect(syncData.zeus_claude_api_key).toBeUndefined();
  });

  it('storage failure during migration prevents silent credential loss from sync', async () => {
    env.sync.__seed({
      zeus_claude_api_key: 'critical-key-do-not-lose',
      models: { claude: 'claude-sonnet-4.6' }
    });

    // Simulate storage.local failure
    const originalLocalSet = env.chrome.storage.local.set;
    env.chrome.storage.local.set = vi.fn((_payload, callback) => {
      env.setLastError('QUOTA_BYTES_EXCEEDED');
      queueMicrotask(() => callback && callback());
    });

    const loaded = await globalThis.ZeusSettings.loadSettings();
    expect(loaded.apiKeys.claude).toBe('critical-key-do-not-lose');

    // Sync credentials MUST NOT be purged when local write failed!
    const syncData = await new Promise((resolve) => env.chrome.storage.sync.get(null, resolve));
    expect(syncData.zeus_claude_api_key).toBe('critical-key-do-not-lose');

    // Restore mock
    env.chrome.storage.local.set = originalLocalSet;
  });

  it('provides credentials to getApiKeyForProvider and getModelForProvider', async () => {
    await globalThis.ZeusSettings.saveSettings({
      provider: 'openrouter',
      apiKeys: { openrouter: 'or-secret-token' },
      models: { openrouter: 'anthropic/claude-3.7-sonnet' }
    });

    const loaded = await globalThis.ZeusSettings.loadSettings();
    expect(globalThis.ZeusSettings.getApiKeyForProvider(loaded, 'openrouter')).toBe('or-secret-token');
    expect(globalThis.ZeusSettings.getModelForProvider(loaded, 'openrouter')).toBe('anthropic/claude-3.7-sonnet');
  });

  it('resolves conflicting credentials by preferring authoritative local store while filling gaps from sync', async () => {
    env.local.__seed({
      [globalThis.ZeusSettings.CREDENTIALS_KEY]: {
        apiKeys: {
          openai: 'local-openai-key',
          claude: ''
        },
        customApiKeys: {}
      }
    });

    env.sync.__seed({
      zeus_openai_api_key: 'old-sync-openai-key',
      zeus_claude_api_key: 'sync-claude-key'
    });

    const loaded = await globalThis.ZeusSettings.loadSettings();
    // Local authoritative key wins over sync
    expect(loaded.apiKeys.openai).toBe('local-openai-key');
    // Gap filled from sync
    expect(loaded.apiKeys.claude).toBe('sync-claude-key');
  });

  it('supports copilot configuration keys and defaults', () => {
    const defaults = globalThis.ZeusSettings.createDefaultSettings();
    expect(defaults.copilotEnabled).toBe(false);
    expect(defaults.copilotMode).toBe('conservative');
    expect(defaults.copilotProvider).toBe('auto');
    expect(defaults.copilotMaxTokens).toBe(60);

    const normalized = globalThis.ZeusSettings.normalizeSettings({
      copilotEnabled: true,
      copilotMode: 'aggressive',
      copilotProvider: 'gemini',
      copilotMaxTokens: 30
    });

    expect(normalized.copilotEnabled).toBe(true);
    expect(normalized.copilotMode).toBe('aggressive');
    expect(normalized.copilotProvider).toBe('gemini');
    expect(normalized.copilotMaxTokens).toBe(30);

    const serialized = globalThis.ZeusSettings.serializeSettings(normalized);
    expect(serialized.copilotEnabled).toBe(true);
    expect(serialized.copilotMode).toBe('aggressive');
    expect(serialized.copilotProvider).toBe('gemini');
    expect(serialized.copilotMaxTokens).toBe(30);
  });

  it('saving ordinary preferences without specifying apiKeys does not wipe existing secure credentials', async () => {
    // 1. Initial configuration with credentials
    await globalThis.ZeusSettings.saveSettings({
      provider: 'openai',
      apiKeys: {
        openai: 'sk-existing-openai-key'
      },
      models: {
        openai: 'gpt-5.4-mini'
      },
      customProviders: [
        { id: 'custom-local', name: 'Local LM', baseUrl: 'http://localhost:1234', apiKey: 'bearer-token-123' }
      ]
    });

    // 2. Later, save an ordinary preference WITHOUT passing apiKeys or custom provider apiKey
    const updateResult = await globalThis.ZeusSettings.saveSettings({
      sidePanelEnabled: false,
      smartRouterProfile: 'performance'
    });

    expect(updateResult.settings.sidePanelEnabled).toBe(false);
    expect(updateResult.settings.smartRouterProfile).toBe('performance');
    expect(updateResult.settings.provider).toBe('openai');
    expect(updateResult.settings.apiKeys.openai).toBe('sk-existing-openai-key');
    expect(updateResult.settings.customProviders[0].apiKey).toBe('bearer-token-123');

    // 3. Load from storage to verify persistent state
    const loaded = await globalThis.ZeusSettings.loadSettings();
    expect(loaded.sidePanelEnabled).toBe(false);
    expect(loaded.smartRouterProfile).toBe('performance');
    expect(loaded.provider).toBe('openai');
    expect(loaded.apiKeys.openai).toBe('sk-existing-openai-key');
    expect(loaded.customProviders[0].apiKey).toBe('bearer-token-123');

    // Sync storage must still have NO credentials
    const syncData = await new Promise((resolve) => env.chrome.storage.sync.get(null, resolve));
    expect(syncData.apiKeys.openai).toBe('');
    expect(syncData.customProviders[0].apiKey).toBe('');
    expect(syncData.sidePanelEnabled).toBe(false);
  });

  it('updating a single provider key preserves other existing provider keys', async () => {
    await globalThis.ZeusSettings.saveSettings({
      apiKeys: {
        openai: 'sk-existing-openai-key',
        claude: 'sk-ant-existing-claude-key'
      }
    });

    // Update ONLY gemini key
    await globalThis.ZeusSettings.saveSettings({
      apiKeys: {
        gemini: 'new-gemini-key'
      }
    });

    const loaded = await globalThis.ZeusSettings.loadSettings();
    expect(loaded.apiKeys.gemini).toBe('new-gemini-key');
    expect(loaded.apiKeys.openai).toBe('sk-existing-openai-key');
    expect(loaded.apiKeys.claude).toBe('sk-ant-existing-claude-key');
  });

  it('storage.local failure during saveSettings rejects and prevents touching sync storage', async () => {
    env.local.__seed({
      [globalThis.ZeusSettings.CREDENTIALS_KEY]: {
        apiKeys: { claude: 'claude-safe-key' },
        customApiKeys: {}
      }
    });

    const originalLocalSet = env.chrome.storage.local.set;
    env.chrome.storage.local.set = vi.fn((_payload, callback) => {
      env.setLastError('IO_ERROR_LOCAL_STORAGE');
      queueMicrotask(() => callback && callback());
    });

    await expect(
      globalThis.ZeusSettings.saveSettings({
        apiKeys: { claude: 'new-unverified-key' }
      })
    ).rejects.toThrow('IO_ERROR_LOCAL_STORAGE');

    env.chrome.storage.local.set = originalLocalSet;

    // Credentials in local storage remain untouched
    const localData = await new Promise((resolve) => env.chrome.storage.local.get([globalThis.ZeusSettings.CREDENTIALS_KEY], resolve));
    expect(localData[globalThis.ZeusSettings.CREDENTIALS_KEY].apiKeys.claude).toBe('claude-safe-key');
  });
});
