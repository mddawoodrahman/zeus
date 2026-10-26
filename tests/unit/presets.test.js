const { loadScript, clearZeusGlobals } = require('../utils/runtime');

describe('ZeusPresets core module', () => {
  beforeEach(() => {
    clearZeusGlobals();
    loadScript('core/presets.js');
  });

  afterEach(() => {
    clearZeusGlobals();
  });

  it('validates compliant preset packs and rejects malformed packs', () => {
    const presets = globalThis.ZeusPresets;
    expect(presets).toBeDefined();

    const validBundle = {
      format: 'zeus-preset-pack',
      version: '1.0.0',
      meta: { name: 'Valid Pack' },
      presets: {
        transforms: [],
        prompts: [],
        customProviders: []
      }
    };
    expect(presets.validatePresetBundle(validBundle).valid).toBe(true);

    const invalidFormat = { ...validBundle, format: 'unknown-format' };
    const invalidFormatRes = presets.validatePresetBundle(invalidFormat);
    expect(invalidFormatRes.valid).toBe(false);
    expect(invalidFormatRes.errors.length).toBeGreaterThan(0);

    const missingPresets = { format: 'zeus-preset-pack', version: '1.0.0' };
    expect(presets.validatePresetBundle(missingPresets).valid).toBe(false);

    const nonArrayTransforms = {
      format: 'zeus-preset-pack',
      version: '1.0.0',
      presets: { transforms: 'invalid' }
    };
    expect(presets.validatePresetBundle(nonArrayTransforms).valid).toBe(false);
  });

  it('exports preset packs and strictly strips API keys for team security', () => {
    const presets = globalThis.ZeusPresets;

    const bundle = presets.exportPresetBundle({
      meta: {
        name: 'Backend Presets',
        author: 'Lead Architect',
        description: 'Team coding transforms'
      },
      transforms: [
        { id: 't1', name: 'Refactor', systemInstruction: 'Make it clean', shortcut: '/ref' }
      ],
      prompts: [
        { id: 'p1', title: 'Bug Report', content: 'Fix {{issue}}', tags: ['bugs'] }
      ],
      customProviders: [
        {
          id: 'vllm-internal',
          name: 'Internal Server',
          baseUrl: 'http://corp-ai:8000/v1',
          defaultModel: 'qwen-coder',
          apiKey: 'super-secret-production-token'
        }
      ],
      smartRouterProfile: 'performance'
    });

    expect(bundle.format).toBe('zeus-preset-pack');
    expect(bundle.version).toBe('1.0.0');
    expect(bundle.meta.name).toBe('Backend Presets');
    expect(bundle.presets.transforms.length).toBe(1);
    expect(bundle.presets.prompts.length).toBe(1);
    expect(bundle.presets.customProviders.length).toBe(1);
    expect(bundle.presets.smartRouterProfile).toBe('performance');

    // Strict security guarantee: API key must be scrubbed on export
    expect(bundle.presets.customProviders[0].apiKey).toBe('');
  });

  it('serializes and parses bundle JSON safely', () => {
    const presets = globalThis.ZeusPresets;

    const bundle = presets.exportPresetBundle({
      meta: { name: 'Serialization Test' }
    });

    const jsonString = presets.generatePresetJson(bundle);
    expect(typeof jsonString).toBe('string');

    const parsed = presets.parsePresetJson(jsonString);
    expect(parsed.meta.name).toBe('Serialization Test');

    expect(() => presets.parsePresetJson('')).toThrow('cannot be empty');
    expect(() => presets.parsePresetJson('invalid { json')).toThrow('Failed to parse');
  });

  it('imports bundles in merge mode without destroying existing items and resolving collisions', () => {
    const presets = globalThis.ZeusPresets;

    const existingState = {
      transforms: [
        { id: 'shared-id', name: 'Existing Transform', shortcut: '/test' }
      ],
      prompts: [
        { id: 'shared-prompt', title: 'Existing Prompt' }
      ],
      customProviders: [
        { id: 'shared-cp', name: 'Local Ollama', baseUrl: 'http://localhost:11434/v1', apiKey: 'existing-key' }
      ],
      smartRouterProfile: 'balanced'
    };

    const bundleToImport = {
      format: 'zeus-preset-pack',
      version: '1.0.0',
      presets: {
        transforms: [
          { id: 'shared-id', name: 'Imported Transform With Collision', shortcut: '/test' },
          { id: 'new-id', name: 'Brand New Transform', shortcut: '/new' }
        ],
        prompts: [
          { id: 'shared-prompt', title: 'Imported Prompt' },
          { id: 'new-prompt', title: 'Brand New Prompt' }
        ],
        customProviders: [
          { id: 'shared-cp', name: 'Imported vLLM', baseUrl: 'http://vllm:8000/v1', apiKey: '' }
        ],
        smartRouterProfile: 'performance'
      }
    };

    const result = presets.importPresetBundle(bundleToImport, existingState, { mode: 'merge' });

    expect(result.success).toBe(true);
    expect(result.stats.transformsCount).toBe(2);
    expect(result.stats.promptsCount).toBe(2);
    expect(result.stats.customProvidersCount).toBe(1);

    // Existing transform must remain intact
    expect(result.nextState.transforms.length).toBe(3);
    expect(result.nextState.transforms[0].id).toBe('shared-id');
    expect(result.nextState.transforms[0].shortcut).toBe('/test');

    // Colliding transform gets unique suffixed ID and cleared colliding shortcut
    const collidingTransform = result.nextState.transforms[1];
    expect(collidingTransform.id).toMatch(/^shared-id_imported_/);
    expect(collidingTransform.shortcut).toBe('');

    // Non-colliding transform keeps original shortcut
    expect(result.nextState.transforms[2].id).toBe('new-id');
    expect(result.nextState.transforms[2].shortcut).toBe('/new');

    // Prompts and custom providers
    expect(result.nextState.prompts.length).toBe(3);
    expect(result.nextState.customProviders.length).toBe(2);
    expect(result.nextState.smartRouterProfile).toBe('performance');
  });

  it('imports bundles in overwrite mode replacing matching IDs and preserving secrets', () => {
    const presets = globalThis.ZeusPresets;

    const existingState = {
      transforms: [
        { id: 'replace-me', name: 'Old Transform', systemInstruction: 'Old instruction' }
      ],
      prompts: [
        { id: 'replace-prompt', title: 'Old Title', content: 'Old content' }
      ],
      customProviders: [
        { id: 'runtime-1', name: 'Old Provider', baseUrl: 'http://old:8000/v1', apiKey: 'preserved-api-key' }
      ]
    };

    const bundleToImport = {
      format: 'zeus-preset-pack',
      version: '1.0.0',
      presets: {
        transforms: [
          { id: 'replace-me', name: 'Updated Transform', systemInstruction: 'New instruction' }
        ],
        prompts: [
          { id: 'replace-prompt', title: 'Updated Title', content: 'New content' }
        ],
        customProviders: [
          { id: 'runtime-1', name: 'Updated Provider', baseUrl: 'http://new:8000/v1', apiKey: '' }
        ]
      }
    };

    const result = presets.importPresetBundle(bundleToImport, existingState, { mode: 'overwrite' });

    expect(result.nextState.transforms.length).toBe(1);
    expect(result.nextState.transforms[0].name).toBe('Updated Transform');

    expect(result.nextState.prompts.length).toBe(1);
    expect(result.nextState.prompts[0].title).toBe('Updated Title');

    expect(result.nextState.customProviders.length).toBe(1);
    expect(result.nextState.customProviders[0].baseUrl).toBe('http://new:8000/v1');
    // Crucial: existing local API key is preserved when imported bundle has blank apiKey
    expect(result.nextState.customProviders[0].apiKey).toBe('preserved-api-key');
  });
});
