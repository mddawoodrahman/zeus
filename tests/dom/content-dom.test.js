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

    const button = wrapper.querySelector('.zeus-enhance-button');
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
});
