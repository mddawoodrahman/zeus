(function initZeusInjector(globalScope) {
  const BUTTON_CLASS = 'zeus-enhance-btn';
  const STYLE_ID = 'zeus-enhance-button-style';

  function ensureButtonStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      @keyframes neon-breathe {
        0%, 100% { opacity: 1; filter: brightness(1); }
        50% { opacity: 0.85; filter: brightness(1.15); }
      }

      .${BUTTON_CLASS}, .zeus-toast {
        --void: #080508;
        --void-elevated: #0f0f12;
        --void-panel: #151519;
        --void-glass: rgba(8, 5, 8, 0.92);
        --cyber-yellow: #FCEE0A;
        --cyber-yellow-dim: #B8A508;
        --cyber-yellow-glow: rgba(252, 238, 10, 0.6);
        --cyber-yellow-faint: rgba(252, 238, 10, 0.08);
        --arasaka-red: #FF003C;
        --arasaka-red-dim: #C5003C;
        --arasaka-red-glow: rgba(255, 0, 60, 0.5);
        --arasaka-red-faint: rgba(255, 0, 60, 0.06);
        --net-cyan: #00F0FF;
        --net-cyan-dim: #55EAD4;
        --net-cyan-glow: rgba(0, 240, 255, 0.5);
        --net-cyan-faint: rgba(0, 240, 255, 0.06);
        --acid-green: #39FF14;
        --acid-green-dim: #2ECC71;
        --acid-green-glow: rgba(57, 255, 20, 0.4);
        --text-primary: #F0F0F0;
        --text-secondary: #8A8A8F;
        --text-muted: #4A4A4F;
        --text-warning: #FCEE0A;
      }

      .${BUTTON_CLASS} {
        all: initial;
        position: absolute;
        z-index: 2147483646;
        font-family: 'Rajdhani', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-weight: 700;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.15em;
        padding: 6px 12px;
        background: var(--void-panel, #151519) !important;
        color: var(--cyber-yellow, #FCEE0A) !important;
        border: 1px solid var(--cyber-yellow, #FCEE0A) !important;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        box-shadow: 0 0 8px var(--cyber-yellow-faint, rgba(252, 238, 10, 0.08));
        transition: all 0.2s ease, opacity 170ms ease, transform 190ms cubic-bezier(0.2, 0.7, 0.2, 1);
        clip-path: polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px);
        text-shadow: 0 0 2px rgba(0, 0, 0, 0.5);
        opacity: 0;
        transform: translateY(4px) scale(0.94);
        pointer-events: none;
        box-sizing: border-box;
      }

      @media (prefers-color-scheme: light) {
        .${BUTTON_CLASS} {
          box-shadow: 0 0 12px rgba(252, 238, 10, 0.4), 0 2px 8px rgba(0,0,0,0.3);
          border-width: 2px !important;
        }
      }

      .${BUTTON_CLASS}[data-visible="1"] {
        opacity: 1;
        transform: translateY(0) scale(1);
        pointer-events: auto;
      }

      .${BUTTON_CLASS}::before {
        content: '⚡';
        color: var(--cyber-yellow, #FCEE0A);
        font-size: 12px;
        filter: drop-shadow(0 0 4px var(--cyber-yellow-glow, rgba(252, 238, 10, 0.6)));
      }

      .${BUTTON_CLASS}:hover {
        background: var(--cyber-yellow, #FCEE0A) !important;
        color: var(--void, #080508) !important;
        box-shadow: 0 0 16px var(--cyber-yellow-glow, rgba(252, 238, 10, 0.6));
        transform: translateY(-1px);
      }

      .${BUTTON_CLASS}:active {
        transform: translateY(0);
      }

      .${BUTTON_CLASS}.processing {
        border-color: var(--net-cyan, #00F0FF) !important;
        color: var(--net-cyan, #00F0FF) !important;
        pointer-events: none;
      }

      .${BUTTON_CLASS}.processing::before {
        content: '◈';
        animation: neon-breathe 1s ease-in-out infinite;
        color: var(--net-cyan, #00F0FF);
      }

      .${BUTTON_CLASS}.error {
        border-color: var(--arasaka-red, #FF003C) !important;
        color: var(--arasaka-red, #FF003C) !important;
      }

      .${BUTTON_CLASS}.error::before {
        content: '✕';
        color: var(--arasaka-red, #FF003C);
      }

      /* Tooltip / Status Toast */
      .zeus-toast {
        position: absolute;
        z-index: 2147483646;
        background: var(--void-glass, rgba(8, 5, 8, 0.92)) !important;
        border: 1px solid var(--net-cyan, #00F0FF) !important;
        color: var(--text-primary, #F0F0F0) !important;
        font-family: 'JetBrains Mono', 'Fira Code', monospace;
        font-size: 11px;
        padding: 8px 12px;
        max-width: 240px;
        backdrop-filter: blur(4px);
        box-shadow: 0 4px 20px rgba(0,0,0,0.5);
        pointer-events: none;
        border-radius: 0 !important;
        box-sizing: border-box;
      }

      .zeus-toast::before {
        content: '> ';
        color: var(--acid-green, #39FF14);
      }

      .zeus-toast.error {
        border-color: var(--arasaka-red, #FF003C) !important;
        color: var(--arasaka-red, #FF003C) !important;
      }

      .zeus-toast.success {
        border-color: var(--acid-green, #39FF14) !important;
        color: var(--acid-green, #39FF14) !important;
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

  function createButton(onClick) {
    ensureButtonStyles();

    const button = document.createElement('button');
    button.type = 'button';
    button.className = BUTTON_CLASS;
    button.dataset.visible = '0';
    button.setAttribute('aria-hidden', 'true');
    button.setAttribute('aria-label', 'Optimize prompt with Zeus');
    button.setAttribute('title', 'Optimize Prompt');
    button.textContent = 'OPTIMIZE PROMPT';

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
    let toastElement = null;

    function showToast(message, type = 'info', durationMs = 3000) {
      if (toastElement) {
        toastElement.remove();
        toastElement = null;
      }

      toastElement = document.createElement('div');
      toastElement.className = `zeus-toast ${type}`;
      toastElement.textContent = message;

      const parent = button?.parentElement;
      if (parent) {
        parent.appendChild(toastElement);
        if (button) {
          const btnRect = button.getBoundingClientRect();
          const parentRect = parent.getBoundingClientRect();
          toastElement.style.right = `${parentRect.right - btnRect.right}px`;
          toastElement.style.bottom = `${parentRect.bottom - btnRect.top + 6}px`;
        }
      }

      if (durationMs > 0) {
        setTimeout(() => {
          if (toastElement && toastElement.isConnected) {
            toastElement.remove();
            toastElement = null;
          }
        }, durationMs);
      }
    }

    function ensureButton() {
      if (button) {
        return;
      }

      button = createButton(() => {
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
      updateButtonState,
      showToast
    });
  }

  globalScope.ZeusInjector = Object.freeze({
    create
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
