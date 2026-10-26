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
    toJSON() { return this; }
  });
}

describe('DOM Remediation & Editor Compatibility Tests', () => {
  beforeEach(() => {
    clearZeusGlobals();
    document.body.innerHTML = '';

    loadScript('core/domUtils.js');
    loadScript('core/useFloatingPosition.js');
    loadScript('core/injector.js');
    loadScript('core/ghostText.js');
  });

  afterEach(() => {
    clearZeusGlobals();
    document.body.innerHTML = '';
  });

  describe('Floating Enhance Button Lifecycle and Visibility', () => {
    it('hides enhance button when input loses focus and is not hovered', async () => {
      vi.useFakeTimers();

      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);
      withRect(textarea, { top: 10, left: 10, right: 200, bottom: 60, width: 190, height: 50 });

      const injector = globalThis.ZeusInjector.create({
        svgMarkup: '<svg></svg>',
        onEnhanceClick: vi.fn()
      });

      injector.inject([textarea]);
      injector.refresh();

      const button = document.querySelector('.zeus-enhance-btn');
      expect(button).toBeTruthy();

      // Trigger focus on textarea -> button becomes visible
      textarea.dispatchEvent(new Event('focus'));
      expect(button.dataset.visible).toBe('1');

      // Trigger blur on textarea -> button visibility should be scheduled to hide
      textarea.dispatchEvent(new Event('blur'));
      vi.advanceTimersByTime(200);

      // Button should now be HIDDEN (0), not stuck visible!
      expect(button.dataset.visible).toBe('0');

      // Hover on button -> button becomes visible
      button.dispatchEvent(new Event('mouseenter'));
      expect(button.dataset.visible).toBe('1');

      // Leave button -> button hides
      button.dispatchEvent(new Event('mouseleave'));
      vi.advanceTimersByTime(200);
      expect(button.dataset.visible).toBe('0');

      vi.useRealTimers();
    });
  });

  describe('React Controlled Input Setter Descriptor Support', () => {
    it('invokes HTMLTextAreaElement prototype setter descriptor when setting value', () => {
      const textarea = document.createElement('textarea');
      withRect(textarea, { width: 300, height: 100, top: 0, left: 0, right: 300, bottom: 100 });
      document.body.appendChild(textarea);

      let prototypeSetterCalls = 0;
      const originalDescriptor = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');

      try {
        // Spy on prototype setter descriptor
        Object.defineProperty(window.HTMLTextAreaElement.prototype, 'value', {
          configurable: true,
          set(val) {
            prototypeSetterCalls++;
            originalDescriptor.set.call(this, val);
          },
          get() {
            return originalDescriptor.get.call(this);
          }
        });

        let inputEvents = 0;
        let changeEvents = 0;
        textarea.addEventListener('input', () => { inputEvents++; });
        textarea.addEventListener('change', () => { changeEvents++; });

        const success = globalThis.ZeusDomUtils.setInputValue('New prompt text', textarea);

        expect(success).toBe(true);
        expect(textarea.value).toBe('New prompt text');
        expect(prototypeSetterCalls).toBeGreaterThan(0);
        expect(inputEvents).toBeGreaterThan(0);
        expect(changeEvents).toBeGreaterThan(0);
      } finally {
        // Restore original descriptor
        Object.defineProperty(window.HTMLTextAreaElement.prototype, 'value', originalDescriptor);
      }
    });
  });

  describe('Ghost Text ContentEditable Isolation', () => {
    it('appends ghost text overlay to document.body and NOT inside contenteditable editor', () => {
      const editor = document.createElement('div');
      editor.setAttribute('contenteditable', 'true');
      editor.innerHTML = '<p>Current user draft</p>';
      document.body.appendChild(editor);

      const ghost = globalThis.ZeusGhostText;
      ghost.createOverlay(editor);
      ghost.setText(' suggested completion');
      ghost.show();

      // Crucial assertion: editor children must NOT contain the ghost overlay element!
      expect(editor.querySelector('.zeus-ghost')).toBeNull();
      expect(editor.innerHTML).toBe('<p>Current user draft</p>');

      // The overlay must exist in document.body
      const overlayInBody = document.body.querySelector('.zeus-ghost');
      expect(overlayInBody).not.toBeNull();
      expect(overlayInBody.parentElement).toBe(document.body);
      expect(overlayInBody.textContent).toBe(' suggested completion');

      ghost.destroy();
      expect(document.body.querySelector('.zeus-ghost')).toBeNull();
    });
  });

  describe('Truthful Side Panel Input Resolution', () => {
    it('correctly sets input on target element and reports success', () => {
      const textarea = document.createElement('textarea');
      withRect(textarea, { width: 300, height: 100, top: 0, left: 0, right: 300, bottom: 100 });
      document.body.appendChild(textarea);

      const domUtils = globalThis.ZeusDomUtils;
      const success = domUtils.setInputValue('Injected from sidepanel', textarea);

      expect(success).toBe(true);
      expect(textarea.value).toBe('Injected from sidepanel');
    });

    it('returns false when no target element is found or eligible', () => {
      const domUtils = globalThis.ZeusDomUtils;
      const nonInput = document.createElement('div');
      document.body.appendChild(nonInput);

      const success = domUtils.setInputValue('Text', nonInput);
      expect(success).toBe(false);
    });
  });
});
