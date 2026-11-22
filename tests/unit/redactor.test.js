const { loadScript, clearZeusGlobals } = require('../utils/runtime');

describe('ZeusRedactor', () => {
  let redactor;

  // Synthetic Test Fixtures (no real secrets)
  const FIXTURES = {
    pemKey: [
      '-----BEGIN RSA PRIVATE KEY-----',
      'MIIEowIBAAKCAQEA0Y1234567890abcdefghijklmnopqrstuvwxyzABCDEFGH',
      'IJKLMNOPQRSTUVWXYZ1234567890abcdefghijklmnopqrstuvwxyzABCDEFGH',
      '-----END RSA PRIVATE KEY-----'
    ].join('\n'),

    postgresUri: 'postgres://zeus_user:super_secret_pw_123@db.internal.net:5432/zeus_production',
    mongoUri: 'mongodb+srv://cluster_admin:P%40ssw0rd!@cluster0.abcde.mongodb.net/test?retryWrites=true',
    redisUri: 'redis://:redis_auth_token_999@cache.local:6379/0',

    jwtToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkphbmUgRG9lIiwiYWRtaW4iOnRydWV9.TJVA95OrM7E2cBab30RMHrHDcEfxjoYZgeFONFh7HgQ',

    openaiKey: 'sk-proj-abcde12345FGHIJ67890klmno12345pqrst67890',
    anthropicKey: 'sk-ant-api03-abcdef1234567890abcdef1234567890abcdef1234567890-XYZ12',
    googleKey: 'AIzaSyD1234567890abcdefghijklmnopqrstuv',
    awsKey: 'AKIAIOSFODNN7EXAMPLE',

    emailAlice: 'alice.smith+filter@engineering.company.com',
    emailBob: 'bob_developer99@corp.subdomain.org',

    publicIp1: '93.184.216.34',
    publicIp2: '198.51.100.42',
    loopbackIp: '127.0.0.1',
    loopbackSubnet: '127.0.0.53',
    zeroIp: '0.0.0.0',
    broadcastIp: '255.255.255.255'
  };

  beforeEach(() => {
    clearZeusGlobals();
    loadScript('core/prompts.js');
    loadScript('core/redactor.js');
    redactor = globalThis.ZeusRedactor;
  });

  afterEach(() => {
    clearZeusGlobals();
  });

  describe('Module Exports & Global Exposure', () => {
    it('attaches ZeusRedactor to globalThis and exports expected methods', () => {
      expect(redactor).toBeDefined();
      expect(typeof redactor.scrub).toBe('function');
      expect(typeof redactor.hydrate).toBe('function');
      expect(typeof redactor.hydrateWithDetails).toBe('function');
      expect(typeof redactor.getLastWarnings).toBe('function');
      expect(typeof redactor.hasSensitive).toBe('function');
      expect(redactor.PATTERNS).toBeDefined();
    });

    it('can be imported via CommonJS require', () => {
      const cjsRedactor = require('../../core/redactor');
      expect(cjsRedactor).toBeDefined();
      expect(typeof cjsRedactor.scrub).toBe('function');
    });
  });

  describe('Deterministic Regex Precedence', () => {
    it('Tier 1 (PEM Private Key): redacts private keys before any nested credential or IP patterns', () => {
      const text = `Deploy this key:\n${FIXTURES.pemKey}\nto server 93.184.216.34`;
      const result = redactor.scrub(text);

      expect(result.text).toContain('[[ZEUS_SECRET_1]]');
      expect(result.text).toContain('[[ZEUS_IPV4_1]]');
      expect(result.text).not.toContain(FIXTURES.pemKey);
      expect(result.secretMap['[[ZEUS_SECRET_1]]']).toBe(FIXTURES.pemKey);
      expect(result.secretMap['[[ZEUS_IPV4_1]]']).toBe('93.184.216.34');
    });

    it('Tier 2 (Connection URIs): redacts database URIs before email, IP, or credential assignment patterns', () => {
      const text = `Connect using ${FIXTURES.postgresUri} and inform alice.smith+filter@engineering.company.com`;
      const result = redactor.scrub(text);

      // The URI contains credentials and hostname; it should be captured in Tier 2 as SECRET_1
      expect(result.text).toContain('[[ZEUS_SECRET_1]]');
      expect(result.text).toContain('[[ZEUS_EMAIL_1]]');
      expect(result.text).not.toContain(FIXTURES.postgresUri);
      expect(result.secretMap['[[ZEUS_SECRET_1]]']).toBe(FIXTURES.postgresUri);
      expect(result.secretMap['[[ZEUS_EMAIL_1]]']).toBe(FIXTURES.emailAlice);
    });

    it('Tier 3 (Bearer & JWT tokens): redacts JWT tokens as SECRET placeholders', () => {
      const text = `Authorization: Bearer ${FIXTURES.jwtToken}`;
      const result = redactor.scrub(text);

      expect(result.text).toBe('Authorization: Bearer [[ZEUS_SECRET_1]]');
      expect(result.secretMap['[[ZEUS_SECRET_1]]']).toBe(FIXTURES.jwtToken);
    });

    it('Tier 4 (Known API keys): redacts OpenAI, Anthropic, Google, and AWS keys with correct prefixes', () => {
      const text = [
        `OpenAI: ${FIXTURES.openaiKey}`,
        `Anthropic: ${FIXTURES.anthropicKey}`,
        `Google: ${FIXTURES.googleKey}`,
        `AWS: ${FIXTURES.awsKey}`
      ].join('\n');

      const result = redactor.scrub(text);

      expect(result.text).not.toContain(FIXTURES.openaiKey);
      expect(result.text).not.toContain(FIXTURES.anthropicKey);
      expect(result.text).not.toContain(FIXTURES.googleKey);
      expect(result.text).not.toContain(FIXTURES.awsKey);

      // Verify Anthropic key was captured entirely, not cut off by sk- prefix
      expect(Object.values(result.secretMap)).toContain(FIXTURES.anthropicKey);
      expect(Object.values(result.secretMap)).toContain(FIXTURES.openaiKey);
      expect(Object.values(result.secretMap)).toContain(FIXTURES.googleKey);
      expect(Object.values(result.secretMap)).toContain(FIXTURES.awsKey);
    });

    it('Tier 5 (Key-value credential assignments): redacts assigned secret value while preserving key name and syntax', () => {
      const text = 'Set password: "P@ssw0rd!#$%" and api_key = "MyCustomSecretVal99"';
      const result = redactor.scrub(text);

      expect(result.text).toBe('Set password: "[[ZEUS_SECRET_1]]" and api_key = "[[ZEUS_SECRET_2]]"');
      expect(result.secretMap['[[ZEUS_SECRET_1]]']).toBe('P@ssw0rd!#$%');
      expect(result.secretMap['[[ZEUS_SECRET_2]]']).toBe('MyCustomSecretVal99');
    });

    it('Tier 5: handles edge cases like secret value matching key name and unquoted assignments', () => {
      const text = 'secret = secretValue123 and auth_token: tokenValue456';
      const result = redactor.scrub(text);

      expect(result.text).toBe('secret = [[ZEUS_SECRET_1]] and auth_token: [[ZEUS_SECRET_2]]');
      expect(result.secretMap['[[ZEUS_SECRET_1]]']).toBe('secretValue123');
      expect(result.secretMap['[[ZEUS_SECRET_2]]']).toBe('tokenValue456');
    });

    it('Tier 4 precedence over Tier 5: known API keys in key-value assignments are handled cleanly without double redaction', () => {
      const text = `export OPENAI_API_KEY="${FIXTURES.openaiKey}"`;
      const result = redactor.scrub(text);

      expect(result.text).toBe('export OPENAI_API_KEY="[[ZEUS_SECRET_1]]"');
      expect(result.secretMap['[[ZEUS_SECRET_1]]']).toBe(FIXTURES.openaiKey);
      expect(result.count).toBe(1);
    });

    it('Tier 6 (Email Addresses): redacts email addresses into [[ZEUS_EMAIL_N]] tokens', () => {
      const text = `Send report to ${FIXTURES.emailAlice} and cc ${FIXTURES.emailBob}`;
      const result = redactor.scrub(text);

      expect(result.text).toBe('Send report to [[ZEUS_EMAIL_1]] and cc [[ZEUS_EMAIL_2]]');
      expect(result.secretMap['[[ZEUS_EMAIL_1]]']).toBe(FIXTURES.emailAlice);
      expect(result.secretMap['[[ZEUS_EMAIL_2]]']).toBe(FIXTURES.emailBob);
      expect(result.categories.emails).toBe(2);
    });

    it('Tier 7 (Public IPv4): redacts public IPv4 addresses into [[ZEUS_IPV4_N]] tokens', () => {
      const text = `Servers at ${FIXTURES.publicIp1} and ${FIXTURES.publicIp2}:8080 are ready`;
      const result = redactor.scrub(text);

      expect(result.text).toBe('Servers at [[ZEUS_IPV4_1]] and [[ZEUS_IPV4_2]]:8080 are ready');
      expect(result.secretMap['[[ZEUS_IPV4_1]]']).toBe(FIXTURES.publicIp1);
      expect(result.secretMap['[[ZEUS_IPV4_2]]']).toBe(FIXTURES.publicIp2);
      expect(result.categories.ipv4s).toBe(2);
    });
  });

  describe('IPv4 Exclusions (Loopback, Broadcast, Semver)', () => {
    it('excludes 127.0.0.1 (loopback) from redaction', () => {
      const text = 'Run local dev server at 127.0.0.1:3000';
      const result = redactor.scrub(text);

      expect(result.text).toBe(text);
      expect(result.hasRedactions).toBe(false);
      expect(result.count).toBe(0);
    });

    it('excludes 127.x.x.x loopback subnet from redaction', () => {
      const text = 'DNS resolver listening on 127.0.0.53';
      const result = redactor.scrub(text);

      expect(result.text).toBe(text);
      expect(result.hasRedactions).toBe(false);
    });

    it('excludes 0.0.0.0 (all interfaces) from redaction', () => {
      const text = 'Binding server to 0.0.0.0:8080';
      const result = redactor.scrub(text);

      expect(result.text).toBe(text);
      expect(result.hasRedactions).toBe(false);
    });

    it('excludes 255.255.255.255 (broadcast) from redaction', () => {
      const text = 'Sending broadcast packet to 255.255.255.255';
      const result = redactor.scrub(text);

      expect(result.text).toBe(text);
      expect(result.hasRedactions).toBe(false);
    });

    it('excludes 4-segment and 5-segment software semver version numbers', () => {
      const text = [
        'Release version 1.2.3.4 was deployed.',
        'Package v1.2.3.4 is stable.',
        'Extended dot chain 1.2.3.4.5 must not match.',
        'Preceded dot .1.2.3.4 must not match.',
        'Followed dot 1.2.3.4. must not match.',
        'Build release-2.4.0.1-beta is available.'
      ].join('\n');

      const result = redactor.scrub(text);

      expect(result.text).toBe(text);
      expect(result.hasRedactions).toBe(false);
    });

    it('redacts public IP while leaving loopback and semver untouched in the same prompt', () => {
      const text = 'Upgrade from version 1.2.3.4 on 127.0.0.1 to production host 93.184.216.34 now';
      const result = redactor.scrub(text);

      expect(result.text).toBe('Upgrade from version 1.2.3.4 on 127.0.0.1 to production host [[ZEUS_IPV4_1]] now');
      expect(result.secretMap['[[ZEUS_IPV4_1]]']).toBe('93.184.216.34');
      expect(result.count).toBe(1);
    });
  });

  describe('Collision-Safe Indexing & Deduplication', () => {
    it('uses 1-based indexing partitioned by category', () => {
      const text = `Contact ${FIXTURES.emailAlice} with key ${FIXTURES.openaiKey} at server ${FIXTURES.publicIp1}`;
      const result = redactor.scrub(text);

      expect(result.text).toContain('[[ZEUS_EMAIL_1]]');
      expect(result.text).toContain('[[ZEUS_SECRET_1]]');
      expect(result.text).toContain('[[ZEUS_IPV4_1]]');
      expect(result.count).toBe(3);
    });

    it('reuses the same placeholder when identical secrets appear multiple times in input', () => {
      const text = `Primary: ${FIXTURES.emailAlice}. Fallback: ${FIXTURES.emailAlice}. Verify with ${FIXTURES.emailAlice}.`;
      const result = redactor.scrub(text);

      expect(result.text).toBe('Primary: [[ZEUS_EMAIL_1]]. Fallback: [[ZEUS_EMAIL_1]]. Verify with [[ZEUS_EMAIL_1]].');
      expect(result.count).toBe(1);
      expect(result.secretMap['[[ZEUS_EMAIL_1]]']).toBe(FIXTURES.emailAlice);
    });

    it('avoids collision when prompt already contains [[ZEUS_*]] tokens before scrubbing', () => {
      const text = `User previously entered [[ZEUS_SECRET_1]] and now adds ${FIXTURES.openaiKey}`;
      const result = redactor.scrub(text);

      // New secret must get index 2 to avoid colliding with pre-existing [[ZEUS_SECRET_1]]
      expect(result.text).toBe('User previously entered [[ZEUS_SECRET_1]] and now adds [[ZEUS_SECRET_2]]');
      expect(result.secretMap['[[ZEUS_SECRET_2]]']).toBe(FIXTURES.openaiKey);
      expect(result.secretMap['[[ZEUS_SECRET_1]]']).toBeUndefined();
    });

    it('Ticket 2 sign-off check: guarantees user-authored noncanonical lookalike (e.g. [ZEUS_SECRET_1]) cannot be replaced with another value', () => {
      const rawPrompt = `Look at example token [ZEUS_SECRET_1]. Connect with password = "superSecretPassword123"`;
      const scrubbed = redactor.scrub(rawPrompt);

      // findHighestExistingIndices detects the single-bracket lookalike [ZEUS_SECRET_1] and advances index to 2
      expect(scrubbed.text).toBe('Look at example token [ZEUS_SECRET_1]. Connect with password = "[[ZEUS_SECRET_2]]"');
      expect(scrubbed.secretMap['[[ZEUS_SECRET_2]]']).toBe('superSecretPassword123');
      expect(scrubbed.secretMap['[[ZEUS_SECRET_1]]']).toBeUndefined();

      // Case A: Model preserves both lookalike [ZEUS_SECRET_1] and placeholder [[ZEUS_SECRET_2]]
      const modelOutputA = 'Enhanced: Reference [ZEUS_SECRET_1] with credentials [[ZEUS_SECRET_2]]';
      const hydratedA = redactor.hydrate(modelOutputA, scrubbed.secretMap);
      expect(hydratedA).toBe('Enhanced: Reference [ZEUS_SECRET_1] with credentials superSecretPassword123');

      // Case B: Model drops [[ZEUS_SECRET_2]] and only outputs the lookalike [ZEUS_SECRET_1]
      // Tolerant fallback for [[ZEUS_SECRET_2]] must NOT match [ZEUS_SECRET_1]
      const modelOutputB = 'Enhanced: Reference [ZEUS_SECRET_1] only';
      const hydratedB = redactor.hydrateWithDetails(modelOutputB, scrubbed.secretMap);
      expect(hydratedB.text).toBe('Enhanced: Reference [ZEUS_SECRET_1] only');
      expect(hydratedB.droppedPlaceholders).toContain('[[ZEUS_SECRET_2]]');
      expect(hydratedB.text).not.toContain('superSecretPassword123');

      // Case C: User authored lowercase and spaced lookalikes: [zeus_secret_1] and [[ ZEUS_SECRET_2 ]]
      const rawPromptC = `Look at [zeus_secret_1] and [[ ZEUS_SECRET_2 ]]. My key is ${FIXTURES.openaiKey}`;
      const scrubbedC = redactor.scrub(rawPromptC);
      // Next generated index must be 3
      expect(scrubbedC.text).toContain('[[ZEUS_SECRET_3]]');
      expect(scrubbedC.secretMap['[[ZEUS_SECRET_3]]']).toBe(FIXTURES.openaiKey);
      expect(scrubbedC.secretMap['[[ZEUS_SECRET_1]]']).toBeUndefined();
      expect(scrubbedC.secretMap['[[ZEUS_SECRET_2]]']).toBeUndefined();
    });
  });

  describe('Safe Literal Rehydration (`hydrate`)', () => {
    it('accurately restores all redacted values to their exact original forms', () => {
      const rawPrompt = `Configure ${FIXTURES.postgresUri} for user ${FIXTURES.emailAlice} on host ${FIXTURES.publicIp1}`;
      const scrubbed = redactor.scrub(rawPrompt);

      const hydrated = redactor.hydrate(scrubbed.text, scrubbed.secretMap);
      expect(hydrated).toBe(rawPrompt);
    });

    it('preserves special regex replacement sequences ($$, $&, $\', $`, $1) without corruption', () => {
      const specialSecret = 'P@ss$$word$&with$1special_and_$$more';
      const prompt = `password = "${specialSecret}"`;
      const scrubbed = redactor.scrub(prompt);

      expect(scrubbed.secretMap['[[ZEUS_SECRET_1]]']).toBe(specialSecret);

      const hydrated = redactor.hydrate(scrubbed.text, scrubbed.secretMap);
      expect(hydrated).toBe(prompt);
      expect(hydrated).toContain(specialSecret);

      // Explicitly test all JavaScript regex special patterns ($$, $&, $', $`, $1) in hydrate
      const rawTextWithTrickyReplacements = 'Prefix [[ZEUS_SECRET_1]] Suffix';
      const trickyMap = {
        '[[ZEUS_SECRET_1]]': '$$dollar-$&-quote-$\'-backtick-$`-group-$1'
      };
      const directHydrated = redactor.hydrate(rawTextWithTrickyReplacements, trickyMap);
      expect(directHydrated).toBe('Prefix $$dollar-$&-quote-$\'-backtick-$`-group-$1 Suffix');
    });

    it('supports repeated placeholders in enhanced model output', () => {
      const rawPrompt = `Use ${FIXTURES.openaiKey} for authentication`;
      const scrubbed = redactor.scrub(rawPrompt);

      // Simulated model output repeating the placeholder multiple times
      const modelOutput = [
        'Enhanced instruction:',
        '1. Set Authorization header with [[ZEUS_SECRET_1]].',
        '2. Verify [[ZEUS_SECRET_1]] against the API endpoint.',
        '3. Log confirmation of [[ZEUS_SECRET_1]].'
      ].join('\n');

      const hydrated = redactor.hydrate(modelOutput, scrubbed.secretMap);

      expect(hydrated).not.toContain('[[ZEUS_SECRET_1]]');
      const occurrences = hydrated.split(FIXTURES.openaiKey).length - 1;
      expect(occurrences).toBe(3);
    });

    it('accepts Map instance or plain Object or scrub result for secretMap', () => {
      const scrubbed = redactor.scrub(`Key: ${FIXTURES.openaiKey}`);

      // Pass scrub result object directly
      const hydratedFromObj = redactor.hydrate(scrubbed.text, scrubbed);
      expect(hydratedFromObj).toBe(`Key: ${FIXTURES.openaiKey}`);

      // Pass Map instance
      const secretAsMap = new Map(Object.entries(scrubbed.secretMap));
      const hydratedFromMap = redactor.hydrate(scrubbed.text, secretAsMap);
      expect(hydratedFromMap).toBe(`Key: ${FIXTURES.openaiKey}`);
    });

    it('handles multiple placeholders with length-descending sorting to avoid prefix collisions', () => {
      const text = 'Token A: [[ZEUS_SECRET_10]], Token B: [[ZEUS_SECRET_1]]';
      const secretMap = {
        '[[ZEUS_SECRET_1]]': 'VALUE_ONE',
        '[[ZEUS_SECRET_10]]': 'VALUE_TEN'
      };

      const hydrated = redactor.hydrate(text, secretMap);
      expect(hydrated).toBe('Token A: VALUE_TEN, Token B: VALUE_ONE');
    });
  });

  describe('Warning for Dropped Placeholders', () => {
    it('logs console.warn and surfaces warning details when model drops a placeholder', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const rawPrompt = `Send to ${FIXTURES.emailAlice} and use ${FIXTURES.openaiKey}`;
      const scrubbed = redactor.scrub(rawPrompt);

      // Model returned response that omitted [[ZEUS_SECRET_1]]
      const modelOutput = 'Enhanced prompt mentioning only [[ZEUS_EMAIL_1]]';

      const result = redactor.hydrateWithDetails(modelOutput, scrubbed.secretMap);

      expect(warnSpy).toHaveBeenCalled();
      expect(result.droppedPlaceholders).toContain('[[ZEUS_SECRET_1]]');
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.text).toBe(`Enhanced prompt mentioning only ${FIXTURES.emailAlice}`);

      const lastWarnings = redactor.getLastWarnings();
      expect(lastWarnings.droppedPlaceholders).toContain('[[ZEUS_SECRET_1]]');

      warnSpy.mockRestore();
    });

    it('calls optional onWarning callback if provided in options', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const onWarning = vi.fn();
      const modelOutput = 'Prompt with no placeholders at all';
      const secretMap = { '[[ZEUS_SECRET_1]]': 'secret-value' };

      redactor.hydrate(modelOutput, secretMap, { onWarning });

      expect(onWarning).toHaveBeenCalledWith(
        expect.stringContaining('[[ZEUS_SECRET_1]]'),
        '[[ZEUS_SECRET_1]]'
      );
      warnSpy.mockRestore();
    });

    it('emits no warnings when all placeholders are faithfully preserved', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const rawPrompt = `Key: ${FIXTURES.openaiKey}`;
      const scrubbed = redactor.scrub(rawPrompt);

      const result = redactor.hydrateWithDetails(scrubbed.text, scrubbed.secretMap);

      expect(warnSpy).not.toHaveBeenCalled();
      expect(result.droppedPlaceholders).toEqual([]);
      expect(result.warnings).toEqual([]);

      warnSpy.mockRestore();
    });
  });

  describe('Strict Ephemeral In-Memory Behavior', () => {
    it('never persists secret mappings or values to chrome.storage or telemetry', () => {
      const storageSetSpy = vi.fn();
      globalThis.chrome = {
        storage: {
          local: { set: storageSetSpy },
          sync: { set: storageSetSpy }
        }
      };

      const rawPrompt = `Deploy with ${FIXTURES.postgresUri} and ${FIXTURES.openaiKey}`;
      const scrubbed = redactor.scrub(rawPrompt);
      redactor.hydrate(scrubbed.text, scrubbed.secretMap);

      expect(storageSetSpy).not.toHaveBeenCalled();
      delete globalThis.chrome;
    });
  });

  describe('Configuration & Edge Cases', () => {
    it('returns unmodified prompt and empty secretMap when redactionEnabled is false', () => {
      const rawPrompt = `Use ${FIXTURES.openaiKey} at ${FIXTURES.publicIp1}`;
      const result = redactor.scrub(rawPrompt, { redactionEnabled: false });

      expect(result.text).toBe(rawPrompt);
      expect(result.hasRedactions).toBe(false);
      expect(result.count).toBe(0);
      expect(result.secretMap).toEqual({});
    });

    it('supports custom redaction patterns', () => {
      const rawPrompt = 'Custom service secret is CUSTSEC-998877665544';
      const result = redactor.scrub(rawPrompt, {
        customPatterns: ['CUSTSEC-[0-9]{12}']
      });

      expect(result.text).toBe('Custom service secret is [[ZEUS_SECRET_1]]');
      expect(result.secretMap['[[ZEUS_SECRET_1]]']).toBe('CUSTSEC-998877665544');

      const hydrated = redactor.hydrate(result.text, result.secretMap);
      expect(hydrated).toBe(rawPrompt);
    });

    it('handles empty, null, undefined, or non-string inputs gracefully', () => {
      expect(redactor.scrub('').text).toBe('');
      expect(redactor.scrub(null).text).toBe('');
      expect(redactor.scrub(undefined).text).toBe('');
      expect(redactor.hydrate('', {}).toString()).toBe('');
      expect(redactor.hydrate(null, {}).toString()).toBe('');
      expect(redactor.hydrate(undefined, {}).toString()).toBe('');

      // Test hydrateWithDetails edge cases with empty text and empty maps
      const emptyDetails1 = redactor.hydrateWithDetails('', {});
      expect(emptyDetails1).toEqual({ text: '', warnings: [], droppedPlaceholders: [] });

      const emptyDetails2 = redactor.hydrateWithDetails(null, null);
      expect(emptyDetails2).toEqual({ text: '', warnings: [], droppedPlaceholders: [] });

      const emptyDetails3 = redactor.hydrateWithDetails('hello world', {});
      expect(emptyDetails3).toEqual({ text: 'hello world', warnings: [], droppedPlaceholders: [] });
    });

    it('supports custom redaction patterns as RegExp objects and handles invalid patterns gracefully', () => {
      const prompt = 'Auth code: AUTH-123456 and token: [INVALID';
      const result = redactor.scrub(prompt, {
        customPatterns: [
          /AUTH-\d{6}/,
          '[unclosed(regex' // invalid regex string, should not throw
        ]
      });

      expect(result.text).toBe('Auth code: [[ZEUS_SECRET_1]] and token: [INVALID');
      expect(result.secretMap['[[ZEUS_SECRET_1]]']).toBe('AUTH-123456');
    });

    it('redacts various database schemes (mysql, redis, amqp, mssql, mongodb)', () => {
      const text = [
        'mysql://user:pass@db:3306/db',
        'redis://:pass@cache:6379/0',
        'amqp://guest:guest@rabbit:5672/',
        'mssql://sa:pass@sqlserver:1433/db'
      ].join(' and ');

      const result = redactor.scrub(text);
      expect(result.count).toBe(4);
      expect(result.text).not.toContain('mysql://');
      expect(result.text).not.toContain('redis://');
      expect(result.text).not.toContain('amqp://');
      expect(result.text).not.toContain('mssql://');

      const restored = redactor.hydrate(result.text, result.secretMap);
      expect(restored).toBe(text);
    });

    it('does not redact invalid IP octets (> 255)', () => {
      const text = 'Check invalid addresses 256.1.2.3 and 999.888.777.666';
      const result = redactor.scrub(text);

      expect(result.text).toBe(text);
      expect(result.hasRedactions).toBe(false);
    });

    it('ensures getLastWarnings returns defensive copies that cannot mutate internal state', () => {
      const warnings = redactor.getLastWarnings();
      warnings.warnings.push('MUTATION_ATTEMPT');
      warnings.droppedPlaceholders.push('MUTATION_ATTEMPT');

      const freshWarnings = redactor.getLastWarnings();
      expect(freshWarnings.warnings).not.toContain('MUTATION_ATTEMPT');
      expect(freshWarnings.droppedPlaceholders).not.toContain('MUTATION_ATTEMPT');
    });

    it('hasSensitive helper accurately detects presence of secrets or PII', () => {
      expect(redactor.hasSensitive(`Configure ${FIXTURES.openaiKey}`)).toBe(true);
      expect(redactor.hasSensitive(`Email us at ${FIXTURES.emailAlice}`)).toBe(true);
      expect(redactor.hasSensitive(`Host on ${FIXTURES.publicIp1}`)).toBe(true);
      expect(redactor.hasSensitive('A completely normal prompt about cooking pasta.')).toBe(false);
      expect(redactor.hasSensitive('Test with 127.0.0.1 and v1.2.3.4')).toBe(false);
    });
  });

  describe('Punctuation & Delimiter Preservation', () => {
    it('preserves sentence punctuation when connection URIs are at the end of sentences or in parentheses', () => {
      const text = `Connect to ${FIXTURES.postgresUri}. Then run migrations.`;
      const scrubbed = redactor.scrub(text);

      expect(scrubbed.text).toBe('Connect to [[ZEUS_SECRET_1]]. Then run migrations.');
      expect(scrubbed.secretMap['[[ZEUS_SECRET_1]]']).toBe(FIXTURES.postgresUri);

      const inParens = `(see ${FIXTURES.postgresUri})`;
      const scrubbedParens = redactor.scrub(inParens);
      expect(scrubbedParens.text).toBe('(see [[ZEUS_SECRET_1]])');
      expect(scrubbedParens.secretMap['[[ZEUS_SECRET_1]]']).toBe(FIXTURES.postgresUri);

      const hydrated = redactor.hydrate(scrubbed.text, scrubbed.secretMap);
      expect(hydrated).toBe(text);
    });

    it('redacts JSON-formatted key-value credential assignments with quoted keys', () => {
      const jsonPrompt = '{\n  "api_key": "mySecretApiKey12345",\n  "password": "mySecretPassword123"\n}';
      const scrubbed = redactor.scrub(jsonPrompt);

      expect(scrubbed.text).toBe('{\n  "api_key": "[[ZEUS_SECRET_1]]",\n  "password": "[[ZEUS_SECRET_2]]"\n}');
      expect(scrubbed.secretMap['[[ZEUS_SECRET_1]]']).toBe('mySecretApiKey12345');
      expect(scrubbed.secretMap['[[ZEUS_SECRET_2]]']).toBe('mySecretPassword123');
      expect(scrubbed.count).toBe(2);

      const hydrated = redactor.hydrate(scrubbed.text, scrubbed.secretMap);
      expect(hydrated).toBe(jsonPrompt);
    });

    it('preserves trailing sentence punctuation in unquoted credential assignments', () => {
      const text = 'Set password = P@ssw0rd123. Then login.';
      const scrubbed = redactor.scrub(text);

      expect(scrubbed.text).toBe('Set password = [[ZEUS_SECRET_1]]. Then login.');
      expect(scrubbed.secretMap['[[ZEUS_SECRET_1]]']).toBe('P@ssw0rd123');

      const hydrated = redactor.hydrate(scrubbed.text, scrubbed.secretMap);
      expect(hydrated).toBe(text);
    });

    it('redacts public IPv4 address at the end of a sentence with a period', () => {
      const text1 = `Deploy to server ${FIXTURES.publicIp1}.`;
      const scrubbed1 = redactor.scrub(text1);
      expect(scrubbed1.text).toBe('Deploy to server [[ZEUS_IPV4_1]].');
      expect(scrubbed1.secretMap['[[ZEUS_IPV4_1]]']).toBe(FIXTURES.publicIp1);

      const text2 = `Deploy to server ${FIXTURES.publicIp1}. And then test it.`;
      const scrubbed2 = redactor.scrub(text2);
      expect(scrubbed2.text).toBe('Deploy to server [[ZEUS_IPV4_1]]. And then test it.');
      expect(scrubbed2.secretMap['[[ZEUS_IPV4_1]]']).toBe(FIXTURES.publicIp1);

      const hydrated = redactor.hydrate(scrubbed2.text, scrubbed2.secretMap);
      expect(hydrated).toBe(text2);
    });

    it('redacts public IPv4 addresses in comma-separated lists and excludes loopback', () => {
      const text = `Servers are ${FIXTURES.publicIp1}, ${FIXTURES.publicIp2}, and 127.0.0.1.`;
      const scrubbed = redactor.scrub(text);

      expect(scrubbed.text).toBe('Servers are [[ZEUS_IPV4_1]], [[ZEUS_IPV4_2]], and 127.0.0.1.');
      expect(scrubbed.count).toBe(2);
      expect(scrubbed.secretMap['[[ZEUS_IPV4_1]]']).toBe(FIXTURES.publicIp1);
      expect(scrubbed.secretMap['[[ZEUS_IPV4_2]]']).toBe(FIXTURES.publicIp2);
    });
  });

  describe('Comprehensive Semver & Netmask Exclusions', () => {
    it('excludes pre-v1 zero-block semver versions (0.x.x.x)', () => {
      const text = 'Install package 0.1.2.3 and pre-release 0.0.1.0';
      const scrubbed = redactor.scrub(text);

      expect(scrubbed.text).toBe(text);
      expect(scrubbed.hasRedactions).toBe(false);
    });

    it('excludes subnet masks (255.x.x.x)', () => {
      const text = 'Subnet mask is 255.255.255.0 and netmask 255.255.0.0';
      const scrubbed = redactor.scrub(text);

      expect(scrubbed.text).toBe(text);
      expect(scrubbed.hasRedactions).toBe(false);
    });

    it('excludes versions with various prefixes (version number, semver, rev, revision, tag)', () => {
      const text = [
        'The release version number 1.2.3.4 was deployed.',
        'Specification semver 1.2.3.4 was accepted.',
        'Checked out rev 1.2.3.4 from git.',
        'Target revision: 1.2.3.4 is stable.',
        'Release tag 1.2.3.4 created.'
      ].join('\n');

      const scrubbed = redactor.scrub(text);
      expect(scrubbed.text).toBe(text);
      expect(scrubbed.hasRedactions).toBe(false);
    });

    it('excludes package specifiers with @ delimiter', () => {
      const text = 'npm install express@1.2.3.4 and docker pull app@1.2.3.4';
      const scrubbed = redactor.scrub(text);

      expect(scrubbed.text).toBe(text);
      expect(scrubbed.hasRedactions).toBe(false);
    });

    it('excludes semver build metadata (+) and non-standard pre-release tags (-canary, -SNAPSHOT)', () => {
      const text = [
        'Build 1.2.3.4+20240101 is tested.',
        'Nightly 1.2.3.4-canary is ready.',
        'Artifact 1.2.3.4-SNAPSHOT published.'
      ].join('\n');

      const scrubbed = redactor.scrub(text);
      expect(scrubbed.text).toBe(text);
      expect(scrubbed.hasRedactions).toBe(false);
    });
  });

  describe('Tolerant Rehydration & Warning State Isolation', () => {
    it('tolerantly recovers single-bracketed placeholders emitted by models', () => {
      const scrubbed = redactor.scrub(`Key: ${FIXTURES.openaiKey}`);
      const modelOutput = 'Enhanced: use [ZEUS_SECRET_1] for requests.';

      const hydrated = redactor.hydrate(modelOutput, scrubbed.secretMap);
      expect(hydrated).toBe(`Enhanced: use ${FIXTURES.openaiKey} for requests.`);
    });

    it('tolerantly recovers lowercase, inner space, and markdown-escaped placeholders', () => {
      const secretMap = { '[[ZEUS_SECRET_1]]': 'my-recovered-secret' };

      expect(redactor.hydrate('Key: [[zeus_secret_1]]', secretMap)).toBe('Key: my-recovered-secret');
      expect(redactor.hydrate('Key: [[ ZEUS_SECRET_1 ]]', secretMap)).toBe('Key: my-recovered-secret');
      expect(redactor.hydrate('Key: \\[\\[ZEUS_SECRET_1\\]\\]', secretMap)).toBe('Key: my-recovered-secret');
    });

    it('resets warning state between independent hydrate calls so stale warnings never leak', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Call 1 drops a placeholder
      redactor.hydrate('No placeholders here', { '[[ZEUS_SECRET_1]]': 'val' });
      expect(redactor.getLastWarnings().droppedPlaceholders).toContain('[[ZEUS_SECRET_1]]');

      // Call 2 has no secrets / drops
      redactor.hydrate('Just normal text', {});
      expect(redactor.getLastWarnings().droppedPlaceholders).toEqual([]);
      expect(redactor.getLastWarnings().warnings).toEqual([]);

      warnSpy.mockRestore();
    });
  });

  describe('Prompt Architect Integration (`core/prompts.js`)', () => {
    it('buildEnhancePrompt includes strict non-negotiable rules for [[ZEUS_*]] placeholders', () => {
      const prompt = globalThis.ZeusPrompts.buildEnhancePrompt('Summarize this document');

      expect(prompt).toContain('SAFETY RULES (NON-NEGOTIABLE):');
      expect(prompt).toContain('Preserve all [[ZEUS_*]] placeholder tokens (e.g., [[ZEUS_SECRET_1]], [[ZEUS_EMAIL_1]]) EXACTLY as written.');
      expect(prompt).toContain('Do NOT translate, modify, expand, or remove any [[ZEUS_*]] placeholder tags.');
    });

    it('getRewriteSystemInstruction includes placeholder preservation command', () => {
      const instruction = globalThis.ZeusPrompts.getRewriteSystemInstruction();

      expect(instruction).toContain('[[ZEUS_*]]');
      expect(instruction).toContain('verbatim');
    });
  });
});
