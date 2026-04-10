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

    const requestBody = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(requestBody.max_completion_tokens).toBe(1024);
    expect(requestBody.max_tokens).toBeUndefined();
  });

  it('retries with alternate token parameter when model rejects max_tokens field', async () => {
    globalThis.fetch
      .mockResolvedValueOnce(
        makeResponse(400, {
          error: {
            type: 'invalid_request_error',
            message: "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead."
          }
        })
      )
      .mockResolvedValueOnce(
        makeResponse(200, {
          choices: [
            {
              message: {
                content: 'Recovered with alternate token field'
              }
            }
          ]
        })
      );

    const result = await globalThis.ZeusProviders.openai('raw prompt', {
      apiKeys: { openai: 'sk-test' },
      models: { openai: 'legacy-model' }
    });

    expect(result).toBe('Recovered with alternate token field');
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);

    const firstRequestBody = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    const secondRequestBody = JSON.parse(globalThis.fetch.mock.calls[1][1].body);

    expect(firstRequestBody.max_tokens).toBe(1024);
    expect(firstRequestBody.max_completion_tokens).toBeUndefined();
    expect(secondRequestBody.max_completion_tokens).toBe(1024);
    expect(secondRequestBody.max_tokens).toBeUndefined();
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
