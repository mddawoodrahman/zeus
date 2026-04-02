const { loadScript, clearZeusGlobals } = require('../utils/runtime');

describe('ZeusRouter unit behavior', () => {
  let providers;
  let settingsModule;

  beforeEach(() => {
    clearZeusGlobals();
    loadScript('model-registry.js');

    providers = {
      openai: vi.fn().mockResolvedValue('openai-result'),
      claude: vi.fn().mockResolvedValue('claude-result'),
      gemini: vi.fn().mockResolvedValue('gemini-result'),
      ollama: vi.fn().mockResolvedValue('ollama-result')
    };

    settingsModule = {
      createDefaultSettings() {
        return { provider: 'gemini' };
      },
      loadSettings: vi.fn().mockResolvedValue({
        provider: 'openai',
        apiKeys: {
          openai: 'openai-key',
          claude: 'claude-key',
          gemini: 'gemini-key',
          openrouter: 'openrouter-key'
        },
        models: {
          openai: 'gpt-5.4-mini',
          claude: 'claude-sonnet-4.6',
          gemini: 'gemini-3-flash',
          openrouter: 'openai/gpt-5.4'
        },
        ollama: {
          model: ''
        }
      })
    };

    globalThis.ZeusSettings = settingsModule;
    globalThis.ZeusProviders = providers;
    globalThis.ZeusTelemetry = {
      trackFallback: vi.fn()
    };

    loadScript('core/router.js');
  });

  afterEach(() => {
    clearZeusGlobals();
  });

  it('detects coding, cheap, long-form, and default intents', () => {
    expect(globalThis.ZeusRouter.detectPromptIntent('debug this python function')).toBe('coding');
    expect(globalThis.ZeusRouter.detectPromptIntent('need a cheap quick rewrite')).toBe('cheap');
    expect(globalThis.ZeusRouter.detectPromptIntent('write a comprehensive in-depth article')).toBe('long-form');
    expect(globalThis.ZeusRouter.detectPromptIntent('hello there')).toBe('default');
  });

  it('builds de-duplicated auto-route candidates', () => {
    const candidates = globalThis.ZeusRouter.buildAutoRouteCandidates({
      provider: 'openai',
      model: 'gpt-5.4-mini'
    });

    const signatures = candidates.map((item) => `${item.provider}:${item.model}`);
    expect(new Set(signatures).size).toBe(signatures.length);
    expect(signatures[0]).toBe('openai:gpt-5.4-mini');
  });

  it('routes to configured provider when auto mode is disabled', async () => {
    const result = await globalThis.ZeusRouter.enhancePrompt('hello world');

    expect(result).toBe('openai-result');
    expect(settingsModule.loadSettings).toHaveBeenCalledTimes(1);
    expect(providers.openai).toHaveBeenCalledWith(
      'hello world',
      expect.objectContaining({ provider: 'openai' })
    );
  });
});
