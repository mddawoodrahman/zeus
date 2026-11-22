/**
 * @vitest-environment jsdom
 */

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

function createMockPort(name = 'copilot-stream') {
  const messageListeners = [];
  const disconnectListeners = [];
  const postedMessages = [];
  let isDisconnected = false;

  return {
    name,
    postedMessages,
    isDisconnected: () => isDisconnected,
    onMessage: {
      addListener(fn) {
        messageListeners.push(fn);
      },
      removeListener(fn) {
        const idx = messageListeners.indexOf(fn);
        if (idx >= 0) messageListeners.splice(idx, 1);
      }
    },
    onDisconnect: {
      addListener(fn) {
        disconnectListeners.push(fn);
      },
      removeListener(fn) {
        const idx = disconnectListeners.indexOf(fn);
        if (idx >= 0) disconnectListeners.splice(idx, 1);
      }
    },
    postMessage(msg) {
      if (isDisconnected) throw new Error('Port disconnected');
      postedMessages.push(JSON.parse(JSON.stringify(msg)));
    },
    disconnect: vi.fn(() => {
      if (isDisconnected) return;
      isDisconnected = true;
      disconnectListeners.forEach((fn) => {
        try { fn(); } catch (_) {}
      });
    }),
    _emitMessage(msg) {
      if (isDisconnected) return;
      messageListeners.forEach((fn) => {
        try { fn(JSON.parse(JSON.stringify(msg))); } catch (_) {}
      });
    },
    _emitDisconnect() {
      if (isDisconnected) return;
      isDisconnected = true;
      disconnectListeners.forEach((fn) => {
        try { fn(); } catch (_) {}
      });
    }
  };
}

