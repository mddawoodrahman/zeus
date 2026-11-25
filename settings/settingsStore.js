(function initZeusSettingsStore(globalScope) {
  'use strict';

  const registry = globalScope.ZeusModelRegistry || null;

  const SCHEMA_VERSION = 3;
  const DEFAULT_OLLAMA_HOST = 'http://localhost:11434';
  const SUPPORTED_PROVIDERS = Object.freeze(['gemini', 'openai', 'claude', 'openrouter', 'ollama', 'auto']);
  const MODEL_PROVIDERS = Object.freeze(['gemini', 'openai', 'claude', 'openrouter']);
  const API_KEY_PROVIDERS = Object.freeze(['gemini', 'openai', 'claude', 'openrouter']);

  const SETTINGS_SCHEMA = Object.freeze({
    schemaVersion: 'number',
    provider: `enum:${SUPPORTED_PROVIDERS.join('|')}`,
    sidePanelEnabled: 'boolean',
    copilotEnabled: 'boolean',
    copilotMode: 'string',
    copilotProvider: 'string',
    copilotMaxTokens: 'number',
    redactionEnabled: 'boolean',
    customRedactionPatterns: 'array',
    apiKeys: Object.freeze({
      gemini: 'string',
      openai: 'string',
      claude: 'string',
      openrouter: 'string'
    }),
    models: Object.freeze({
      gemini: 'string',
      openai: 'string',
      claude: 'string',
      openrouter: 'string'
    }),
    ollama: Object.freeze({
      host: 'string',
      model: 'string'
    })
  });

  const SYNC_STORAGE_KEYS = Object.freeze([
    'schemaVersion',
    'provider',
    'models',
    'ollama',
    'sidePanelEnabled',
    'copilotEnabled',
    'copilotMode',
    'copilotProvider',
    'copilotMaxTokens',
    'redactionEnabled',
    'customRedactionPatterns'
  ]);

  const LOCAL_STORAGE_KEYS = Object.freeze([
    'apiKeys'
  ]);

  const LEGACY_STORAGE_KEYS = Object.freeze([
    'zeus_selected_provider',
    'zeus_gemini_api_key',
    'zeus_gemini_model',
    'zeus_openai_api_key',
    'zeus_openai_model',
    'zeus_claude_api_key',
    'zeus_claude_model',
    'zeus_openrouter_api_key',
    'zeus_openrouter_model',
    'zeus_ollama_model',
    'zeus_provider_configs',
    'apiKeys'
  ]);

  const STORAGE_KEYS = Object.freeze([
    ...SYNC_STORAGE_KEYS,
    ...LEGACY_STORAGE_KEYS
  ]);

  // In-memory cache & migration concurrency lock
  let cachedSettings = null;
  let cacheEpoch = 0;
  let migrationPromise = null;
  let migrationEpoch = 0;
  let storageListenerInstalled = false;
  let lastSeenStorageSync = null;
  let lastSeenStorageLocal = null;

  function invalidateCache() {
    cachedSettings = null;
    cacheEpoch += 1;
  }

  function checkStorageInstanceChanged() {
    const currentSync = globalScope?.chrome?.storage?.sync || null;
    const currentLocal = globalScope?.chrome?.storage?.local || null;
    if (currentSync !== lastSeenStorageSync || currentLocal !== lastSeenStorageLocal) {
      lastSeenStorageSync = currentSync;
      lastSeenStorageLocal = currentLocal;
      invalidateCache();
      storageListenerInstalled = false;
    }
  }

  function deepClone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function sanitizeString(value) {
    return String(value || '').trim();
  }

  function clampCopilotMaxTokens(value, fallback = 60) {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) {
      return fallback;
    }
    return Math.min(250, Math.max(10, Math.round(num)));
  }

  function normalizeOllamaHost(value) {
    const raw = sanitizeString(value).replace(/\/+$/, '');
    if (!raw) return DEFAULT_OLLAMA_HOST;
    try {
      const parsed = new URL(raw);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return DEFAULT_OLLAMA_HOST;
      }
      const cleanPath = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, '');
      return `${parsed.origin}${cleanPath}`;
    } catch (_) {
      return DEFAULT_OLLAMA_HOST;
    }
  }

  function readRegistryDefault(provider) {
    const reg = globalScope.ZeusModelRegistry || registry;
    const defaultFromRegistry = String(reg?.getDefaultModel?.(provider) || '').trim();
    if (defaultFromRegistry) {
      return defaultFromRegistry;
    }

    const firstModel = reg?.getProviderModels?.(provider)?.[0]?.id;
    return String(firstModel || '').trim();
  }

  function createDefaultSettings() {
    return {
      schemaVersion: SCHEMA_VERSION,
      provider: 'gemini',
      sidePanelEnabled: true,
      copilotEnabled: false,
      copilotMode: 'conservative',
      copilotProvider: 'auto',
      copilotMaxTokens: 60,
      redactionEnabled: true,
      customRedactionPatterns: [],
      apiKeys: {
        gemini: '',
        openai: '',
        claude: '',
        openrouter: ''
      },
      models: {
        gemini: readRegistryDefault('gemini'),
        openai: readRegistryDefault('openai'),
        claude: readRegistryDefault('claude'),
        openrouter: readRegistryDefault('openrouter')
      },
      ollama: {
        host: DEFAULT_OLLAMA_HOST,
        model: ''
      }
    };
  }

  function normalizeProvider(provider, fallbackProvider) {
    const normalized = sanitizeString(provider).toLowerCase();
    if (SUPPORTED_PROVIDERS.includes(normalized)) {
      return normalized;
    }
    return fallbackProvider;
  }

  function normalizeSettings(stored, localStored) {
    const defaults = createDefaultSettings();
    const legacyConfigs = (stored && stored.zeus_provider_configs) || {};

    const provider = normalizeProvider(
      stored?.provider || stored?.zeus_selected_provider,
      defaults.provider
    );

    const rawLocalKeys = (localStored && localStored.apiKeys) || {};
    const rawStoredKeys = (stored && stored.apiKeys) || {};

    // Local precedence: non-empty local keys take precedence over sync/legacy keys
    const apiKeys = {
      gemini: sanitizeString(rawLocalKeys.gemini) || sanitizeString(
        rawStoredKeys.gemini ??
        stored?.zeus_gemini_api_key ??
        defaults.apiKeys.gemini
      ),
      openai: sanitizeString(rawLocalKeys.openai) || sanitizeString(
        rawStoredKeys.openai ??
        stored?.zeus_openai_api_key ??
        defaults.apiKeys.openai
      ),
      claude: sanitizeString(rawLocalKeys.claude) || sanitizeString(
        rawStoredKeys.claude ??
        stored?.zeus_claude_api_key ??
        defaults.apiKeys.claude
      ),
      openrouter: sanitizeString(rawLocalKeys.openrouter) || sanitizeString(
        rawStoredKeys.openrouter ??
        stored?.zeus_openrouter_api_key ??
        legacyConfigs?.openrouter?.apiKey ??
        defaults.apiKeys.openrouter
      )
    };

    const savedGeminiModel = sanitizeString(stored?.models?.gemini ?? stored?.zeus_gemini_model) || defaults.models.gemini;
    const models = {
      ...defaults.models,
      ...(stored?.models || {}),
      gemini: globalScope.ZeusModelRegistry?.normalizeGeminiModel?.(savedGeminiModel) ?? savedGeminiModel,
      openai: sanitizeString(stored?.models?.openai ?? stored?.zeus_openai_model ?? defaults.models.openai) || defaults.models.openai,
      claude: sanitizeString(stored?.models?.claude ?? stored?.zeus_claude_model ?? defaults.models.claude) || defaults.models.claude,
      openrouter: sanitizeString(
        stored?.models?.openrouter ??
        stored?.zeus_openrouter_model ??
        legacyConfigs?.openrouter?.model ??
        defaults.models.openrouter
      ) || defaults.models.openrouter
    };

    const ollama = {
      host: normalizeOllamaHost(stored?.ollama?.host),
      model: sanitizeString(stored?.ollama?.model ?? stored?.zeus_ollama_model)
    };

    const sidePanelEnabled = stored?.sidePanelEnabled !== undefined ? Boolean(stored.sidePanelEnabled) : defaults.sidePanelEnabled;
    const copilotEnabled = stored?.copilotEnabled !== undefined ? Boolean(stored.copilotEnabled) : defaults.copilotEnabled;
    const copilotMode = stored?.copilotMode !== undefined ? sanitizeString(stored.copilotMode) : defaults.copilotMode;
    const copilotProvider = stored?.copilotProvider !== undefined ? sanitizeString(stored.copilotProvider) : defaults.copilotProvider;
    const copilotMaxTokens = clampCopilotMaxTokens(stored?.copilotMaxTokens, defaults.copilotMaxTokens);
    const redactionEnabled = stored?.redactionEnabled !== undefined ? Boolean(stored.redactionEnabled) : defaults.redactionEnabled;
    const customRedactionPatterns = Array.isArray(stored?.customRedactionPatterns)
      ? stored.customRedactionPatterns.map(sanitizeString).filter(Boolean)
      : defaults.customRedactionPatterns;

    return {
      schemaVersion: SCHEMA_VERSION,
      provider,
      sidePanelEnabled,
      copilotEnabled,
      copilotMode,
      copilotProvider,
      copilotMaxTokens,
      redactionEnabled,
      customRedactionPatterns,
      apiKeys,
      models,
      ollama
    };
  }

  function migrateSettings(stored, localStored) {
    return normalizeSettings(stored || {}, localStored || {});
  }

  function serializeSettings(settingsInput) {
    const settings = normalizeSettings(settingsInput || {});

    // Purely non-sensitive preferences for chrome.storage.sync.
    // Legacy dual-writing and API keys are strictly excluded.
    return {
      schemaVersion: SCHEMA_VERSION,
      provider: settings.provider,
      sidePanelEnabled: settings.sidePanelEnabled,
      copilotEnabled: settings.copilotEnabled,
      copilotMode: settings.copilotMode,
      copilotProvider: settings.copilotProvider,
      copilotMaxTokens: settings.copilotMaxTokens,
      redactionEnabled: settings.redactionEnabled,
      customRedactionPatterns: [...settings.customRedactionPatterns],
      models: { ...settings.models },
      ollama: { ...settings.ollama }
    };
  }

  function getPublicSettings(settingsInput) {
    const settings = normalizeSettings(settingsInput || {});
    const existingHasKey = settingsInput?.hasApiKey;
    return {
      ...serializeSettings(settings),
      hasApiKey: {
        gemini: existingHasKey?.gemini !== undefined ? Boolean(existingHasKey.gemini) : Boolean(settings.apiKeys?.gemini),
        openai: existingHasKey?.openai !== undefined ? Boolean(existingHasKey.openai) : Boolean(settings.apiKeys?.openai),
        claude: existingHasKey?.claude !== undefined ? Boolean(existingHasKey.claude) : Boolean(settings.apiKeys?.claude),
        openrouter: existingHasKey?.openrouter !== undefined ? Boolean(existingHasKey.openrouter) : Boolean(settings.apiKeys?.openrouter)
      }
    };
  }

  function storageGet(area, keys) {
    return new Promise((resolve, reject) => {
      if (!area || typeof area.get !== 'function') {
        resolve({});
        return;
      }
      area.get(keys, (items) => {
        if (globalScope?.chrome?.runtime?.lastError) {
          const err = new Error(globalScope.chrome.runtime.lastError.message || 'Failed to read from storage.');
          globalScope.chrome.runtime.lastError = null;
          reject(err);
          return;
        }
        resolve(items || {});
      });
    });
  }

  function storageSet(area, payload) {
    return new Promise((resolve, reject) => {
      if (!area || typeof area.set !== 'function') {
        resolve();
        return;
      }
      area.set(payload, () => {
        if (globalScope?.chrome?.runtime?.lastError) {
          const err = new Error(globalScope.chrome.runtime.lastError.message || 'Failed to write to storage.');
          globalScope.chrome.runtime.lastError = null;
          reject(err);
          return;
        }
        resolve();
      });
    });
  }

  function storageRemove(area, keys) {
    return new Promise((resolve, reject) => {
      if (!area || typeof area.remove !== 'function') {
        resolve();
        return;
      }
      area.remove(keys, () => {
        if (globalScope?.chrome?.runtime?.lastError) {
          const err = new Error(globalScope.chrome.runtime.lastError.message || 'Failed to remove from storage.');
          globalScope.chrome.runtime.lastError = null;
          reject(err);
          return;
        }
        resolve();
      });
    });
  }

  function installStorageSyncGuard() {
    const syncArea = globalScope?.chrome?.storage?.sync;
    if (!syncArea || syncArea.__zeus_sync_guard_installed) {
      return;
    }

    const originalSet = syncArea.set;
    syncArea.set = function guardedSyncSet(items, callback) {
      if (items && typeof items === 'object') {
        const keys = Object.keys(items);
        const hasSensitiveKey = keys.some((k) => {
          if (k === 'apiKeys') return true;
          if (/api[_-]?key/i.test(k)) return true;
          if (k === 'zeus_provider_configs') {
            return Boolean(items[k]?.openrouter?.apiKey);
          }
          return false;
        });

        if (hasSensitiveKey) {
          const error = new Error('Security Violation: API keys cannot be stored in chrome.storage.sync.');
          if (globalScope?.chrome?.runtime) {
            globalScope.chrome.runtime.lastError = error;
          }
          if (typeof callback === 'function') {
            callback();
            return;
          }
          return Promise.reject(error);
        }
      }

      return originalSet.call(syncArea, items, callback);
    };

    syncArea.__zeus_sync_guard_installed = true;
  }

  function initStorageListener() {
    checkStorageInstanceChanged();
    const onChanged = globalScope?.chrome?.storage?.onChanged;
    if (!onChanged || typeof onChanged.addListener !== 'function') {
      return;
    }
    if (storageListenerInstalled) {
      return;
    }

    onChanged.addListener((changes, areaName) => {
      // Invalidate in-memory cache whenever either 'sync' or 'local' storage area changes
      if (areaName === 'sync' || areaName === 'local') {
        invalidateCache();
      }
    });

    storageListenerInstalled = true;
  }

  async function executeLoadSettings() {
    const syncArea = globalScope?.chrome?.storage?.sync;
    const localArea = globalScope?.chrome?.storage?.local;

    // 1. Read both chrome.storage.sync and chrome.storage.local
    const [syncStored, localStored] = await Promise.all([
      storageGet(syncArea, null),
      storageGet(localArea, null)
    ]);

    // Check if migration is needed:
    // Migration is needed if syncStored has schemaVersion !== 3 or contains any legacy sync keys or sync.apiKeys
    const legacyKeysFound = Object.keys(syncStored || {}).filter(
      (k) => LEGACY_STORAGE_KEYS.includes(k) || /^zeus_.*_(?:api_key|model)$/.test(k)
    );
    const hasLegacyKey = legacyKeysFound.length > 0;
    const needsMigration = syncStored?.schemaVersion !== SCHEMA_VERSION || hasLegacyKey;

    if (!needsMigration) {
      return normalizeSettings(syncStored, localStored);
    }

    // 2. Perform idempotent merge with local precedence
    const normalized = normalizeSettings(syncStored, localStored);
    const mergedApiKeys = { ...normalized.apiKeys };

    // 3. Write-before-delete ordering:
    // chrome.storage.local.set() MUST resolve successfully before removing sync.apiKeys and legacy keys from sync
    await storageSet(localArea, { apiKeys: mergedApiKeys });

    // 4. Purge ALL legacy keys and sync.apiKeys from chrome.storage.sync
    const keysToRemove = Array.from(new Set([...LEGACY_STORAGE_KEYS, ...legacyKeysFound]));
    await storageRemove(syncArea, keysToRemove);

    // 5. Persist normalized sync preferences with schemaVersion: 3
    const syncPayload = serializeSettings(normalized);
    await storageSet(syncArea, syncPayload);

    return normalized;
  }

  async function get(forceFresh = false) {
    checkStorageInstanceChanged();
    installStorageSyncGuard();
    initStorageListener();

    while (true) {
      if (!forceFresh && cachedSettings) {
        return deepClone(cachedSettings);
      }

      if (migrationPromise) {
        if (!forceFresh && migrationEpoch === cacheEpoch) {
          return await migrationPromise;
        }
        await migrationPromise.catch(() => {});
        continue;
      }

      const loadEpoch = cacheEpoch;
      migrationEpoch = loadEpoch;
      const currentLoad = (async () => {
        try {
          const normalized = await executeLoadSettings();
          if (loadEpoch === cacheEpoch) {
            cachedSettings = deepClone(normalized);
          }
          return deepClone(normalized);
        } finally {
          if (migrationPromise === currentLoad) {
            migrationPromise = null;
          }
        }
      })();
      migrationPromise = currentLoad;

      return await currentLoad;
    }
  }

  async function update(diff) {
    checkStorageInstanceChanged();
    installStorageSyncGuard();
    initStorageListener();

    if (migrationPromise) {
      await migrationPromise.catch(() => {});
    }

    const syncArea = globalScope?.chrome?.storage?.sync;
    const localArea = globalScope?.chrome?.storage?.local;

    // Read current state from both sync and local to support partial updates without data loss
    const [currentSync, currentLocal] = await Promise.all([
      storageGet(syncArea, null),
      storageGet(localArea, ['apiKeys'])
    ]);

    const existingLocalKeys = currentLocal?.apiKeys || {};
    const inputKeys = diff?.apiKeys;

    // Section-level nested merge for API keys:
    // If input explicitly specifies apiKeys, an individual key present in input takes precedence (even "" to clear/delete).
    // If an individual provider key is omitted from diff.apiKeys, preserve from existing local keys.
    const mergedApiKeys = {
      gemini: inputKeys && ('gemini' in inputKeys) ? sanitizeString(inputKeys.gemini) : sanitizeString(existingLocalKeys.gemini),
      openai: inputKeys && ('openai' in inputKeys) ? sanitizeString(inputKeys.openai) : sanitizeString(existingLocalKeys.openai),
      claude: inputKeys && ('claude' in inputKeys) ? sanitizeString(inputKeys.claude) : sanitizeString(existingLocalKeys.claude),
      openrouter: inputKeys && ('openrouter' in inputKeys) ? sanitizeString(inputKeys.openrouter) : sanitizeString(existingLocalKeys.openrouter)
    };

    // Merge preferences onto existing sync preferences so partial updates do not wipe other settings
    const mergedPreferences = {
      ...currentSync,
      ...(diff || {})
    };

    if (diff?.models) {
      mergedPreferences.models = {
        ...(currentSync?.models || {}),
        ...diff.models
      };
    }

    if (diff?.ollama) {
      mergedPreferences.ollama = {
        ...(currentSync?.ollama || {}),
        ...diff.ollama
      };
    }

    // Do not allow legacy sync keys or sync.apiKeys in merged preferences
    for (const legacyKey of LEGACY_STORAGE_KEYS) {
      delete mergedPreferences[legacyKey];
    }

    const normalized = normalizeSettings({
      ...mergedPreferences,
      apiKeys: mergedApiKeys
    });

    const syncPayload = serializeSettings(normalized);
    const localPayload = { apiKeys: { ...normalized.apiKeys } };
    const hasExplicitApiKeys = Boolean(inputKeys && typeof inputKeys === 'object');
    const apiKeysChanged = API_KEY_PROVIDERS.some(
      (p) => sanitizeString(existingLocalKeys[p]) !== normalized.apiKeys[p]
    ) || (hasExplicitApiKeys && API_KEY_PROVIDERS.some(
      (p) => (p in inputKeys) && existingLocalKeys[p] !== normalized.apiKeys[p]
    ));
    const shouldWriteLocal = apiKeysChanged || (hasExplicitApiKeys && !currentLocal?.apiKeys);

    // Write-before-delete ordering: local first (when changed), then cleanup and write sync
    if (shouldWriteLocal) {
      await storageSet(localArea, localPayload);
    }

    // Ensure all legacy keys are purged from sync
    const keysToRemove = Array.from(new Set([
      ...LEGACY_STORAGE_KEYS,
      ...Object.keys(currentSync || {}).filter(k => /^zeus_.*_(?:api_key|model)$/.test(k))
    ]));
    await storageRemove(syncArea, keysToRemove);

    await storageSet(syncArea, syncPayload);

    // Advance epoch so any older in-flight get() cannot overwrite cache, then update cache
    cacheEpoch += 1;
    cachedSettings = deepClone(normalized);

    return { settings: deepClone(normalized), payload: syncPayload };
  }

  function getPublic(settingsInput) {
    if (settingsInput && typeof settingsInput === 'object' && !('then' in settingsInput)) {
      return getPublicSettings(settingsInput);
    }
    return (async () => {
      const settings = await get();
      return getPublicSettings(settings);
    })();
  }

  function getModelForProvider(settingsInput, provider) {
    const settings = normalizeSettings(settingsInput || {});
    const providerId = normalizeProvider(provider, settings.provider);
    if (!MODEL_PROVIDERS.includes(providerId)) {
      return '';
    }

    return sanitizeString(settings.models?.[providerId]);
  }

  function getApiKeyForProvider(settingsInput, provider) {
    const settings = normalizeSettings(settingsInput || {});
    const providerId = normalizeProvider(provider, settings.provider);
    if (!API_KEY_PROVIDERS.includes(providerId)) {
      return '';
    }

    return sanitizeString(settings.apiKeys?.[providerId]);
  }

  // Install guard eagerly if chrome.storage is already available on load
  installStorageSyncGuard();

  const ZeusSettingsStore = Object.freeze({
    SCHEMA_VERSION,
    SUPPORTED_PROVIDERS,
    SETTINGS_SCHEMA,
    STORAGE_KEYS,
    SYNC_STORAGE_KEYS,
    LOCAL_STORAGE_KEYS,
    LEGACY_STORAGE_KEYS,
    DEFAULT_OLLAMA_HOST,
    normalizeOllamaHost,
    clampCopilotMaxTokens,
    get,
    update,
    getPublic,
    invalidateCache,
    loadSettings: get,
    saveSettings: update,
    getPublicSettings,
    createDefaultSettings,
    migrateSettings,
    normalizeSettings,
    serializeSettings,
    installStorageSyncGuard,
    getModelForProvider,
    getApiKeyForProvider
  });

  globalScope.ZeusSettingsStore = ZeusSettingsStore;
  globalScope.ZeusSettings = ZeusSettingsStore;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ZeusSettingsStore;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
