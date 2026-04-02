(function initZeusInjector(globalScope) {
  const DEFAULT_BUTTON_STYLE = [
    'position:absolute',
    'z-index:2147483646',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'width:32px',
    'height:32px',
    'border:none',
    'border-radius:8px',
    'background:transparent',
    'cursor:pointer',
    'padding:0'
  ].join(';');

  function ensureAnchorPosition(anchor) {
    if (!anchor) return;
    const computed = window.getComputedStyle(anchor);
    if (computed.position === 'static') {
      anchor.style.position = 'relative';
      anchor.dataset.zeusAnchorPositioned = '1';
    }
  }

  function ensureInputPadding(inputElement) {
    if (!inputElement || inputElement.dataset.zeusPaddingAdjusted === '1') {
      return;
    }

    try {
      const computed = window.getComputedStyle(inputElement);
      const currentPaddingRight = parseFloat(computed.paddingRight || '0') || 0;
      const targetPadding = 42;

      if (currentPaddingRight < targetPadding) {
        inputElement.style.paddingRight = `${targetPadding}px`;
      }

      inputElement.dataset.zeusPaddingAdjusted = '1';
    } catch (_) {
      // Skip if style access fails in sandboxed areas.
    }
  }

  function positionButtonForInput(inputElement, buttonElement, anchorElement) {
    if (!inputElement || !buttonElement || !anchorElement) return;

    const inputRect = inputElement.getBoundingClientRect();
    const anchorRect = anchorElement.getBoundingClientRect();

    const top = inputRect.top - anchorRect.top + Math.max(4, (inputRect.height - 32) / 2);
    const left = inputRect.right - anchorRect.left - 36;

    buttonElement.style.top = `${Math.max(0, top)}px`;
    buttonElement.style.left = `${Math.max(0, left)}px`;
  }

  function createButton(svgMarkup, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'zeus-enhance-button';
    button.setAttribute('aria-label', 'Enhance prompt with Zeus');
    button.setAttribute('title', 'Enhance Prompt');
    button.style.cssText = DEFAULT_BUTTON_STYLE;
    button.innerHTML = svgMarkup;

    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      onClick(button);
    });

    return button;
  }

  function create(options) {
    const inputToButton = new WeakMap();
    const buttonToInput = new WeakMap();
    const mounted = new Set();

    const svgMarkup = String(options?.svgMarkup || '');
    const onEnhanceClick = typeof options?.onEnhanceClick === 'function' ? options.onEnhanceClick : () => {};

    function inject(inputs) {
      const list = Array.isArray(inputs) ? inputs : [];
      for (const inputElement of list) {
        if (!inputElement || !inputElement.parentElement) continue;

        const existingButton = inputToButton.get(inputElement);
        if (existingButton && existingButton.isConnected) {
          continue;
        }

        const anchor = inputElement.parentElement;
        ensureAnchorPosition(anchor);
        ensureInputPadding(inputElement);

        const button = createButton(svgMarkup, (btn) => {
          const input = buttonToInput.get(btn);
          if (input) {
            onEnhanceClick(input, btn);
          }
        });

        anchor.appendChild(button);
        inputToButton.set(inputElement, button);
        buttonToInput.set(button, inputElement);
        mounted.add(button);

        positionButtonForInput(inputElement, button, anchor);
      }
    }

    function refresh() {
      for (const button of mounted) {
        if (!button.isConnected) {
          mounted.delete(button);
          continue;
        }

        const input = buttonToInput.get(button);
        if (!input || !input.isConnected) {
          button.remove();
          mounted.delete(button);
          continue;
        }

        const anchor = input.parentElement;
        if (!anchor) continue;

        ensureAnchorPosition(anchor);
        positionButtonForInput(input, button, anchor);
      }
    }

    function updateButtonState(inputElement, updater) {
      const button = inputToButton.get(inputElement);
      if (!button) return;
      updater(button);
    }

    return Object.freeze({
      inject,
      refresh,
      updateButtonState
    });
  }

  globalScope.ZeusInjector = Object.freeze({
    create
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
