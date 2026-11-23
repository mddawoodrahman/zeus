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

describe('DOM/content core behavior', () => {
  beforeEach(() => {
    clearZeusGlobals();
    document.body.innerHTML = '';

    loadScript('core/domUtils.js');
    loadScript('core/useFloatingPosition.js');
    loadScript('core/injector.js');
    loadScript('core/observer.js');
  });

  afterEach(() => {
    clearZeusGlobals();
    document.body.innerHTML = '';
  });

  it('reads and writes textarea values with input events', () => {
    const textarea = document.createElement('textarea');
    let inputEvents = 0;

    textarea.addEventListener('input', () => {
      inputEvents += 1;
    });

    Object.defineProperty(textarea, 'scrollHeight', {
      configurable: true,
      get() {
        return 72;
      }
    });

    document.body.appendChild(textarea);

    globalThis.ZeusDomUtils.setInputText(textarea, 'enhanced');

    expect(globalThis.ZeusDomUtils.getInputText(textarea)).toBe('enhanced');
    expect(inputEvents).toBe(1);
  });

  it('injects a non-intrusive sibling button for eligible inputs', () => {
    const wrapper = document.createElement('div');
    const textarea = document.createElement('textarea');

    withRect(wrapper, {
      top: 0,
      left: 0,
      right: 520,
      bottom: 180,
      width: 520,
      height: 180
    });

    withRect(textarea, {
      top: 20,
      left: 20,
      right: 500,
      bottom: 100,
      width: 480,
      height: 80
    });

    wrapper.appendChild(textarea);
    document.body.appendChild(wrapper);

    const onEnhanceClick = vi.fn();
    const injector = globalThis.ZeusInjector.create({
      svgMarkup: '<svg></svg>',
      onEnhanceClick
    });

    injector.inject([textarea]);
    injector.refresh();

    const button = wrapper.querySelector('.zeus-enhance-btn');
    expect(button).toBeTruthy();
    expect(textarea.parentElement).toBe(wrapper);

    button.click();
    expect(onEnhanceClick).toHaveBeenCalledWith(textarea, button);
  });

  it('observes targeted DOM additions for input selectors', async () => {
    const onChange = vi.fn();
    const observer = globalThis.ZeusObserver.create({
      root: document.body,
      inputSelectors: ['textarea'],
      onChange,
      debounceMs: 10
    });

    const container = document.createElement('div');
    container.innerHTML = '<textarea></textarea>';
    document.body.appendChild(container);

    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(onChange).toHaveBeenCalled();
    observer.disconnect();
  });

  it('renders status toasts fixed in document.body without clipping in parent container', () => {
    const composer = document.createElement('form');
    composer.style.overflow = 'hidden';
    const textarea = document.createElement('textarea');

    withRect(composer, {
      top: 100,
      left: 100,
      right: 700,
      bottom: 160,
      width: 600,
      height: 60
    });

    withRect(textarea, {
      top: 110,
      left: 110,
      right: 650,
      bottom: 150,
      width: 540,
      height: 40
    });

    composer.appendChild(textarea);
    document.body.appendChild(composer);

    const injector = globalThis.ZeusInjector.create({
      svgMarkup: '<svg></svg>',
      onEnhanceClick: () => {}
    });

    injector.inject([textarea]);
    injector.refresh();

    const button = composer.querySelector('.zeus-enhance-btn');
    expect(button).toBeTruthy();
    withRect(button, {
      top: 120,
      left: 600,
      right: 628,
      bottom: 148,
      width: 28,
      height: 28
    });

    injector.showToast('LINK FAILURE', 'error', 0);

    const toast = document.body.querySelector('.zeus-toast.error');
    expect(toast).toBeTruthy();
    expect(toast.textContent).toBe('LINK FAILURE');
    // Crucially: toast is mounted in document.body, NOT inside the overflow:hidden composer form
    expect(toast.parentElement).toBe(document.body);
    expect(toast.style.position).toBe('fixed');
    expect(toast.style.zIndex).toBe('2147483647');
    expect(parseInt(toast.style.right, 10)).toBeGreaterThan(0);
    expect(parseInt(toast.style.bottom, 10)).toBeGreaterThan(0);
  });

  it('clears active toast when injector visibility is hidden or refreshed with no inputs', () => {
    const injector = globalThis.ZeusInjector.create({
      svgMarkup: '<svg></svg>',
      onEnhanceClick: () => {}
    });

    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    injector.inject([textarea]);
    injector.refresh();

    injector.showToast('MISSING ACCESS TOKEN', 'error', 0);
    expect(document.body.querySelector('.zeus-toast.error')).toBeTruthy();

    injector.inject([]);
    expect(document.body.querySelector('.zeus-toast')).toBeNull();
  });

  it('avoids multiple trailing action buttons by clearing horizontally', () => {
    const wrapper = document.createElement('div');
    const textarea = document.createElement('textarea');
    const micButton = document.createElement('button');
    micButton.setAttribute('aria-label', 'Voice');
    const sendButton = document.createElement('button');
    sendButton.setAttribute('data-testid', 'send-button');

    withRect(wrapper, {
      top: 100,
      left: 100,
      right: 700,
      bottom: 160,
      width: 600,
      height: 60
    });

    withRect(textarea, {
      top: 110,
      left: 110,
      right: 650,
      bottom: 150,
      width: 540,
      height: 40
    });

    withRect(micButton, {
      top: 114,
      left: 610,
      right: 642,
      bottom: 146,
      width: 32,
      height: 32
    });

    withRect(sendButton, {
      top: 114,
      left: 652,
      right: 684,
      bottom: 146,
      width: 32,
      height: 32
    });

    wrapper.appendChild(textarea);
    wrapper.appendChild(micButton);
    wrapper.appendChild(sendButton);
    document.body.appendChild(wrapper);

    const adapter = {
      id: 'test-chat',
      getAnchorContainer: () => wrapper,
      getPositionStrategy: () => ({
        mode: 'anchored',
        right: 12,
        bottom: 10,
        avoidSelector: 'button[data-testid="send-button"], button[aria-label*="Voice"]'
      })
    };

    const injector = globalThis.ZeusInjector.create({
      svgMarkup: '<svg></svg>',
      onEnhanceClick: () => {}
    });

    injector.inject([textarea], adapter);
    injector.refresh();

    const button = wrapper.querySelector('.zeus-enhance-btn');
    expect(button).toBeTruthy();

    const computedRight = parseInt(button.style.right, 10);
    // wrapper.right (700) - micButton.left (610) + 8 = 98px
    expect(computedRight).toBeGreaterThanOrEqual(98);
    // Baseline bottom is preserved rather than jumping into the textarea
    expect(parseInt(button.style.bottom, 10)).toBe(10);
  });

  it('dynamically updates toast position when viewport scrolls', () => {
    const composer = document.createElement('form');
    const textarea = document.createElement('textarea');
    withRect(composer, { top: 200, left: 100, right: 700, bottom: 260, width: 600, height: 60 });
    withRect(textarea, { top: 210, left: 110, right: 650, bottom: 250, width: 540, height: 40 });
    composer.appendChild(textarea);
    document.body.appendChild(composer);

    const injector = globalThis.ZeusInjector.create({
      svgMarkup: '<svg></svg>',
      onEnhanceClick: () => {}
    });

    injector.inject([textarea]);
    injector.refresh();

    const button = composer.querySelector('.zeus-enhance-btn');
    withRect(button, { top: 220, left: 600, right: 628, bottom: 248, width: 28, height: 28 });

    injector.showToast('TEST TOAST', 'info', 0);
    const toast = document.body.querySelector('.zeus-toast.info');
    expect(toast).toBeTruthy();

    const initialBottom = parseInt(toast.style.bottom, 10);

    // Simulate page scroll that shifts button up by 50px
    withRect(button, { top: 170, left: 600, right: 628, bottom: 198, width: 28, height: 28 });
    window.dispatchEvent(new Event('scroll'));

    const updatedBottom = parseInt(toast.style.bottom, 10);
    // Since button top moved from 220 to 170, bottom (winH - btn.top + 8) increases by 50px
    expect(updatedBottom).toBe(initialBottom + 50);

    injector.clearToast();
    expect(document.body.querySelector('.zeus-toast')).toBeNull();
  });

  it('cancels previous dismissal timers on rapid successive toasts', async () => {
    vi.useFakeTimers();
    try {
      const composer = document.createElement('form');
      const textarea = document.createElement('textarea');
      composer.appendChild(textarea);
      document.body.appendChild(composer);

      const injector = globalThis.ZeusInjector.create({
        svgMarkup: '<svg></svg>',
        onEnhanceClick: () => {}
      });

      injector.inject([textarea]);
      injector.refresh();

      // Show toast 1 with 1000ms duration
      injector.showToast('TOAST ONE', 'info', 1000);
      expect(document.body.querySelector('.zeus-toast').textContent).toBe('TOAST ONE');

      // Advance 800ms (toast 1 is still alive)
      vi.advanceTimersByTime(800);

      // Show toast 2 with 3000ms duration
      injector.showToast('TOAST TWO', 'error', 3000);
      expect(document.body.querySelector('.zeus-toast').textContent).toBe('TOAST TWO');

      // Advance past the original toast 1 timeout (at 1000ms total, so +300ms)
      vi.advanceTimersByTime(300);

      // Toast 2 must NOT be dismissed by Toast 1's expired timer
      const currentToast = document.body.querySelector('.zeus-toast');
      expect(currentToast).toBeTruthy();
      expect(currentToast.textContent).toBe('TOAST TWO');

      injector.clearToast();
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears multiple obstacles sequentially across multiple passes', () => {
    const wrapper = document.createElement('div');
    const textarea = document.createElement('textarea');
    const searchBtn = document.createElement('button');
    searchBtn.setAttribute('data-testid', 'search-btn');
    const micBtn = document.createElement('button');
    micBtn.setAttribute('data-testid', 'mic-btn');
    const sendBtn = document.createElement('button');
    sendBtn.setAttribute('data-testid', 'send-btn');

    withRect(wrapper, { top: 100, left: 100, right: 700, bottom: 160, width: 600, height: 60 });
    withRect(textarea, { top: 110, left: 110, right: 650, bottom: 150, width: 540, height: 40 });
    // Obstacle 1 (send): x=660..692
    withRect(sendBtn, { top: 114, left: 660, right: 692, bottom: 146, width: 32, height: 32 });
    // Obstacle 2 (mic): x=620..652
    withRect(micBtn, { top: 114, left: 620, right: 652, bottom: 146, width: 32, height: 32 });
    // Obstacle 3 (search): x=580..612
    withRect(searchBtn, { top: 114, left: 580, right: 612, bottom: 146, width: 32, height: 32 });

    wrapper.appendChild(textarea);
    wrapper.appendChild(searchBtn);
    wrapper.appendChild(micBtn);
    wrapper.appendChild(sendBtn);
    document.body.appendChild(wrapper);

    const adapter = {
      id: 'test-multi-obstacle',
      getAnchorContainer: () => wrapper,
      getPositionStrategy: () => ({
        mode: 'anchored',
        right: 10,
        bottom: 10,
        avoidSelector: 'button[data-testid="send-btn"], button[data-testid="mic-btn"], button[data-testid="search-btn"]'
      })
    };

    const injector = globalThis.ZeusInjector.create({
      svgMarkup: '<svg></svg>',
      onEnhanceClick: () => {}
    });

    injector.inject([textarea], adapter);
    injector.refresh();

    const button = wrapper.querySelector('.zeus-enhance-btn');
    expect(button).toBeTruthy();

    const computedRight = parseInt(button.style.right, 10);
    // wrapper.right (700) - searchBtn.left (580) + 8 = 128px
    expect(computedRight).toBeGreaterThanOrEqual(128);
  });
});