describe('Copilot Sensitive Data Interruption & Dynamic Recovery (Ticket 4)', () => {
  let createdPorts = [];
  let textarea;
  let adapter;
  let settings;

  beforeEach(() => {
    vi.useFakeTimers();
    clearZeusGlobals();
    document.body.innerHTML = '';
    createdPorts = [];

    // Mock chrome.runtime.connect
    globalThis.chrome = {
      runtime: {
        id: 'zeus-test-extension',
        connect: vi.fn((connectInfo) => {
          const port = createMockPort(connectInfo?.name);
          createdPorts.push(port);
          return port;
        })
      }
    };

    // Load dependencies in exact order
    loadScript('core/domUtils.js');
    loadScript('core/redactor.js');
    loadScript('core/ghostText.js');
    loadScript('core/copilot.js');

    textarea = document.createElement('textarea');
    withRect(textarea, {
      top: 50,
      left: 50,
      right: 450,
      bottom: 250,
      width: 400,
      height: 200
    });
    document.body.appendChild(textarea);

    adapter = {
      inputSelectors: ['textarea'],
      pickInputs: (inputs) => inputs
    };

    settings = {
      copilotEnabled: true,
      copilotMode: 'conservative', // 800ms debounce
      copilotProvider: 'openai',
      copilotMaxTokens: 60,
      redactionEnabled: true,
      apiKeys: {}
    };

    globalThis.ZeusCopilot.init(adapter, settings);
  });

  afterEach(() => {
    if (globalThis.ZeusCopilot) {
      globalThis.ZeusCopilot.destroy();
    }
    clearZeusGlobals();
    document.body.innerHTML = '';
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('detects sensitive input before dispatch and blocks suggestion request', () => {
    // User types input containing a synthetic secret OpenAI API key
    textarea.value = 'Please review my config with sk-proj-test1234567890123456789012';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));

    // Fast forward debounce timer
    vi.advanceTimersByTime(1000);

    // Assert NO stream was ever initiated
    expect(globalThis.chrome.runtime.connect).not.toHaveBeenCalled();
    expect(createdPorts.length).toBe(0);

    // Assert paused state and indicator
    expect(globalThis.ZeusCopilot.isPaused(textarea)).toBe(true);
    const indicator = document.querySelector('.zeus-copilot-paused');
    expect(indicator).toBeTruthy();
    expect(indicator.getAttribute('data-zeus-copilot-status')).toBe('paused');
    expect(indicator.textContent).toContain('Copilot paused');
    expect(document.querySelector('.zeus-ghost')).toBeFalsy();
  });

  it('detects connection URIs and blocks stream dispatch', () => {
    textarea.value = 'Connecting to postgres://zeus_user:supersecret_pass@localhost:5432/main_db';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));

    vi.advanceTimersByTime(1000);

    expect(globalThis.chrome.runtime.connect).not.toHaveBeenCalled();
    expect(globalThis.ZeusCopilot.isPaused(textarea)).toBe(true);
    expect(document.querySelector('.zeus-copilot-paused')).toBeTruthy();
  });

  it('immediately aborts an active in-flight stream via port.disconnect() when sensitive data is entered', () => {
    // 1. User starts typing safe, non-sensitive prompt
    textarea.value = 'Could you help me write an algorithm to sort';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));

    // Advance debounce timer (800ms) to trigger suggestion fetch
    vi.advanceTimersByTime(800);

    expect(globalThis.chrome.runtime.connect).toHaveBeenCalledWith({ name: 'copilot-stream' });
    expect(createdPorts.length).toBe(1);
    const port = createdPorts[0];
    expect(port.disconnect).not.toHaveBeenCalled();

    // Stream delivers a chunk
    port._emitMessage({ type: 'chunk', text: ' an array of numbers' });
    const ghost = document.querySelector('.zeus-ghost');
    expect(ghost).toBeTruthy();
    expect(ghost.textContent).toBe(' an array of numbers');
    expect(globalThis.ZeusCopilot.isPaused(textarea)).toBe(false);

    // 2. WHILE stream is in-flight, user pastes a synthetic Anthropic key
    textarea.value += ' using sk-ant-api03-abcdef12345678901234567890';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));

    // Assert: active port is immediately disconnected!
    expect(port.disconnect).toHaveBeenCalled();
    expect(globalThis.ZeusCopilot.isPaused(textarea)).toBe(true);

    // Assert: ghost overlay is cleared/hidden and paused indicator is shown
    const ghostAfterAbort = document.querySelector('.zeus-ghost');
    expect(!ghostAfterAbort || ghostAfterAbort.style.display === 'none').toBe(true);
    const indicator = document.querySelector('.zeus-copilot-paused');
    expect(indicator).toBeTruthy();
    expect(indicator.textContent).toContain('Copilot paused');
  });

  it('suppresses stale chunks arriving after stream abort', () => {
    // 1. Start streaming safe text
    textarea.value = 'Explain the difference between call and apply';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    vi.advanceTimersByTime(800);

    expect(createdPorts.length).toBe(1);
    const port = createdPorts[0];

    // 2. Secret entered -> stream aborts
    textarea.value += ' with password="very_secret_pass_123"';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));

    expect(port.disconnect).toHaveBeenCalled();
    expect(globalThis.ZeusCopilot.isPaused(textarea)).toBe(true);

    // 3. Stale chunk arrives on the disconnected port
    port._emitMessage({ type: 'chunk', text: ' in JavaScript functions' });

    // Stale chunk must be suppressed
    const ghostAfterChunk = document.querySelector('.zeus-ghost');
    expect(!ghostAfterChunk || ghostAfterChunk.style.display === 'none').toBe(true);
    expect(ghostAfterChunk?.textContent || '').not.toContain('in JavaScript functions');
  });

  it('automatically clears the pause state and resumes suggestions once sensitive text is removed', () => {
    // 1. User inputs prompt with sensitive secret
    textarea.value = 'Configure database with mysql://root:mypassword123@10.0.0.1:3306/prod';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    vi.advanceTimersByTime(800);

    expect(globalThis.ZeusCopilot.isPaused(textarea)).toBe(true);
    expect(document.querySelector('.zeus-copilot-paused')).toBeTruthy();
    expect(createdPorts.length).toBe(0);

    // 2. User deletes the database connection URI, leaving safe prompt text (>= 10 chars)
    textarea.value = 'Configure database with optimized connection pool settings';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));

    // Assert: pause state is immediately cleared and indicator is removed
    expect(globalThis.ZeusCopilot.isPaused(textarea)).toBe(false);
    expect(document.querySelector('.zeus-copilot-paused')).toBeFalsy();

    // 3. Debounce timer elapses -> suggestion stream resumes!
    vi.advanceTimersByTime(800);

    expect(globalThis.chrome.runtime.connect).toHaveBeenCalledWith({ name: 'copilot-stream' });
    expect(createdPorts.length).toBe(1);

    const port = createdPorts[0];
    port._emitMessage({ type: 'chunk', text: ' and min/max connections' });

    const ghost = document.querySelector('.zeus-ghost');
    expect(ghost).toBeTruthy();
    expect(ghost.style.display).toBe('block');
    expect(ghost.textContent).toBe(' and min/max connections');
  });

  it('does NOT pause on excluded IP patterns such as loopback 127.0.0.1 or semver strings', () => {
    // Loopback 127.0.0.1 and semver v1.2.3.4 should not trigger false positive redaction
    textarea.value = 'Testing API endpoint running locally on 127.0.0.1 with version v2.1.0';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));

    vi.advanceTimersByTime(800);

    // Should not be paused
    expect(globalThis.ZeusCopilot.isPaused(textarea)).toBe(false);
    expect(document.querySelector('.zeus-copilot-paused')).toBeFalsy();
    expect(globalThis.chrome.runtime.connect).toHaveBeenCalledWith({ name: 'copilot-stream' });
  });

  it('respects redactionEnabled: false setting when user explicitly opts out', () => {
    // Reconfigure with redaction explicitly disabled
    globalThis.ZeusCopilot.reconfigure({
      ...settings,
      redactionEnabled: false
    });

    textarea.value = 'Testing with sk-proj-test12345678901234567890 when redaction disabled';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));

    vi.advanceTimersByTime(800);

    // Redaction disabled -> no pause
    expect(globalThis.ZeusCopilot.isPaused(textarea)).toBe(false);
    expect(document.querySelector('.zeus-copilot-paused')).toBeFalsy();
    expect(globalThis.chrome.runtime.connect).toHaveBeenCalled();
  });

  it('cleans up paused indicator and overlay on destroy', () => {
    textarea.value = 'Configuring auth with AKIAIOSFODNN7EXAMPLE key';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));

    expect(globalThis.ZeusCopilot.isPaused(textarea)).toBe(true);
    expect(document.querySelector('.zeus-copilot-paused')).toBeTruthy();

    globalThis.ZeusCopilot.destroy();

    expect(document.querySelector('.zeus-copilot-paused')).toBeFalsy();
    expect(globalThis.ZeusCopilot.isPaused(textarea)).toBe(false);
  });
});

