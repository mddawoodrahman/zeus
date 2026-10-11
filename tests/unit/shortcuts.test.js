const { loadScript, clearZeusGlobals } = require('../utils/runtime');

function keyEvent(key, modifiers) {
  const flags = modifiers || {};
  return {
    key,
    ctrlKey: Boolean(flags.ctrl),
    altKey: Boolean(flags.alt),
    shiftKey: Boolean(flags.shift),
    metaKey: Boolean(flags.meta)
  };
}

describe('ZeusShortcuts', () => {
  beforeEach(() => {
    clearZeusGlobals();
    loadScript('core/shortcuts.js');
  });

  afterEach(() => {
    clearZeusGlobals();
  });

  it('canonicalizes modifier order so equivalent combos compare equal', () => {
    const shortcuts = globalThis.ZeusShortcuts;

    expect(shortcuts.canonicalizeCombo('Shift+Ctrl+1')).toBe('Ctrl+Shift+1');
    expect(shortcuts.canonicalizeCombo('ctrl+shift+1')).toBe('Ctrl+Shift+1');
    expect(shortcuts.canonicalizeCombo('alt+p')).toBe('Alt+P');
    expect(shortcuts.canonicalizeCombo('Escape')).toBe('Escape');
    expect(shortcuts.canonicalizeCombo('cmd+1')).toBe(shortcuts.canonicalizeCombo('Ctrl+1'));
  });

  it('rejects malformed combos', () => {
    const shortcuts = globalThis.ZeusShortcuts;

    expect(shortcuts.parseCombo('')).toBeNull();
    expect(shortcuts.parseCombo('   ')).toBeNull();
    expect(shortcuts.parseCombo('Ctrl')).toBeNull();
    expect(shortcuts.parseCombo('Ctrl+Shift')).toBeNull();
    expect(shortcuts.parseCombo('Ctrl+K+P')).toBeNull();
    expect(shortcuts.canonicalizeCombo('not-a-combo')).toBe('');
  });

  it('builds a canonical combo from a live keydown event', () => {
    const shortcuts = globalThis.ZeusShortcuts;

    expect(shortcuts.comboFromEvent(keyEvent('1', { ctrl: true, shift: true }))).toBe('Ctrl+Shift+1');
    expect(shortcuts.comboFromEvent(keyEvent('p', { ctrl: true }))).toBe('Ctrl+P');
    expect(shortcuts.comboFromEvent(keyEvent('Escape', { ctrl: true }))).toBe('Ctrl+Escape');
    // Modifier-only events produce no combo.
    expect(shortcuts.comboFromEvent(keyEvent('Shift', { shift: true }))).toBe('');
    expect(shortcuts.comboFromEvent(keyEvent('Control', { ctrl: true }))).toBe('');
  });

  it('requires a real key and rejects modifier-only shortcuts', () => {
    const shortcuts = globalThis.ZeusShortcuts;

    expect(shortcuts.isValidCombo('Shift')).toBe(false);
    expect(shortcuts.isValidCombo('Ctrl+Alt')).toBe(false);
    expect(shortcuts.validateCombo('Shift').reason).toMatch(/modifier keys alone/i);

    expect(shortcuts.isValidCombo('Ctrl+Shift+1')).toBe(true);
    expect(shortcuts.isValidCombo('Ctrl+Escape')).toBe(true);
    expect(shortcuts.isValidCombo('F8')).toBe(true);
  });

  it('refuses bare typing keys that would interrupt the user', () => {
    const shortcuts = globalThis.ZeusShortcuts;

    expect(shortcuts.isValidCombo('P')).toBe(false);
    expect(shortcuts.isValidCombo('7')).toBe(false);
    expect(shortcuts.validateCombo('P').reason).toMatch(/add a modifier/i);
  });

  it('refuses combos Chrome or the OS would consume first', () => {
    const shortcuts = globalThis.ZeusShortcuts;

    expect(shortcuts.isValidCombo('Ctrl+T')).toBe(false);
    expect(shortcuts.isValidCombo('Ctrl+W')).toBe(false);
    expect(shortcuts.isValidCombo('Alt+F4')).toBe(false);
    expect(shortcuts.validateCombo('Ctrl+T').reason).toMatch(/reserved by the browser/i);
    expect(shortcuts.isValidCombo('Ctrl+Shift+T')).toBe(false);
  });

  it('formats combos for display', () => {
    const shortcuts = globalThis.ZeusShortcuts;

    expect(shortcuts.formatCombo('Ctrl+Shift+1')).toContain('Ctrl');
    expect(shortcuts.formatCombo('Ctrl+Shift+1')).toContain('Shift');
    expect(shortcuts.formatCombo('Ctrl+Shift+1')).toContain('1');
    expect(shortcuts.formatCombo('')).toBe('');
    expect(shortcuts.describeCombo('')).toMatch(/no shortcut/i);
  });

  it('matches an event against a combo including exact modifiers', () => {
    const shortcuts = globalThis.ZeusShortcuts;

    expect(shortcuts.matchesEvent(keyEvent('1', { ctrl: true, shift: true }), 'Ctrl+Shift+1')).toBe(true);
    expect(shortcuts.matchesEvent(keyEvent('1', { ctrl: true }), 'Ctrl+Shift+1')).toBe(false);
    expect(shortcuts.matchesEvent(keyEvent('1', { ctrl: true, shift: true, alt: true }), 'Ctrl+Shift+1')).toBe(false);
    expect(shortcuts.matchesEvent(keyEvent('2', { ctrl: true, shift: true }), 'Ctrl+Shift+1')).toBe(false);
  });

  it('resolves the transform bound to an event', () => {
    const shortcuts = globalThis.ZeusShortcuts;

    const transforms = [
      { id: 'polish', name: 'Polish', enabled: true, shortcut: 'Ctrl+Shift+1' },
      { id: 'engineer', name: 'Prompt Engineer', enabled: true, shortcut: 'Ctrl+Shift+2' },
      { id: 'disabled', name: 'Off', enabled: false, shortcut: 'Ctrl+Shift+3' }
    ];

    expect(shortcuts.findTransformForEvent(keyEvent('1', { ctrl: true, shift: true }), transforms)?.id).toBe('polish');
    expect(shortcuts.findTransformForEvent(keyEvent('2', { ctrl: true, shift: true }), transforms)?.id).toBe('engineer');
    // Disabled transforms and unbound keys resolve to nothing.
    expect(shortcuts.findTransformForEvent(keyEvent('3', { ctrl: true, shift: true }), transforms)).toBeNull();
    expect(shortcuts.findTransformForEvent(keyEvent('9', { ctrl: true, shift: true }), transforms)).toBeNull();
    expect(shortcuts.findTransformForEvent(keyEvent('Shift', { shift: true }), transforms)).toBeNull();
  });

  it('detects duplicate shortcuts, ignoring the transform being edited', () => {
    const shortcuts = globalThis.ZeusShortcuts;

    const transforms = [
      { id: 'polish', name: 'Polish', shortcut: 'Ctrl+Shift+1' },
      { id: 'engineer', name: 'Prompt Engineer', shortcut: 'Ctrl+Shift+2' },
      { id: 'unbound', name: 'Unbound', shortcut: '' }
    ];

    expect(shortcuts.findDuplicateShortcut(transforms, 'Ctrl+Shift+1', 'engineer')?.id).toBe('polish');
    expect(shortcuts.findDuplicateShortcut(transforms, 'Ctrl+Shift+1', 'polish')).toBeNull();
    expect(shortcuts.findDuplicateShortcut(transforms, 'Ctrl+Shift+9', 'polish')).toBeNull();
    expect(shortcuts.findDuplicateShortcut(transforms, '', 'polish')).toBeNull();
  });
});
