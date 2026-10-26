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

  describe('Endpoint URL and Host Permission Validation', () => {
    it('validates HTTPS remote endpoints correctly', () => {
      const custom = globalThis.ZeusProviders.custom;
      const parsed = custom.validateEndpointUrl('https://api.together.xyz/v1');
      expect(parsed.protocol).toBe('https:');
      expect(parsed.hostname).toBe('api.together.xyz');
      expect(custom.getOriginPattern('https://api.together.xyz/v1')).toBe('https://api.together.xyz/*');
    });

    it('rejects remote HTTP endpoints to protect user tokens over the wire', () => {
      const custom = globalThis.ZeusProviders.custom;
      expect(() => custom.validateEndpointUrl('http://api.together.xyz/v1')).toThrow(
        /Insecure HTTP is only permitted for local endpoints/
      );
      expect(() => custom.validateEndpointUrl('http://192.168.1.50:8000/v1')).toThrow(
        /Insecure HTTP is only permitted for local endpoints/
      );
    });

    it('allows local HTTP exceptions for localhost, 127.0.0.1, and [::1]', () => {
      const custom = globalThis.ZeusProviders.custom;
      expect(custom.validateEndpointUrl('http://localhost:1234/v1').hostname).toBe('localhost');
      expect(custom.validateEndpointUrl('http://127.0.0.1:8000/v1').hostname).toBe('127.0.0.1');
      expect(custom.validateEndpointUrl('http://[::1]:11434/v1').hostname).toBe('[::1]');
    });

    it('fails safely for unsupported protocols and malformed URLs', () => {
      const custom = globalThis.ZeusProviders.custom;
      expect(() => custom.validateEndpointUrl('ftp://api.example.com/v1')).toThrow(/Unsupported protocol/);
      expect(() => custom.validateEndpointUrl('ws://localhost:1234')).toThrow(/Unsupported protocol/);
      expect(() => custom.validateEndpointUrl('file:///etc/hosts')).toThrow(/Unsupported protocol/);
      expect(() => custom.validateEndpointUrl('not-a-valid-url')).toThrow(/Invalid endpoint URL/);
      expect(() => custom.validateEndpointUrl('')).toThrow(/baseUrl is required/);
    });

    it('rejects enhance requests when origin permission is not granted', async () => {
      // Mock chrome.permissions.contains returning false (permission denied)
      globalThis.chrome = {
        permissions: {
          contains: vi.fn((_query, cb) => cb(false))
        },
        runtime: { lastError: null }
      };

      await expect(
        globalThis.ZeusProviders.custom('test prompt', {
          customProviders: [
            {
              id: 'custom-unapproved',
              baseUrl: 'https://api.unapproved-origin.com/v1',
              apiKey: 'sk-token'
            }
          ]
        })
      ).rejects.toThrow(/Host permission not granted for https:\/\/api\.unapproved-origin\.com\/\*/);

      expect(globalThis.fetch).not.toHaveBeenCalled();
      delete globalThis.chrome;
    });

    it('rejects suggest requests when origin permission is not granted', async () => {
      globalThis.chrome = {
        permissions: {
          contains: vi.fn((_query, cb) => cb(false))
        },
        runtime: { lastError: null }
      };

      const messages = [];
      const mockPort = {
        postMessage: vi.fn((msg) => messages.push(msg))
      };

      await globalThis.ZeusProviders.custom.suggest('suggest prompt', {
        customProviders: [
          {
            id: 'custom-unapproved',
            baseUrl: 'https://api.unapproved-origin.com/v1'
          }
        ]
      }, mockPort);

      expect(messages.length).toBe(1);
      expect(messages[0].type).toBe('error');
      expect(messages[0].message).toContain('Host permission not granted');
      expect(globalThis.fetch).not.toHaveBeenCalled();
      delete globalThis.chrome;
    });
  });
});