describe('Background Copilot Stream Handler (Ticket 4)', () => {
  const { createChromeMock } = require('../mocks/chrome');
  let mockEnv;
  let streamSuggestSpy;

  beforeEach(() => {
    clearZeusGlobals();
    mockEnv = createChromeMock({
      syncStore: {
        schemaVersion: 3,
        copilotProvider: 'openai',
        copilotMode: 'conservative',
        copilotMaxTokens: 60,
        redactionEnabled: true
      },
      localStore: {
        apiKeys: { openai: 'sk-test-local-key' }
      }
    });

    globalThis.chrome = mockEnv.chrome;
    globalThis.chrome.commands = {
      onCommand: {
        addListener: vi.fn(),
        removeListener: vi.fn()
      }
    };

    streamSuggestSpy = vi.fn().mockResolvedValue(undefined);

    globalThis.ZeusSettings = {
      loadSettings: vi.fn().mockResolvedValue({
        copilotProvider: 'openai',
        copilotMode: 'conservative',
        copilotMaxTokens: 60,
        redactionEnabled: true,
        apiKeys: { openai: 'sk-test-local-key' }
      })
    };

    globalThis.ZeusRouter = {
      streamSuggest: streamSuggestSpy
    };

    globalThis.ZeusErrors = {
      normalizeEnhanceError: (e) => e
    };

    loadScript('core/redactor.js');
    loadScript('messaging/messageHandler.js');
  });

  afterEach(() => {
    clearZeusGlobals();
  });

  it('rejects copilot:start containing sensitive credentials, sends paused event, and disconnects port without calling router.streamSuggest', async () => {
    // Client connects to copilot-stream
    const clientPort = globalThis.chrome.runtime.connect({ name: 'copilot-stream' });
    const connection = mockEnv.calls.runtimeConnect[0];
    const serverPort = connection.serverPort;

    const clientMessages = [];
    clientPort.onMessage.addListener((msg) => clientMessages.push(msg));

    // Send copilot:start containing a synthetic database connection secret
    clientPort.postMessage({
      type: 'copilot:start',
      text: 'Connect to database using postgres://zeus_admin:super_secret_pw@db.internal:5432/core',
      cursorPos: 80,
      settings: {
        copilotMode: 'conservative',
        copilotProvider: 'openai',
        copilotMaxTokens: 60
      }
    });

    // Wait for async message processing
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Assert: router.streamSuggest was NOT called
    expect(streamSuggestSpy).not.toHaveBeenCalled();

    // Assert: client received paused event
    expect(clientMessages.some((m) => m.type === 'paused' && m.reason === 'sensitive_data')).toBe(true);
  });

  it('allows copilot:start with non-sensitive text and passes AbortSignal to router.streamSuggest', async () => {
    let capturedSignal = null;
    streamSuggestSpy.mockImplementation((text, settings, port, signal) => {
      capturedSignal = signal;
      return new Promise(() => {}); // keep pending
    });

    const clientPort = globalThis.chrome.runtime.connect({ name: 'copilot-stream' });

    clientPort.postMessage({
      type: 'copilot:start',
      text: 'Write a helper function to format dates as YYYY-MM-DD',
      cursorPos: 50,
      settings: {
        copilotMode: 'conservative',
        copilotProvider: 'openai',
        copilotMaxTokens: 60
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(streamSuggestSpy).toHaveBeenCalled();
    expect(capturedSignal).toBeTruthy();
    expect(capturedSignal.aborted).toBe(false);
  });

  it('aborts active streamSuggest via AbortSignal when copilot:abort message is sent', async () => {
    let capturedSignal = null;
    streamSuggestSpy.mockImplementation((text, settings, port, signal) => {
      capturedSignal = signal;
      return new Promise(() => {});
    });

    const clientPort = globalThis.chrome.runtime.connect({ name: 'copilot-stream' });

    clientPort.postMessage({
      type: 'copilot:start',
      text: 'Explain how async/await works under the hood in V8',
      cursorPos: 45
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(capturedSignal).toBeTruthy();
    expect(capturedSignal.aborted).toBe(false);

    // Client sends copilot:abort
    clientPort.postMessage({ type: 'copilot:abort' });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(capturedSignal.aborted).toBe(true);
  });

  it('aborts active streamSuggest via AbortSignal when port is disconnected', async () => {
    let capturedSignal = null;
    streamSuggestSpy.mockImplementation((text, settings, port, signal) => {
      capturedSignal = signal;
      return new Promise(() => {});
    });

    const clientPort = globalThis.chrome.runtime.connect({ name: 'copilot-stream' });

    clientPort.postMessage({
      type: 'copilot:start',
      text: 'Generate a CSS grid layout for a responsive dashboard',
      cursorPos: 50
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(capturedSignal).toBeTruthy();
    expect(capturedSignal.aborted).toBe(false);

    // Client disconnects port
    clientPort.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(capturedSignal.aborted).toBe(true);
  });
});
