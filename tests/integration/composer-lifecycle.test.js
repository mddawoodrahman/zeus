/**
 * @vitest-environment jsdom
 * @vitest-environment-options {"url":"https://chatgpt.com/"}
 */
const { loadScript, clearZeusGlobals } = require('../utils/runtime');
const manifest = require('../../manifest.json');
let editor, pending, send, handlers, settings;
function addEditor(id) {
  const node = document.createElement('textarea');
  node.setAttribute('aria-label', 'Chat message');
  node.id = id;
  node.getBoundingClientRect = () => ({ left: 20, right: 320, top: 80, bottom: 130, width: 300, height: 50 });
  node.value = 'initial draft';
  document.querySelector('form').append(node);
  return node;
}
function message(msg) {
  return new Promise((resolve) => [...handlers][0](msg, {}, resolve));
}
function edit(el, text) {
  el.value = text;
  el.dispatchEvent(new InputEvent('input', { bubbles: true }));
}
beforeEach(async () => {
  clearZeusGlobals();
  settings = { provider: 'openai', hasApiKey: { openai: true }, copilotEnabled: false };
  handlers = new Set();
  send = vi.fn((msg, cb) => {
    if (msg.action === 'getSettings') cb({ settings });
    if (msg.action === 'enhancePrompt') pending = cb;
  });
  globalThis.chrome = {
    runtime: {
      sendMessage: send,
      getManifest: () => manifest,
      onMessage: { addListener: (fn) => handlers.add(fn), removeListener: (fn) => handlers.delete(fn) }
    }
  };
  document.body.innerHTML = '<form></form>';
  editor = addEditor('prompt-textarea');
  manifest.content_scripts[0].js.forEach(loadScript);
  editor.focus();
  await Promise.resolve();
});
afterEach(() => {
  ZeusContentRuntime.destroy();
  delete globalThis.chrome;
  clearZeusGlobals();
  document.body.replaceChildren();
});

it('locks button and context-menu requests together before dispatch', async () => {
  const a = ZeusContentRuntime.enhanceInput(editor);
  expect((await message({ action: 'contextEnhancePrompt' })).status).toBe('busy');
  expect(send.mock.calls.filter(([m]) => m.action === 'enhancePrompt')).toHaveLength(1);
  pending({ success: true, enhancedText: 'better' });
  expect(await a).toBe('enhanced');
  expect(editor.value).toBe('better');
});
it.each(['typed', 'edited then restored', 'composition'])(
  'keeps the user draft during %s and offers a preview',
  async (change) => {
    const a = ZeusContentRuntime.enhanceInput(editor);
    if (change === 'composition')
      editor.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    else {
      edit(editor, 'latest text');
      if (change === 'edited then restored') edit(editor, 'initial draft');
    }
    const current = editor.value;
    pending({ success: true, enhancedText: 'older response' });
    expect(await a).toBe('preview');
    expect(editor.value).toBe(current);
  }
);
it.each(['switch', 'detach', 'route', 'destroy'])('discards the response after %s', async (change) => {
  const a = ZeusContentRuntime.enhanceInput(editor);
  const next = addEditor('next');
  if (change === 'switch') next.focus();
  if (change === 'detach') editor.remove();
  if (change === 'route') history.pushState({}, '', '/other-chat');
  if (change === 'destroy') {
    ZeusContentRuntime.destroy();
    manifest.content_scripts[0].js.forEach(loadScript);
  }
  pending({ success: true, enhancedText: 'stale' });
  expect(await a).toBe('stale');
  expect(next.value).toBe('initial draft');
  expect(editor.value).toBe('initial draft');
});
it.each(['Provider failed', 'Request timed out', 'Network offline'])(
  'allows retry and preserves the original after %s',
  async (error) => {
    const a = ZeusContentRuntime.enhanceInput(editor);
    pending({ success: false, error });
    expect(await a).toBe('failed');
    expect(editor.value).toBe('initial draft');
    const b = ZeusContentRuntime.enhanceInput(editor);
    pending({ success: true, enhancedText: 'retried' });
    expect(await b).toBe('enhanced');
  }
);
it('preserves the draft when prerequisites fail and accurately reports side panel failure', async () => {
  await message({ action: 'settingsUpdated', settings: { ...settings, hasApiKey: { openai: false } } });
  expect(await ZeusContentRuntime.enhanceInput(editor)).toBe('failed');
  expect(editor.value).toBe('initial draft');
  editor.value = '';
  expect(await ZeusContentRuntime.enhanceInput(editor)).toBe('failed');
  expect(send.mock.calls.some(([m]) => m.action === 'enhancePrompt')).toBe(false);
  editor.disabled = true;
  expect(await message({ type: 'sidePanel:setInputValue', value: 'test' })).toEqual({ success: false });
});
it('reinjection keeps one root, one message listener and one adapter per site', async () => {
  manifest.content_scripts[0].js.forEach(loadScript);
  await message({ action: 'forceInjectButton' });
  expect(handlers.size).toBe(1);
  expect(new Set(ZeusContentAdapters.map((a) => a.id)).size).toBe(ZeusContentAdapters.length);
  expect(document.querySelectorAll('zeus-composer-root')).toHaveLength(1);
  editor.remove();
  ZeusContentRuntime.refresh();
  expect(document.querySelector('zeus-composer-root')).toBeNull();
  addEditor('prompt-textarea');
  ZeusContentRuntime.refresh();
  expect(document.querySelectorAll('zeus-composer-root')).toHaveLength(1);
});

