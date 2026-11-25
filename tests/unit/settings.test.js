const { createChromeMock } = require('../mocks/chrome');
const { loadScript, clearZeusGlobals } = require('../utils/runtime');

describe('ZeusSettings', () => {
  let env;

  beforeEach(() => {
    clearZeusGlobals();
    env = createChromeMock();
    globalThis.chrome = env.chrome;

    loadScript('model-registry.js');
    loadScript('settings/settingsStore.js');
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

    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.provider).toBe('openrouter');
    expect(migrated.apiKeys.openrouter).toBe('legacy-openrouter-key');
    expect(migrated.models.openrouter).toBe('google/gemini-3-pro');
  });

  it.each([
    [{ models: { gemini: 'gemini-3-flash' } }, 'gemini-flash-latest'],
    [{ zeus_gemini_model: 'gemini-3-pro' }, 'gemini-3.1-pro-preview'],
    [{ models: { gemini: ' models/gemini-3.1-pro ' } }, 'gemini-3.1-pro-preview'],
    [{ models: { gemini: 'gemini-custom' } }, 'gemini-custom']
  ])('loads a saved Gemini selection from %j as %s', async (stored, expected) => {
    await chrome.storage.sync.set(stored);
    const settings = await globalThis.ZeusSettings.loadSettings();
    expect(settings.models.gemini).toBe(expected);
    expect(globalThis.ZeusSettings.getPublicSettings(settings).models.gemini).toBe(expected);
  });

  it('normalizes unsupported providers to defaults', () => {
    const normalized = globalThis.ZeusSettings.normalizeSettings({
      provider: 'unsupported-provider',
      models: {
        openai: ''
      }
    });

    expect(normalized.schemaVersion).toBe(3);
    expect(normalized.provider).toBe('gemini');
    expect(normalized.models.openai).toBe(globalThis.ZeusModelRegistry.getDefaultModel('openai'));
  });

  it('serializes canonical sync preferences without legacy dual-writing or apiKeys', () => {
    const payload = globalThis.ZeusSettings.serializeSettings({
      provider: 'claude',
      apiKeys: {
        claude: 'claude-test-key'
      },
      models: {
        claude: 'claude-sonnet-4.6'
      }
    });

    expect(payload.schemaVersion).toBe(3);
    expect(payload.provider).toBe('claude');
    expect(payload.models.claude).toBe('claude-sonnet-4.6');
    expect(payload.apiKeys).toBeUndefined();
    expect(payload.zeus_selected_provider).toBeUndefined();
    expect(payload.zeus_claude_api_key).toBeUndefined();
    expect(payload.zeus_claude_model).toBeUndefined();
    expect(payload.zeus_provider_configs).toBeUndefined();
  });

  it('supports copilot configuration keys and defaults', () => {
    const defaults = globalThis.ZeusSettings.createDefaultSettings();
    expect(defaults.schemaVersion).toBe(3);
    expect(defaults.copilotEnabled).toBe(false);
    expect(defaults.copilotMode).toBe('conservative');
    expect(defaults.copilotProvider).toBe('auto');
    expect(defaults.copilotMaxTokens).toBe(60);
    expect(defaults.redactionEnabled).toBe(true);
    expect(defaults.customRedactionPatterns).toEqual([]);

    const normalized = globalThis.ZeusSettings.normalizeSettings({
      copilotEnabled: true,
      copilotMode: 'aggressive',
      copilotProvider: 'gemini',
      copilotMaxTokens: 30,
      redactionEnabled: false,
      customRedactionPatterns: ['pattern1']
    });

    expect(normalized.copilotEnabled).toBe(true);
    expect(normalized.copilotMode).toBe('aggressive');
    expect(normalized.copilotProvider).toBe('gemini');
    expect(normalized.copilotMaxTokens).toBe(30);
    expect(normalized.redactionEnabled).toBe(false);
    expect(normalized.customRedactionPatterns).toEqual(['pattern1']);

    const serialized = globalThis.ZeusSettings.serializeSettings(normalized);
    expect(serialized.schemaVersion).toBe(3);
    expect(serialized.copilotEnabled).toBe(true);
    expect(serialized.copilotMode).toBe('aggressive');
    expect(serialized.copilotProvider).toBe('gemini');
    expect(serialized.copilotMaxTokens).toBe(30);
    expect(serialized.redactionEnabled).toBe(false);
    expect(serialized.customRedactionPatterns).toEqual(['pattern1']);
    expect(serialized.apiKeys).toBeUndefined();
  });

  it('migrates legacy sync keys to local storage on loadSettings with write-before-delete and purges legacy sync data', async () => {
    Object.assign(env.syncStore, {
      schemaVersion: 2,
      zeus_selected_provider: 'claude',
      zeus_claude_api_key: 'synth-claude-key',
      zeus_claude_model: 'claude-sonnet-4.6',
      zeus_openai_api_key: 'synth-openai-key',
      zeus_gemini_api_key: 'synth-gemini-key',
      zeus_openrouter_api_key: 'synth-openrouter-key',
      zeus_provider_configs: {
        openrouter: {
          apiKey: 'synth-openrouter-key'
        }
      }
    });

    const loaded = await globalThis.ZeusSettings.loadSettings();

    expect(loaded.schemaVersion).toBe(3);
    expect(loaded.provider).toBe('claude');
    expect(loaded.apiKeys.claude).toBe('synth-claude-key');
    expect(loaded.apiKeys.openai).toBe('synth-openai-key');
    expect(loaded.apiKeys.gemini).toBe('synth-gemini-key');
    expect(loaded.apiKeys.openrouter).toBe('synth-openrouter-key');

    // Sensitive keys moved strictly to localStore
    expect(env.localStore.apiKeys).toEqual({
      gemini: 'synth-gemini-key',
      openai: 'synth-openai-key',
      claude: 'synth-claude-key',
      openrouter: 'synth-openrouter-key'
    });

    // Preferences in syncStore updated to schemaVersion 3
    expect(env.syncStore.schemaVersion).toBe(3);
    expect(env.syncStore.provider).toBe('claude');

    // All legacy keys and sync.apiKeys purged from syncStore
    expect(env.syncStore.apiKeys).toBeUndefined();
    expect(env.syncStore.zeus_selected_provider).toBeUndefined();
    expect(env.syncStore.zeus_claude_api_key).toBeUndefined();
    expect(env.syncStore.zeus_claude_model).toBeUndefined();
    expect(env.syncStore.zeus_openai_api_key).toBeUndefined();
    expect(env.syncStore.zeus_gemini_api_key).toBeUndefined();
    expect(env.syncStore.zeus_openrouter_api_key).toBeUndefined();
    expect(env.syncStore.zeus_provider_configs).toBeUndefined();
  });

  it('performs idempotent merge with non-empty local keys taking precedence over sync', async () => {
    env.localStore.apiKeys = {
      claude: 'newer-local-claude-key',
      openai: '',
      gemini: '',
      openrouter: ''
    };

    Object.assign(env.syncStore, {
      schemaVersion: 2,
      zeus_claude_api_key: 'stale-sync-claude-key',
      zeus_openai_api_key: 'sync-openai-key'
    });

    const loaded = await globalThis.ZeusSettings.loadSettings();

    expect(loaded.apiKeys.claude).toBe('newer-local-claude-key');
    expect(loaded.apiKeys.openai).toBe('sync-openai-key');
    expect(env.localStore.apiKeys.claude).toBe('newer-local-claude-key');
    expect(env.localStore.apiKeys.openai).toBe('sync-openai-key');
  });

  it('write-before-delete: does not purge sync keys if local write fails', async () => {
    Object.assign(env.syncStore, {
      schemaVersion: 2,
      zeus_claude_api_key: 'critical-sync-key'
    });

    // Simulate failure during local storage write
    env.chrome.storage.local.set = vi.fn((_payload, callback) => {
      globalThis.chrome.runtime.lastError = new Error('Disk quota exceeded on local');
      if (typeof callback === 'function') callback();
    });

    await expect(globalThis.ZeusSettings.loadSettings()).rejects.toThrow('Disk quota exceeded on local');

    // Sync store legacy keys must NOT have been removed
    expect(env.syncStore.zeus_claude_api_key).toBe('critical-sync-key');
    expect(env.syncStore.schemaVersion).toBe(2);
  });

  it('recovers gracefully from interrupted migration with synthetic credentials', async () => {
    // Interrupted state: local already has credentials written, but sync has not yet been cleaned up
    env.localStore.apiKeys = {
      claude: 'migrated-local-claude',
      gemini: 'migrated-local-gemini',
      openai: '',
      openrouter: ''
    };

    Object.assign(env.syncStore, {
      schemaVersion: 2,
      zeus_selected_provider: 'claude',
      zeus_claude_api_key: 'stale-sync-claude',
      zeus_openai_api_key: 'remaining-sync-openai'
    });

    const loaded = await globalThis.ZeusSettings.loadSettings();

    // Local-precedence merge ensures existing local key was not overwritten by stale sync key
    expect(loaded.apiKeys.claude).toBe('migrated-local-claude');
    expect(loaded.apiKeys.gemini).toBe('migrated-local-gemini');
    expect(loaded.apiKeys.openai).toBe('remaining-sync-openai');

    // Sync store is now fully cleaned and upgraded to schemaVersion 3
    expect(env.syncStore.schemaVersion).toBe(3);
    expect(env.syncStore.zeus_claude_api_key).toBeUndefined();
    expect(env.syncStore.zeus_openai_api_key).toBeUndefined();
    expect(env.syncStore.apiKeys).toBeUndefined();
  });

  it('concurrency protection: simultaneous loadSettings calls share a single migration run', async () => {
    Object.assign(env.syncStore, {
      schemaVersion: 2,
      zeus_selected_provider: 'claude',
      zeus_claude_api_key: 'concurrent-test-key'
    });

    const removeSpy = vi.spyOn(env.chrome.storage.sync, 'remove');

    const results = await Promise.all([
      globalThis.ZeusSettings.loadSettings(),
      globalThis.ZeusSettings.loadSettings(),
      globalThis.ZeusSettings.loadSettings(),
      globalThis.ZeusSettings.loadSettings()
    ]);

    expect(results[0]).toEqual(results[1]);
    expect(results[1]).toEqual(results[2]);
    expect(results[2]).toEqual(results[3]);

    expect(results[0].apiKeys.claude).toBe('concurrent-test-key');
    expect(env.localStore.apiKeys.claude).toBe('concurrent-test-key');
    expect(removeSpy).toHaveBeenCalledTimes(1);
  });

  it('saveSettings partitions preferences in sync and credentials strictly in local without legacy dual-writing', async () => {
    const saveResult = await globalThis.ZeusSettings.saveSettings({
      provider: 'openai',
      apiKeys: {
        openai: 'synth-secret-key'
      },
      models: {
        openai: 'gpt-4o'
      }
    });

    expect(saveResult.settings.provider).toBe('openai');
    expect(saveResult.settings.apiKeys.openai).toBe('synth-secret-key');

    // Local has the secret
    expect(env.localStore.apiKeys.openai).toBe('synth-secret-key');

    // Sync has preferences only, no credentials or legacy keys
    expect(env.syncStore.schemaVersion).toBe(3);
    expect(env.syncStore.provider).toBe('openai');
    expect(env.syncStore.models.openai).toBe('gpt-4o');
    expect(env.syncStore.apiKeys).toBeUndefined();
    expect(env.syncStore.zeus_selected_provider).toBeUndefined();
    expect(env.syncStore.zeus_openai_api_key).toBeUndefined();
  });

  it('strictly blocks API key persistence in chrome.storage.sync.set', () => {
    let errorCaught = null;
    env.chrome.storage.sync.set({ apiKeys: { gemini: 'leak-attempt' } }, () => {
      errorCaught = globalThis.chrome.runtime.lastError;
    });

    expect(errorCaught).toBeTruthy();
    expect(errorCaught.message).toMatch(/Security Violation: API keys cannot be stored in chrome.storage.sync/i);
    expect(env.syncStore.apiKeys).toBeUndefined();
  });

  it('getPublicSettings excludes apiKeys and provides hasApiKey flags', () => {
    const publicSettings = globalThis.ZeusSettings.getPublicSettings({
      provider: 'gemini',
      apiKeys: {
        gemini: 'secret-gemini-key',
        openai: ''
      }
    });

    expect(publicSettings.schemaVersion).toBe(3);
    expect(publicSettings.provider).toBe('gemini');
    expect(publicSettings.apiKeys).toBeUndefined();
    expect(publicSettings.hasApiKey.gemini).toBe(true);
    expect(publicSettings.hasApiKey.openai).toBe(false);
  });

  it('saveSettings preserves existing local apiKeys during partial preference updates', async () => {
    // Existing credential in localStore
    env.localStore.apiKeys = {
      gemini: 'preserved-local-gemini',
      openai: 'preserved-local-openai',
      claude: '',
      openrouter: ''
    };
    env.syncStore.schemaVersion = 3;

    // Update only provider without specifying apiKeys
    await globalThis.ZeusSettings.saveSettings({
      provider: 'openai'
    });

    expect(env.localStore.apiKeys.gemini).toBe('preserved-local-gemini');
    expect(env.localStore.apiKeys.openai).toBe('preserved-local-openai');
    expect(env.syncStore.provider).toBe('openai');
  });

  it('saveSettings updates existing API keys in localStore when new keys are provided', async () => {
    env.localStore.apiKeys = {
      gemini: 'old-gemini-key',
      openai: 'preserved-openai-key',
      claude: '',
      openrouter: ''
    };
    env.syncStore.schemaVersion = 3;

    const result = await globalThis.ZeusSettings.saveSettings({
      apiKeys: {
        gemini: 'new-updated-gemini-key'
      }
    });

    expect(result.settings.apiKeys.gemini).toBe('new-updated-gemini-key');
    expect(result.settings.apiKeys.openai).toBe('preserved-openai-key');
    expect(env.localStore.apiKeys.gemini).toBe('new-updated-gemini-key');
    expect(env.localStore.apiKeys.openai).toBe('preserved-openai-key');
  });

  it('saveSettings clears API keys when explicitly set to empty string or defaults', async () => {
    env.localStore.apiKeys = {
      gemini: 'key-to-clear',
      openai: 'key-to-remain',
      claude: 'other-key',
      openrouter: ''
    };
    env.syncStore.schemaVersion = 3;

    // Clear single key
    await globalThis.ZeusSettings.saveSettings({
      apiKeys: {
        gemini: ''
      }
    });

    expect(env.localStore.apiKeys.gemini).toBe('');
    expect(env.localStore.apiKeys.openai).toBe('key-to-remain');

    // Purge all keys via createDefaultSettings()
    const defaults = globalThis.ZeusSettings.createDefaultSettings();
    await globalThis.ZeusSettings.saveSettings(defaults);

    expect(env.localStore.apiKeys.gemini).toBe('');
    expect(env.localStore.apiKeys.openai).toBe('');
    expect(env.localStore.apiKeys.claude).toBe('');
    expect(env.localStore.apiKeys.openrouter).toBe('');
  });

  it('saveSettings preserves existing sync preferences during partial updates', async () => {
    Object.assign(env.syncStore, {
      schemaVersion: 3,
      provider: 'claude',
      copilotEnabled: true,
      copilotMaxTokens: 120,
      copilotMode: 'aggressive',
      models: {
        claude: 'claude-sonnet-4.6',
        openai: 'gpt-4o'
      }
    });

    await globalThis.ZeusSettings.saveSettings({
      provider: 'openai'
    });

    expect(env.syncStore.provider).toBe('openai');
    expect(env.syncStore.copilotEnabled).toBe(true);
    expect(env.syncStore.copilotMaxTokens).toBe(120);
    expect(env.syncStore.copilotMode).toBe('aggressive');
    expect(env.syncStore.models.claude).toBe('claude-sonnet-4.6');
    expect(env.syncStore.models.openai).toBe('gpt-4o');
  });

  it('saveSettings purges legacy keys if present in syncStore', async () => {
    Object.assign(env.syncStore, {
      schemaVersion: 2,
      zeus_selected_provider: 'claude',
      zeus_claude_api_key: 'stale-legacy-key'
    });

    await globalThis.ZeusSettings.saveSettings({
      provider: 'gemini',
      apiKeys: {
        gemini: 'new-g-key'
      }
    });

    expect(env.syncStore.schemaVersion).toBe(3);
    expect(env.syncStore.zeus_selected_provider).toBeUndefined();
    expect(env.syncStore.zeus_claude_api_key).toBeUndefined();
    expect(env.syncStore.apiKeys).toBeUndefined();
    expect(env.localStore.apiKeys.gemini).toBe('new-g-key');
  });

  it('getPublicSettings preserves pre-existing hasApiKey flags', () => {
    const publicSettings = globalThis.ZeusSettings.getPublicSettings({
      provider: 'openai',
      hasApiKey: {
        openai: true,
        gemini: false,
        claude: true,
        openrouter: false
      }
    });

    expect(publicSettings.provider).toBe('openai');
    expect(publicSettings.hasApiKey.openai).toBe(true);
    expect(publicSettings.hasApiKey.gemini).toBe(false);
    expect(publicSettings.hasApiKey.claude).toBe(true);
    expect(publicSettings.hasApiKey.openrouter).toBe(false);
    expect(publicSettings.apiKeys).toBeUndefined();
  });

  it('cleans up stray legacy keys even if schemaVersion is 3', async () => {
    Object.assign(env.syncStore, {
      schemaVersion: 3,
      provider: 'claude',
      zeus_selected_provider: 'claude',
      zeus_claude_api_key: 'stray-sync-key'
    });

    const loaded = await globalThis.ZeusSettings.loadSettings();

    expect(loaded.schemaVersion).toBe(3);
    expect(env.localStore.apiKeys.claude).toBe('stray-sync-key');
    expect(env.syncStore.zeus_selected_provider).toBeUndefined();
    expect(env.syncStore.zeus_claude_api_key).toBeUndefined();
    expect(env.syncStore.apiKeys).toBeUndefined();
  });

  describe('SettingsStore Deepening: Nested Merges & Dual-Area Cache Invalidation', () => {
    it('exposes ZeusSettingsStore with get, update, getPublic, and invalidateCache', () => {
      const store = globalThis.ZeusSettingsStore;
      expect(store).toBeDefined();
      expect(typeof store.get).toBe('function');
      expect(typeof store.update).toBe('function');
      expect(typeof store.getPublic).toBe('function');
      expect(typeof store.invalidateCache).toBe('function');
      expect(globalThis.ZeusSettings).toBe(store);
    });

    it('preserves sibling apiKeys during partial nested updates and supports explicit key clearing', async () => {
      const store = globalThis.ZeusSettingsStore;

      // 1. Initial setup with multiple keys
      await store.update({
        apiKeys: {
          openai: 'sk-initial-openai',
          claude: 'sk-initial-claude',
          gemini: 'sk-initial-gemini',
          openrouter: 'sk-initial-openrouter'
        }
      });

      let current = await store.get();
      expect(current.apiKeys.openai).toBe('sk-initial-openai');
      expect(current.apiKeys.claude).toBe('sk-initial-claude');
      expect(current.apiKeys.gemini).toBe('sk-initial-gemini');
      expect(current.apiKeys.openrouter).toBe('sk-initial-openrouter');

      // 2. Update ONLY openai key -> sibling keys must remain intact
      await store.update({
        apiKeys: {
          openai: 'sk-updated-openai'
        }
      });

      current = await store.get();
      expect(current.apiKeys.openai).toBe('sk-updated-openai');
      expect(current.apiKeys.claude).toBe('sk-initial-claude');
      expect(current.apiKeys.gemini).toBe('sk-initial-gemini');
      expect(current.apiKeys.openrouter).toBe('sk-initial-openrouter');

      // 3. Explicitly clear openai key with "" -> only openai cleared, siblings preserved
      await store.update({
        apiKeys: {
          openai: ''
        }
      });

      current = await store.get();
      expect(current.apiKeys.openai).toBe('');
      expect(current.apiKeys.claude).toBe('sk-initial-claude');
      expect(current.apiKeys.gemini).toBe('sk-initial-gemini');
      expect(current.apiKeys.openrouter).toBe('sk-initial-openrouter');
    });

    it('preserves sibling model configurations during partial models updates', async () => {
      const store = globalThis.ZeusSettingsStore;

      await store.update({
        models: {
          openai: 'gpt-4o',
          claude: 'claude-3-5-sonnet',
          gemini: 'gemini-1.5-pro'
        }
      });

      // Update only openai model
      await store.update({
        models: {
          openai: 'gpt-5-codex'
        }
      });

      const current = await store.get();
      expect(current.models.openai).toBe('gpt-5-codex');
      expect(current.models.claude).toBe('claude-3-5-sonnet');
      expect(current.models.gemini).toBe('gemini-1.5-pro');
    });

    it('invalidates in-memory cache upon chrome.storage.onChanged event in sync area', async () => {
      const store = globalThis.ZeusSettingsStore;

      // Seed initial
      await store.update({ provider: 'gemini' });
      const initial = await store.get();
      expect(initial.provider).toBe('gemini');

      // Directly modify sync store underlying backing without going through store.update
      env.syncStore.provider = 'openai';

      // Verify cached value is served before onChanged fires
      const cached = await store.get();
      expect(cached.provider).toBe('gemini');

      // Trigger chrome.storage.onChanged for 'sync'
      env.listeners.storageOnChanged.listeners.forEach((listener) => {
        listener({ provider: { oldValue: 'gemini', newValue: 'openai' } }, 'sync');
      });

      // Next get() must fetch freshly updated value
      const refreshed = await store.get();
      expect(refreshed.provider).toBe('openai');
    });

    it('invalidates in-memory cache upon chrome.storage.onChanged event in local area', async () => {
      const store = globalThis.ZeusSettingsStore;

      // Seed initial
      await store.update({ apiKeys: { claude: 'sk-old-key' } });
      const initial = await store.get();
      expect(initial.apiKeys.claude).toBe('sk-old-key');

      // Modify local store directly
      env.localStore.apiKeys = { ...env.localStore.apiKeys, claude: 'sk-externally-changed' };

      // Verify cached before invalidation
      const cached = await store.get();
      expect(cached.apiKeys.claude).toBe('sk-old-key');

      // Trigger chrome.storage.onChanged for 'local'
      env.listeners.storageOnChanged.listeners.forEach((listener) => {
        listener({ apiKeys: { oldValue: { claude: 'sk-old-key' }, newValue: { claude: 'sk-externally-changed' } } }, 'local');
      });

      // Next get() must reflect external change
      const refreshed = await store.get();
      expect(refreshed.apiKeys.claude).toBe('sk-externally-changed');
    });

    it('getPublic() asynchronously returns zero apiKeys and accurate hasApiKey flags', async () => {
      const store = globalThis.ZeusSettingsStore;

      await store.update({
        provider: 'claude',
        apiKeys: {
          claude: 'sk-valid-claude-key',
          openai: ''
        }
      });

      const publicSettings = await store.getPublic();
      expect(publicSettings.provider).toBe('claude');
      expect(publicSettings.apiKeys).toBeUndefined();
      expect(publicSettings.hasApiKey.claude).toBe(true);
      expect(publicSettings.hasApiKey.openai).toBe(false);
    });

    it('normalizes and persists ollama.host with safe URL validation and trailing-slash trimming', async () => {
      const store = globalThis.ZeusSettingsStore;
      expect(store.createDefaultSettings().ollama.host).toBe('http://localhost:11434');

      expect(store.normalizeSettings({ ollama: { host: 'http://127.0.0.1:11434/' } }).ollama.host)
        .toBe('http://127.0.0.1:11434');
      expect(store.normalizeSettings({ ollama: { host: 'javascript:alert(1)' } }).ollama.host)
        .toBe('http://localhost:11434');

      await store.update({ ollama: { host: 'http://127.0.0.1:11435/' } });
      await store.update({ ollama: { model: 'qwen3:8b' } });

      const current = await store.get();
      expect(current.ollama.host).toBe('http://127.0.0.1:11435');
      expect(current.ollama.model).toBe('qwen3:8b');
      expect(env.syncStore.ollama).toEqual({ host: 'http://127.0.0.1:11435', model: 'qwen3:8b' });
    });

    it('clamps copilotMaxTokens to [10, 250] and defaults invalid values to 60', () => {
      const store = globalThis.ZeusSettingsStore;
      expect(store.normalizeSettings({ copilotMaxTokens: 3 }).copilotMaxTokens).toBe(10);
      expect(store.normalizeSettings({ copilotMaxTokens: 900 }).copilotMaxTokens).toBe(250);
      expect(store.normalizeSettings({ copilotMaxTokens: -5 }).copilotMaxTokens).toBe(60);
      expect(store.normalizeSettings({ copilotMaxTokens: 'not-a-number' }).copilotMaxTokens).toBe(60);
    });
  });
});
