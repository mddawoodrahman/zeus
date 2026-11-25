const { loadScript, clearZeusGlobals } = require('../utils/runtime');
const scripts = [
  'core/editorBridge',
  'core/domUtils',
  'core/useFloatingPosition',
  'core/injector',
  'core/observer',
  'adapters/chatgpt',
  'adapters/generic'
];
const box = (left, top, width, height) => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
  width,
  height
});
let form, editor, site, ui;
const shadow = () => ui.button.getRootNode();

beforeEach(() => {
  clearZeusGlobals();
  scripts.forEach((s) => loadScript(s + '.js'));
  document.body.innerHTML = '<form><textarea id="prompt-textarea"></textarea><button>Send</button></form>';
  form = document.querySelector('form');
  editor = form.querySelector('textarea');
  editor.getBoundingClientRect = () => box(45, 100, 500, 100);
  form.getBoundingClientRect = () => box(40, 90, 530, 170);
  site = ZeusContentAdapters[0];
  ui = ZeusInjector.create(vi.fn());
});
afterEach(() => {
  ui.destroy();
  clearZeusGlobals();
  document.body.replaceChildren();
});

it('updates the native value and emits exactly one input with no resize side effects', async () => {
  const onInput = vi.fn();
  editor.addEventListener('input', onInput);
  expect(await site.replaceText(editor, 'new\n🌩️')).toBe(true);
  expect(site.readText(editor)).toBe('new\n🌩️');
  expect(onInput).toHaveBeenCalledTimes(1);
  expect(editor.style.height).toBe('');
});

it('restores the original if the host rejects a write during reconciliation', async () => {
  editor.value = 'old';
  editor.addEventListener(
    'input',
    () =>
      queueMicrotask(() => {
        editor.value = 'normalized';
      }),
    { once: true }
  );
  expect(await site.replaceText(editor, 'new')).toBe(false);
  expect(editor.value).toBe('old');
});

it('leaves a newer edit alone during delayed verification', async () => {
  const controller = new AbortController();
  ZeusEditorBridge.observe(controller.signal);
  const pending = site.replaceText(editor, 'response');
  editor.value = 'user typed again';
  editor.dispatchEvent(new InputEvent('input', { bubbles: true }));
  expect(await pending).toBe(false);
  expect(editor.value).toBe('user typed again');
  controller.abort();
});

it('honors beforeinput cancellation and refuses multiline in a single-line field', async () => {
  editor.value = 'keep';
  editor.addEventListener('beforeinput', (e) => e.preventDefault());
  expect(await site.replaceText(editor, 'unsafe')).toBe(false);
  expect(editor.value).toBe('keep');
  const single = document.createElement('input');
  form.append(single);
  expect(await site.replaceText(single, 'many\nlines')).toBe(false);
});

it('binds one isolated keyboard button to the intended editor without altering the form', () => {
  const callback = vi.fn();
  ui = ZeusInjector.create(callback);
  const original = form.outerHTML;
  ui.bind(editor, site);
  ui.bind(editor, site);
  expect(ui.host.parentNode).toBe(document.documentElement);
  expect(document.querySelectorAll('zeus-composer-root')).toHaveLength(1);
  expect(ui.host.shadowRoot).toBeNull();
  expect(form.outerHTML).toBe(original);
  ui.button.click();
  expect(callback).toHaveBeenCalledWith(editor);
  expect(ui.button.tabIndex).toBe(0);
  expect(ui.button.hasAttribute('aria-hidden')).toBe(false);
});

it('keeps one SVG through all states, blocks duplicate clicks, and announces status outside clipping ancestors', () => {
  const cb = vi.fn();
  ui = ZeusInjector.create(cb);
  form.style.overflow = 'hidden';
  ui.bind(editor, site);
  const svg = ui.button.querySelector('svg');
  for (const name of ['processing', 'success', 'error', 'idle']) {
    ui.state(name, 'Message ' + name);
    expect(shadow().querySelector('[role=status]').textContent).toBe('Message ' + name);
    expect(ui.button.querySelector('svg')).toBe(svg);
    expect(ui.button.getAttribute('aria-busy')).toBe(String(name === 'processing'));
    if (name === 'processing') {
      ui.button.click();
      expect(cb).not.toHaveBeenCalled();
    }
  }
  expect(form.contains(ui.host)).toBe(false);
});

it('cancels older status timers and drops previews when a target disappears', () => {
  vi.useFakeTimers();
  try {
    ui.bind(editor, site);
    ui.state('error', 'First', 100);
    vi.advanceTimersByTime(80);
    ui.state('success', 'Second', 200);
    vi.advanceTimersByTime(50);
    expect(shadow().querySelector('[role=status]').textContent).toBe('Second');
    vi.advanceTimersByTime(160);
    expect(ui.button.dataset.state).toBe('idle');
    ui.state('error', 'Review', 0, 'enhanced draft');
    ui.bind(null, site);
    expect(ui.host.isConnected).toBe(false);
    expect(shadow().querySelector('textarea').value).toBe('');
  } finally {
    vi.useRealTimers();
  }
});