it('loads custom redaction rules before dispatching a click during initialization', async () => {
  ZeusContentRuntime.destroy();
  let releaseSettings;
  send.mockClear().mockImplementation((msg, cb) => {
    if (msg.action === 'getSettings') releaseSettings = cb;
    if (msg.action === 'enhancePrompt') cb({ success: true, enhancedText: msg.prompt });
  });
  manifest.content_scripts[0].js.forEach(loadScript);
  edit(editor, 'Use fixture-private-label');
  const result = ZeusContentRuntime.enhanceInput(editor);
  expect(send.mock.calls.map(([m]) => m.action)).toEqual(['getSettings']);
  releaseSettings({ settings: { ...settings, customRedactionPatterns: ['fixture-private-label'] } });
  expect(await result).toBe('enhanced');
  const outgoing = send.mock.calls.find(([m]) => m.action === 'enhancePrompt')[0];
  expect(outgoing.prompt).toBe('Use [[ZEUS_SECRET_1]]');
  expect(editor.value).toBe('Use fixture-private-label');
});

it('surfaces specific normalized provider errors in the status notice instead of masking them', async () => {
  let capturedShadow = null;
  const origAttachShadow = Element.prototype.attachShadow;
  Element.prototype.attachShadow = function patchedAttachShadow(init) {
    const sr = origAttachShadow.call(this, init);
    capturedShadow = sr;
    return sr;
  };
  try {
    ZeusContentRuntime.destroy();
    manifest.content_scripts[0].js.forEach(loadScript);
    editor.focus();
    await Promise.resolve();
    const errMsg = 'OpenAI quota or credits are insufficient for this project or org. Check billing and usage limits in your OpenAI dashboard.';
    const req = ZeusContentRuntime.enhanceInput(editor);
    pending({ success: false, error: errMsg });
    expect(await req).toBe('failed');
    expect(capturedShadow.querySelector('[role=status]').textContent).toBe(errMsg);
  } finally {
    Element.prototype.attachShadow = origAttachShadow;
  }
});

it('displays full untruncated Ollama origin errors and specific Gemini model errors', async () => {
  let capturedShadow = null;
  const origAttachShadow = Element.prototype.attachShadow;
  Element.prototype.attachShadow = function patchedAttachShadow(init) {
    const sr = origAttachShadow.call(this, init);
    capturedShadow = sr;
    return sr;
  };
  try {
    ZeusContentRuntime.destroy();
    manifest.content_scripts[0].js.forEach(loadScript);
    editor.focus();
    await Promise.resolve();

    const longOllamaErr = 'Ollama blocked extension origin (HTTP 403). Add OLLAMA_ORIGINS=chrome-extension://abcdefghijklmnop to your environment and restart Ollama completely so local models can accept requests from the extension background service worker.';
    const req1 = ZeusContentRuntime.enhanceInput(editor);
    pending({ success: false, error: longOllamaErr });
    expect(await req1).toBe('failed');
    expect(capturedShadow.querySelector('[role=status]').textContent).toBe(longOllamaErr);

    const geminiModelErr = "Model 'gemini-custom-preview' may not be available for Gemini. Choose another model or verify your API access.";
    const req2 = ZeusContentRuntime.enhanceInput(editor);
    pending({ success: false, error: geminiModelErr });
    expect(await req2).toBe('failed');
    expect(capturedShadow.querySelector('[role=status]').textContent).toBe(geminiModelErr);
  } finally {
    Element.prototype.attachShadow = origAttachShadow;
  }
});

it('allows in-place replacement when warnings contain only NOTICE audit messages', async () => {
  editor.value = 'Draft prompt';
  const req1 = ZeusContentRuntime.enhanceInput(editor);
  pending({
    success: true,
    enhancedText: 'Refined draft prompt',
    warnings: ['NOTICE: Defense-in-depth scrubbing occurred server-side.']
  });
  expect(await req1).toBe('enhanced');
  expect(editor.value).toBe('Refined draft prompt');

  const req2 = ZeusContentRuntime.enhanceInput(editor);
  pending({
    success: true,
    enhancedText: 'Refined draft without secret',
    warnings: ['Sensitive placeholder [[ZEUS_SECRET_1]] was omitted by the model.']
  });
  expect(await req2).toBe('preview');
});
