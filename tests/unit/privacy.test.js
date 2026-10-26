const { loadScript, clearZeusGlobals } = require('../utils/runtime');

describe('ZeusPrivacy Unit Tests', () => {
  beforeEach(() => {
    clearZeusGlobals();

    const store = {};
    globalThis.chrome = {
      storage: {
        sync: {
          get: vi.fn((keys, cb) => cb(store)),
          set: vi.fn((obj, cb) => {
            Object.assign(store, obj);
            if (cb) cb();
          })
        },
        local: {
          get: vi.fn((keys, cb) => cb(store)),
          set: vi.fn((obj, cb) => {
            Object.assign(store, obj);
            if (cb) cb();
          })
        }
      },
      runtime: {
        lastError: null
      }
    };

    loadScript('core/privacy.js');
    loadScript('settings/settings.js');
  });

  afterEach(() => {
    clearZeusGlobals();
  });

  describe('PII Entity Detection', () => {
    it('detects standard, subdomain, and tagged email addresses', () => {
      const privacy = globalThis.ZeusPrivacy;
      const text = 'Reach out to user@example.com or support+billing@corp.co.uk for help.';
      const result = privacy.scanPromptForPII(text);

      expect(result.hasPII).toBe(true);
      expect(result.count).toBe(2);
      expect(result.countsByCategory.email).toBe(2);
      expect(result.detected.map((d) => d.value)).toEqual([
        'user@example.com',
        'support+billing@corp.co.uk'
      ]);
    });

    it('detects US and international phone numbers while ignoring date strings', () => {
      const privacy = globalThis.ZeusPrivacy;
      const text = 'Call 555-123-4567 or (800) 555-0199 or +44 20 7946 0958. Date is 2026-10-12.';
      const result = privacy.scanPromptForPII(text);

      expect(result.hasPII).toBe(true);
      expect(result.countsByCategory.phone).toBe(3);
      const values = result.detected.map((d) => d.value);
      expect(values).toContain('555-123-4567');
      expect(values).toContain('(800) 555-0199');
      expect(values).toContain('+44 20 7946 0958');
      expect(values).not.toContain('2026-10-12');
    });

    it('detects credit card numbers with valid Luhn checksums and rejects random numbers', () => {
      const privacy = globalThis.ZeusPrivacy;
      // Valid Visa card (test number)
      const validVisa = '4532-0150-1234-5671'; // Luhn valid
      const invalidCard = '4000-1234-5678-9999'; // Luhn invalid
      const text = `Pay with ${validVisa} or ignore ${invalidCard}`;
      const result = privacy.scanPromptForPII(text);

      expect(result.hasPII).toBe(true);
      expect(result.countsByCategory.creditCard).toBe(1);
      expect(result.detected[0].value).toBe(validVisa);
    });

    it('detects Social Security Numbers (SSN)', () => {
      const privacy = globalThis.ZeusPrivacy;
      const text = 'My SSN is 123-45-6789 and not 000-12-3456';
      const result = privacy.scanPromptForPII(text);

      expect(result.hasPII).toBe(true);
      expect(result.countsByCategory.ssn).toBe(1);
      expect(result.detected[0].value).toBe('123-45-6789');
    });

    it('detects IPv4 and IPv6 addresses', () => {
      const privacy = globalThis.ZeusPrivacy;
      const text = 'Server IP is 192.168.1.1 and IPv6 is 2001:0db8:85a3:0000:0000:8a2e:0370:7334.';
      const result = privacy.scanPromptForPII(text);

      expect(result.hasPII).toBe(true);
      expect(result.countsByCategory.ip).toBe(2);
      expect(result.detected.some((d) => d.value === '192.168.1.1')).toBe(true);
      expect(result.detected.some((d) => d.value === '2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe(true);
    });

    it('detects API keys from OpenAI, Anthropic, GitHub, AWS, Stripe, and Bearer tokens', () => {
      const privacy = globalThis.ZeusPrivacy;
      const text = [
        'OpenAI key: sk-proj-1234567890abcdefghijklmnop',
        'Anthropic key: sk-ant-1234567890abcdefghij',
        'GitHub token: ghp_123456789012345678901234567890123456',
        'AWS ID: AKIAIOSFODNN7EXAMPLE',
        'Stripe key: sk_test_51Oz1234567890abcdefghijk',
        'Authorization: Bearer abcdef1234567890abcdef1234567890'
      ].join('\n');

      const result = privacy.scanPromptForPII(text);
      expect(result.hasPII).toBe(true);
      expect(result.countsByCategory.apiKey).toBe(6);
    });

    it('detects user-defined custom sensitive keywords and regex patterns', () => {
      const privacy = globalThis.ZeusPrivacy;
      const text = 'The confidential project codename is ProjectFalcon and internal ID is Vault-9021.';
      const result = privacy.scanPromptForPII(text, {
        customPatterns: ['ProjectFalcon', '/Vault-\\d+/i']
      });

      expect(result.hasPII).toBe(true);
      expect(result.countsByCategory.custom).toBe(2);
      expect(result.detected.map((d) => d.value)).toContain('ProjectFalcon');
      expect(result.detected.map((d) => d.value)).toContain('Vault-9021');
    });
  });

  describe('Deterministic Surrogate Tokenization & Redaction', () => {
    it('redacts entities into deterministic tokens and guarantees token consistency for identical values', () => {
      const privacy = globalThis.ZeusPrivacy;
      const prompt = 'Please email test@example.com and CC test@example.com, or reach dev@domain.com.';
      const result = privacy.redactPrompt(prompt);

      expect(result.totalRedacted).toBe(3);
      // Both occurrences of test@example.com should map to the exact same token [EMAIL_1]
      expect(result.redactedText).toBe('Please email [EMAIL_1] and CC [EMAIL_1], or reach [EMAIL_2].');
      expect(result.tokenMap['[EMAIL_1]']).toBe('test@example.com');
      expect(result.tokenMap['[EMAIL_2]']).toBe('dev@domain.com');
      expect(result.counts.email).toBe(3);
    });

    it('respects category disabling in options', () => {
      const privacy = globalThis.ZeusPrivacy;
      const prompt = 'Email me at admin@corp.com or call 555-555-5555.';
      const result = privacy.redactPrompt(prompt, {
        categories: {
          email: false,
          phone: true
        }
      });

      expect(result.totalRedacted).toBe(1);
      expect(result.redactedText).toBe('Email me at admin@corp.com or call [PHONE_1].');
      expect(result.tokenMap['[PHONE_1]']).toBe('555-555-5555');
    });

    it('returns original prompt unchanged if no PII is present', () => {
      const privacy = globalThis.ZeusPrivacy;
      const cleanPrompt = 'Write a concise Python function to calculate Fibonacci numbers.';
      const result = privacy.redactPrompt(cleanPrompt);

      expect(result.totalRedacted).toBe(0);
      expect(result.redactedText).toBe(cleanPrompt);
      expect(result.tokenMap).toEqual({});
    });
  });

  describe('Surrogate Restoration Fidelity', () => {
    it('restores surrogate tokens back to original values in model output', () => {
      const privacy = globalThis.ZeusPrivacy;
      const tokenMap = {
        '[EMAIL_1]': 'alice@example.com',
        '[API_KEY_1]': 'sk-proj-test1234567890abcdef'
      };

      const llmOutput = 'Here is your configuration:\nCONTACT=[EMAIL_1]\nAUTH_TOKEN=[API_KEY_1]';
      const restored = privacy.restorePrompt(llmOutput, tokenMap);

      expect(restored).toBe('Here is your configuration:\nCONTACT=alice@example.com\nAUTH_TOKEN=sk-proj-test1234567890abcdef');
    });

    it('tolerates whitespace and case differences in model token output', () => {
      const privacy = globalThis.ZeusPrivacy;
      const tokenMap = {
        '[EMAIL_1]': 'alice@example.com'
      };

      const variedOutput = 'Notify [ EMAIL_1 ] or [email_1] promptly.';
      const report = privacy.restorePromptWithReport(variedOutput, tokenMap);

      expect(report.restoredCount).toBe(2);
      expect(report.restoredText).toBe('Notify alice@example.com or alice@example.com promptly.');
    });

    it('reports unmapped surrogate tokens if the model fabricated a token', () => {
      const privacy = globalThis.ZeusPrivacy;
      const tokenMap = {
        '[EMAIL_1]': 'alice@example.com'
      };

      const hallucinatoryOutput = 'Sent to [EMAIL_1] and [EMAIL_99].';
      const report = privacy.restorePromptWithReport(hallucinatoryOutput, tokenMap);

      expect(report.restoredText).toBe('Sent to alice@example.com and [EMAIL_99].');
      expect(report.unmappedTokens).toContain('[EMAIL_99]');
    });
  });

  describe('Mask Entity Previews', () => {
    it('produces safe masked previews for UI display', () => {
      const privacy = globalThis.ZeusPrivacy;

      expect(privacy.maskEntityPreview('alice@example.com', 'email')).toBe('al***@example.com');
      expect(privacy.maskEntityPreview('555-123-4567', 'phone')).toBe('***-***-4567');
      expect(privacy.maskEntityPreview('4532-0150-1234-5671', 'creditCard')).toBe('****-****-****-5671');
      expect(privacy.maskEntityPreview('123-45-6789', 'ssn')).toBe('***-**-6789');
      expect(privacy.maskEntityPreview('192.168.1.1', 'ip')).toBe('192.168.***.***');
      expect(privacy.maskEntityPreview('sk-proj-1234567890abcdef', 'apiKey')).toBe('sk-p...cdef');
    });
  });

  describe('Privacy Audit Statistics', () => {
    it('records and accumulates redaction statistics in local storage', async () => {
      const privacy = globalThis.ZeusPrivacy;

      await privacy.recordRedactionStats({ email: 2, apiKey: 1 });
      let stats = await privacy.getPrivacyStats();
      expect(stats.totalRedacted).toBe(3);
      expect(stats.byCategory.email).toBe(2);
      expect(stats.byCategory.apiKey).toBe(1);

      await privacy.recordRedactionStats({ email: 1, phone: 1 });
      stats = await privacy.getPrivacyStats();
      expect(stats.totalRedacted).toBe(5);
      expect(stats.byCategory.email).toBe(3);
      expect(stats.byCategory.phone).toBe(1);

      await privacy.resetPrivacyStats();
      stats = await privacy.getPrivacyStats();
      expect(stats.totalRedacted).toBe(0);
      expect(stats.byCategory).toEqual({});
    });
  });

  describe('Settings Integration', () => {
    it('initializes default privacy settings properly', () => {
      const settings = globalThis.ZeusSettings.createDefaultSettings();

      expect(settings.privacyModeEnabled).toBe(false);
      expect(settings.privacyAutoRestore).toBe(true);
      expect(settings.privacyCustomPatterns).toEqual([]);
      expect(settings.privacyAuditLogEnabled).toBe(true);
      expect(settings.privacyCategories).toEqual({
        email: true,
        phone: true,
        creditCard: true,
        ssn: true,
        ip: true,
        apiKey: true,
        custom: true
      });
    });

    it('normalizes and serializes privacy settings correctly', () => {
      const raw = {
        privacyModeEnabled: true,
        privacyCategories: {
          email: false,
          apiKey: true
        },
        privacyAutoRestore: false,
        privacyCustomPatterns: [' Secret1 ', 'Secret2 ', '']
      };

      const normalized = globalThis.ZeusSettings.normalizeSettings(raw);
      expect(normalized.privacyModeEnabled).toBe(true);
      expect(normalized.privacyCategories.email).toBe(false);
      expect(normalized.privacyCategories.apiKey).toBe(true);
      expect(normalized.privacyCategories.phone).toBe(true); // default fallback
      expect(normalized.privacyAutoRestore).toBe(false);
      expect(normalized.privacyCustomPatterns).toEqual(['Secret1', 'Secret2']);

      const serialized = globalThis.ZeusSettings.serializeSettings(normalized);
      expect(serialized.privacyModeEnabled).toBe(true);
      expect(serialized.privacyCategories.email).toBe(false);
      expect(serialized.privacyAutoRestore).toBe(false);
      expect(serialized.privacyCustomPatterns).toEqual(['Secret1', 'Secret2']);
    });
  });

  describe('Router Pipeline Integration', () => {
    beforeEach(() => {
      loadScript('core/retry.js');
      loadScript('core/prompts.js');
      loadScript('model-registry.js');

      // Setup mock provider
      globalThis.ZeusProviders = {
        gemini: vi.fn(async (prompt) => `ENHANCED PROMPT: ${prompt}`)
      };

      loadScript('core/router.js');
    });

    it('redacts outbound prompt to provider and restores response when privacy mode is enabled', async () => {
      globalThis.chrome.storage.sync.get = vi.fn((keys, cb) => cb({
        provider: 'gemini',
        privacyModeEnabled: true
      }));

      const rawPrompt = 'Configure API endpoint for user@acme.com with key sk-proj-1234567890abcdef123456';
      const enhanced = await globalThis.ZeusRouter.enhancePrompt(rawPrompt);

      // Provider was called with redacted text
      const providerCall = globalThis.ZeusProviders.gemini.mock.calls[0];
      const promptSentToProvider = providerCall[0];
      expect(promptSentToProvider).toContain('[EMAIL_1]');
      expect(promptSentToProvider).toContain('[API_KEY_1]');
      expect(promptSentToProvider).not.toContain('user@acme.com');
      expect(promptSentToProvider).not.toContain('sk-proj-1234567890abcdef123456');

      // The returned result has restored original values
      expect(enhanced).toContain('user@acme.com');
      expect(enhanced).toContain('sk-proj-1234567890abcdef123456');
    });

    it('leaves prompt untouched when privacy mode is disabled', async () => {
      globalThis.chrome.storage.sync.get = vi.fn((keys, cb) => cb({
        provider: 'gemini',
        privacyModeEnabled: false
      }));

      const rawPrompt = 'Contact user@acme.com immediately.';
      const enhanced = await globalThis.ZeusRouter.enhancePrompt(rawPrompt);

      const providerCall = globalThis.ZeusProviders.gemini.mock.calls[0];
      const promptSentToProvider = providerCall[0];
      expect(promptSentToProvider).toBe(rawPrompt);
      expect(enhanced).toContain('user@acme.com');
    });

    it('redacts conversation context turns when privacy mode is enabled', async () => {
      globalThis.chrome.storage.sync.get = vi.fn((keys, cb) => cb({
        provider: 'gemini',
        privacyModeEnabled: true
      }));

      const rawPrompt = 'Follow up with them.';
      const conversationContext = [
        { role: 'user', text: 'My email is bob@acme.com' },
        { role: 'assistant', text: 'Noted, I have your email.' }
      ];

      await globalThis.ZeusRouter.enhancePrompt(rawPrompt, { conversationContext });

      const providerCall = globalThis.ZeusProviders.gemini.mock.calls[0];
      const optionsSent = providerCall[2];
      const redactedContext = optionsSent.conversationContext;

      expect(redactedContext[0].text).toContain('[EMAIL_1]');
      expect(redactedContext[0].text).not.toContain('bob@acme.com');
    });
  });
});
