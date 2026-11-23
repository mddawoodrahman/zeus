const { loadScript, clearZeusGlobals } = require('../utils/runtime');

function makeResponse(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data
  };
}

function makeStreamResponse(chunks) {
  const encoder = new TextEncoder();
  let index = 0;
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/x-ndjson' }),
    body: {
      getReader: () => ({
        read: async () => {
          if (index < chunks.length) {
            const chunk = chunks[index++];
            return { done: false, value: encoder.encode(chunk) };
          }
          return { done: true, value: undefined };
        },
        releaseLock: () => {}
      })
    }
  };
}

describe('Ollama provider with mocked fetch', () => {
  beforeEach(() => {
    clearZeusGlobals();

    globalThis.fetch = vi.fn();
    globalThis.ZeusTelemetry = {
      trackFallback: vi.fn()
    };

    loadScript('model-registry.js');
    loadScript('core/retry.js');
    loadScript('core/prompts.js');
    loadScript('core/errors.js');
    loadScript('core/providerTransport.js');
    loadScript('providers/utils.js');
    loadScript('providers/ollama.js');
  });

  afterEach(() => {
    delete globalThis.fetch;
    clearZeusGlobals();
  });

  it('returns enhanced output on successful Ollama generate call', async () => {
    // 1. health check
    globalThis.fetch.mockResolvedValueOnce(makeResponse(200, { version: '0.1.30' }));
    // 2. generate response
    globalThis.fetch.mockResolvedValueOnce(makeResponse(200, { response: 'Enhanced locally with Ollama' }));

    const result = await globalThis.ZeusProviders.ollama('raw prompt', {
      ollama: { model: 'qwen3:8b' }
    });

    expect(result).toBe('Enhanced locally with Ollama');
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(globalThis.fetch.mock.calls[0][0]).toBe('http://localhost:11434/api/version');
    expect(globalThis.fetch.mock.calls[1][0]).toBe('http://localhost:11434/api/generate');
  });

  it('streams copilot suggestions using NDJSON decoder via ProviderTransport', async () => {
    // 1. health check
    globalThis.fetch.mockResolvedValueOnce(makeResponse(200, { version: '0.1.30' }));

    // 2. NDJSON stream
    const ndjsonChunks = [
      JSON.stringify({ response: ' local', done: false }) + '\n',
      JSON.stringify({ response: ' completion', done: false }) + '\n',
      JSON.stringify({ response: '', done: true }) + '\n'
    ];
    globalThis.fetch.mockResolvedValueOnce(makeStreamResponse(ndjsonChunks));

    const port = { postMessage: vi.fn() };
    await globalThis.ZeusProviders.ollama.suggest('My local prompt', {
      ollama: { model: 'qwen3:8b' }
    }, port, null);

    expect(port.postMessage).toHaveBeenCalledWith({ type: 'chunk', text: ' local' });
    expect(port.postMessage).toHaveBeenCalledWith({ type: 'chunk', text: ' completion' });
    expect(port.postMessage).toHaveBeenCalledWith({ type: 'done' });
  });

  it('throws friendly message when Ollama is not running', async () => {
    globalThis.fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(
      globalThis.ZeusProviders.ollama('raw prompt', { ollama: { model: 'qwen3:8b' } })
    ).rejects.toThrow('Ollama not running. Start with: ollama run qwen3:8b');
  });
});
