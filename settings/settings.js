(function initZeusSettings(globalScope) {
  const registry = globalScope.ZeusModelRegistry || null;

  const SCHEMA_VERSION = 2;
  const SUPPORTED_PROVIDERS = Object.freeze(['gemini', 'openai', 'claude', 'openrouter', 'ollama', 'auto', 'custom']);
  const MODEL_PROVIDERS = Object.freeze(['gemini', 'openai', 'claude', 'openrouter']);
  const API_KEY_PROVIDERS = Object.freeze(['gemini', 'openai', 'claude', 'openrouter']);

  const SETTINGS_SCHEMA = Object.freeze({
    schemaVersion: 'number',
    provider: `enum:${SUPPORTED_PROVIDERS.join('|')}`,
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
      model: 'string'
    })
  });

  const STORAGE_KEYS = Object.freeze([
    'schemaVersion',
    'provider',
    'apiKeys',
    'models',
    'ollama',
    'customProviders',
    'sidePanelEnabled',
    'copilotEnabled',
    'copilotMode',
    'copilotProvider',
    'copilotMaxTokens',
    'contextAwareEnabled',
    'contextMaxTurns',
    'contextMaxChars',
    'smartRouterProfile',
    'smartRouterCooldownMs',
    'multimodalEnabled',
    'visionOptimizationPreset',
    'privacyModeEnabled',
    'privacyCategories',
    'privacyAutoRestore',
    'privacyCustomPatterns',
    'privacyAuditLogEnabled',
    'commandPaletteEnabled',
    'commandPaletteShortcut',
    'keyboardShortcutsEnabled',
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
    'zeus_provider_configs'
  ]);

  function readRegistryDefault(provider) {
    const defaultFromRegistry = String(registry?.getDefaultModel?.(provider) || '').trim();
    if (defaultFromRegistry) {
      return defaultFromRegistry;
    }

    const firstModel = registry?.getProviderModels?.(provider)?.[0]?.id;
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
      contextAwareEnabled: true,
      contextMaxTurns: 4,
      contextMaxChars: 2000,
      smartRouterProfile: 'balanced',
      smartRouterCooldownMs: 60000,
      multimodalEnabled: true,
      visionOptimizationPreset: 'auto',
      privacyModeEnabled: false,
      privacyCategories: {
        email: true,
        phone: true,
        creditCard: true,
        ssn: true,
        ip: true,
        apiKey: true,
        custom: true
      },
      privacyAutoRestore: true,
      privacyCustomPatterns: [],
      privacyAuditLogEnabled: true,
      commandPaletteEnabled: true,
      commandPaletteShortcut: 'Ctrl+K',
      keyboardShortcutsEnabled: true,
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
        model: ''
      },
      customProviders: []
    };
  }

  function sanitizeString(value) {
    return String(value || '').trim();
  }

  function normalizeCustomProvider(p) {
    if (!p || typeof p !== 'object') return null;
    const name = sanitizeString(p.name || 'Custom OpenAI').slice(0, 50);
    const baseUrl = sanitizeString(p.baseUrl);
    if (!baseUrl) return null;
    const id = sanitizeString(p.id) || `custom-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Math.random().toString(36).slice(2, 6)}`;
    return {
      id,
      name,
      baseUrl,
      apiKey: sanitizeString(p.apiKey),
      model: sanitizeString(p.model || 'default'),
      customHeaders: (p.customHeaders && typeof p.customHeaders === 'object') ? p.customHeaders : {},
      enabled: p.enabled === undefined ? true : Boolean(p.enabled),
      createdAt: Number(p.createdAt) || Date.now()
    };
  }

  function normalizeProvider(provider, fallbackProvider) {
    const normalized = sanitizeString(provider).toLowerCase();
    if (SUPPORTED_PROVIDERS.includes(normalized) || normalized.startsWith('custom')) {
      return normalized;
    }
    return fallbackProvider;
  }

  function normalizeSettings(stored) {
    const defaults = createDefaultSettings();
    const legacyConfigs = (stored && stored.zeus_provider_configs) || {};

    const provider = normalizeProvider(
      stored?.provider || stored?.zeus_selected_provider,
      defaults.provider
    );

    const apiKeys = {
      ...defaults.apiKeys,
      ...(stored?.apiKeys || {}),
      gemini: sanitizeString(stored?.apiKeys?.gemini ?? stored?.zeus_gemini_api_key ?? defaults.apiKeys.gemini),
      openai: sanitizeString(stored?.apiKeys?.openai ?? stored?.zeus_openai_api_key ?? defaults.apiKeys.openai),
      claude: sanitizeString(stored?.apiKeys?.claude ?? stored?.zeus_claude_api_key ?? defaults.apiKeys.claude),
      openrouter: sanitizeString(
        stored?.apiKeys?.openrouter ??
        stored?.zeus_openrouter_api_key ??
        legacyConfigs?.openrouter?.apiKey ??
        defaults.apiKeys.openrouter
      )
    };

    const models = {
      ...defaults.models,
      ...(stored?.models || {}),
      gemini: sanitizeString(stored?.models?.gemini ?? stored?.zeus_gemini_model ?? defaults.models.gemini) || defaults.models.gemini,
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
      model: sanitizeString(stored?.ollama?.model ?? stored?.zeus_ollama_model)
    };

    const sidePanelEnabled = stored?.sidePanelEnabled !== undefined ? Boolean(stored.sidePanelEnabled) : defaults.sidePanelEnabled;
    const copilotEnabled = stored?.copilotEnabled !== undefined ? Boolean(stored.copilotEnabled) : defaults.copilotEnabled;
    const copilotMode = stored?.copilotMode !== undefined ? sanitizeString(stored.copilotMode) : defaults.copilotMode;
    const copilotProvider = stored?.copilotProvider !== undefined ? sanitizeString(stored.copilotProvider) : defaults.copilotProvider;
    const copilotMaxTokens = stored?.copilotMaxTokens !== undefined ? Number(stored.copilotMaxTokens) : defaults.copilotMaxTokens;
    const contextAwareEnabled = stored?.contextAwareEnabled !== undefined ? Boolean(stored.contextAwareEnabled) : defaults.contextAwareEnabled;
    const contextMaxTurns = stored?.contextMaxTurns !== undefined ? Math.max(1, Math.min(10, Number(stored.contextMaxTurns) || defaults.contextMaxTurns)) : defaults.contextMaxTurns;
    const contextMaxChars = stored?.contextMaxChars !== undefined ? Math.max(200, Math.min(10000, Number(stored.contextMaxChars) || defaults.contextMaxChars)) : defaults.contextMaxChars;
    const smartRouterProfile = ['balanced', 'performance', 'cost-saver', 'local-first'].includes(stored?.smartRouterProfile)
      ? stored.smartRouterProfile
      : defaults.smartRouterProfile;
    const smartRouterCooldownMs = stored?.smartRouterCooldownMs !== undefined ? Math.max(5000, Number(stored.smartRouterCooldownMs) || defaults.smartRouterCooldownMs) : defaults.smartRouterCooldownMs;
    const customProviders = Array.isArray(stored?.customProviders)
      ? stored.customProviders.map(normalizeCustomProvider).filter(Boolean)
      : defaults.customProviders;
    const multimodalEnabled = stored?.multimodalEnabled !== undefined ? Boolean(stored.multimodalEnabled) : defaults.multimodalEnabled;
    const validVisionPresets = ['auto', 'ui-code', 'error-debug', 'diagram-analysis', 'document-extract', 'general-vision'];
    const visionOptimizationPreset = validVisionPresets.includes(stored?.visionOptimizationPreset)
      ? stored.visionOptimizationPreset
      : defaults.visionOptimizationPreset;
    const privacyModeEnabled = stored?.privacyModeEnabled !== undefined ? Boolean(stored.privacyModeEnabled) : defaults.privacyModeEnabled;
    const defaultCats = defaults.privacyCategories;
    const storedCats = (stored && typeof stored.privacyCategories === 'object') ? stored.privacyCategories : {};
    const privacyCategories = {
      email: storedCats.email !== undefined ? Boolean(storedCats.email) : defaultCats.email,
      phone: storedCats.phone !== undefined ? Boolean(storedCats.phone) : defaultCats.phone,
      creditCard: storedCats.creditCard !== undefined ? Boolean(storedCats.creditCard) : defaultCats.creditCard,
      ssn: storedCats.ssn !== undefined ? Boolean(storedCats.ssn) : defaultCats.ssn,
      ip: storedCats.ip !== undefined ? Boolean(storedCats.ip) : defaultCats.ip,
      apiKey: storedCats.apiKey !== undefined ? Boolean(storedCats.apiKey) : defaultCats.apiKey,
      custom: storedCats.custom !== undefined ? Boolean(storedCats.custom) : defaultCats.custom
    };
    const privacyAutoRestore = stored?.privacyAutoRestore !== undefined ? Boolean(stored.privacyAutoRestore) : defaults.privacyAutoRestore;
    const privacyCustomPatterns = Array.isArray(stored?.privacyCustomPatterns)
      ? stored.privacyCustomPatterns.map((p) => String(p || '').trim()).filter(Boolean)
      : defaults.privacyCustomPatterns;
    const privacyAuditLogEnabled = stored?.privacyAuditLogEnabled !== undefined ? Boolean(stored.privacyAuditLogEnabled) : defaults.privacyAuditLogEnabled;
    const commandPaletteEnabled = stored?.commandPaletteEnabled !== undefined ? Boolean(stored.commandPaletteEnabled) : defaults.commandPaletteEnabled;
    const commandPaletteShortcut = sanitizeString(stored?.commandPaletteShortcut || defaults.commandPaletteShortcut);
    const keyboardShortcutsEnabled = stored?.keyboardShortcutsEnabled !== undefined ? Boolean(stored.keyboardShortcutsEnabled) : defaults.keyboardShortcutsEnabled;

    return {
      schemaVersion: SCHEMA_VERSION,
      provider,
      sidePanelEnabled,
      copilotEnabled,
      copilotMode,
      copilotProvider,
      copilotMaxTokens,
      contextAwareEnabled,
      contextMaxTurns,
      contextMaxChars,
      smartRouterProfile,
      smartRouterCooldownMs,
      multimodalEnabled,
      visionOptimizationPreset,
      privacyModeEnabled,
      privacyCategories,
      privacyAutoRestore,
      privacyCustomPatterns,
      privacyAuditLogEnabled,
      commandPaletteEnabled,
      commandPaletteShortcut,
      keyboardShortcutsEnabled,
      apiKeys,
      models,
      ollama,
      customProviders
    };
  }

  function migrateSettings(stored) {
    return normalizeSettings(stored || {});
  }

  function serializeSettings(settingsInput) {
    const settings = normalizeSettings(settingsInput || {});

    return {
      schemaVersion: SCHEMA_VERSION,
      provider: settings.provider,
      sidePanelEnabled: settings.sidePanelEnabled,
      copilotEnabled: settings.copilotEnabled,
      copilotMode: settings.copilotMode,
      copilotProvider: settings.copilotProvider,
      copilotMaxTokens: settings.copilotMaxTokens,
      contextAwareEnabled: settings.contextAwareEnabled,
      contextMaxTurns: settings.contextMaxTurns,
      contextMaxChars: settings.contextMaxChars,
      smartRouterProfile: settings.smartRouterProfile,
      smartRouterCooldownMs: settings.smartRouterCooldownMs,
      multimodalEnabled: settings.multimodalEnabled,
      visionOptimizationPreset: settings.visionOptimizationPreset,
      privacyModeEnabled: settings.privacyModeEnabled,
      privacyCategories: { ...settings.privacyCategories },
      privacyAutoRestore: settings.privacyAutoRestore,
      privacyCustomPatterns: [...settings.privacyCustomPatterns],
      privacyAuditLogEnabled: settings.privacyAuditLogEnabled,
      commandPaletteEnabled: settings.commandPaletteEnabled,
      commandPaletteShortcut: settings.commandPaletteShortcut,
      keyboardShortcutsEnabled: settings.keyboardShortcutsEnabled,
      apiKeys: { ...settings.apiKeys },
      models: { ...settings.models },
      ollama: { ...settings.ollama },
      customProviders: settings.customProviders.map((p) => ({ ...p })),

      // Legacy compatibility keys for existing extension versions.
      zeus_selected_provider: settings.provider,
      zeus_gemini_api_key: settings.apiKeys.gemini,
      zeus_gemini_model: settings.models.gemini,
      zeus_openai_api_key: settings.apiKeys.openai,
      zeus_openai_model: settings.models.openai,
      zeus_claude_api_key: settings.apiKeys.claude,
      zeus_claude_model: settings.models.claude,
      zeus_openrouter_api_key: settings.apiKeys.openrouter,
      zeus_openrouter_model: settings.models.openrouter,
      zeus_ollama_model: settings.ollama.model,
      zeus_provider_configs: {
        openrouter: {
          apiKey: settings.apiKeys.openrouter,
          model: settings.models.openrouter
        }
      }
    };
  }

  function loadSettings() {
    return new Promise((resolve, reject) => {
      chrome.storage.sync.get(STORAGE_KEYS, (stored) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message || 'Failed to read settings.'));
          return;
        }

        resolve(migrateSettings(stored || {}));
      });
    });
  }

  function saveSettings(settingsInput) {
    const normalized = normalizeSettings(settingsInput || {});
    const payload = serializeSettings(normalized);

    return new Promise((resolve, reject) => {
      chrome.storage.sync.set(payload, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message || 'Failed to save settings.'));
          return;
        }

        resolve({ settings: normalized, payload });
      });
    });
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

  globalScope.ZeusSettings = Object.freeze({
    SCHEMA_VERSION,
    SUPPORTED_PROVIDERS,
    SETTINGS_SCHEMA,
    STORAGE_KEYS,
    createDefaultSettings,
    migrateSettings,
    normalizeSettings,
    serializeSettings,
    loadSettings,
    saveSettings,
    getModelForProvider,
    getApiKeyForProvider,
    normalizeCustomProvider,
    getCustomProviders: (s) => (s && Array.isArray(s.customProviders) ? s.customProviders : []),
    getCustomProvider: (s, id) => (s && Array.isArray(s.customProviders) ? s.customProviders.find((p) => p.id === id) : null)
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
