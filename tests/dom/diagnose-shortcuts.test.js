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

/**
 * The operator-facing diagnostic in scripts/diagnose-shortcuts.js is pasted into a
 * live page, so a crash or a wrong verdict there wastes a debugging round-trip.
 * These tests run it against a real content-script graph in jsdom.
 */
describe('scripts/diagnose-shortcuts.js', () => {
  let logged;
  let textarea;

  const TRANSFORMS = [
    { id: 'builtin-polish', name: 'Polish', shortcut: 'Alt+V', enabled: true, instruction: 'x' },
    { id: 'builtin-prompt-engineer', name: 'Prompt Engineer', shortcut: 'Ctrl+Shift+2', enabled: true, instruction: 'y' }
  ];

  function installChromeStub(options) {
    const respond = (message) => {
      if (message?.action === 'getSettings') {
        return { settings: { provider: 'openai', apiKeys: { openai: 'k' } } };
      }
      if (message?.action === 'getTransforms') {
        return { transforms: options?.transforms ?? TRANSFORMS };
      }
      if (message?.action === 'ping') return { status: 'pong' };
      if (message?.action === 'enhancePrompt') return { success: true, enhancedPrompt: 'enhanced' };
      return {};
    };

    globalThis.chrome = {
      runtime: {
        lastError: null,
        sendMessage: (message, callback) => {
          if (typeof callback === 'function') callback(respond(message));
        },
        onMessage: { listeners: [], addListener() {}, removeListener() {} }
      },
      storage: {
        sync: { get: (_k, cb) => cb && cb({}), set: (_p, cb) => cb && cb() },
        onChanged: { addListener() {} }
      }
    };
  }

  function loadContentScriptGraph() {
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

  function runDiagnostic() {
    loadScript('scripts/diagnose-shortcuts.js');
  }

  /**
   * jsdom performs no layout, so every element reports a zero-size rect and Zeus's
   * own eligibility check (min 40x20) rejects it. A real browser always has layout,
   * so give the document one rather than weakening the check under test.
   */
  function installLayout() {
    Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
      return {
        x: 0,
        y: 0,
        top: 0,
        right: 300,
        bottom: 80,
        left: 0,
        width: 300,
        height: 80,
        toJSON() {
          return this;
        }
      };
    };
  }

  function linesMatching(pattern) {
    return logged.filter((line) => pattern.test(line));
  }

  /** Parses a `[ZEUS-DIAG] PASS|FAIL | <name> [| detail]` line. */
  function verdict(name) {
    const line = logged.find((entry) => entry.includes('| ' + name + ' |') || entry.endsWith('| ' + name));
    if (!line) return null;
    const status = line.replace('[ZEUS-DIAG]', '').split('|')[0].trim();
    return status === 'PASS' || status === 'FAIL' ? status : 'OTHER';
  }

  beforeEach(() => {
    clearZeusGlobals();
    document.documentElement.innerHTML = '<head></head><body></body>';
    logged = [];
    vi.spyOn(console, 'log').mockImplementation((...args) => {
      logged.push(args.map(String).join(' '));
    });
  });

  afterEach(() => {
    globalThis.ZeusContentRuntime?.destroy?.();
    delete globalThis.chrome;
    clearZeusGlobals();
    vi.restoreAllMocks();
  });

  it('reports the listener as alive and selective on a healthy page', async () => {
    installChromeStub();
    installLayout();
    loadContentScriptGraph();

    textarea = document.createElement('textarea');
    textarea.value = 'write me a poem';
    document.body.appendChild(textarea);
    textarea.focus();

    await new Promise((resolve) => setTimeout(resolve, 30));
    runDiagnostic();
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(verdict('handler claims a bound combo (Ctrl+Shift+2)')).toBe('PASS');
    expect(verdict('handler ignores an unbound combo (Ctrl+Shift+0)')).toBe('PASS');
    expect(verdict('a prompt-like element is focused')).toBe('PASS');
    expect(verdict('ZeusContentRuntime.destroy present')).toBe('PASS');
    // The stored Alt+V binding must parse cleanly.
    expect(verdict('stored shortcut parses')).toBe('PASS');
    expect(logged.some((line) => line.includes('"Alt+V" -> {"modifiers":["Alt"],"key":"V"}'))).toBe(true);
    expect(logged.some((line) => line.includes('getEventListeners(document).keydown'))).toBe(true);
    expect(linesMatching(/SUMMARY: \d+ pass, 0 fail/)).toHaveLength(1);
  });

  it('blames the listener when the content script is not present', async () => {
    // No content script loaded: this is the "nothing works at all" page state.
    installChromeStub();
    installLayout();
    textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    textarea.focus();

    runDiagnostic();
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(verdict('ZeusShortcuts loaded')).toBe('FAIL');
    expect(verdict('handler claims a bound combo (Ctrl+Shift+2)')).toBe('FAIL');
    expect(logged.some((line) => line.includes('listener missing, or Ctrl+Shift+2 is not bound'))).toBe(true);
  });

  it('does not disturb the page once it has finished probing', async () => {
    installChromeStub();
    loadContentScriptGraph();
    await new Promise((resolve) => setTimeout(resolve, 30));

    const bodyBefore = document.body.innerHTML;
    runDiagnostic();
    await new Promise((resolve) => setTimeout(resolve, 30));

    // The synthetic press runs on a probe field that is removed again, and no
    // probe textarea is left behind.
    expect(document.body.innerHTML).toBe(bodyBefore);
    expect(document.querySelectorAll('textarea')).toHaveLength(0);
    expect(logged.some((line) => line.includes('SUMMARY:'))).toBe(true);
    expect(logged.some((line) => line.includes('REAL PRESS REACHED THE PAGE')) ||
      logged.some((line) => line.includes('NO REAL PRESS')) ||
      logged.some((line) => line.includes('Now press Ctrl+Shift+2'))).toBe(true);
  });
});
