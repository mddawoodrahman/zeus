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

  it('uses configured ollama.host across health, generate, and suggest endpoints', async () => {
    globalThis.fetch
      .mockResolvedValueOnce(makeResponse(200, { version: '0.1.30' }))
      .mockResolvedValueOnce(makeResponse(200, { response: 'Enhanced via 127.0.0.1' }));

    const result = await globalThis.ZeusProviders.ollama('raw prompt', {
      ollama: { host: 'http://127.0.0.1:11435/', model: 'qwen3:8b' }
    });

    expect(result).toBe('Enhanced via 127.0.0.1');
    expect(globalThis.fetch.mock.calls[0][0]).toBe('http://127.0.0.1:11435/api/version');
    expect(globalThis.fetch.mock.calls[1][0]).toBe('http://127.0.0.1:11435/api/generate');

    globalThis.fetch
      .mockResolvedValueOnce(makeResponse(200, { version: '0.1.30' }))
      .mockResolvedValueOnce(makeStreamResponse([JSON.stringify({ response: ' ok', done: true }) + '\n']));

    const port = { postMessage: vi.fn() };
    await globalThis.ZeusProviders.ollama.suggest('Prompt', {
      ollama: { host: 'http://127.0.0.1:11435', model: 'qwen3:8b' }
    }, port, null);

    expect(globalThis.fetch.mock.calls[2][0]).toBe('http://127.0.0.1:11435/api/version');
    expect(globalThis.fetch.mock.calls[3][0]).toBe('http://127.0.0.1:11435/api/generate');
  });

  it('rethrows caller AbortError without misclassifying timeout aborts as OLLAMA_NOT_RUNNING_MESSAGE', async () => {
    const controller = new AbortController();
    const timeoutAbortError = new Error('Enhancement request timed out after 25ms.');
    timeoutAbortError.name = 'AbortError';

    globalThis.fetch
      .mockResolvedValueOnce(makeResponse(200, { version: '0.1.30' }))
      .mockImplementationOnce((_url, opts) => new Promise((_resolve, reject) => {
        if (opts?.signal?.aborted) {
          reject(timeoutAbortError);
          return;
        }
        opts?.signal?.addEventListener('abort', () => {
          reject(timeoutAbortError);
        }, { once: true });
      }));

    setTimeout(() => controller.abort(timeoutAbortError), 15);

    await expect(
      globalThis.ZeusProviders.ollama('raw prompt', {
        ollama: { host: 'http://localhost:11434', model: 'qwen3:8b' },
        signal: controller.signal
      })
    ).rejects.toMatchObject({
      name: 'AbortError',
      message: 'Enhancement request timed out after 25ms.'
    });
  });

  describe('discoverLocalModels & discoverModels', () => {
    it('discovers version, running models, and deduplicated installed models from configured host', async () => {
      globalThis.chrome = { runtime: { id: 'ollama-disc-id' } };
      globalThis.fetch
        .mockResolvedValueOnce(makeResponse(200, { version: '0.6.2' }))
        .mockResolvedValueOnce(makeResponse(200, { models: [{ model: 'qwen3:8b' }] }))
        .mockResolvedValueOnce(makeResponse(200, { models: [{ name: 'qwen3:8b' }, { name: 'llama4' }] }));

      const discovery = await globalThis.ZeusOllamaMeta.discoverLocalModels({
        ollama: { host: 'http://127.0.0.1:11435/' }
      });

      expect(discovery).toEqual({
        reachable: true,
        originBlocked: false,
        origin: 'chrome-extension://ollama-disc-id',
        version: '0.6.2',
        running: ['qwen3:8b'],
        installed: ['qwen3:8b', 'llama4'],
        models: ['qwen3:8b', 'llama4'],
        error: ''
      });
      expect(globalThis.fetch.mock.calls[0][0]).toBe('http://127.0.0.1:11435/api/version');
      expect(globalThis.fetch.mock.calls[1][0]).toBe('http://127.0.0.1:11435/api/ps');
      expect(globalThis.fetch.mock.calls[2][0]).toBe('http://127.0.0.1:11435/api/tags');
      expect(globalThis.ZeusProviders.ollama.discoverModels).toBe(globalThis.ZeusOllamaMeta.discoverLocalModels);
      delete globalThis.chrome;
    });

    it('returns reachable: true with empty models when Ollama has no running or installed models', async () => {
      globalThis.fetch
        .mockResolvedValueOnce(makeResponse(200, { version: '0.6.2' }))
        .mockResolvedValueOnce(makeResponse(200, { models: [] }))
        .mockResolvedValueOnce(makeResponse(200, { models: [] }));

      const discovery = await globalThis.ZeusOllamaMeta.discoverLocalModels({});
      expect(discovery.reachable).toBe(true);
      expect(discovery.originBlocked).toBe(false);
      expect(discovery.models).toEqual([]);
      expect(discovery.error).toBe('');
    });

    it('detects HTTP 403 origin blocking with scoped extension origin and zero wildcard', async () => {
      globalThis.chrome = { runtime: { id: 'scoped-disc-ext' } };
      globalThis.fetch.mockResolvedValueOnce(makeResponse(403, { error: 'Forbidden origin' }));

      const discovery = await globalThis.ZeusOllamaMeta.discoverLocalModels({});
      expect(discovery.reachable).toBe(false);
      expect(discovery.originBlocked).toBe(true);
      expect(discovery.origin).toBe('chrome-extension://scoped-disc-ext');
      expect(discovery.error).toContain('chrome-extension://scoped-disc-ext');
      expect(discovery.error).not.toContain('*');
      delete globalThis.chrome;
    });

    it('reports reachable: false with OLLAMA_NOT_RUNNING_MESSAGE on connection error', async () => {
      globalThis.fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      const discovery = await globalThis.ZeusOllamaMeta.discoverLocalModels({});
      expect(discovery.reachable).toBe(false);
      expect(discovery.originBlocked).toBe(false);
      expect(discovery.models).toEqual([]);
      expect(discovery.error).toBe(globalThis.ZeusOllamaMeta.OLLAMA_NOT_RUNNING_MESSAGE);
    });
  });
});
