const { loadScript, clearZeusGlobals } = require('../utils/runtime');

function makeResponse(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data
  };
}

describe('Custom OpenAI-compatible provider with mocked fetch', () => {
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
    loadScript('providers/custom.js');
  });

  afterEach(() => {
    delete globalThis.fetch;
    clearZeusGlobals();
  });

  it('normalizes various endpoint URLs correctly', () => {
    const custom = globalThis.ZeusProviders.custom;
    expect(custom.normalizeEndpoint('http://localhost:1234')).toBe('http://localhost:1234/v1/chat/completions');
    expect(custom.normalizeEndpoint('http://localhost:1234/v1')).toBe('http://localhost:1234/v1/chat/completions');
    expect(custom.normalizeEndpoint('http://localhost:1234/v1/')).toBe('http://localhost:1234/v1/chat/completions');
    expect(custom.normalizeEndpoint('https://api.together.xyz/v1/chat/completions')).toBe('https://api.together.xyz/v1/chat/completions');
    expect(() => custom.normalizeEndpoint('')).toThrow();
  });

  it('resolves custom config matching provider id or first enabled', () => {
    const custom = globalThis.ZeusProviders.custom;
    const config = {
      customProviders: [
        { id: 'custom-lmstudio', name: 'LM Studio', baseUrl: 'http://localhost:1234/v1', model: 'qwen' },
        { id: 'custom-vllm', name: 'vLLM', baseUrl: 'http://localhost:8000/v1', model: 'llama3' }
      ]
    };

    expect(custom.resolveCustomConfig(config, 'custom-vllm').id).toBe('custom-vllm');
    expect(custom.resolveCustomConfig(config, 'custom').id).toBe('custom-lmstudio');
    expect(custom.resolveCustomConfig({}, 'custom')).toBeNull();
  });

  it('returns enhanced content on successful API response with Bearer auth', async () => {
    globalThis.fetch.mockResolvedValueOnce(
      makeResponse(200, {
        choices: [
          {
            message: {
              content: 'Enhanced prompt from custom provider'
            }
          }
        ]
      })
    );

    const result = await globalThis.ZeusProviders.custom('raw prompt', {
      customProviders: [
        {
          id: 'custom-1',
          name: 'Local vLLM',
          baseUrl: 'http://localhost:8000/v1',
          model: 'mistral-7b',
          apiKey: 'sk-custom-secret'
        }
      ]
    });

    expect(result).toBe('Enhanced prompt from custom provider');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch.mock.calls[0][0]).toBe('http://localhost:8000/v1/chat/completions');

    const headers = globalThis.fetch.mock.calls[0][1].headers;
    expect(headers['Authorization']).toBe('Bearer sk-custom-secret');
    expect(headers['Content-Type']).toBe('application/json');

    const requestBody = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(requestBody.model).toBe('mistral-7b');
    expect(requestBody.messages[1].content).toContain('raw prompt');
  });

  it('omits Authorization header when apiKey is empty (local Ollama/LM Studio compatibility)', async () => {
    globalThis.fetch.mockResolvedValueOnce(
      makeResponse(200, {
        choices: [
          {
            message: {
              content: 'Enhanced locally without auth'
            }
          }
        ]
      })
    );

    const result = await globalThis.ZeusProviders.custom('raw prompt', {
      customProviders: [
        {
          id: 'custom-local',
          baseUrl: 'http://localhost:1234/v1',
          apiKey: ''
        }
      ]
    });

    expect(result).toBe('Enhanced locally without auth');
    const headers = globalThis.fetch.mock.calls[0][1].headers;
    expect(headers['Authorization']).toBeUndefined();
  });

  it('applies customHeaders if configured', async () => {
    globalThis.fetch.mockResolvedValueOnce(
      makeResponse(200, {
        choices: [
          {
            message: {
              content: 'Custom headers accepted'
            }
          }
        ]
      })
    );

    await globalThis.ZeusProviders.custom('test', {
      customProviders: [
        {
          id: 'custom-headers',
          baseUrl: 'http://localhost:1234/v1',
          customHeaders: {
            'X-Custom-Routing': 'node-beta'
          }
        }
      ]
    });

    const headers = globalThis.fetch.mock.calls[0][1].headers;
    expect(headers['X-Custom-Routing']).toBe('node-beta');
  });

  it('throws an error when provider returns empty choices or no message content', async () => {
    globalThis.fetch.mockResolvedValue(
      makeResponse(200, {
        choices: []
      })
    );

    await expect(
      globalThis.ZeusProviders.custom('test', {
        customProviders: [
          {
            id: 'custom-empty',
            baseUrl: 'http://localhost:1234/v1'
          }
        ]
      })
    ).rejects.toThrow();
  });

  it('suggest streams completion chunks to port', async () => {
    globalThis.fetch.mockResolvedValueOnce(
      makeResponse(200, {
        choices: [
          {
            message: {
              content: 'suggestion completion'
            }
          }
        ]
      })
    );

    const messages = [];
    const mockPort = {
      postMessage: vi.fn((msg) => messages.push(msg))
    };

    await globalThis.ZeusProviders.custom.suggest('incomplete user input', {
      customProviders: [
        {
          id: 'custom-copilot',
          baseUrl: 'http://localhost:1234/v1',
          model: 'qwen-coder'
        }
      ],
      copilotMaxTokens: 40
    }, mockPort);

    expect(messages).toEqual([
      { type: 'chunk', text: 'suggestion completion' },
      { type: 'done' }
    ]);
  });
});
