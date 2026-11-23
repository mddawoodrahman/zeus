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
        fromModel: 'gemini-3.1-pro'
      })
    );
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

    expect(port.postMessage).toHaveBeenCalledWith({ type: 'chunk', text: ' continue' });
    expect(port.postMessage).toHaveBeenCalledWith({ type: 'chunk', text: ' writing prompt' });
    expect(port.postMessage).toHaveBeenCalledWith({ type: 'done' });
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
