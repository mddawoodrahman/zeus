const { loadScript, clearZeusGlobals } = require('../utils/runtime');

function keydown(element, key, modifiers = {}) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ctrlKey: Boolean(modifiers.ctrl),
    shiftKey: Boolean(modifiers.shift),
    altKey: Boolean(modifiers.alt),
    metaKey: Boolean(modifiers.meta)
  });
  element.dispatchEvent(event);
  return event;
}

describe('ZeusCommandPalette DOM & Keyboard Interaction Tests', () => {
  let palette;
  let registry;

  beforeEach(() => {
    clearZeusGlobals();
    document.body.innerHTML = '';

    globalThis.chrome = {
      storage: {
        sync: {
          get: vi.fn((keys, cb) => cb({})),
          set: vi.fn((obj, cb) => {
            if (cb) cb();
          })
        }
      },
      runtime: {
        lastError: null
      }
    };

    loadScript('core/commandPalette.js');
    registry = new globalThis.ZeusCommandPalette.CommandRegistry();
  });

  afterEach(() => {
    if (palette) {
      palette.destroy();
      palette = null;
    }
    clearZeusGlobals();
    document.body.innerHTML = '';
  });

  it('builds overlay DOM and mounts to document.body on open', () => {
    palette = globalThis.ZeusCommandPalette.createPalette({ registry });

    expect(document.querySelector('.zeus-palette-overlay')).toBeNull();
    expect(palette.isOpen()).toBe(false);

    palette.open();

    const overlay = document.querySelector('.zeus-palette-overlay');
    expect(overlay).not.toBeNull();
    expect(overlay.style.display).toBe('flex');
    expect(palette.isOpen()).toBe(true);

    const dialog = overlay.querySelector('.zeus-palette-dialog');
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute('role')).toBe('dialog');

    const input = overlay.querySelector('.zeus-palette-input');
    expect(input).not.toBeNull();
    expect(input.getAttribute('role')).toBe('combobox');

    const list = overlay.querySelector('.zeus-palette-list');
    expect(list).not.toBeNull();
    expect(list.getAttribute('role')).toBe('listbox');
  });

  it('toggles palette visibility and closes on Escape or backdrop click', () => {
    palette = globalThis.ZeusCommandPalette.createPalette({ registry });

    palette.toggle();
    expect(palette.isOpen()).toBe(true);
    const overlay = document.querySelector('.zeus-palette-overlay');
    expect(overlay.style.display).toBe('flex');

    palette.toggle();
    expect(palette.isOpen()).toBe(false);
    expect(overlay.style.display).toBe('none');

    // Open again and close with Escape
    palette.open();
    expect(palette.isOpen()).toBe(true);
    const input = overlay.querySelector('.zeus-palette-input');
    keydown(input, 'Escape');
    expect(palette.isOpen()).toBe(false);
    expect(overlay.style.display).toBe('none');

    // Open and click overlay backdrop
    palette.open();
    expect(palette.isOpen()).toBe(true);
    overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(palette.isOpen()).toBe(false);
  });

  it('renders command list with categories, icons, and keyboard badges', () => {
    registry.register({
      id: 'cmd-opt',
      title: 'Optimize Prompt',
      description: 'AI optimization',
      category: 'Actions',
      shortcut: 'Ctrl+Enter',
      icon: '⚡'
    });
    registry.register({
      id: 'cmd-lib',
      title: 'Open Library',
      description: 'Prompt templates',
      category: 'Navigation',
      shortcut: 'Alt+L',
      icon: '📚'
    });

    palette = globalThis.ZeusCommandPalette.createPalette({ registry });
    palette.open();

    const catHeaders = document.querySelectorAll('.zeus-palette-category-header');
    expect(catHeaders.length).toBeGreaterThanOrEqual(1);

    const items = document.querySelectorAll('.zeus-palette-item');
    expect(items.length).toBe(2);

    const badges = document.querySelectorAll('.zeus-palette-badge');
    expect(badges.length).toBe(2);
    expect(badges[0].textContent).toBe('Ctrl+Enter');
  });

  it('filters commands via input event and shows empty state on no match', () => {
    registry.register({ id: 'c1', title: 'Polish Text', category: 'Transforms' });
    registry.register({ id: 'c2', title: 'Formalize Tone', category: 'Transforms' });

    palette = globalThis.ZeusCommandPalette.createPalette({ registry });
    palette.open();

    const input = document.querySelector('.zeus-palette-input');
    input.value = 'Formal';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    let items = document.querySelectorAll('.zeus-palette-item');
    expect(items.length).toBe(1);
    expect(items[0].textContent).toContain('Formalize Tone');

    // Non-matching query
    input.value = 'NonExistentZzz';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    items = document.querySelectorAll('.zeus-palette-item');
    expect(items.length).toBe(0);

    const empty = document.querySelector('.zeus-palette-empty');
    expect(empty).not.toBeNull();
    expect(empty.textContent).toContain('NO COMMANDS MATCHED');
  });

  it('navigates through items with ArrowDown and ArrowUp and wraps around', () => {
    registry.register({ id: 'c1', title: 'Action 1' });
    registry.register({ id: 'c2', title: 'Action 2' });
    registry.register({ id: 'c3', title: 'Action 3' });

    palette = globalThis.ZeusCommandPalette.createPalette({ registry });
    palette.open();

    expect(palette.getSelectedIndex()).toBe(0);

    const input = document.querySelector('.zeus-palette-input');
    keydown(input, 'ArrowDown');
    expect(palette.getSelectedIndex()).toBe(1);

    keydown(input, 'ArrowDown');
    expect(palette.getSelectedIndex()).toBe(2);

    // Wraps to 0
    keydown(input, 'ArrowDown');
    expect(palette.getSelectedIndex()).toBe(0);

    // ArrowUp wraps to 2
    keydown(input, 'ArrowUp');
    expect(palette.getSelectedIndex()).toBe(2);
  });

  it('executes selected command when Enter is pressed and closes palette', () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    const onExecute = vi.fn();

    registry.register({ id: 'c1', title: 'First Action', handler: handler1 });
    registry.register({ id: 'c2', title: 'Second Action', handler: handler2 });

    palette = globalThis.ZeusCommandPalette.createPalette({ registry, onExecute });
    palette.open();

    const input = document.querySelector('.zeus-palette-input');
    keydown(input, 'ArrowDown'); // selects c2

    keydown(input, 'Enter');

    expect(handler2).toHaveBeenCalledTimes(1);
    expect(handler1).not.toHaveBeenCalled();
    expect(onExecute).toHaveBeenCalledWith(expect.objectContaining({ id: 'c2' }));
    expect(palette.isOpen()).toBe(false);
  });

  it('executes command when clicked and highlights on mouseenter', () => {
    const handler = vi.fn();
    registry.register({ id: 'c1', title: 'Clickable Action', handler });

    palette = globalThis.ZeusCommandPalette.createPalette({ registry });
    palette.open();

    const item = document.querySelector('.zeus-palette-item');
    item.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    expect(palette.getSelectedIndex()).toBe(0);

    item.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(handler).toHaveBeenCalledTimes(1);
    expect(palette.isOpen()).toBe(false);
  });

  it('cleans up DOM on destroy', () => {
    palette = globalThis.ZeusCommandPalette.createPalette({ registry });
    palette.open();

    expect(document.querySelector('.zeus-palette-overlay')).not.toBeNull();

    palette.destroy();
    expect(document.querySelector('.zeus-palette-overlay')).toBeNull();
    expect(palette.isOpen()).toBe(false);
  });
});
