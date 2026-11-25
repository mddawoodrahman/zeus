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
    headers: new Headers({ 'content-type': 'text/event-stream' }),
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

describe('Gemini provider with mocked fetch', () => {
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
    loadScript('providers/gemini.js');
  });

  afterEach(() => {
    delete globalThis.fetch;
    clearZeusGlobals();
  });

  it('falls back to next model on high-demand unavailable errors', async () => {
    globalThis.fetch
      .mockResolvedValueOnce(
        makeResponse(503, {
          error: {
            status: 'UNAVAILABLE',
            message: 'This model is currently experiencing high demand. Please try again later.'
          }
        })
      )
      .mockResolvedValueOnce(
        makeResponse(200, {
          candidates: [
            {
              content: {
                parts: [{ text: 'Enhanced by fallback Gemini model' }]
              }
            }
          ]
        })
      );

    const result = await globalThis.ZeusProviders.gemini('raw prompt', {
      apiKeys: { gemini: 'gemini-key' },
      models: { gemini: 'gemini-3.1-pro' }
    });

    expect(result).toBe('Enhanced by fallback Gemini model');
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(globalThis.ZeusTelemetry.trackFallback).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'provider-fallback',
        provider: 'gemini',
        fromModel: 'gemini-3.1-pro-preview'
      })
    );
  });

  it('uses the corrected saved Flash model and advances once on a model 404', async () => {
    fetch.mockResolvedValueOnce(makeResponse(404, { error: { status: 'NOT_FOUND' } }))
      .mockResolvedValueOnce(makeResponse(200, {
        candidates: [{ content: { parts: [{ text: 'enhanced' }] } }]
      }));

    const result = await ZeusProviders.gemini('draft', {
      apiKeys: { gemini: 'test-key' }, models: { gemini: 'models/gemini-3-flash' }
    });
    const base = 'https://generativelanguage.googleapis.com/v1beta/models/';
    expect(result).toBe('enhanced');
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      base + 'gemini-flash-latest:generateContent', base + 'gemini-3.5-flash-lite:generateContent'
    ]);
    for (const [, request] of fetch.mock.calls) {
      expect(request.headers['x-goog-api-key']).toBe('test-key');
    }
  });

  it('stops after the last distinct candidate if Google returns only 404s', async () => {
    fetch.mockResolvedValue(makeResponse(404, {
      error: { status: 'NOT_FOUND', message: 'The requested model is unavailable.' }
    }));
    const result = ZeusProviders.gemini('draft', { apiKeys: { gemini: 'test-key' } });
    await expect(result).rejects.toMatchObject({ status: 404, model: 'gemini-3.1-flash-lite' });
    const urls = fetch.mock.calls.map(([url]) => url);
    expect(urls).toHaveLength(3);
    expect(new Set(urls).size).toBe(3);
  });

  it('streams copilot suggestions via ProviderTransport SSE decoder', async () => {
    const ssePayload = [
      'data: {"candidates":[{"content":{"parts":[{"text":" continue"}]}}]}\n\n',
      'data: {"candidates":[{"content":{"parts":[{"text":" writing prompt"}]}}]}\n\n',
      'data: [DONE]\n\n'
    ];

    globalThis.fetch.mockResolvedValueOnce(makeStreamResponse(ssePayload));

    const port = { postMessage: vi.fn() };
    await globalThis.ZeusProviders.gemini.suggest('User prompt', {
      apiKeys: { gemini: 'test-key' },
      models: { gemini: 'gemini-3-flash' }
    }, port, null);

    expect(fetch).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:streamGenerateContent?alt=sse',
      expect.objectContaining({ headers: expect.objectContaining({ 'x-goog-api-key': 'test-key' }) })
    );
    expect(port.postMessage).toHaveBeenCalledWith({ type: 'chunk', text: ' continue' });
    expect(port.postMessage).toHaveBeenCalledWith({ type: 'chunk', text: ' writing prompt' });
    expect(port.postMessage).toHaveBeenCalledWith({ type: 'done' });
  });

  it('ignores thought parts in Gemini enhance() and suggest() responses', async () => {
    globalThis.fetch.mockResolvedValueOnce(
      makeResponse(200, {
        candidates: [{
          content: {
            parts: [
              { text: 'internal reasoning trace', thought: true },
              { text: 'Clean enhanced output' }
            ]
          }
        }]
      })
    );

    const enhanced = await globalThis.ZeusProviders.gemini('draft prompt', {
      apiKeys: { gemini: 'test-key' },
      models: { gemini: 'gemini-3.1-pro-preview' }
    });
    expect(enhanced).toBe('Clean enhanced output');

    const ssePayload = [
      'data: {"candidates":[{"content":{"parts":[{"text":"thinking...","thought":true}]}}]}\n\n',
      'data: {"candidates":[{"content":{"parts":[{"text":"still thinking","thought":true},{"text":" actual completion"}]}}]}\n\n',
      'data: [DONE]\n\n'
    ];
    globalThis.fetch.mockResolvedValueOnce(makeStreamResponse(ssePayload));

    const port = { postMessage: vi.fn() };
    await globalThis.ZeusProviders.gemini.suggest('draft prompt', {
      apiKeys: { gemini: 'test-key' },
      models: { gemini: 'gemini-3.1-pro-preview' }
    }, port, null);

    expect(port.postMessage).toHaveBeenCalledTimes(2);
    expect(port.postMessage).toHaveBeenNthCalledWith(1, { type: 'chunk', text: ' actual completion' });
    expect(port.postMessage).toHaveBeenNthCalledWith(2, { type: 'done' });
  });

  it('throws when missing Gemini API key', async () => {
    await expect(
      globalThis.ZeusProviders.gemini('test prompt', {
        apiKeys: { gemini: '' },
        models: { gemini: 'gemini-3-flash' }
      })
    ).rejects.toThrow('Missing Gemini API key.');
  });
});
