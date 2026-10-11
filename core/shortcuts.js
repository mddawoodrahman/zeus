(function initZeusShortcuts(globalScope) {
  const MODIFIER_KEYS = Object.freeze(['Control', 'Alt', 'Shift', 'Meta', 'AltGraph']);
  const MODIFIER_ALIASES = Object.freeze({
    ctrl: 'Ctrl',
    control: 'Ctrl',
    cmd: 'Ctrl',
    command: 'Ctrl',
    meta: 'Meta',
    super: 'Meta',
    win: 'Meta',
    alt: 'Alt',
    option: 'Alt',
    opt: 'Alt',
    shift: 'Shift'
  });

  // Modifier order is fixed so equivalent combos always compare equal as strings.
  const MODIFIER_ORDER = Object.freeze(['Ctrl', 'Alt', 'Shift', 'Meta']);

  const KEY_ALIASES = Object.freeze({
    esc: 'Escape',
    escape: 'Escape',
    ' ': 'Space',
    space: 'Space',
    spacebar: 'Space',
    plus: '+',
    del: 'Delete',
    ins: 'Insert',
    return: 'Enter'
  });

  /** Keys that can meaningfully appear in a combo, excluding free-form text. */
  const NAMED_KEYS = Object.freeze([
    'Escape', 'Enter', 'Tab', 'Space', 'Backspace', 'Delete', 'Insert',
    'Home', 'End', 'PageUp', 'PageDown',
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'CapsLock', 'NumLock', 'ScrollLock', 'PrintScreen', 'Pause',
    'ContextMenu', 'Backquote', 'Minus', 'Equal', 'BracketLeft', 'BracketRight',
    'Backslash', 'Semicolon', 'Quote', 'Comma', 'Period', 'Slash'
  ]);

  function isKnownKeyName(key) {
    const value = String(key || '');
    if (value.length === 1) {
      return true;
    }

    if (/^F([1-9]|1[0-9]|2[0-4])$/.test(value)) {
      return true;
    }

    return NAMED_KEYS.includes(value);
  }

  // Combos Chrome or the OS consumes before a page-level listener can act.
  const RESERVED_COMBOS = Object.freeze([
    'Ctrl+T', 'Ctrl+N', 'Ctrl+W', 'Ctrl+Shift+W', 'Ctrl+Shift+T', 'Ctrl+Shift+N',
    'Ctrl+Tab', 'Ctrl+Shift+Tab', 'Ctrl+P', 'Ctrl+S', 'Ctrl+F', 'Ctrl+G', 'Ctrl+H',
    'Ctrl+J', 'Ctrl+K', 'Ctrl+L', 'Ctrl+O', 'Ctrl+R', 'Ctrl+Shift+R', 'Ctrl+U',
    'Ctrl+D', 'Ctrl+E', 'Ctrl+Shift+Delete', 'Ctrl+Shift+B', 'Ctrl+Shift+O',
    'Alt+F4', 'Alt+Tab', 'Alt+Shift+Tab', 'Alt+Left', 'Alt+Right', 'Alt+Home',
    'Ctrl+L', 'Ctrl+Shift+J', 'Ctrl+Shift+I', 'Ctrl+Shift+C', 'Ctrl+Shift+M',
    'Meta+Space', 'Meta+Tab', 'Alt+Space'
  ]);

  // Reserved browser/OS shortcuts should not be rejected on macOS where the Cmd
  // key owns them, so evaluate reservations in canonical terms.
  function detectPlatform() {
    try {
      const platform = String(globalScope?.navigator?.platform || globalScope?.navigator?.userAgent || '');
      return /mac|iphone|ipad/i.test(platform) ? 'mac' : 'other';
    } catch (_) {
      return 'other';
    }
  }

  /** Modifier used for the "primary" binding on this platform. */
  function primaryModifier() {
    return detectPlatform() === 'mac' ? 'Meta' : 'Ctrl';
  }

  function isModifierKey(key) {
    return MODIFIER_KEYS.includes(String(key || ''));
  }

  function normalizeKeyName(rawKey) {
    const value = String(rawKey || '');
    if (!value) {
      return '';
    }

    const alias = KEY_ALIASES[value.toLowerCase()];
    if (alias) {
      return alias;
    }

    if (value.length === 1) {
      return value.toUpperCase();
    }

    return value;
  }

  /** Extracts canonical state from a KeyboardEvent (or any keydown-like object). */
  function normalizeEvent(event) {
    if (!event) {
      return null;
    }

    const key = normalizeKeyName(event.key);
    if (!key || isModifierKey(event.key)) {
      return null;
    }

    return {
      key,
      code: String(event.code || ''),
      ctrl: Boolean(event.ctrlKey || event.metaKey),
      alt: Boolean(event.altKey),
      shift: Boolean(event.shiftKey),
      meta: Boolean(event.metaKey)
    };
  }

  function comboFromParts(modifiers, key) {
    const normalizedKey = normalizeKeyName(key);
    if (!normalizedKey) {
      return '';
    }

    const ordered = MODIFIER_ORDER.filter((modifier) => modifiers.includes(modifier));
    return ordered.concat(normalizedKey).join('+');
  }

  /** Builds a canonical combo string from a live keydown event. */
  function comboFromEvent(event) {
    const normalized = normalizeEvent(event);
    if (!normalized) {
      return '';
    }

    const modifiers = [];
    if (normalized.ctrl) modifiers.push('Ctrl');
    if (normalized.alt) modifiers.push('Alt');
    if (normalized.shift) modifiers.push('Shift');
    if (normalized.meta) modifiers.push('Meta');

    return comboFromParts(modifiers, normalized.key);
  }

  /** True when the tokens are modifiers only, e.g. "Shift" or "Ctrl+Alt". */
  function isModifierOnlyCombo(combo) {
    const tokens = String(combo || '')
      .split('+')
      .map((token) => token.trim())
      .filter(Boolean);

    if (tokens.length === 0) {
      return false;
    }

    return tokens.every((token) => token.toLowerCase() === 'mod' || Boolean(MODIFIER_ALIASES[token.toLowerCase()]));
  }

  /**
   * Parses a combo string into canonical parts. Handles both `+`-joined combos and
   * the `Mod+K` convenience form used by the built-in defaults.
   */
  function parseCombo(combo) {
    const raw = String(combo || '').trim();
    if (!raw) {
      return null;
    }

    const tokens = raw
      .split('+')
      .map((token) => token.trim())
      .filter(Boolean);

    if (tokens.length === 0) {
      return null;
    }

    const modifiers = [];
    let key = '';

    for (const token of tokens) {
      // `Mod` is a platform-neutral alias for the primary modifier key.
      if (token.toLowerCase() === 'mod') {
        const primary = primaryModifier();
        if (!modifiers.includes(primary)) {
          modifiers.push(primary);
        }
        continue;
      }

      const modifier = MODIFIER_ALIASES[token.toLowerCase()];
      if (modifier) {
        if (key) {
          return null;
        }
        if (!modifiers.includes(modifier)) {
          modifiers.push(modifier);
        }
        continue;
      }

      if (key) {
        return null;
      }

      key = normalizeKeyName(token);
    }

    if (!key) {
      return null;
    }

    // Reject free-form text such as "not-a-combo" rather than treating it as a key.
    if (!isKnownKeyName(key)) {
      return null;
    }

    return {
      modifiers: MODIFIER_ORDER.filter((modifier) => modifiers.includes(modifier)),
      key
    };
  }

  function canonicalizeCombo(combo) {
    const parsed = parseCombo(combo);
    return parsed ? comboFromParts(parsed.modifiers, parsed.key) : '';
  }

  /** Keys that would interrupt ordinary typing if bound without a modifier. */
  function requiresModifier(key) {
    if (key === 'Space') {
      return true;
    }

    return key.length === 1 && /[A-Z0-9]/i.test(key);
  }

  function validateCombo(combo) {
    // Report the specific, actionable reason before the generic malformed-combo one.
    if (isModifierOnlyCombo(combo)) {
      return {
        valid: false,
        reason: 'Modifier keys alone cannot be used. Add a letter, number, or other key.'
      };
    }

    const parsed = parseCombo(combo);

    if (!parsed) {
      return {
        valid: false,
        reason: 'Press a key combination, for example Ctrl+Shift+1.'
      };
    }

    if (!parsed.key || isModifierKey(parsed.key)) {
      return {
        valid: false,
        reason: 'Modifier keys alone cannot be used. Add a letter, number, or other key.'
      };
    }

    if (requiresModifier(parsed.key) && parsed.modifiers.length === 0) {
      return {
        valid: false,
        reason: `Add a modifier (Ctrl, Alt, or Shift) to ${parsed.key} so typing is not interrupted.`
      };
    }

    const canonical = comboFromParts(parsed.modifiers, parsed.key);
    if (RESERVED_COMBOS.includes(canonical)) {
      return {
        valid: false,
        reason: `${canonical} is reserved by the browser and cannot be captured.`
      };
    }

    return { valid: true, canonical };
  }

  function isValidCombo(combo) {
    return validateCombo(combo).valid;
  }

  /** Human-readable label for a combo, platform aware. */
  function formatCombo(combo) {
    const parsed = parseCombo(combo);
    if (!parsed) {
      return '';
    }

    const isMac = detectPlatform() === 'mac';
    const parts = parsed.modifiers.map((modifier) => {
      if (modifier === 'Ctrl') return isMac ? 'Cmd' : 'Ctrl';
      if (modifier === 'Alt') return isMac ? 'Option' : 'Alt';
      return modifier;
    });

    return parts.concat(parsed.key).join(' + ');
  }

  function describeCombo(combo) {
    const formatted = formatCombo(combo);
    return formatted ? `Press ${formatted}` : 'No shortcut set';
  }

  function matchCombo(normalizedEvent, combo) {
    if (!normalizedEvent) {
      return false;
    }

    const parsed = parseCombo(combo);
    if (!parsed || parsed.key !== normalizedEvent.key) {
      return false;
    }

    const expected = {
      Ctrl: Boolean(normalizedEvent.ctrl),
      Alt: Boolean(normalizedEvent.alt),
      Shift: Boolean(normalizedEvent.shift),
      Meta: Boolean(normalizedEvent.meta)
    };

    return MODIFIER_ORDER.every((modifier) => expected[modifier] === parsed.modifiers.includes(modifier));
  }

  function matchesEvent(event, combo) {
    return matchCombo(normalizeEvent(event), combo);
  }

  /** Finds another transform that already owns this combo, if any. */
  function findDuplicateShortcut(transforms, combo, exceptTransformId) {
    const canonical = canonicalizeCombo(combo);
    if (!canonical || !Array.isArray(transforms)) {
      return null;
    }

    return transforms.find((transform) => {
      if (!transform || transform.id === exceptTransformId || !transform.shortcut) {
        return false;
      }

      return canonicalizeCombo(transform.shortcut) === canonical;
    }) || null;
  }

  /** Resolves the transform bound to a live keydown event, if any. */
  function findTransformForEvent(event, transforms) {
    const normalized = normalizeEvent(event);
    if (!normalized || !Array.isArray(transforms)) {
      return null;
    }

    return transforms.find((transform) => {
      if (!transform || transform.enabled === false || !transform.shortcut) {
        return false;
      }

      return matchCombo(normalized, transform.shortcut);
    }) || null;
  }

  /**
   * Wires a keydown-capturing shortcut field. Shared by the popup and the side
   * panel so both surfaces behave identically. `options.onCommit(combo)` receives
   * either a valid canonical combo or '' when the user clears the field.
   */
  function createRecorder(field, options) {
    if (!field || typeof field.addEventListener !== 'function') {
      return { destroy() {}, setCombo() {}, cancel() {} };
    }

    const settings = options || {};
    const onCommit = typeof settings.onCommit === 'function' ? settings.onCommit : () => {};
    const onReject = typeof settings.onReject === 'function' ? settings.onReject : () => {};
    const validate = typeof settings.validate === 'function' ? settings.validate : validateCombo;

    let capturing = false;
    let currentCombo = '';

    function render(text, isCapturing) {
      field.textContent = text;
      field.dataset.capturing = isCapturing ? '1' : '0';
    }

    function renderCurrent() {
      render(currentCombo ? formatCombo(currentCombo) : 'Click to set', false);
    }

    function beginCapture() {
      capturing = true;
      render('Press keys...', true);
    }

    function endCapture() {
      capturing = false;
      renderCurrent();
    }

    function onFocus() {
      beginCapture();
    }

    function onKeydown(event) {
      if (!capturing) {
        return;
      }

      // Always own the keystroke while capturing so the recorded combo cannot also
      // trigger its own transform or the host page.
      event.preventDefault();
      event.stopPropagation();

      if (event.key === 'Escape') {
        endCapture();
        return;
      }

      if (event.key === 'Backspace' || event.key === 'Delete') {
        currentCombo = '';
        onCommit('');
        endCapture();
        return;
      }

      if (isModifierKey(event.key)) {
        const preview = comboFromEvent(event);
        if (preview) {
          render(`${formatCombo(preview)} ...`, true);
        }
        return;
      }

      const combo = comboFromEvent(event);
      const result = validate(combo);

      if (!result || !result.valid) {
        onReject(result?.reason || 'That key combination cannot be used.');
        return;
      }

      currentCombo = result.canonical;
      onCommit(currentCombo);
      endCapture();
    }

    function onBlur() {
      if (capturing) {
        endCapture();
      }
    }

    field.addEventListener('focus', onFocus);
    field.addEventListener('keydown', onKeydown, true);
    field.addEventListener('blur', onBlur);
    field.setAttribute('tabindex', field.getAttribute('tabindex') || '0');
    field.setAttribute('role', 'button');

    renderCurrent();

    return {
      setCombo(combo) {
        currentCombo = canonicalizeCombo(combo) || '';
        renderCurrent();
      },
      getCombo() {
        return currentCombo;
      },
      cancel() {
        endCapture();
      },
      destroy() {
        field.removeEventListener('focus', onFocus);
        field.removeEventListener('keydown', onKeydown, true);
        field.removeEventListener('blur', onBlur);
      }
    };
  }

  globalScope.ZeusShortcuts = Object.freeze({
    MODIFIER_ORDER,
    RESERVED_COMBOS,
    MODIFIER_KEYS,
    isModifierKey,
    isModifierOnlyCombo,
    normalizeEvent,
    normalizeKeyName,
    comboFromEvent,
    parseCombo,
    canonicalizeCombo,
    validateCombo,
    isValidCombo,
    formatCombo,
    describeCombo,
    matchCombo,
    matchesEvent,
    findDuplicateShortcut,
    findTransformForEvent,
    primaryModifier,
    createRecorder
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
