const { loadScript, clearZeusGlobals } = require('../utils/runtime');

function makeResponse(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data
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
    loadScript('providers/utils.js');
    loadScript('providers/gemini.js');
  });

  afterEach(() => {
    delete globalThis.fetch;
    clearZeusGlobals();
  });

  it('throws error if API key or model is missing', async () => {
    await expect(
      globalThis.ZeusProviders.gemini('test prompt', { apiKeys: {}, models: { gemini: 'gemini-2.5-flash' } })
    ).rejects.toThrow('Missing Gemini API key.');

    await expect(
      globalThis.ZeusProviders.gemini('test prompt', { apiKeys: { gemini: 'test-key' }, models: {} })
    ).rejects.toThrow('Missing Gemini model.');
  });

  it('returns enhanced content on successful Gemini response', async () => {
    globalThis.fetch.mockResolvedValueOnce(
      makeResponse(200, {
        candidates: [
          {
            content: {
              parts: [{ text: 'Enhanced Gemini prompt' }]
            }
          }
        ]
      })
    );

    const result = await globalThis.ZeusProviders.gemini('raw prompt', {
      apiKeys: { gemini: 'test-gemini-key' },
      models: { gemini: 'gemini-2.5-flash' }
    });

    expect(result).toBe('Enhanced Gemini prompt');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch.mock.calls[0][0]).toContain('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');

    const headers = globalThis.fetch.mock.calls[0][1].headers;
    expect(headers['x-goog-api-key']).toBe('test-gemini-key');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('falls back to alternate model when primary model returns 404', async () => {
    globalThis.fetch
      .mockResolvedValueOnce(makeResponse(404, { error: { message: 'models/gemini-invalid is not found' } }))
      .mockResolvedValueOnce(
        makeResponse(200, {
          candidates: [
            {
              content: {
                parts: [{ text: 'Recovered from fallback model' }]
              }
            }
          ]
        })
      );

    const result = await globalThis.ZeusProviders.gemini('raw prompt', {
      apiKeys: { gemini: 'test-gemini-key' },
      models: { gemini: 'gemini-invalid' }
    });

    expect(result).toBe('Recovered from fallback model');
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});
