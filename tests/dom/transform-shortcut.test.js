const { loadScript, clearZeusGlobals } = require('../utils/runtime');

function withRect(element, rect) {
  element.getBoundingClientRect = () => ({
    x: rect.left,
    y: rect.top,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    toJSON() {
      return this;
    }
  });
}

function keydown(element, key, code, modifiers) {
  const flags = modifiers || {};
  const event = new KeyboardEvent('keydown', {
    key,
    code,
    ctrlKey: Boolean(flags.ctrl),
    shiftKey: Boolean(flags.shift),
    altKey: Boolean(flags.alt),
    metaKey: Boolean(flags.meta),
    bubbles: true,
    cancelable: true
  });

  element.dispatchEvent(event);
  return event;
}

/**
 * The real US-layout keydown for the digit row: with Shift held Chrome reports
 * key === "!" and code === "Digit1", never key === "1".
 */
function pressDigit(element, digit, modifiers) {
  const shifted = { 1: '!', 2: '@', 9: '(' };
  return keydown(element, shifted[digit], `Digit${digit}`, modifiers);
}

/**
 * Replaces the whole document body with a detached, freshly attached one.
 * content.js installs a module-level keydown listener on `document`, so without
 * this the previous test's listener would keep firing against stale closures.
 */
function resetDocument() {
  document.documentElement.innerHTML = '<head></head><body></body>';
}

