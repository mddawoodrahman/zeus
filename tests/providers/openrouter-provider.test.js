const { loadScript, clearZeusGlobals } = require('../utils/runtime');

function makeResponse(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data
  };
}

describe('OpenRouter provider with mocked fetch', () => {
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
    loadScript('providers/openrouter.js');
  });

  afterEach(() => {
    delete globalThis.fetch;
    clearZeusGlobals();
  });

  it('retries with alternate token parameter when model rejects max_tokens field', async () => {
    globalThis.fetch
      .mockResolvedValueOnce(makeResponse(500, {}))
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
                content: 'Recovered on OpenRouter'
              }
            }
          ]
        })
      );

    const result = await globalThis.ZeusProviders.openrouter('raw prompt', {
      apiKeys: { openrouter: 'or-test' },
      models: { openrouter: 'openai/legacy-model' }
    });

    expect(result).toBe('Recovered on OpenRouter');
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);

    const firstCompletionRequestBody = JSON.parse(globalThis.fetch.mock.calls[1][1].body);
    const secondCompletionRequestBody = JSON.parse(globalThis.fetch.mock.calls[2][1].body);

    expect(firstCompletionRequestBody.max_tokens).toBe(2048);
    expect(firstCompletionRequestBody.max_completion_tokens).toBeUndefined();
    expect(secondCompletionRequestBody.max_completion_tokens).toBe(2048);
    expect(secondCompletionRequestBody.max_tokens).toBeUndefined();
  });
});
