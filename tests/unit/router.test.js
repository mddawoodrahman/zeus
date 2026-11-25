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
      ollama: vi.fn().mockResolvedValue('ollama-result'),
      openrouter: vi.fn().mockResolvedValue('openrouter-result')
    };

    providers.openai.suggest = vi.fn().mockResolvedValue();
    providers.claude.suggest = vi.fn().mockResolvedValue();
    providers.gemini.suggest = vi.fn().mockResolvedValue();
    providers.ollama.suggest = vi.fn().mockResolvedValue();
    providers.openrouter.suggest = vi.fn().mockResolvedValue();

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

  it('detects coding, cheap, long-form, and default intents without downgrading domain nouns', () => {
    expect(globalThis.ZeusRouter.detectPromptIntent('debug this python function')).toBe('coding');
    expect(globalThis.ZeusRouter.detectPromptIntent('need a cheap quick rewrite')).toBe('cheap');
    expect(globalThis.ZeusRouter.detectPromptIntent('give me a low-cost answer')).toBe('cheap');
    expect(globalThis.ZeusRouter.detectPromptIntent('write a comprehensive in-depth article')).toBe('long-form');
    expect(globalThis.ZeusRouter.detectPromptIntent('build a Q4 marketing budget forecast')).toBe('default');
    expect(globalThis.ZeusRouter.detectPromptIntent('design a lightweight aluminum frame')).toBe('default');
    expect(globalThis.ZeusRouter.detectPromptIntent('hello there')).toBe('default');
  });

  it('builds de-duplicated auto-route candidates including openrouter', () => {
    const candidates = globalThis.ZeusRouter.buildAutoRouteCandidates({
      provider: 'openai',
      model: 'gpt-5.4-mini'
    });

    const signatures = candidates.map((item) => `${item.provider}:${item.model}`);
    expect(new Set(signatures).size).toBe(signatures.length);
    expect(signatures[0]).toBe('openai:gpt-5.4-mini');
    expect(candidates.some((item) => item.provider === 'openrouter' && Boolean(item.model))).toBe(true);
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

  it('streamSuggest routes to the correct provider and calls suggest', async () => {
    const port = { postMessage: vi.fn() };
    const abortSignal = {};
    const settings = {
      copilotProvider: 'gemini',
      apiKeys: { gemini: 'gemini-key' }
    };

    await globalThis.ZeusRouter.streamSuggest('how to', settings, port, abortSignal);

    expect(providers.gemini.suggest).toHaveBeenCalledWith('how to', settings, port, abortSignal);
  });

  it('falls back from unavailable ollama to configured cloud provider in copilot auto mode', async () => {
    providers.ollama.suggest.mockRejectedValueOnce(new Error('Ollama not running'));
    providers.gemini.suggest.mockImplementationOnce(async (_text, _settings, port) => {
      port.postMessage({ type: 'chunk', text: ' cloud fallback' });
      port.postMessage({ type: 'done' });
    });

    const port = { postMessage: vi.fn(), disconnect: vi.fn() };
    const settings = {
      copilotProvider: 'auto',
      ollama: { model: 'qwen3:8b' },
      apiKeys: { gemini: 'gemini-key' }
    };

    await globalThis.ZeusRouter.streamSuggest('Finish this prompt', settings, port, new AbortController().signal);

    expect(providers.ollama.suggest).toHaveBeenCalledTimes(1);
    expect(providers.gemini.suggest).toHaveBeenCalledTimes(1);
    expect(port.postMessage).toHaveBeenCalledWith({ type: 'chunk', text: ' cloud fallback' });
    expect(port.postMessage).toHaveBeenCalledWith({ type: 'done' });
  });

  it('posts error and closes port when copilot auto mode has no available provider or keys', async () => {
    const port = { postMessage: vi.fn(), disconnect: vi.fn() };
    const settings = {
      copilotProvider: 'auto',
      ollama: { model: '' },
      apiKeys: { gemini: '', openai: '', claude: '', openrouter: '' }
    };

    await globalThis.ZeusRouter.streamSuggest('Finish this prompt', settings, port, new AbortController().signal);

    expect(port.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
    expect(port.disconnect).toHaveBeenCalledTimes(1);
  });
});