describe('content script transform shortcuts', () => {
  let sentMessages;
  let textarea;

  const TRANSFORMS = [
    {
      id: 'builtin-polish',
      name: 'Polish',
      description: '',
      instruction: 'Make it clearer.',
      template: '',
      variables: [],
      shortcut: 'Ctrl+Shift+1',
      enabled: true,
      builtin: true
    },
    {
      id: 'unbound',
      name: 'Unbound',
      instruction: 'Unused.',
      template: '',
      variables: [],
      shortcut: '',
      enabled: true,
      builtin: true
    }
  ];

  function installChromeStub(options) {
    sentMessages = [];
    const transformsPayload = options && Array.isArray(options.transforms) ? options.transforms : TRANSFORMS;
    const respond = (message) => {
      const action = message?.action;

      if (action === 'getSettings') {
        return {
          settings: {
            provider: 'openai',
            apiKeys: { openai: 'test-key' },
            models: { openai: 'gpt-test' }
          }
        };
      }

      if (action === 'getTransforms') {
        return { transforms: transformsPayload };
      }

      if (action === 'ping') {
        return { status: 'pong' };
      }

      if (action === 'enhancePrompt') {
        return { success: true, enhancedPrompt: `enhanced:${message.prompt}` };
      }

      return {};
    };

    globalThis.chrome = {
      runtime: {
        lastError: null,
        sendMessage: (message, callback) => {
          sentMessages.push(message);
          if (typeof callback === 'function') {
            callback(respond(message));
          }
        },
        // Retains listeners so tests can drive the context-menu message path.
        onMessage: {
          listeners: [],
          addListener(listener) {
            if (typeof listener === 'function' && !this.listeners.includes(listener)) {
              this.listeners.push(listener);
            }
          },
          removeListener(listener) {
            const index = this.listeners.indexOf(listener);
            if (index >= 0) this.listeners.splice(index, 1);
          }
        }
      },
      storage: {
        sync: {
          get: (_keys, callback) => callback && callback({}),
          set: (_payload, callback) => callback && callback()
        },
        onChanged: { addListener: () => {} }
      }
    };
  }

  // Loads the content-script module graph against the currently installed stub.
  function loadContentScripts() {
    loadScript('core/domUtils.js');
    loadScript('core/useFloatingPosition.js');
    loadScript('core/injector.js');
    loadScript('core/observer.js');
    loadScript('core/ghostText.js');
    loadScript('core/shortcuts.js');
    loadScript('core/transforms.js');
    loadScript('adapters/generic.js');
    loadScript('content.js');
  }

  function makeTextarea(value) {
    const element = document.createElement('textarea');
    element.value = value;
    withRect(element, { left: 0, top: 0, right: 300, bottom: 80, width: 300, height: 80 });
    document.body.appendChild(element);
    element.focus();
    return element;
  }

  beforeEach(() => {
    clearZeusGlobals();
    resetDocument();
    installChromeStub();
    textarea = makeTextarea('write me a poem');
  });

  async function bootWith(stubOptions) {
    // Rebuild state from scratch so the module graph sees one coherent stub.
    clearZeusGlobals();
    resetDocument();
    installChromeStub(stubOptions);
    textarea = makeTextarea('write me a poem');
    loadContentScripts();
    await new Promise((resolve) => setTimeout(resolve, 30));
  }

  afterEach(() => {
    // Mirrors what a real re-injection does: release listeners before rebuilding.
    globalThis.ZeusContentRuntime?.destroy?.();
    delete globalThis.chrome;
    clearZeusGlobals();
    resetDocument();
  });

  it('applies the bound transform when its shortcut is pressed in a focused input', async () => {
    await bootWith();
    const event = pressDigit(textarea, 1, { ctrl: true, shift: true });
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(event.defaultPrevented).toBe(true);

    const enhanceCall = sentMessages.find((message) => message.action === 'enhancePrompt');
    expect(enhanceCall).toBeTruthy();
    expect(enhanceCall.transformId).toBe('builtin-polish');
    expect(textarea.value).toBe('enhanced:write me a poem');
  });

  it('applies a transform from a real Ctrl+Shift+1 keydown where event.key is "!"', async () => {
    await bootWith();

    // The regression this locks down: a matcher keyed on event.key sees "!" and
    // never matches the stored "Ctrl+Shift+1", so nothing happens at all.
    const event = keydown(textarea, '!', 'Digit1', { ctrl: true, shift: true });
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(event.key).toBe('!');
    expect(event.defaultPrevented).toBe(true);
    expect(sentMessages.find((message) => message.action === 'enhancePrompt')?.transformId)
      .toBe('builtin-polish');
    expect(textarea.value).toBe('enhanced:write me a poem');
  });

  it('ignores keys that match no transform', async () => {
    await bootWith();
    pressDigit(textarea, 9, { ctrl: true, shift: true });
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(sentMessages.some((message) => message.action === 'enhancePrompt')).toBe(false);
    expect(textarea.value).toBe('write me a poem');
  });

  it('ignores modifier-only presses so typing is never interrupted', async () => {
    await bootWith();
    const event = keydown(textarea, 'Shift', 'ShiftLeft', { shift: true });
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(event.defaultPrevented).toBe(false);
    expect(sentMessages.some((message) => message.action === 'enhancePrompt')).toBe(false);
  });

  it('ignores the shortcut when no editable input is focused', async () => {
    await bootWith();
    textarea.blur();
    document.body.focus();

    pressDigit(document.body, 1, { ctrl: true, shift: true });
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(sentMessages.some((message) => message.action === 'enhancePrompt')).toBe(false);
  });

  it('does not rewrite an unfocused prompt box even if the event is dispatched at it', async () => {
    await bootWith();
    textarea.blur();
    document.body.focus();

    // The old resolver fell back to collectInputs()[0], so a shortcut pressed with
    // nothing focused silently rewrote the first prompt box on the page.
    const event = pressDigit(textarea, 1, { ctrl: true, shift: true });
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(event.defaultPrevented).toBe(false);
    expect(sentMessages.some((message) => message.action === 'enhancePrompt')).toBe(false);
    expect(textarea.value).toBe('write me a poem');
  });

  it('does not enhance an empty prompt', async () => {
    await bootWith();
    textarea.value = '';
    textarea.focus();

    pressDigit(textarea, 1, { ctrl: true, shift: true });
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(sentMessages.some((message) => message.action === 'enhancePrompt')).toBe(false);
  });

  it('reports an unavailable transform instead of silently doing nothing', async () => {
    // Simulate a site where every transform was removed before the page loaded.
    await bootWith({ transforms: [] });

    pressDigit(textarea, 1, { ctrl: true, shift: true });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(sentMessages.some((message) => message.action === 'enhancePrompt')).toBe(false);
    expect(textarea.value).toBe('write me a poem');
  });

  it('does not apply the transform twice for one keydown', async () => {
    await bootWith();

    pressDigit(textarea, 1, { ctrl: true, shift: true });
    await new Promise((resolve) => setTimeout(resolve, 30));

    const enhanceCalls = sentMessages.filter((message) => message.action === 'enhancePrompt');
    expect(enhanceCalls).toHaveLength(1);
    // One application, not two stacked rewrites.
    expect(textarea.value).toBe('enhanced:write me a poem');
  });

  it('does nothing after ZeusContentRuntime.destroy()', async () => {
    await bootWith();

    // Sanity: the listener works before teardown.
    pressDigit(textarea, 1, { ctrl: true, shift: true });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(sentMessages.filter((message) => message.action === 'enhancePrompt')).toHaveLength(1);

    sentMessages = [];
    textarea.value = 'write me a poem';
    textarea.focus();

    globalThis.ZeusContentRuntime.destroy();

    const event = pressDigit(textarea, 1, { ctrl: true, shift: true });
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(event.defaultPrevented).toBe(false);
    expect(sentMessages.some((message) => message.action === 'enhancePrompt')).toBe(false);
    expect(textarea.value).toBe('write me a poem');
  });

  it('does not attach a second listener when forceInject re-runs the content script', async () => {
    await bootWith();

    const runtimeBefore = globalThis.ZeusContentRuntime;
    expect(globalThis.chrome.runtime.onMessage.listeners).toHaveLength(1);

    // forceInject re-injects the whole content-script file list into the same
    // isolated world, where the previous run's runtime global is still present.
    loadContentScripts();
    await new Promise((resolve) => setTimeout(resolve, 30));

    // The re-run re-attached to the live runtime instead of initializing again.
    expect(globalThis.ZeusContentRuntime).toBe(runtimeBefore);
    expect(globalThis.chrome.runtime.onMessage.listeners).toHaveLength(1);

    pressDigit(textarea, 1, { ctrl: true, shift: true });
    await new Promise((resolve) => setTimeout(resolve, 30));

    // Exactly one application: a leaked second listener would have fired twice.
    expect(sentMessages.filter((message) => message.action === 'enhancePrompt')).toHaveLength(1);
    expect(textarea.value).toBe('enhanced:write me a poem');
  });

  it('applies the shortcut once the transform list arrives, even if settings never respond', async () => {
    // Repro of the silent total failure: initialize() used to await the settings
    // round-trip BEFORE attaching the keydown listener, so a stalled service worker
    // left the page with no shortcut handling at all.
    const baseSendMessage = globalThis.chrome.runtime.sendMessage;
    globalThis.chrome.runtime.sendMessage = (message, callback) => {
      if (message?.action === 'getSettings') {
        sentMessages.push(message);
        return; // never calls back, exactly like a wedged service worker
      }

      return baseSendMessage(message, callback);
    };

    loadScript('core/domUtils.js');
    loadScript('core/useFloatingPosition.js');
    loadScript('core/injector.js');
    loadScript('core/observer.js');
    loadScript('core/ghostText.js');
    loadScript('core/shortcuts.js');
    loadScript('core/transforms.js');
    loadScript('adapters/generic.js');
    loadScript('content.js');

    // The listener must be live without waiting on settings.
    expect(typeof globalThis.ZeusContentRuntime?.destroy).toBe('function');

    // Let the transform list land; it is fetched independently of settings now.
    await new Promise((resolve) => setTimeout(resolve, 30));

    textarea.focus();
    const event = pressDigit(textarea, 1, { ctrl: true, shift: true });

    // The bound combo is claimed rather than dropped, even though the settings
    // round-trip this handler used to depend on has still not answered.
    expect(event.defaultPrevented).toBe(true);
    expect(sentMessages.some((message) => message.action === 'getTransforms')).toBe(true);

    // ...while an unbound key in the same state is still left alone.
    const unbound = keydown(textarea, '(', 'Digit9', { ctrl: true, shift: true });
    expect(unbound.defaultPrevented).toBe(false);
  });

  it('still resolves a context-menu target when nothing is focused', async () => {
    await bootWith();
    textarea.blur();
    document.body.focus();

    // The context-menu path legitimately falls back to the first prompt box.
    const runtimeListener = globalThis.chrome.runtime.onMessage.listeners[0];
    expect(typeof runtimeListener).toBe('function');

    const response = await new Promise((resolve) => {
      runtimeListener({ action: 'contextEnhancePrompt', transformId: 'builtin-polish' }, {}, resolve);
    });
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(response).toEqual({ status: 'enhanced' });
    expect(textarea.value).toBe('enhanced:write me a poem');
  });
});

