const { loadScript, clearZeusGlobals } = require('../utils/runtime');

function makeResponse(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data
  };
}

describe('Ollama provider with mocked fetch', () => {
  beforeEach(() => {
    clearZeusGlobals();

    globalThis.fetch = vi.fn();
    globalThis.ZeusTelemetry = {
      trackFallback: vi.fn()
    };
    globalThis.chrome = {
      runtime: { id: 'test-zeus-id' }
    };

    loadScript('model-registry.js');
    loadScript('core/retry.js');
    loadScript('core/prompts.js');
    loadScript('core/errors.js');
    loadScript('providers/utils.js');
    loadScript('providers/ollama.js');
  });

  afterEach(() => {
    delete globalThis.fetch;
    delete globalThis.chrome;
    clearZeusGlobals();
  });

  it('detects model and returns enhanced prompt on successful response', async () => {
    // 1: Health check
    globalThis.fetch.mockResolvedValueOnce(makeResponse(200, { version: '0.1.28' }));
    // 2: Generate response
    globalThis.fetch.mockResolvedValueOnce(
      makeResponse(200, {
        response: 'Enhanced Ollama prompt',
        done: true
      })
    );

    const result = await globalThis.ZeusProviders.ollama('raw prompt', {
      ollama: { model: 'qwen3:8b' }
    });

    expect(result).toBe('Enhanced Ollama prompt');
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(globalThis.fetch.mock.calls[1][0]).toBe('http://localhost:11434/api/generate');

    const requestBody = JSON.parse(globalThis.fetch.mock.calls[1][1].body);
    expect(requestBody.model).toBe('qwen3:8b');
    expect(requestBody.stream).toBe(false);
  });

  it('throws friendly error when Ollama server is unreachable', async () => {
    globalThis.fetch.mockRejectedValueOnce(new Error('Connection refused'));

    await expect(
      globalThis.ZeusProviders.ollama('raw prompt', { ollama: { model: 'qwen3:8b' } })
    ).rejects.toThrow('Ollama not running. Start with: ollama run qwen3:8b');
  });
});
