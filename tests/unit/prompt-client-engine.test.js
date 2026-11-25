const { loadScript, clearZeusGlobals } = require('../utils/runtime');

describe('Ticket 04: MV3 Process-Split Prompt Architecture (PromptClient & PromptEngine)', () => {
  let runtimeMessages;
  let chromeMock;

  const FIXTURES = {
    apiKey: 'sk-proj-supersecretkey1234567890',
    postgresUri: 'postgres://admin:top_secret_pw@db.internal:5432/zeus',
    email: 'dev@company.example.com'
  };

  beforeEach(() => {
    clearZeusGlobals();
    runtimeMessages = [];

    chromeMock = {
      runtime: {
        id: 'test-zeus-id',
        lastError: null,
        sendMessage(msg, callback) {
          runtimeMessages.push(msg);
          if (typeof callback === 'function') {
            if (msg.action === 'enhancePrompt') {
              // Simulated background engine echo
              callback({
                success: true,
                enhancedText: `OPTIMIZED:\n${msg.prompt}`,
                enhancedPrompt: `OPTIMIZED:\n${msg.prompt}`,
                warnings: [],
                meta: { provider: 'openai', model: 'gpt-5.4-mini', durationMs: 42 }
              });
            } else {
              callback({ success: true });
            }
          }
        }
      },
      storage: {
        local: {
          set: vi.fn((_data, cb) => { if (cb) cb(); }),
          get: vi.fn((_keys, cb) => { if (cb) cb({}); })
        },
        sync: {
          get: vi.fn((_keys, cb) => { if (cb) cb({}); }),
          set: vi.fn((_data, cb) => { if (cb) cb(); })
        }
      }
    };

    globalThis.chrome = chromeMock;
  });

  afterEach(() => {
    delete globalThis.chrome;
    clearZeusGlobals();
  });

  describe('1. PromptClient (Renderer / Untrusted Context)', () => {
    beforeEach(() => {
      loadScript('core/redactor.js');
      loadScript('core/promptClient.js');
    });

    it('scrubs secrets client-side so plaintext credentials NEVER cross chrome.runtime.sendMessage', async () => {
      const rawPrompt = `Deploy database ${FIXTURES.postgresUri} with apiKey ${FIXTURES.apiKey}`;

      const result = await globalThis.ZeusPromptClient.enhance(rawPrompt);

      expect(runtimeMessages).toHaveLength(1);
      const ipcMessage = runtimeMessages[0];
      expect(ipcMessage.action).toBe('enhancePrompt');

      // INVARIANT: Plaintext secrets must NEVER be present in the IPC message
      expect(ipcMessage.prompt).not.toContain(FIXTURES.postgresUri);
      expect(ipcMessage.prompt).not.toContain(FIXTURES.apiKey);
      expect(ipcMessage.prompt).toContain('[[ZEUS_SECRET_1]]');
      expect(ipcMessage.prompt).toContain('[[ZEUS_SECRET_2]]');
      expect(ipcMessage.secretMap).toBeUndefined();

      // Client rehydrates secrets locally
      expect(result.enhancedText).toContain(FIXTURES.postgresUri);
      expect(result.enhancedText).toContain(FIXTURES.apiKey);
      expect(result.originalText).toBe(rawPrompt);
    });

    it('returns a structured return payload with warnings and metadata', async () => {
      const rawPrompt = 'Analyze the performance of this SQL query';
      const result = await globalThis.ZeusPromptClient.enhance(rawPrompt);

      expect(result).toHaveProperty('enhancedText');
      expect(result).toHaveProperty('originalText', rawPrompt);
      expect(result).toHaveProperty('warnings');
      expect(result).toHaveProperty('meta');
      expect(Array.isArray(result.warnings)).toBe(true);
      expect(result.meta.provider).toBe('openai');
      expect(result.meta.durationMs).toBe(42);
      expect(result.meta.hasRedactions).toBe(false);
    });

    it('captures dropped placeholder warnings when AI model omits a secret placeholder', async () => {
      chromeMock.runtime.sendMessage = (msg, callback) => {
        runtimeMessages.push(msg);
        // AI model completely drops the placeholder
        callback({
          success: true,
          enhancedText: 'OPTIMIZED: Deploy database on cloud without credential',
          warnings: [],
          meta: { provider: 'openai', model: 'gpt-5.4-mini' }
        });
      };

      const rawPrompt = `Deploy database with secret ${FIXTURES.apiKey}`;
      const result = await globalThis.ZeusPromptClient.enhance(rawPrompt);

      expect(result.meta.hasRedactions).toBe(true);
      expect(result.meta.droppedPlaceholders).toContain('[[ZEUS_SECRET_1]]');
      expect(result.warnings.some((w) => w.includes('SENSITIVE PLACEHOLDER OMITTED'))).toBe(true);
    });

    it('rejects with error when prompt is empty or whitespace', async () => {
      await expect(globalThis.ZeusPromptClient.enhance('   ')).rejects.toThrow('Empty prompt provided.');
    });

    it('normalizes IPC error responses into thrown errors', async () => {
      chromeMock.runtime.sendMessage = (_msg, callback) => {
        callback({ success: false, error: 'Provider network timeout' });
      };

      await expect(globalThis.ZeusPromptClient.enhance('Test prompt')).rejects.toThrow('Provider network timeout');
    });

    it('propagates structured error metadata (code, category, provider, retryable, errorDetail) from IPC failures', async () => {
      const detail = {
        code: 'AUTH_FAILED',
        category: 'AUTHENTICATION_ERROR',
        provider: 'gemini',
        model: 'gemini-flash-latest',
        status: 401,
        retryable: false,
        userMessage: 'Invalid Gemini API key. Please verify your key in Zeus settings.'
      };
      chromeMock.runtime.sendMessage = (_msg, callback) => {
        callback({
          success: false,
          error: detail.userMessage,
          errorDetail: detail
        });
      };

      let caught = null;
      try {
        await globalThis.ZeusPromptClient.enhance('Optimize this prompt');
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(Error);
      expect(caught.message).toBe(detail.userMessage);
      expect(caught.code).toBe('AUTH_FAILED');
      expect(caught.category).toBe('AUTHENTICATION_ERROR');
      expect(caught.provider).toBe('gemini');
      expect(caught.retryable).toBe(false);
      expect(caught.errorDetail).toEqual(detail);
    });
  });

  describe('2. PromptEngine (Privileged Background Service Worker)', () => {
    beforeEach(() => {
      globalThis.ZeusTelemetry = { trackFallback: vi.fn() };
      globalThis.ZeusProviders = {
        gemini: vi.fn().mockResolvedValue('Enhanced by Gemini'),
        openai: vi.fn().mockResolvedValue('Enhanced by OpenAI'),
        claude: vi.fn().mockResolvedValue('Enhanced by Claude')
      };
      globalThis.ZeusSettings = {
        createDefaultSettings() { return { provider: 'gemini' }; },
        loadSettings: vi.fn().mockResolvedValue({
          provider: 'gemini',
          apiKeys: { gemini: 'gm-key', openai: 'sk-key', claude: 'cl-key' },
          models: { gemini: 'gemini-3-flash' }
        })
      };

      loadScript('model-registry.js');
      loadScript('core/router.js');
      loadScript('core/redactor.js');
      loadScript('core/promptEngine.js');
    });

    it('executes prompt through configured provider and returns structured payload', async () => {
      const result = await globalThis.ZeusPromptEngine.execute('Enhance my marketing copy');

      expect(result.enhancedText).toBe('Enhanced by Gemini');
      expect(result.meta.provider).toBe('gemini');
      expect(typeof result.meta.durationMs).toBe('number');
      expect(globalThis.ZeusProviders.gemini).toHaveBeenCalledTimes(1);
    });

    it('performs defense-in-depth scrubbing on direct background calls with secrets', async () => {
      const rawPrompt = `Direct background prompt with ${FIXTURES.postgresUri}`;

      const result = await globalThis.ZeusPromptEngine.execute(rawPrompt);

      expect(globalThis.ZeusProviders.gemini).toHaveBeenCalled();
      const calledPrompt = globalThis.ZeusProviders.gemini.mock.calls[0][0];

      // Provider must receive scrubbed text
      expect(calledPrompt).not.toContain(FIXTURES.postgresUri);
      expect(calledPrompt).toContain('[[ZEUS_SECRET_1]]');

      // Rehydrates before returning to caller
      expect(result.enhancedText).toContain('Enhanced by Gemini');
      expect(result.warnings.some((w) => w.includes('Defense-in-depth'))).toBe(true);
    });

    it('cascades auto-fallback and records telemetry on provider failure', async () => {
      globalThis.ZeusSettings.loadSettings = vi.fn().mockResolvedValue({
        provider: 'auto',
        apiKeys: { openai: 'sk-key', claude: 'cl-key', gemini: 'gm-key' },
        models: { openai: 'gpt-5.3-codex', claude: 'claude-3-7-sonnet', gemini: 'gemini-3-flash' }
      });

      // Primary OpenAI fails, fallback Claude succeeds
      globalThis.ZeusProviders.openai.mockRejectedValueOnce(new Error('OpenAI 503 Overloaded'));
      globalThis.ZeusProviders.claude.mockResolvedValueOnce('Recovered by Claude fallback');

      const result = await globalThis.ZeusPromptEngine.execute('def solve_problem(): pass');

      expect(result.enhancedText).toBe('Recovered by Claude fallback');
      expect(result.meta.provider).toBe('claude');
      expect(globalThis.ZeusTelemetry.trackFallback).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'auto-route-fallback',
          provider: 'openai'
        })
      );
    });

    it('honors redactionEnabled: false and customRedactionPatterns from SettingsStore before scrubbing', async () => {
      globalThis.ZeusSettings.loadSettings = vi.fn().mockResolvedValue({
        provider: 'gemini',
        redactionEnabled: false,
        customRedactionPatterns: ['PROJECT_OMEGA'],
        apiKeys: { gemini: 'gm-key' },
        models: { gemini: 'gemini-3-flash' }
      });

      const rawPrompt = `Direct prompt with ${FIXTURES.postgresUri} and PROJECT_OMEGA`;
      const result = await globalThis.ZeusPromptEngine.execute(rawPrompt);

      expect(globalThis.ZeusProviders.gemini.mock.calls[0][0]).toBe(rawPrompt);
      expect(result.warnings).toEqual([]);

      globalThis.ZeusSettings.loadSettings = vi.fn().mockResolvedValue({
        provider: 'gemini',
        redactionEnabled: true,
        customRedactionPatterns: ['PROJECT_OMEGA'],
        apiKeys: { gemini: 'gm-key' },
        models: { gemini: 'gemini-3-flash' }
      });

      const scrubbedResult = await globalThis.ZeusPromptEngine.execute('Direct prompt for PROJECT_OMEGA');
      expect(globalThis.ZeusProviders.gemini.mock.calls[1][0]).toContain('[[ZEUS_SECRET_1]]');
      expect(scrubbedResult.warnings.some((w) => w.includes('Defense-in-depth'))).toBe(true);
    });

    it('propagates options.timeoutMs via AbortController and stops fallback attempts on timeout', async () => {
      globalThis.ZeusSettings.loadSettings = vi.fn().mockResolvedValue({
        provider: 'auto',
        apiKeys: { openai: 'sk-key', claude: 'cl-key' },
        models: { openai: 'gpt-5.3-codex', claude: 'claude-sonnet-4.6' }
      });

      let capturedSignal = null;
      globalThis.ZeusProviders.openai.mockImplementation((_prompt, cfg) => {
        capturedSignal = cfg.signal;
        return new Promise((_resolve, reject) => {
          cfg.signal?.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      });

      await expect(
        globalThis.ZeusPromptEngine.execute('debug this python function', { timeoutMs: 25 })
      ).rejects.toThrow();

      expect(capturedSignal).toBeDefined();
      expect(capturedSignal.aborted).toBe(true);
      expect(globalThis.ZeusProviders.claude).not.toHaveBeenCalled();
    });

    it('interrupts provider retry backoff immediately on timeoutMs abort instead of throwing stale ProviderHttpError', async () => {
      const origFetch = globalThis.fetch;
      globalThis.ZeusSettings.loadSettings = vi.fn().mockResolvedValue({
        provider: 'openai',
        apiKeys: { openai: 'sk-key' },
        models: { openai: 'gpt-5-mini' }
      });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        headers: { get: () => null },
        json: async () => ({ error: { message: 'Temporary service unavailable' } }),
        text: async () => JSON.stringify({ error: { message: 'Temporary service unavailable' } })
      });

      try {
        loadScript('core/errors.js');
        loadScript('core/retry.js');
        loadScript('providers/utils.js');
        loadScript('core/prompts.js');
        loadScript('providers/openai.js');
        loadScript('core/promptEngine.js');

        const startedAt = Date.now();
        await expect(
          globalThis.ZeusPromptEngine.execute('Polish this prompt', { timeoutMs: 30 })
        ).rejects.toMatchObject({
          name: 'AbortError'
        });
        expect(Date.now() - startedAt).toBeLessThan(500);
        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      } finally {
        globalThis.fetch = origFetch;
      }
    });

    it('pre-checks missing API key in direct cloud modes and throws ProviderConfigError(NOT_CONFIGURED) without calling providers', async () => {
      loadScript('core/errors.js');
      loadScript('core/promptEngine.js');

      for (const provider of ['gemini', 'openai', 'claude', 'openrouter']) {
        globalThis.ZeusProviders[provider] = vi.fn().mockResolvedValue('should-not-run');
        globalThis.ZeusSettings.loadSettings = vi.fn().mockResolvedValue({
          provider,
          apiKeys: { gemini: '', openai: '', claude: '', openrouter: '' },
          models: { [provider]: 'some-model' },
          ollama: { host: 'http://localhost:11434', model: '' }
        });

        let caught = null;
        try {
          await globalThis.ZeusPromptEngine.execute('Enhance this');
        } catch (err) {
          caught = err;
        }

        expect(caught).toBeInstanceOf(globalThis.ZeusErrors.ProviderConfigError);
        expect(caught.code).toBe('NOT_CONFIGURED');
        expect(caught.provider).toBe(provider);
        expect(caught.errorDetail?.code).toBe('NOT_CONFIGURED');
        expect(globalThis.ZeusProviders[provider]).not.toHaveBeenCalled();
      }
    });

    it('pre-checks missing Ollama model and throws ProviderConfigError(NOT_CONFIGURED) without calling Ollama', async () => {
      loadScript('core/errors.js');
      loadScript('core/promptEngine.js');

      globalThis.ZeusProviders.ollama = vi.fn().mockResolvedValue('should-not-run');
      globalThis.ZeusSettings.loadSettings = vi.fn().mockResolvedValue({
        provider: 'ollama',
        apiKeys: {},
        models: {},
        ollama: { host: 'http://localhost:11434', model: '' }
      });

      let caught = null;
      try {
        await globalThis.ZeusPromptEngine.execute('Enhance locally');
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(globalThis.ZeusErrors.ProviderConfigError);
      expect(caught.code).toBe('NOT_CONFIGURED');
      expect(caught.provider).toBe('ollama');
      expect(globalThis.ZeusProviders.ollama).not.toHaveBeenCalled();
    });

    it('gates unconfigured auto mode before network calls and records skippedProviders when falling back', async () => {
      loadScript('core/errors.js');
      loadScript('core/promptEngine.js');

      globalThis.ZeusProviders.openrouter = vi.fn().mockResolvedValue('Recovered via OpenRouter');
      globalThis.ZeusProviders.ollama = vi.fn().mockResolvedValue('Recovered via Ollama');

      // 1. Zero configured backends -> immediate NOT_CONFIGURED
      globalThis.ZeusSettings.loadSettings = vi.fn().mockResolvedValue({
        provider: 'auto',
        apiKeys: { gemini: '', openai: '', claude: '', openrouter: '' },
        models: {},
        ollama: { host: 'http://localhost:11434', model: '' }
      });

      let caught = null;
      try {
        await globalThis.ZeusPromptEngine.execute('debug this python function');
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(globalThis.ZeusErrors.ProviderConfigError);
      expect(caught.code).toBe('NOT_CONFIGURED');
      expect(caught.provider).toBe('auto');
      expect(caught.details?.skippedProviders).toEqual(
        expect.arrayContaining(['openai', 'claude', 'gemini', 'openrouter', 'ollama'])
      );
      expect(globalThis.ZeusProviders.openai).not.toHaveBeenCalled();
      expect(globalThis.ZeusProviders.gemini).not.toHaveBeenCalled();

      // 2. Only OpenRouter configured -> skips unconfigured providers cleanly and tracks skippedProviders
      globalThis.ZeusSettings.loadSettings = vi.fn().mockResolvedValue({
        provider: 'auto',
        apiKeys: { gemini: '', openai: '', claude: '', openrouter: 'or-key-only' },
        models: { openrouter: 'openai/gpt-5.4' },
        ollama: { host: 'http://localhost:11434', model: '' }
      });

      const res = await globalThis.ZeusPromptEngine.execute('debug this python function');
      expect(res.enhancedText).toBe('Recovered via OpenRouter');
      expect(res.meta.provider).toBe('openrouter');
      expect(res.meta.skippedProviders).toEqual(['openai', 'claude', 'gemini']);
    });

    it('attaches normalized error metadata (code, category, provider, retryable, errorDetail) on HTTP errors', async () => {
      loadScript('core/errors.js');
      loadScript('core/promptEngine.js');

      globalThis.ZeusSettings.loadSettings = vi.fn().mockResolvedValue({
        provider: 'claude',
        apiKeys: { claude: 'sk-ant-invalid-secret' },
        models: { claude: 'claude-sonnet-4.6' }
      });

      globalThis.ZeusProviders.claude.mockRejectedValueOnce(
        new globalThis.ZeusErrors.ProviderHttpError('claude', 401, { error: { message: 'Invalid x-api-key sk-ant-invalid-secret' } }, 'claude-sonnet-4.6')
      );

      let caught = null;
      try {
        await globalThis.ZeusPromptEngine.execute('Improve this specification');
      } catch (err) {
        caught = err;
      }

      expect(caught.code).toBe('AUTH_FAILED');
      expect(caught.category).toBe('AUTHENTICATION_ERROR');
      expect(caught.provider).toBe('claude');
      expect(caught.retryable).toBe(false);
      expect(caught.errorDetail?.userMessage).not.toContain('sk-ant-invalid-secret');
    });

    it('records all failing candidate attempts in fallbackAttempts when auto mode exhausts >= 2 configured providers', async () => {
      loadScript('core/errors.js');
      loadScript('core/promptEngine.js');

      globalThis.ZeusSettings.loadSettings = vi.fn().mockResolvedValue({
        provider: 'auto',
        apiKeys: { openai: 'oa-key', claude: 'cl-key', gemini: 'gem-key', openrouter: '' },
        models: { openai: 'gpt-5.3-codex', claude: 'claude-sonnet-4.6', gemini: 'gemini-flash-latest' },
        ollama: { host: 'http://localhost:11434', model: '' }
      });

      globalThis.ZeusProviders.openai = vi.fn().mockRejectedValue(
        new globalThis.ZeusErrors.ProviderHttpError('openai', 503, { error: { message: 'OpenAI overloaded' } }, 'gpt-5.3-codex')
      );
      globalThis.ZeusProviders.claude = vi.fn().mockRejectedValue(
        new globalThis.ZeusErrors.ProviderHttpError('claude', 429, { error: { message: 'Claude rate limited' } }, 'claude-sonnet-4.6')
      );
      globalThis.ZeusProviders.gemini = vi.fn().mockRejectedValue(
        new globalThis.ZeusErrors.ProviderHttpError('gemini', 401, { error: { message: 'Gemini invalid key' } }, 'gemini-flash-latest')
      );

      let caught = null;
      try {
        await globalThis.ZeusPromptEngine.execute('debug this python function');
      } catch (err) {
        caught = err;
      }

      expect(caught).not.toBeNull();
      expect(caught.code).toBe('AUTH_FAILED');
      expect(Array.isArray(caught.fallbackAttempts)).toBe(true);
      expect(caught.fallbackAttempts.some((item) => item.startsWith('openai:'))).toBe(true);
      expect(caught.fallbackAttempts.some((item) => item.startsWith('claude:'))).toBe(true);
      expect(caught.fallbackAttempts.some((item) => item.startsWith('gemini:'))).toBe(true);
    });
  });

  describe('3. Router Delegation Compatibility', () => {
    it('ZeusRouter.enhancePrompt delegates to ZeusPromptEngine.execute', async () => {
      globalThis.ZeusProviders = {
        gemini: vi.fn().mockResolvedValue('Enhanced via Router-Engine delegation')
      };
      globalThis.ZeusSettings = {
        createDefaultSettings() { return { provider: 'gemini' }; },
        loadSettings: vi.fn().mockResolvedValue({
          provider: 'gemini',
          apiKeys: { gemini: 'gm-key' },
          models: { gemini: 'gemini-3-flash' }
        })
      };

      loadScript('model-registry.js');
      loadScript('core/router.js');
      loadScript('core/promptEngine.js');

      const result = await globalThis.ZeusRouter.enhancePrompt('Hello router');
      expect(result).toBe('Enhanced via Router-Engine delegation');
    });
  });
});
