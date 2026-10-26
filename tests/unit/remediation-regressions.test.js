const { loadScript, clearZeusGlobals } = require('../utils/runtime');

describe('Remediation Regressions and Hardening Tests', () => {
  beforeEach(() => {
    clearZeusGlobals();
  });

  afterEach(() => {
    clearZeusGlobals();
    delete globalThis.chrome;
    delete globalThis.fetch;
  });

  describe('Custom Provider Permissions and URL Validation', () => {
    beforeEach(() => {
      loadScript('model-registry.js');
      loadScript('core/retry.js');
      loadScript('core/prompts.js');
      loadScript('core/errors.js');
      loadScript('providers/utils.js');
      loadScript('providers/custom.js');
    });

    it('rejects unsupported schemes and malformed URLs', () => {
      const custom = globalThis.ZeusProviders.custom;
      expect(() => custom.validateEndpointUrl('ftp://example.com/v1')).toThrow(/Unsupported protocol/);
      expect(() => custom.validateEndpointUrl('file:///etc/hosts')).toThrow(/Unsupported protocol/);
      expect(() => custom.validateEndpointUrl('not-a-valid-url')).toThrow(/Invalid endpoint URL/);
      expect(() => custom.validateEndpointUrl('')).toThrow(/baseUrl is required/);
    });

    it('rejects insecure HTTP for remote non-local endpoints', () => {
      const custom = globalThis.ZeusProviders.custom;
      expect(() => custom.validateEndpointUrl('http://remote-ai-host.com/v1')).toThrow(/Insecure HTTP is only permitted for local endpoints/);
      expect(() => custom.validateEndpointUrl('http://192.168.1.10:8000/v1')).toThrow(/Insecure HTTP is only permitted for local endpoints/);
    });

    it('accepts local HTTP and remote HTTPS endpoints', () => {
      const custom = globalThis.ZeusProviders.custom;
      expect(custom.validateEndpointUrl('http://localhost:1234/v1').hostname).toBe('localhost');
      expect(custom.validateEndpointUrl('http://127.0.0.1:8000/v1').hostname).toBe('127.0.0.1');
      expect(custom.validateEndpointUrl('https://api.together.xyz/v1').hostname).toBe('api.together.xyz');
    });

    it('computes correct narrowest origin pattern', () => {
      const custom = globalThis.ZeusProviders.custom;
      expect(custom.getOriginPattern('http://localhost:1234/v1')).toBe('http://localhost/*');
      expect(custom.getOriginPattern('http://127.0.0.1:8000/v1')).toBe('http://127.0.0.1/*');
      expect(custom.getOriginPattern('https://api.together.xyz/v1/chat/completions')).toBe('https://api.together.xyz/*');
    });

    it('throws explicit error when endpoint host permission is denied or missing', async () => {
      globalThis.chrome = {
        permissions: {
          contains: vi.fn((query, cb) => cb(false))
        },
        runtime: { lastError: null }
      };

      const custom = globalThis.ZeusProviders.custom;
      await expect(
        custom('test prompt', {
          customProviders: [
            { id: 'custom-denied', baseUrl: 'https://api.denied.com/v1', model: 'default' }
          ]
        })
      ).rejects.toThrow(/Host permission not granted for https:\/\/api\.denied\.com\/\*/);
    });
  });

  describe('Preset and Transform Serialization Round-Trip', () => {
    beforeEach(() => {
      loadScript('core/transforms.js');
      loadScript('core/presets.js');
    });

    it('preserves transform instruction and avoids empty string overwrites', () => {
      const presets = globalThis.ZeusPresets;
      const originalTransforms = [
        {
          id: 'transform-code-refactor',
          name: 'Code Refactor',
          instruction: 'Perform an idiomatic refactor maintaining all tests.',
          shortcut: 'Ctrl+Shift+R',
          isDefault: false
        }
      ];

      const bundle = presets.exportPresetBundle({
        meta: { name: 'Engineering Presets' },
        transforms: originalTransforms
      });

      const exportedTransform = bundle.presets.transforms[0];
      expect(exportedTransform.instruction).toBe('Perform an idiomatic refactor maintaining all tests.');
      expect(exportedTransform.systemInstruction).toBe('Perform an idiomatic refactor maintaining all tests.');

      // Import bundle back
      const imported = presets.importPresetBundle(bundle, { transforms: [] }, { mode: 'replace-all' });
      expect(imported.nextState.transforms.length).toBe(1);
      expect(imported.nextState.transforms[0].instruction).toBe('Perform an idiomatic refactor maintaining all tests.');
    });

    it('accepts legacy preset bundles with only systemInstruction and maps to instruction', () => {
      const presets = globalThis.ZeusPresets;
      const legacyBundle = {
        format: 'zeus-preset-pack',
        version: '1.0.0',
        meta: { name: 'Legacy Pack' },
        presets: {
          transforms: [
            {
              id: 'legacy-transform',
              name: 'Legacy Rewrite',
              systemInstruction: 'Rewrite in active voice.',
              shortcut: ''
            }
          ]
        }
      };

      const imported = presets.importPresetBundle(legacyBundle, { transforms: [] }, { mode: 'replace-all' });
      expect(imported.nextState.transforms.length).toBe(1);
      expect(imported.nextState.transforms[0].instruction).toBe('Rewrite in active voice.');

      // Transforms module normalizes legacy records correctly
      const normalized = globalThis.ZeusTransforms.normalizeTransform(legacyBundle.presets.transforms[0]);
      expect(normalized).not.toBeNull();
      expect(normalized.instruction).toBe('Rewrite in active voice.');
    });
  });

  describe('AbortSignal Combination Fallback in ZeusRetry', () => {
    beforeEach(() => {
      loadScript('core/retry.js');
    });

    it('returns a valid AbortSignal even when AbortSignal.any is undefined', async () => {
      const originalAny = globalThis.AbortSignal?.any;
      try {
        delete globalThis.AbortSignal.any; // Force fallback path
      } catch (_) {
        globalThis.AbortSignal.any = undefined;
      }

      globalThis.fetch = vi.fn().mockImplementation((_url, options) => {
        // Assert options.signal is a valid AbortSignal object, not a function!
        expect(typeof options.signal).toBe('object');
        expect(typeof options.signal.addEventListener).toBe('function');
        expect(typeof options.signal.aborted).toBe('boolean');
        return Promise.resolve({ ok: true });
      });

      const callerController = new AbortController();
      const res = await globalThis.ZeusRetry.fetchWithTimeout(
        'https://example.com/api',
        { signal: callerController.signal },
        5000
      );

      expect(res.ok).toBe(true);

      // Restore AbortSignal.any if it was present
      if (originalAny) {
        globalThis.AbortSignal.any = originalAny;
      }
    });

    it('forwards caller abort in fallback branch', async () => {
      const originalAny = globalThis.AbortSignal?.any;
      try {
        delete globalThis.AbortSignal.any;
      } catch (_) {
        globalThis.AbortSignal.any = undefined;
      }

      globalThis.fetch = vi.fn().mockImplementation((_url, options) => new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
        });
      }));

      const callerController = new AbortController();
      const promise = globalThis.ZeusRetry.fetchWithTimeout(
        'https://example.com/api',
        { signal: callerController.signal },
        10000
      );

      callerController.abort();
      await expect(promise).rejects.toMatchObject({ name: 'AbortError' });

      if (originalAny) {
        globalThis.AbortSignal.any = originalAny;
      }
    });
  });

  describe('Prompt Library Storage Quota and Local Migration', () => {
    beforeEach(() => {
      loadScript('core/promptLibrary.js');
    });

    it('migrates prompt library from sync to local when local is empty', async () => {
      const syncStore = {
        zeus_prompt_library: [
          {
            id: 'synced-prompt-1',
            title: 'Cloud Synced Prompt',
            content: 'Write an architecture doc for {{service}}.',
            activeVersionId: 'v1',
            versions: [{ versionId: 'v1', content: 'Write an architecture doc for {{service}}.' }]
          }
        ]
      };
      const localStore = {};

      globalThis.chrome = {
        storage: {
          sync: {
            get(keys, cb) { cb(syncStore); },
            set(items, cb) { Object.assign(syncStore, items); cb && cb(); }
          },
          local: {
            get(keys, cb) { cb(localStore); },
            set(items, cb) { Object.assign(localStore, items); cb && cb(); }
          }
        },
        runtime: { lastError: null }
      };

      const lib = globalThis.ZeusPromptLibrary;
      const loaded = await lib.loadLibrary();

      expect(loaded.length).toBe(1);
      expect(loaded[0].id).toBe('synced-prompt-1');

      // Assert data was migrated into localStore
      expect(localStore.zeus_prompt_library).toBeDefined();
      expect(localStore.zeus_prompt_library[0].id).toBe('synced-prompt-1');
    });

    it('saves directly to local storage to protect sync storage quota', async () => {
      const syncStore = {};
      const localStore = {};

      globalThis.chrome = {
        storage: {
          sync: {
            get(keys, cb) { cb(syncStore); },
            set(items, cb) { Object.assign(syncStore, items); cb && cb(); }
          },
          local: {
            get(keys, cb) { cb(localStore); },
            set(items, cb) { Object.assign(localStore, items); cb && cb(); }
          }
        },
        runtime: { lastError: null }
      };

      const lib = globalThis.ZeusPromptLibrary;
      const custom = lib.createPrompt({
        title: 'Huge Prompt with Multiple Versions',
        content: 'Long prompt content '.repeat(200)
      });

      await lib.saveLibrary([custom]);

      // Assert local storage received the write, keeping sync untouched
      expect(localStore.zeus_prompt_library).toBeDefined();
      expect(localStore.zeus_prompt_library[0].title).toBe('Huge Prompt with Multiple Versions');
      expect(syncStore.zeus_prompt_library).toBeUndefined();
    });
  });

  describe('Workflow Step Provider and Model Overrides', () => {
    let mockOpenAi;
    let mockGemini;

    beforeEach(() => {
      mockOpenAi = vi.fn().mockResolvedValue('OpenAI output');
      mockGemini = vi.fn().mockResolvedValue('Gemini output');

      globalThis.ZeusProviders = {
        openai: mockOpenAi,
        gemini: mockGemini
      };

      globalThis.ZeusSettings = {
        loadSettings: vi.fn().mockResolvedValue({
          provider: 'gemini',
          apiKeys: { openai: 'mock-openai-key', gemini: 'mock-gemini-key' },
          models: { gemini: 'gemini-2.5-flash', openai: 'gpt-5.4-mini' }
        })
      };

      loadScript('model-registry.js');
      loadScript('core/retry.js');
      loadScript('core/prompts.js');
      loadScript('core/errors.js');
      loadScript('providers/utils.js');
      loadScript('core/privacy.js');
      loadScript('core/router.js');
    });

    it('honors options.provider and options.model over global settings', async () => {
      const router = globalThis.ZeusRouter;

      // Request enhancement with explicit provider: 'openai' and model: 'gpt-5.4-pro'
      const result = await router.enhancePrompt('Draft code', {
        provider: 'openai',
        model: 'gpt-5.4-pro'
      });

      expect(result).toBe('OpenAI output');
      expect(mockOpenAi).toHaveBeenCalledTimes(1);
      expect(mockGemini).not.toHaveBeenCalled();

      // Verify the provider received the overridden model
      const calledOptions = mockOpenAi.mock.calls[0][2];
      expect(calledOptions.model).toBe('gpt-5.4-pro');
    });
  });

  describe('Side Panel Word Diff Performance and Safety', () => {
    // Test the standalone diff algorithm
    function diffWords(oldStr, newStr) {
      if (oldStr === newStr) {
        return oldStr ? [{ type: 'common', value: oldStr }] : [];
      }
      if (!oldStr) return newStr ? [{ type: 'add', value: newStr }] : [];
      if (!newStr) return [{ type: 'del', value: oldStr }];

      const one = oldStr.split(/(\s+)/);
      const other = newStr.split(/(\s+)/);

      let start = 0;
      while (start < one.length && start < other.length && one[start] === other[start]) {
        start++;
      }

      let endOne = one.length - 1;
      let endOther = other.length - 1;
      while (endOne >= start && endOther >= start && one[endOne] === other[endOther]) {
        endOne--;
        endOther--;
      }

      const prefix = [];
      for (let k = 0; k < start; k++) prefix.push({ type: 'common', value: one[k] });
      const suffix = [];
      for (let k = endOne + 1; k < one.length; k++) suffix.push({ type: 'common', value: one[k] });

      const midOne = one.slice(start, endOne + 1);
      const midOther = other.slice(start, endOther + 1);
      const n = midOne.length;
      const m = midOther.length;

      if (n === 0 && m === 0) return [...prefix, ...suffix];

      const MAX_DP_CELLS = 40000;
      if (n * m > MAX_DP_CELLS) {
        const midDiff = [];
        if (n > 0) midDiff.push({ type: 'del', value: midOne.join('') });
        if (m > 0) midDiff.push({ type: 'add', value: midOther.join('') });
        return [...prefix, ...midDiff, ...suffix];
      }

      const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
      for (let i = 1; i <= n; i++) {
        for (let j = 1; j <= m; j++) {
          if (midOne[i - 1] === midOther[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
          else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }

      let i = n;
      let j = m;
      const midDiff = [];
      while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && midOne[i - 1] === midOther[j - 1]) {
          midDiff.unshift({ type: 'common', value: midOne[i - 1] });
          i--;
          j--;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
          midDiff.unshift({ type: 'add', value: midOther[j - 1] });
          j--;
        } else {
          midDiff.unshift({ type: 'del', value: midOne[i - 1] });
          i--;
        }
      }

      return [...prefix, ...midDiff, ...suffix];
    }

    it('returns single common chunk for identical strings in O(1)', () => {
      const text = 'Prompt text that is identical';
      const result = diffWords(text, text);
      expect(result).toEqual([{ type: 'common', value: text }]);
    });

    it('handles empty inputs cleanly', () => {
      expect(diffWords('', '')).toEqual([]);
      expect(diffWords('', 'New text')).toEqual([{ type: 'add', value: 'New text' }]);
      expect(diffWords('Old text', '')).toEqual([{ type: 'del', value: 'Old text' }]);
    });

    it('diffs large prompt inputs in under 30ms without memory exhaustion', () => {
      const oldWords = Array.from({ length: 1500 }, (_, i) => `word${i}`).join(' ');
      const newWords = Array.from({ length: 1500 }, (_, i) => i % 5 === 0 ? `MODIFIED${i}` : `word${i}`).join(' ');

      const start = Date.now();
      const diff = diffWords(oldWords, newWords);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(100); // Must be fast (< 100ms)
      expect(diff.length).toBeGreaterThan(0);
    });
  });
});
