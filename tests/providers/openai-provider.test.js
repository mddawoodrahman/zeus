const { loadScript, clearZeusGlobals } = require('../utils/runtime');

function makeResponse(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data
  };
}

describe('OpenAI provider with mocked fetch', () => {
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
    loadScript('providers/openai.js');
  });

  afterEach(() => {
    delete globalThis.fetch;
    clearZeusGlobals();
  });

  it('returns enhanced content on successful API response', async () => {
    globalThis.fetch.mockResolvedValueOnce(
      makeResponse(200, {
        choices: [
          {
            message: {
              content: 'Enhanced prompt output'
            }
          }
        ]
      })
    );

    const result = await globalThis.ZeusProviders.openai('raw prompt', {
      apiKeys: { openai: 'sk-test' },
      models: { openai: 'gpt-5.4-mini' }
    });

    expect(result).toBe('Enhanced prompt output');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch.mock.calls[0][0]).toBe('https://api.openai.com/v1/chat/completions');
  });

  it('falls back to next model when model is unavailable', async () => {
    globalThis.fetch
      .mockResolvedValueOnce(
        makeResponse(404, {
          error: {
            code: 'model_not_found',
            message: 'Model does not exist'
          }
        })
      )
      .mockResolvedValueOnce(
        makeResponse(200, {
          choices: [
            {
              message: {
                content: 'Recovered with fallback model'
              }
            }
          ]
        })
      );

    const result = await globalThis.ZeusProviders.openai('raw prompt', {
      apiKeys: { openai: 'sk-test' },
      models: { openai: 'missing-model' }
    });

    expect(result).toBe('Recovered with fallback model');
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(globalThis.ZeusTelemetry.trackFallback).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'provider-fallback',
        provider: 'openai',
        fromModel: 'missing-model'
      })
    );
  });

  it('throws normalized provider error for non-retryable failures', async () => {
    globalThis.fetch.mockResolvedValueOnce(
      makeResponse(401, {
        error: {
          type: 'invalid_request_error',
          message: 'Invalid API key'
        }
      })
    );

    await expect(
      globalThis.ZeusProviders.openai('raw prompt', {
        apiKeys: { openai: 'invalid-key' },
        models: { openai: 'gpt-5.4-mini' }
      })
    ).rejects.toBeInstanceOf(globalThis.ZeusErrors.ProviderHttpError);
  });
});
