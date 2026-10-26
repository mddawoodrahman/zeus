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

/**
 * A keydown carrying BOTH `key` and `code`, exactly as Chrome dispatches it.
 *
 * `key` is the character the layout actually produced — with Shift held on a US
 * layout, Ctrl+Shift+1 reports key === "!" while code === "Digit1". Tests that
 * omit `code` cannot see that difference and will pass while the feature is dead.
 */
function physicalKeyEvent(key, code, modifiers) {
  return Object.assign(keyEvent(key, modifiers), { code });
}

/** The real US-layout keydown for the shipped defaults. */
const DIGIT_ROW = Object.freeze({
  1: { key: '!', code: 'Digit1' },
  2: { key: '@', code: 'Digit2' },
  4: { key: '$', code: 'Digit4' },
  5: { key: '%', code: 'Digit5' },
  9: { key: '(', code: 'Digit9' }
});

function digitEvent(digit, modifiers) {
  const physical = DIGIT_ROW[digit];
  return physicalKeyEvent(physical.key, physical.code, modifiers);
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

  describe('real browser keydown events (event.code, not event.key)', () => {
    it('matches Ctrl+Shift+1 even though event.key is "!"', () => {
      const shortcuts = globalThis.ZeusShortcuts;
      const event = physicalKeyEvent('!', 'Digit1', { ctrl: true, shift: true });

      // Document the trap explicitly: event.key alone is not the digit.
      expect(event.key).toBe('!');
      expect(shortcuts.matchesEvent(event, 'Ctrl+Shift+1')).toBe(true);
    });

    it('canonicalizes a physically-pressed digit back to the unshifted key', () => {
      const shortcuts = globalThis.ZeusShortcuts;

      expect(shortcuts.comboFromEvent(physicalKeyEvent('!', 'Digit1', { ctrl: true, shift: true })))
        .toBe('Ctrl+Shift+1');
      expect(shortcuts.comboFromEvent(physicalKeyEvent('@', 'Digit2', { ctrl: true, shift: true })))
        .toBe('Ctrl+Shift+2');
      expect(shortcuts.comboFromEvent(physicalKeyEvent('#', 'Digit3', { ctrl: true, shift: true })))
        .toBe('Ctrl+Shift+3');
      // Shifted symbols that have no relation to the digit's unshifted value.
      expect(shortcuts.comboFromEvent(physicalKeyEvent('$', 'Digit4', { ctrl: true, shift: true })))
        .toBe('Ctrl+Shift+4');
      expect(shortcuts.comboFromEvent(physicalKeyEvent('%', 'Digit5', { ctrl: true, shift: true })))
        .toBe('Ctrl+Shift+5');
    });

    it('resolves the shipped default transforms from real keydown events', () => {
      const shortcuts = globalThis.ZeusShortcuts;

      const transforms = [
        { id: 'builtin-polish', name: 'Polish', enabled: true, shortcut: 'Ctrl+Shift+1' },
        { id: 'builtin-prompt-engineer', name: 'Prompt Engineer', enabled: true, shortcut: 'Ctrl+Shift+2' }
      ];

      expect(shortcuts.findTransformForEvent(digitEvent(1, { ctrl: true, shift: true }), transforms)?.id)
        .toBe('builtin-polish');
      expect(shortcuts.findTransformForEvent(digitEvent(2, { ctrl: true, shift: true }), transforms)?.id)
        .toBe('builtin-prompt-engineer');
      // An unbound digit row key stays unbound.
      expect(shortcuts.findTransformForEvent(digitEvent(9, { ctrl: true, shift: true }), transforms))
        .toBeNull();
    });

    it('binds the physical key, so a different layout still triggers the shortcut', () => {
      const shortcuts = globalThis.ZeusShortcuts;
      // On AZERTY, physical Digit1 emits "&" rather than "1"/"!".
      const azerty = physicalKeyEvent('&', 'Digit1', { ctrl: true, shift: true });

      expect(shortcuts.comboFromEvent(azerty)).toBe('Ctrl+Shift+1');
      expect(shortcuts.matchesEvent(azerty, 'Ctrl+Shift+1')).toBe(true);
    });

    it('still distinguishes the Shift state on the digit row', () => {
      const shortcuts = globalThis.ZeusShortcuts;

      expect(shortcuts.matchesEvent(physicalKeyEvent('1', 'Digit1', { ctrl: true }), 'Ctrl+Shift+1'))
        .toBe(false);
      expect(shortcuts.matchesEvent(physicalKeyEvent('!', 'Digit1', { ctrl: true, shift: true, alt: true }), 'Ctrl+Shift+1'))
        .toBe(false);
    });

    it('leaves labelled keys and modifier-only presses alone', () => {
      const shortcuts = globalThis.ZeusShortcuts;

      // A letter reports its unshifted value through code just as before.
      expect(shortcuts.comboFromEvent(physicalKeyEvent('P', 'KeyP', { ctrl: true, shift: true })))
        .toBe('Ctrl+Shift+P');
      expect(shortcuts.comboFromEvent(physicalKeyEvent('Escape', 'Escape', { ctrl: true })))
        .toBe('Ctrl+Escape');
      // Bare Shift produces no combo at all.
      expect(shortcuts.comboFromEvent(physicalKeyEvent('Shift', 'ShiftLeft', { shift: true }))).toBe('');
      // Caps Lock is a real key, not a modifier, but binding it alone is refused so
      // toggling the lock while typing can never fire a transform.
      expect(shortcuts.isValidCombo('CapsLock')).toBe(false);
      expect(shortcuts.validateCombo('CapsLock').reason).toMatch(/add a modifier/i);
      expect(shortcuts.isValidCombo('NumLock')).toBe(false);
      expect(shortcuts.isValidCombo('ScrollLock')).toBe(false);
      // With a modifier it is an ordinary binding.
      expect(shortcuts.comboFromEvent(physicalKeyEvent('CapsLock', 'CapsLock', { shift: true }))).toBe('Shift+CapsLock');
      expect(shortcuts.isValidCombo('Ctrl+CapsLock')).toBe(true);
    });

    it('rejects free-form text and modifier-only combos', () => {
      const shortcuts = globalThis.ZeusShortcuts;

      expect(shortcuts.parseCombo('not-a-combo')).toBeNull();
      expect(shortcuts.canonicalizeCombo('not-a-combo')).toBe('');
      expect(shortcuts.isValidCombo('not-a-combo')).toBe(false);
      expect(shortcuts.validateCombo('Shift').valid).toBe(false);
      expect(shortcuts.validateCombo('Control+Alt').valid).toBe(false);
      expect(shortcuts.validateCombo('Ctrl').reason).toMatch(/modifier keys alone/i);
    });

    it('round-trips a recorded combo so the recorder and the matcher agree', () => {
      const shortcuts = globalThis.ZeusShortcuts;

      // What the recorder stores when the user presses Ctrl+Shift+1.
      const recorded = shortcuts.comboFromEvent(digitEvent(1, { ctrl: true, shift: true }));
      const validation = shortcuts.validateCombo(recorded);

      expect(validation.valid).toBe(true);
      expect(validation.canonical).toBe('Ctrl+Shift+1');
      // The stored value is exactly what the matcher accepts back.
      expect(shortcuts.matchesEvent(digitEvent(1, { ctrl: true, shift: true }), recorded)).toBe(true);
      expect(shortcuts.formatCombo(recorded)).toBe('Ctrl + Shift + 1');
    });
  });
});
