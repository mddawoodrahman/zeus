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
});
