const { loadScript, clearZeusGlobals } = require('../utils/runtime');

describe('Router and provider integration', () => {
  afterEach(() => {
    clearZeusGlobals();
  });

  it('passes prompt/config to selected provider', async () => {
    clearZeusGlobals();
    loadScript('model-registry.js');

    const providers = {
      openai: vi.fn().mockResolvedValue('enhanced-by-openai')
    };

    globalThis.ZeusSettings = {
      createDefaultSettings() {
        return { provider: 'gemini' };
      },
      loadSettings: vi.fn().mockResolvedValue({
        provider: 'openai',
        apiKeys: { openai: 'openai-key' },
        models: { openai: 'gpt-5.4-mini' },
        ollama: { model: '' }
      })
    };

    globalThis.ZeusProviders = providers;
    loadScript('core/router.js');

    const result = await globalThis.ZeusRouter.enhancePrompt('Make this clearer');

    expect(result).toBe('enhanced-by-openai');
    expect(providers.openai).toHaveBeenCalledWith(
      'Make this clearer',
      expect.objectContaining({ provider: 'openai' })
    );
  });

  it('falls back to the next provider in auto mode', async () => {
    clearZeusGlobals();
    loadScript('model-registry.js');

    const providers = {
      openai: vi.fn().mockRejectedValue(new Error('temporary failure from openai')),
      claude: vi.fn().mockResolvedValue('enhanced-by-claude'),
      gemini: vi.fn().mockResolvedValue('enhanced-by-gemini'),
      ollama: vi.fn().mockResolvedValue('enhanced-by-ollama')
    };

    const telemetry = {
      trackFallback: vi.fn()
    };

    globalThis.ZeusSettings = {
      createDefaultSettings() {
        return { provider: 'gemini' };
      },
      loadSettings: vi.fn().mockResolvedValue({
        provider: 'auto',
        apiKeys: {
          openai: 'openai-key',
          claude: 'claude-key',
          gemini: 'gemini-key',
          openrouter: ''
        },
        models: {
          openai: 'gpt-5.3-codex',
          claude: 'claude-sonnet-4.6',
          gemini: 'gemini-3-flash',
          openrouter: 'openai/gpt-5.4'
        },
        ollama: { model: '' }
      })
    };

    globalThis.ZeusProviders = providers;
    globalThis.ZeusTelemetry = telemetry;

    loadScript('core/router.js');

    const result = await globalThis.ZeusRouter.enhancePrompt('Please debug this stack trace');

    expect(result).toBe('enhanced-by-claude');
    expect(providers.openai.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(providers.claude).toHaveBeenCalledTimes(1);
    expect(telemetry.trackFallback).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'auto-route-fallback',
        provider: 'openai',
        stage: 'provider-candidate-error'
      })
    );
  });

  it('routes streamSuggest to configured provider suggest method', async () => {
    clearZeusGlobals();
    loadScript('model-registry.js');

    const mockSuggest = vi.fn().mockImplementation(async (text, settings, port, signal) => {
      port.postMessage({ type: 'chunk', text: 'suggested' });
    });

    const providers = {
      claude: Object.assign(vi.fn(), { suggest: mockSuggest })
    };

    globalThis.ZeusSettings = {
      createDefaultSettings() {
        return { provider: 'claude' };
      },
      loadSettings: vi.fn().mockResolvedValue({
        copilotProvider: 'claude',
        apiKeys: { claude: 'claude-key' }
      })
    };

    globalThis.ZeusProviders = providers;
    loadScript('core/router.js');

    const port = { postMessage: vi.fn() };
    const abortController = new AbortController();

    await globalThis.ZeusRouter.streamSuggest('Write a python script', {
      copilotProvider: 'claude',
      apiKeys: { claude: 'claude-key' }
    }, port, abortController.signal);

    expect(mockSuggest).toHaveBeenCalledWith(
      'Write a python script',
      expect.objectContaining({ copilotProvider: 'claude' }),
      port,
      abortController.signal
    );
    expect(port.postMessage).toHaveBeenCalledWith({ type: 'chunk', text: 'suggested' });
  });

  it('routes to openrouter in auto mode when only an OpenRouter API key is configured', async () => {
    clearZeusGlobals();
    loadScript('model-registry.js');

    const providers = {
      openai: vi.fn().mockRejectedValue(new Error('missing')),
      claude: vi.fn().mockRejectedValue(new Error('missing')),
      gemini: vi.fn().mockRejectedValue(new Error('missing')),
      openrouter: vi.fn().mockResolvedValue('enhanced-by-openrouter'),
      ollama: vi.fn().mockRejectedValue(new Error('ollama offline'))
    };

    globalThis.ZeusSettings = {
      createDefaultSettings: () => ({ provider: 'gemini' }),
      loadSettings: vi.fn().mockResolvedValue({
        provider: 'auto',
        apiKeys: { openai: '', claude: '', gemini: '', openrouter: 'or-key' },
        models: { openrouter: 'openai/gpt-5.4' },
        ollama: { model: '' }
      })
    };

    globalThis.ZeusProviders = providers;
    globalThis.ZeusTelemetry = { trackFallback: vi.fn() };
    loadScript('core/router.js');

    const result = await globalThis.ZeusRouter.enhancePrompt('Improve this marketing summary');
    expect(result).toBe('enhanced-by-openrouter');
    expect(providers.openrouter).toHaveBeenCalledTimes(1);
  });
});
