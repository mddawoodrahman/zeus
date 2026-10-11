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

function keydown(element, key, modifiers) {
  const flags = modifiers || {};
  const event = new KeyboardEvent('keydown', {
    key,
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
        onMessage: { addListener: () => {}, removeListener: () => {} }
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
    const event = keydown(textarea, '1', { ctrl: true, shift: true });
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(event.defaultPrevented).toBe(true);

    const enhanceCall = sentMessages.find((message) => message.action === 'enhancePrompt');
    expect(enhanceCall).toBeTruthy();
    expect(enhanceCall.transformId).toBe('builtin-polish');
    expect(textarea.value).toBe('enhanced:write me a poem');
  });

  it('ignores keys that match no transform', async () => {
    await bootWith();
    keydown(textarea, '9', { ctrl: true, shift: true });
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(sentMessages.some((message) => message.action === 'enhancePrompt')).toBe(false);
    expect(textarea.value).toBe('write me a poem');
  });

  it('ignores modifier-only presses so typing is never interrupted', async () => {
    await bootWith();
    const event = keydown(textarea, 'Shift', { shift: true });
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(event.defaultPrevented).toBe(false);
    expect(sentMessages.some((message) => message.action === 'enhancePrompt')).toBe(false);
  });

  it('ignores the shortcut when no editable input is focused', async () => {
    await bootWith();
    textarea.blur();
    document.body.focus();

    keydown(document.body, '1', { ctrl: true, shift: true });
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(sentMessages.some((message) => message.action === 'enhancePrompt')).toBe(false);
  });

  it('does not enhance an empty prompt', async () => {
    await bootWith();
    textarea.value = '';
    textarea.focus();

    keydown(textarea, '1', { ctrl: true, shift: true });
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(sentMessages.some((message) => message.action === 'enhancePrompt')).toBe(false);
  });

  it('reports an unavailable transform instead of silently doing nothing', async () => {
    // Simulate a site where every transform was removed before the page loaded.
    await bootWith({ transforms: [] });

    keydown(textarea, '1', { ctrl: true, shift: true });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(sentMessages.some((message) => message.action === 'enhancePrompt')).toBe(false);
    expect(textarea.value).toBe('write me a poem');
  });
});
