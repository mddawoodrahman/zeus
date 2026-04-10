(function initZeusInjector(globalScope) {
  const BUTTON_CLASS = 'zeus-enhance-button';
  const STYLE_ID = 'zeus-enhance-button-style';

  function ensureButtonStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .${BUTTON_CLASS} {
        position: absolute;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: clamp(30px, 2.2vw, 34px);
        height: clamp(30px, 2.2vw, 34px);
        border-radius: 999px;
        border: 1px solid rgba(0, 0, 0, 0.12);
        background: rgba(255, 255, 255, 0.94);
        box-shadow: 0 8px 20px rgba(15, 23, 42, 0.18);
        color: #111827;
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        cursor: pointer;
        padding: 0;
        opacity: 0;
        transform: translateY(4px) scale(0.94);
        transition: opacity 170ms ease, transform 190ms cubic-bezier(0.2, 0.7, 0.2, 1), box-shadow 200ms ease;
        pointer-events: none;
      }

      .${BUTTON_CLASS}[data-visible="1"] {
        opacity: 1;
        transform: translateY(0) scale(1);
        pointer-events: auto;
      }

      .${BUTTON_CLASS}:hover {
        box-shadow: 0 10px 24px rgba(15, 23, 42, 0.24);
      }

      .${BUTTON_CLASS}[data-busy="1"] {
        cursor: progress;
      }

      .${BUTTON_CLASS} svg {
        width: 16px;
        height: 16px;
        pointer-events: none;
      }
    `;

    (document.head || document.documentElement).appendChild(style);
  }

  function isInputFocused(input) {
    if (!input || !document.activeElement) {
      return false;
    }

    return document.activeElement === input || (input.contains && input.contains(document.activeElement));
  }

  function createButton(svgMarkup, onClick) {
    ensureButtonStyles();

    const button = document.createElement('button');
    button.type = 'button';
    button.className = BUTTON_CLASS;
    button.dataset.visible = '0';
    button.setAttribute('aria-hidden', 'true');
    button.setAttribute('aria-label', 'Enhance prompt with Zeus');
    button.setAttribute('title', 'Enhance Prompt');
    button.innerHTML = svgMarkup;

    button.addEventListener('mousedown', (event) => {
      event.preventDefault();
    });

    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      onClick(button);
    });

    return button;
  }

  function create(options) {
    const svgMarkup = String(options?.svgMarkup || '');
    const onEnhanceClick = typeof options?.onEnhanceClick === 'function' ? options.onEnhanceClick : () => {};

    const inputListeners = new Map();

    let knownInputs = [];
    let button = null;
    let floatingController = null;
    let activeInput = null;
    let focusedInput = null;
    let hoveredInput = null;
    let buttonHovering = false;
    let hideTimer = null;
    let resolveAnchorContainer = (input) => input?.parentElement || null;
    let resolvePositionStrategy = () => ({ mode: 'anchored', right: 12, bottom: 10 });

    function ensureButton() {
      if (button) {
        return;
      }

      button = createButton(svgMarkup, () => {
        if (activeInput) {
          onEnhanceClick(activeInput, button);
        }
      });

      button.addEventListener('mouseenter', () => {
        buttonHovering = true;
        updateVisibility();
      });

      button.addEventListener('mouseleave', () => {
        buttonHovering = false;
        scheduleVisibility(80);
      });
    }

    function resolveAnchor(input) {
      let anchor = null;
      try {
        anchor = resolveAnchorContainer(input);
      } catch (_) {
        anchor = null;
      }

      if (!(anchor instanceof Element)) {
        anchor = input?.parentElement || null;
      }

      return anchor;
    }

    function resolveStrategy(input, anchor) {
      try {
        const strategy = resolvePositionStrategy(input, anchor);
        if (strategy && typeof strategy === 'object') {
          return strategy;
        }
      } catch (_) {
        // Fall back to anchored mode if strategy logic fails.
      }

      return { mode: 'anchored', right: 12, bottom: 10 };
    }

    function resolveMountRoot(input, anchor) {
      const strategy = resolveStrategy(input, anchor);
      const mode = String(strategy?.mode || strategy?.type || 'anchored').toLowerCase();
      if (mode === 'fixed') {
        return document.documentElement || document.body;
      }

      return anchor || input?.parentElement || document.body;
    }

    function ensureFloatingController() {
      if (floatingController || !button) {
        return;
      }

      const floatingFactory = globalScope.ZeusFloatingPosition;
      if (!floatingFactory || typeof floatingFactory.create !== 'function') {
        floatingController = Object.freeze({
          update() {},
          setTarget() {},
          destroy() {}
        });
        return;
      }

      floatingController = floatingFactory.create({
        button,
        getStrategy: resolveStrategy
      });
    }

    function mountForInput(input) {
      if (!input || !input.isConnected) {
        return;
      }

      ensureButton();
      ensureFloatingController();

      const anchor = resolveAnchor(input);
      const mountRoot = resolveMountRoot(input, anchor);

      if (mountRoot && button.parentElement !== mountRoot) {
        mountRoot.appendChild(button);
      }

      activeInput = input;
      floatingController.setTarget(input, anchor);
      floatingController.update();
    }

    function pickBestInput(candidates) {
      const list = Array.isArray(candidates) ? candidates : [];
      if (list.length === 0) {
        return null;
      }

      if (focusedInput && list.includes(focusedInput)) {
        return focusedInput;
      }

      if (hoveredInput && list.includes(hoveredInput)) {
        return hoveredInput;
      }

      if (document.activeElement && list.includes(document.activeElement)) {
        return document.activeElement;
      }

      return list[0];
    }

    function setVisible(visible) {
      if (!button) {
        return;
      }

      button.dataset.visible = visible ? '1' : '0';
      button.setAttribute('aria-hidden', visible ? 'false' : 'true');
    }

    function shouldBeVisible() {
      if (activeInput && activeInput.isConnected) {
        return true;
      }

      if (buttonHovering) {
        return true;
      }

      if (focusedInput && focusedInput.isConnected) {
        return true;
      }

      if (hoveredInput && hoveredInput.isConnected) {
        return true;
      }

      if (activeInput && activeInput.isConnected && isInputFocused(activeInput)) {
        return true;
      }

      return false;
    }

    function updateVisibility() {
      clearTimeout(hideTimer);
      hideTimer = null;

      if (knownInputs.length === 0) {
        setVisible(false);
        return;
      }

      const nextInput = pickBestInput(knownInputs);
      if (nextInput && nextInput !== activeInput) {
        mountForInput(nextInput);
      } else if (activeInput && activeInput.isConnected) {
        mountForInput(activeInput);
      }

      setVisible(shouldBeVisible());
    }

    function scheduleVisibility(delayMs) {
      clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => {
        updateVisibility();
      }, Math.max(0, Number(delayMs) || 0));
    }

    function registerInput(input) {
      if (!input || inputListeners.has(input)) {
        return;
      }

      const onFocus = () => {
        focusedInput = input;
        mountForInput(input);
        setVisible(true);
      };

      const onBlur = () => {
        if (focusedInput === input) {
          focusedInput = null;
        }
        scheduleVisibility(80);
      };

      const onMouseEnter = () => {
        hoveredInput = input;
        if (!focusedInput) {
          mountForInput(input);
        }
        setVisible(true);
      };

      const onMouseLeave = () => {
        if (hoveredInput === input) {
          hoveredInput = null;
        }
        scheduleVisibility(120);
      };

      const onInput = () => {
        if (activeInput === input && floatingController) {
          floatingController.update();
        }
      };

      input.addEventListener('focus', onFocus, true);
      input.addEventListener('blur', onBlur, true);
      input.addEventListener('mouseenter', onMouseEnter);
      input.addEventListener('mouseleave', onMouseLeave);
      input.addEventListener('input', onInput);

      inputListeners.set(input, () => {
        input.removeEventListener('focus', onFocus, true);
        input.removeEventListener('blur', onBlur, true);
        input.removeEventListener('mouseenter', onMouseEnter);
        input.removeEventListener('mouseleave', onMouseLeave);
        input.removeEventListener('input', onInput);
      });
    }

    function unregisterMissingInputs(nextInputs) {
      const nextSet = new Set(nextInputs);
      for (const [input, cleanup] of inputListeners.entries()) {
        if (!nextSet.has(input) || !input.isConnected) {
          cleanup();
          inputListeners.delete(input);
        }
      }
    }

    function inject(inputs, adapter) {
      const list = Array.from(new Set((Array.isArray(inputs) ? inputs : []).filter((input) => input && input.isConnected)));

      resolveAnchorContainer = typeof adapter?.getAnchorContainer === 'function'
        ? adapter.getAnchorContainer
        : (input) => input?.parentElement || null;

      resolvePositionStrategy = typeof adapter?.getPositionStrategy === 'function'
        ? adapter.getPositionStrategy
        : () => ({ mode: 'anchored', right: 12, bottom: 10 });

      ensureButton();
      ensureFloatingController();

      knownInputs = list;
      unregisterMissingInputs(list);

      for (const input of list) {
        registerInput(input);
      }

      if (activeInput && (!activeInput.isConnected || !list.includes(activeInput))) {
        activeInput = null;
      }

      if (focusedInput && (!focusedInput.isConnected || !list.includes(focusedInput))) {
        focusedInput = null;
      }

      if (hoveredInput && (!hoveredInput.isConnected || !list.includes(hoveredInput))) {
        hoveredInput = null;
      }

      if (list.length === 0) {
        setVisible(false);
        if (button?.isConnected) {
          button.remove();
        }
        return;
      }

      const fallbackInput = pickBestInput(list);
      if (fallbackInput && !activeInput) {
        mountForInput(fallbackInput);
      }

      updateVisibility();
    }

    function refresh() {
      if (activeInput && activeInput.isConnected) {
        mountForInput(activeInput);
      } else {
        const connected = knownInputs.filter((input) => input && input.isConnected);
        const fallbackInput = pickBestInput(connected);
        if (fallbackInput) {
          mountForInput(fallbackInput);
        }
      }

      updateVisibility();
      floatingController?.update();
    }

    function updateButtonState(inputElement, updater) {
      if (!button || inputElement !== activeInput || typeof updater !== 'function') {
        return;
      }
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
