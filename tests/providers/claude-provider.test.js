const { loadScript, clearZeusGlobals } = require('../utils/runtime');

function makeResponse(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data
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
    loadScript('providers/utils.js');
    loadScript('providers/claude.js');
  });

  afterEach(() => {
    delete globalThis.fetch;
    clearZeusGlobals();
  });

  it('throws error if API key or model is missing', async () => {
    await expect(
      globalThis.ZeusProviders.claude('test prompt', { apiKeys: {}, models: { claude: 'claude-sonnet-4.6' } })
    ).rejects.toThrow('Missing Claude API key.');

    await expect(
      globalThis.ZeusProviders.claude('test prompt', { apiKeys: { claude: 'sk-ant-test' }, models: {} })
    ).rejects.toThrow('Missing Claude model.');
  });

  it('returns enhanced content on successful Claude response', async () => {
    globalThis.fetch.mockResolvedValueOnce(
      makeResponse(200, {
        content: [
          { type: 'text', text: 'Enhanced Claude prompt' }
        ]
      })
    );

    const result = await globalThis.ZeusProviders.claude('raw prompt', {
      apiKeys: { claude: 'sk-ant-test-key' },
      models: { claude: 'claude-sonnet-4.6' }
    });

    expect(result).toBe('Enhanced Claude prompt');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch.mock.calls[0][0]).toBe('https://api.anthropic.com/v1/messages');

    const headers = globalThis.fetch.mock.calls[0][1].headers;
    expect(headers['x-api-key']).toBe('sk-ant-test-key');
    expect(headers['anthropic-version']).toBe('2023-06-01');
  });

  it('falls back to alternate model when model is not found or unsupported', async () => {
    globalThis.fetch
      .mockResolvedValueOnce(makeResponse(404, { error: { type: 'not_found_error', message: 'model not found' } }))
      .mockResolvedValueOnce(
        makeResponse(200, {
          content: [{ type: 'text', text: 'Recovered from Claude fallback' }]
        })
      );

    const result = await globalThis.ZeusProviders.claude('raw prompt', {
      apiKeys: { claude: 'sk-ant-test-key' },
      models: { claude: 'unsupported-claude-model' }
    });

    expect(result).toBe('Recovered from Claude fallback');
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});
