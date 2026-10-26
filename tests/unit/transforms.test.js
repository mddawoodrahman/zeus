const { createChromeMock } = require('../mocks/chrome');
const { loadScript, clearZeusGlobals } = require('../utils/runtime');

const STORAGE_KEY = 'zeus_transforms';
const LEGACY_KEY = 'zeus_templates';

describe('ZeusTransforms', () => {
  let env;

  beforeEach(() => {
    clearZeusGlobals();
    env = createChromeMock();
    globalThis.chrome = env.chrome;
    // The content script loads shortcuts alongside transforms.
    loadScript('core/shortcuts.js');
    loadScript('core/transforms.js');
  });

  afterEach(() => {
    delete globalThis.chrome;
    clearZeusGlobals();
  });

  it('ships Polish and Prompt Engineer with distinct default shortcuts', () => {
    const transforms = globalThis.ZeusTransforms.createDefaultTransforms();
    const names = transforms.map((transform) => transform.name);

    expect(names).toEqual(['Polish', 'Prompt Engineer']);

    const shortcuts = transforms.map((transform) => transform.shortcut);
    expect(shortcuts).toEqual(['Ctrl+Shift+1', 'Ctrl+Shift+2']);
    expect(new Set(shortcuts).size).toBe(shortcuts.length);

    for (const transform of transforms) {
      expect(globalThis.ZeusShortcuts.isValidCombo(transform.shortcut)).toBe(true);
      expect(transform.instruction.length).toBeGreaterThan(20);
      expect(transform.enabled).toBe(true);
    }
  });

  it('seeds the defaults on first load and persists them', async () => {
    const transforms = await globalThis.ZeusTransforms.loadTransforms();

    expect(transforms).toHaveLength(2);
    expect(env.sync.__data.get(STORAGE_KEY)).toHaveLength(2);
  });

  it('normalizes stored records and drops unusable ones', async () => {
    env.sync.__seed({
      [STORAGE_KEY]: [
        { id: 'keep', name: 'Keep', instruction: 'Do the thing', shortcut: 'Ctrl+Shift+9' },
        { id: 'no-name', name: '', instruction: 'x' },
        { id: 'no-action', name: 'Nothing' },
        null,
        'not-an-object'
      ]
    });

    const transforms = await globalThis.ZeusTransforms.loadTransforms();

    expect(transforms).toHaveLength(1);
    expect(transforms[0].id).toBe('keep');
    expect(transforms[0].enabled).toBe(true);
  });

  it('unbinds duplicate shortcuts so a stale entry cannot hijack', async () => {
    env.sync.__seed({
      [STORAGE_KEY]: [
        { id: 'one', name: 'One', instruction: 'a', shortcut: 'Ctrl+Shift+1' },
        { id: 'two', name: 'Two', instruction: 'b', shortcut: 'Ctrl+Shift+1' }
      ]
    });

    const transforms = await globalThis.ZeusTransforms.loadTransforms();

    expect(transforms[0].shortcut).toBe('Ctrl+Shift+1');
    expect(transforms[1].shortcut).toBe('');
  });

  it('derives template variables from the template text', () => {
    const transform = globalThis.ZeusTransforms.normalizeTransform({
      name: 'Idea',
      template: 'Improve {{topic}} for {{audience}} and {{topic}}',
      variables: ['ignored']
    });

    expect(transform.variables).toEqual(['topic', 'audience']);
  });

  it('migrates legacy templates once and leaves the legacy key in place', async () => {
    env.sync.__seed({
      [LEGACY_KEY]: [
        { name: 'Legacy One', template: 'Do {{thing}}', variables: ['thing'] }
      ]
    });

    const transforms = await globalThis.ZeusTransforms.loadTransforms();
    const names = transforms.map((transform) => transform.name);

    expect(names).toContain('Polish');
    expect(names).toContain('Prompt Engineer');
    expect(names).toContain('Legacy One');

    const migrated = transforms.find((transform) => transform.name === 'Legacy One');
    expect(migrated.shortcut).toBe('');
    expect(migrated.variables).toEqual(['thing']);

    // Rollback safety: the previous version's key still holds its data.
    expect(env.sync.__data.get(LEGACY_KEY)).toHaveLength(1);

    // A second load must not duplicate the migrated entry.
    const second = await globalThis.ZeusTransforms.loadTransforms();
    expect(second.filter((transform) => transform.name === 'Legacy One')).toHaveLength(1);
  });

  it('refuses a payload too large to sync', async () => {
    // Each instruction is individually valid; the combined payload exceeds sync quota.
    const many = Array.from({ length: 40 }, (_, index) => ({
      id: `bulk-${index}`,
      name: `Bulk ${index}`,
      instruction: 'x'.repeat(3000),
      template: '',
      variables: [],
      shortcut: '',
      enabled: true,
      builtin: false
    }));

    await expect(globalThis.ZeusTransforms.saveTransforms(many)).rejects.toThrow(/too large to sync/i);
  });

  it('round-trips a save and resolves by id', async () => {
    const saved = await globalThis.ZeusTransforms.saveTransforms([{
      id: 'custom-a',
      name: 'Custom A',
      instruction: 'Rewrite it tersely.',
      template: '',
      variables: [],
      shortcut: 'Ctrl+Shift+7',
      enabled: true,
      builtin: false
    }]);

    expect(saved).toHaveLength(1);

    const loaded = await globalThis.ZeusTransforms.loadTransforms();
    expect(globalThis.ZeusTransforms.getTransformById(loaded, 'custom-a').name).toBe('Custom A');
    expect(globalThis.ZeusTransforms.getTransformById(loaded, 'missing')).toBeNull();
  });

  it('treats disabled transforms as not applicable', () => {
    const transforms = [
      { id: 'on', name: 'On', enabled: true },
      { id: 'off', name: 'Off', enabled: false }
    ];

    expect(globalThis.ZeusTransforms.getEnabledTransforms(transforms).map((t) => t.id)).toEqual(['on']);
  });

  it('applies template values and reports unresolved placeholders', () => {
    const transforms = globalThis.ZeusTransforms;

    expect(transforms.applyTemplateValues('A {{x}} B {{y}}', { x: '1' })).toBe('A 1 B {{y}}');
    expect(transforms.findUnresolvedVariables('A {{x}} B {{y}}')).toEqual(['x', 'y']);
    expect(transforms.findUnresolvedVariables('no vars')).toEqual([]);
  });

  it('generates unique ids for user transforms', () => {
    const first = globalThis.ZeusTransforms.createTransformId('My Cool Transform');
    const second = globalThis.ZeusTransforms.createTransformId('My Cool Transform');

    expect(first).toMatch(/^custom-my-cool-transform-/);
    expect(first).not.toBe(second);
  });

  it('surfaces a rejected sync write instead of reporting success', async () => {
    let setCalls = 0;
    const originalSet = env.chrome.storage.sync.set;
    env.chrome.storage.sync.set = (payload, callback) => {
      setCalls += 1;
      // Reproduce Chrome's quota failure: lastError is set and the payload is dropped.
      env.setLastError('QUOTA_BYTES_PER_ITEM quota exceeded');
      if (typeof callback === 'function') callback();
    };

    await expect(globalThis.ZeusTransforms.saveTransforms([{
      id: 'custom-quota',
      name: 'Quota',
      instruction: 'Rewrite it.',
      template: '',
      variables: [],
      shortcut: '',
      enabled: true,
      builtin: false
    }])).rejects.toThrow(/quota/i);

    // The guard must report the failure rather than swallow it.
    expect(setCalls).toBe(1);
    // Nothing was persisted, so callers must not treat this as a success.
    expect(env.sync.__data.has(STORAGE_KEY)).toBe(false);

    env.chrome.storage.sync.set = originalSet;
  });

  it('reports a failed read instead of silently returning no transforms', async () => {
    const originalGet = env.chrome.storage.sync.get;
    env.chrome.storage.sync.get = (_keys, callback) => {
      env.setLastError('Storage read failed');
      if (typeof callback === 'function') callback({});
    };

    await expect(globalThis.ZeusTransforms.loadTransforms()).rejects.toThrow(/storage read failed/i);

    env.chrome.storage.sync.get = originalGet;
  });
});
