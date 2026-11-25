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
    loadScript('core/providerTransport.js');
    loadScript('providers/utils.js');
    loadScript('providers/openrouter.js');
  });

  afterEach(() => {
    delete globalThis.fetch;
    clearZeusGlobals();
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
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);

    const firstCompletionRequestBody = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    const secondCompletionRequestBody = JSON.parse(globalThis.fetch.mock.calls[1][1].body);

    expect(firstCompletionRequestBody.max_tokens).toBe(2048);
    expect(firstCompletionRequestBody.max_completion_tokens).toBeUndefined();
    expect(secondCompletionRequestBody.max_completion_tokens).toBe(2048);
    expect(secondCompletionRequestBody.max_tokens).toBeUndefined();
  });

  it('restricts fallbacks to curated models without sweeping /api/v1/models and retries 429 on the active model', async () => {
    globalThis.fetch
      .mockResolvedValueOnce(makeResponse(429, { error: { message: 'Rate limited' } }))
      .mockResolvedValueOnce(makeResponse(200, { choices: [{ message: { content: 'Recovered after 429 retry' } }] }));

    const result = await globalThis.ZeusProviders.openrouter('raw prompt', {
      apiKeys: { openrouter: 'or-test' },
      models: { openrouter: 'openai/gpt-5.4' }
    });

    expect(result).toBe('Recovered after 429 retry');
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(globalThis.fetch.mock.calls.every(([url]) => url === 'https://openrouter.ai/api/v1/chat/completions')).toBe(true);
    expect(JSON.parse(globalThis.fetch.mock.calls[0][1].body).model).toBe('openai/gpt-5.4');
    expect(JSON.parse(globalThis.fetch.mock.calls[1][1].body).model).toBe('openai/gpt-5.4');
  });

  it('streams copilot suggestions via ProviderTransport SSE decoder using inferChatTokenParam', async () => {
    const ssePayload = [
      'data: {"choices":[{"delta":{"content":" suggested"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" completion"}}]}\n\n',
      'data: [DONE]\n\n'
    ];

    globalThis.fetch.mockResolvedValueOnce(makeStreamResponse(ssePayload));

    const port = { postMessage: vi.fn() };
    await globalThis.ZeusProviders.openrouter.suggest('Help me', {
      apiKeys: { openrouter: 'or-key' },
      models: { openrouter: 'openai/gpt-5.4' },
      copilotMaxTokens: 80
    }, port, null);

    const reqBody = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(reqBody.max_completion_tokens).toBe(80);
    expect(reqBody.max_tokens).toBeUndefined();
    expect(port.postMessage).toHaveBeenCalledWith({ type: 'chunk', text: ' suggested' });
    expect(port.postMessage).toHaveBeenCalledWith({ type: 'chunk', text: ' completion' });
    expect(port.postMessage).toHaveBeenCalledWith({ type: 'done' });
  });

  it('throws error when missing OpenRouter API key', async () => {
    await expect(
      globalThis.ZeusProviders.openrouter('prompt', {
        apiKeys: { openrouter: '' },
        models: { openrouter: 'openai/gpt-5.4' }
      })
    ).rejects.toThrow('Missing OpenRouter API key.');
  });
});
