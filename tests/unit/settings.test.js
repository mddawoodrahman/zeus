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

  it('serializes canonical and legacy-compatible keys', () => {
    const payload = globalThis.ZeusSettings.serializeSettings({
      provider: 'claude',
      apiKeys: {
        claude: 'claude-test-key'
      },
      models: {
        claude: 'claude-sonnet-4.6'
      }
    });

    expect(payload.provider).toBe('claude');
    expect(payload.zeus_selected_provider).toBe('claude');
    expect(payload.apiKeys.claude).toBe('claude-test-key');
    expect(payload.zeus_claude_api_key).toBe('claude-test-key');
    expect(payload.models.claude).toBe('claude-sonnet-4.6');
    expect(payload.zeus_claude_model).toBe('claude-sonnet-4.6');
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
});
