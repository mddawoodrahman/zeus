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

describe('Claude provider with mocked fetch', () => {
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
    loadScript('providers/claude.js');
  });

  afterEach(() => {
    delete globalThis.fetch;
    clearZeusGlobals();
  });

  it('returns enhanced content on successful Claude API response', async () => {
    globalThis.fetch.mockResolvedValueOnce(
      makeResponse(200, {
        content: [
          {
            type: 'text',
            text: 'Enhanced prompt from Claude'
          }
        ]
      })
    );

    const result = await globalThis.ZeusProviders.claude('raw prompt', {
      apiKeys: { claude: 'sk-ant-test' },
      models: { claude: 'claude-3-7-sonnet' }
    });

    expect(result).toBe('Enhanced prompt from Claude');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch.mock.calls[0][0]).toBe('https://api.anthropic.com/v1/messages');

    const headers = globalThis.fetch.mock.calls[0][1].headers;
    expect(headers['x-api-key']).toBe('sk-ant-test');
    expect(headers['anthropic-version']).toBe('2023-06-01');
  });

  it('falls back to next model candidate on model not found error', async () => {
    globalThis.fetch
      .mockResolvedValueOnce(
        makeResponse(404, {
          error: {
            type: 'not_found_error',
            message: 'Model not found'
          }
        })
      )
      .mockResolvedValueOnce(
        makeResponse(200, {
          content: [
            {
              type: 'text',
              text: 'Recovered with fallback Claude model'
            }
          ]
        })
      );

    const result = await globalThis.ZeusProviders.claude('raw prompt', {
      apiKeys: { claude: 'sk-ant-test' },
      models: { claude: 'claude-3-7-sonnet' }
    });

    expect(result).toBe('Recovered with fallback Claude model');
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(globalThis.ZeusTelemetry.trackFallback).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'provider-fallback',
        provider: 'claude',
        fromModel: 'claude-3-7-sonnet'
      })
    );
  });

  it('streams copilot suggestions with typed SSE events (content_block_delta)', async () => {
    const ssePayload = [
      'data: {"type":"message_start","message":{"id":"msg_1","type":"message"}}\n\n',
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" hello"}}\n\n',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" world"}}\n\n',
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null}}\n\n',
      'data: {"type":"message_stop"}\n\n'
    ];

    globalThis.fetch.mockResolvedValueOnce(makeStreamResponse(ssePayload));

    const port = { postMessage: vi.fn() };
    await globalThis.ZeusProviders.claude.suggest('Prompt context', {
      apiKeys: { claude: 'sk-ant-test' },
      models: { claude: 'claude-3-5-haiku' }
    }, port, null);

    expect(port.postMessage).toHaveBeenCalledWith({ type: 'chunk', text: ' hello' });
    expect(port.postMessage).toHaveBeenCalledWith({ type: 'chunk', text: ' world' });
    expect(port.postMessage).toHaveBeenCalledWith({ type: 'done' });
  });

  it('throws ProviderHttpError for non-retryable 401 client error', async () => {
    globalThis.fetch.mockResolvedValueOnce(
      makeResponse(401, {
        error: {
          type: 'authentication_error',
          message: 'Invalid API key'
        }
      })
    );

    await expect(
      globalThis.ZeusProviders.claude('raw prompt', {
        apiKeys: { claude: 'invalid-key' },
        models: { claude: 'claude-3-7-sonnet' }
      })
    ).rejects.toBeInstanceOf(globalThis.ZeusErrors.ProviderHttpError);
  });
});