it.each([2, 3, 5])(
  'rejects collisions with %i toolbar controls and clears the editor with measured dimensions',
  (count) => {
    const root = box(50, 50, 500, 150);
    const controls = Array.from({ length: count }, (_, i) => box(495 - i * 36, 151, 32, 40));
    const editRect = box(55, 50, 485, 90);
    const result = ZeusFloatingPosition.choose({
      root,
      editor: editRect,
      controls,
      size: box(0, 0, 42, 32),
      view: box(0, 0, 600, 400)
    });
    expect(result.placement).toBe('toolbar');
    for (const obstacle of [editRect, ...controls])
      expect(ZeusFloatingPosition.intersects(result, obstacle, 6)).toBe(false);
  }
);

it('repositions after scroll, falls back outside and hides when no safe region exists', () => {
  const geometry = {
    root: box(15, 80, 100, 60),
    editor: box(15, 80, 100, 60),
    controls: [],
    size: box(0, 0, 40, 32),
    view: box(0, 0, 150, 200)
  };
  const before = ZeusFloatingPosition.choose(geometry);
  expect(before.placement).toBe('outside');
  const after = ZeusFloatingPosition.choose({
    ...geometry,
    root: box(15, 62, 100, 60),
    editor: box(15, 62, 100, 60)
  });
  expect(after.top).toBe(before.top - 18);
  expect(ZeusFloatingPosition.choose({ ...geometry, clear: () => false })).toBeNull();
  expect(ZeusFloatingPosition.choose({ ...geometry, view: box(0, 0, 30, 30) })).toBeNull();
});

it('uses focus to resolve ambiguous composers, and filters search, credentials and disabled fields', () => {
  const another = editor.cloneNode();
  another.removeAttribute('id');
  another.placeholder = 'Message';
  another.getBoundingClientRect = editor.getBoundingClientRect;
  form.append(another);
  expect(site.getActiveEditor()).toBeNull();
  another.focus();
  expect(site.getActiveEditor()).toBe(another);
  for (const type of ['search', 'password']) {
    const field = document.createElement('input');
    field.type = type;
    field.placeholder = 'Message';
    field.getBoundingClientRect = editor.getBoundingClientRect;
    document.body.append(field);
    expect(site.isEditorAvailable(field)).toBe(false);
  }
  another.disabled = true;
  expect(site.findEditors()).toEqual([editor]);
  expect(ZeusContentAdapters.at(-1).matches('unpermitted.example')).toBe(false);
});

it('discovers inserted editors, ignores its own tree, cancels pending callbacks on cleanup', async () => {
  const change = vi.fn();
  const observer = ZeusObserver.create({ onChange: change, debounceMs: 5 });
  ui.bind(editor, site);
  ui.state('error', 'Error');
  await new Promise((r) => setTimeout(r, 15));
  expect(change).not.toHaveBeenCalled();
  const added = document.createElement('textarea');
  form.append(added);
  await new Promise((r) => setTimeout(r, 15));
  expect(change).toHaveBeenCalledTimes(1);
  added.remove();
  observer.trigger();
  observer.disconnect();
  await new Promise((r) => setTimeout(r, 15));
  expect(change).toHaveBeenCalledTimes(1);
});

it('exposes the IME pause and restores keyboard activation when composition ends', () => {
  ui.bind(editor, site);
  editor.dispatchEvent(new CompositionEvent('compositionstart'));
  expect(ui.button.getAttribute('aria-disabled')).toBe('true');
  expect(shadow().querySelector('[role=status]').textContent).toContain('composing');
  editor.dispatchEvent(new CompositionEvent('compositionend'));
  expect(ui.button.getAttribute('aria-disabled')).toBe('false');
});

it('matches legacy origins exactly and keeps provider-only permissions out of generic discovery', () => {
  loadScript('adapters/gemini.js');
  expect(site.matches('chat.openai.com')).toBe(true);
  expect(site.matches('chatgpt.com.example')).toBe(false);
  expect(ZeusContentAdapters.find((a) => a.id === 'gemini').matches('bard.google.com')).toBe(true);
  const generic = ZeusContentAdapters.find((a) => a.id === 'generic');
  const manifest = require('../../manifest.json');
  vi.stubGlobal('chrome', { runtime: { getManifest: () => manifest } });
  try {
    expect(generic.matches('deepseek.com')).toBe(true);
    expect(generic.matches('localhost')).toBe(false);
  } finally {
    vi.unstubAllGlobals();
  }
});
