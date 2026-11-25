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