describe('shortcut recorder', () => {
  beforeEach(() => {
    clearZeusGlobals();
    loadScript('core/shortcuts.js');
  });

  afterEach(() => {
    clearZeusGlobals();
  });

  // A real element: the recorder also drives textContent, dataset, tabindex and
  // role, so a hand-rolled stub would not exercise the same surface.
  function makeField() {
    const field = document.createElement('div');
    document.body.appendChild(field);
    return field;
  }

  function pressChord(field, keys) {
    for (const key of keys) {
      field.dispatchEvent(new KeyboardEvent('keydown', {
        key: key.key,
        code: key.code,
        ctrlKey: Boolean(key.ctrl),
        shiftKey: Boolean(key.shift),
        altKey: Boolean(key.alt),
        metaKey: Boolean(key.meta),
        bubbles: true,
        cancelable: true
      }));
    }
  }

  it('records a real Ctrl+Shift+1 keydown as the canonical unshifted combo', () => {
    const commits = [];
    const field = makeField();

    globalThis.ZeusShortcuts.createRecorder(field, {
      onCommit(combo) {
        commits.push(combo);
      }
    });

    field.dispatchEvent(new FocusEvent('focus'));
    pressChord(field, [
      { key: 'Control', code: 'ControlLeft', ctrl: true },
      { key: 'Shift', code: 'ShiftLeft', ctrl: true, shift: true },
      { key: '!', code: 'Digit1', ctrl: true, shift: true }
    ]);

    // Storing "Ctrl+Shift+!" here is what made the recorder disagree with the
    // stored default and with the matcher.
    expect(commits).toEqual(['Ctrl+Shift+1']);
    expect(field.textContent).toBe('Ctrl + Shift + 1');
  });

  it('refuses free-form text and modifier-only presses', () => {
    const commits = [];
    const rejections = [];
    const field = makeField();

    globalThis.ZeusShortcuts.createRecorder(field, {
      onCommit(combo) {
        commits.push(combo);
      },
      onReject(reason) {
        rejections.push(reason);
      }
    });

    field.dispatchEvent(new FocusEvent('focus'));
    // Modifier-only: previewed, never committed.
    pressChord(field, [{ key: 'Shift', code: 'ShiftLeft', shift: true }]);
    expect(commits).toEqual([]);

    // A locked key on its own is refused with an actionable reason.
    pressChord(field, [{ key: 'CapsLock', code: 'CapsLock' }]);
    expect(commits).toEqual([]);
    expect(rejections).toHaveLength(1);
    expect(rejections[0]).toMatch(/add a modifier/i);
  });

  it('writes nothing to storage while recording', () => {
    const commits = [];
    let writes = 0;

    globalThis.chrome = {
      storage: {
        sync: {
          set() {
            writes += 1;
          }
        }
      }
    };

    const field = makeField();
    globalThis.ZeusShortcuts.createRecorder(field, {
      onCommit(combo) {
        commits.push(combo);
      }
    });

    field.dispatchEvent(new FocusEvent('focus'));
    pressChord(field, [
      { key: 'Control', code: 'ControlLeft', ctrl: true },
      { key: 'Shift', code: 'ShiftLeft', ctrl: true, shift: true },
      { key: '!', code: 'Digit1', ctrl: true, shift: true }
    ]);

    // Recording is pure state: a write per keystroke would burn the sync quota
    // before the user ever presses SAVE.
    expect(commits).toEqual(['Ctrl+Shift+1']);
    expect(writes).toBe(0);

    delete globalThis.chrome;
  });

  it('stops capturing once the recorder is destroyed', () => {
    const commits = [];
    const field = makeField();
    const recorder = globalThis.ZeusShortcuts.createRecorder(field, {
      onCommit(combo) {
        commits.push(combo);
      }
    });

    field.dispatchEvent(new FocusEvent('focus'));
    recorder.destroy();

    // The keydown listener is gone, so a later press cannot commit anything.
    pressChord(field, [{ key: '!', code: 'Digit1', ctrl: true, shift: true }]);
    expect(commits).toEqual([]);
  });
});
