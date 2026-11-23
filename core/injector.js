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

      @keyframes zeus-toast-enter {
        from {
          opacity: 0;
          transform: translateY(6px) scale(0.96);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      .${BUTTON_CLASS}, .zeus-toast {
        --void: #080508;
        --void-elevated: #0f0f12;
        --void-panel: #151519;
        --void-glass: rgba(8, 5, 8, 0.94);
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
        position: absolute !important;
        z-index: 2147483646 !important;
        width: 28px !important;
        height: 28px !important;
        min-width: 28px !important;
        min-height: 28px !important;
        max-width: 28px !important;
        max-height: 28px !important;
        margin: 0 !important;
        padding: 0 !important;
        background: var(--void-panel, #151519) !important;
        color: var(--cyber-yellow, #FCEE0A) !important;
        border: 1.5px solid var(--cyber-yellow, #FCEE0A) !important;
        border-radius: 7px !important;
        cursor: pointer !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        box-sizing: border-box !important;
        box-shadow: 0 0 10px var(--cyber-yellow-faint, rgba(252, 238, 10, 0.12)), 0 2px 6px rgba(0, 0, 0, 0.4) !important;
        transition: opacity 170ms ease, transform 190ms cubic-bezier(0.2, 0.7, 0.2, 1), background-color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease, color 0.15s ease;
        opacity: 0;
        transform: translateY(4px) scale(0.94);
        pointer-events: none;
        user-select: none !important;
        -webkit-user-select: none !important;
        outline: none !important;
        overflow: hidden !important;
        line-height: 1 !important;
      }

      @media (prefers-color-scheme: light) {
        .${BUTTON_CLASS} {
          box-shadow: 0 0 12px rgba(252, 238, 10, 0.4), 0 2px 8px rgba(0,0,0,0.3) !important;
          border-width: 1.5px !important;
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
        font-size: 13px;
        line-height: 1;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        filter: drop-shadow(0 0 4px var(--cyber-yellow-glow, rgba(252, 238, 10, 0.6)));
        transition: transform 0.15s ease, filter 0.15s ease;
      }

      .${BUTTON_CLASS}:hover {
        background: var(--cyber-yellow, #FCEE0A) !important;
        color: var(--void, #080508) !important;
        box-shadow: 0 0 16px var(--cyber-yellow-glow, rgba(252, 238, 10, 0.65)), 0 2px 8px rgba(0, 0, 0, 0.5) !important;
        transform: translateY(-1px) scale(1.05);
      }

      .${BUTTON_CLASS}:hover::before {
        color: var(--void, #080508) !important;
        filter: none;
      }

      .${BUTTON_CLASS}:active {
        transform: translateY(0) scale(0.96);
      }

      .${BUTTON_CLASS}.processing {
        border-color: var(--net-cyan, #00F0FF) !important;
        color: var(--net-cyan, #00F0FF) !important;
        box-shadow: 0 0 14px var(--net-cyan-glow, rgba(0, 240, 255, 0.5)) !important;
        pointer-events: none !important;
      }

      .${BUTTON_CLASS}.processing::before {
        content: '◈';
        font-size: 14px;
        animation: neon-breathe 0.9s ease-in-out infinite;
        color: var(--net-cyan, #00F0FF);
      }

      .${BUTTON_CLASS}.error {
        border-color: var(--arasaka-red, #FF003C) !important;
        color: var(--arasaka-red, #FF003C) !important;
        box-shadow: 0 0 14px var(--arasaka-red-glow, rgba(255, 0, 60, 0.5)) !important;
      }

      .${BUTTON_CLASS}.error::before {
        content: '✕';
        font-size: 12px;
        font-weight: 800;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        color: var(--arasaka-red, #FF003C);
      }

      .${BUTTON_CLASS}.error:hover {
        background: rgba(255, 0, 60, 0.15) !important;
        border-color: var(--arasaka-red, #FF003C) !important;
        color: var(--arasaka-red, #FF003C) !important;
      }

      .${BUTTON_CLASS}.error:hover::before {
        color: var(--arasaka-red, #FF003C) !important;
      }

      .${BUTTON_CLASS}.success {
        border-color: var(--acid-green, #39FF14) !important;
        color: var(--acid-green, #39FF14) !important;
        box-shadow: 0 0 14px var(--acid-green-glow, rgba(57, 255, 20, 0.5)) !important;
      }

      .${BUTTON_CLASS}.success::before {
        content: '✓';
        font-size: 13px;
        font-weight: 800;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        color: var(--acid-green, #39FF14);
      }

      .${BUTTON_CLASS}.success:hover {
        background: rgba(57, 255, 20, 0.15) !important;
        border-color: var(--acid-green, #39FF14) !important;
        color: var(--acid-green, #39FF14) !important;
      }

      .${BUTTON_CLASS}.success:hover::before {
        color: var(--acid-green, #39FF14) !important;
      }

      /* Tooltip / Status Toast */
      .zeus-toast {
        position: fixed !important;
        z-index: 2147483647 !important;
        background: var(--void-glass, rgba(8, 5, 8, 0.94)) !important;
        border: 1px solid var(--net-cyan, #00F0FF) !important;
        color: var(--text-primary, #F0F0F0) !important;
        font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, Monaco, Consolas, monospace;
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.6px;
        line-height: 1.4;
        padding: 6px 12px;
        max-width: min(380px, calc(100vw - 24px));
        white-space: nowrap;
        text-overflow: ellipsis;
        overflow: hidden;
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.65), 0 0 10px var(--net-cyan-faint);
        pointer-events: none;
        border-radius: 6px !important;
        box-sizing: border-box;
        animation: zeus-toast-enter 180ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
        transition: opacity 200ms ease, transform 200ms ease;
      }

      .zeus-toast::before {
        content: '> ';
        color: var(--net-cyan, #00F0FF);
        font-weight: 700;
      }

      .zeus-toast.info {
        border-color: var(--net-cyan, #00F0FF) !important;
        color: var(--net-cyan, #00F0FF) !important;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.65), 0 0 12px var(--net-cyan-glow);
      }

      .zeus-toast.info::before {
        content: '◈ ';
        color: var(--net-cyan, #00F0FF);
      }

      .zeus-toast.warning {
        border-color: var(--cyber-yellow, #FCEE0A) !important;
        color: var(--cyber-yellow, #FCEE0A) !important;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.65), 0 0 12px var(--cyber-yellow-glow);
      }

      .zeus-toast.warning::before {
        content: '▲ ';
        color: var(--cyber-yellow, #FCEE0A);
      }

      .zeus-toast.error {
        border-color: var(--arasaka-red, #FF003C) !important;
        color: #FF4D6D !important;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.65), 0 0 14px var(--arasaka-red-glow);
      }

      .zeus-toast.error::before {
        content: '✕ ';
        color: var(--arasaka-red, #FF003C);
        font-weight: 700;
      }

      .zeus-toast.success {
        border-color: var(--acid-green, #39FF14) !important;
        color: var(--acid-green, #39FF14) !important;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.65), 0 0 12px var(--acid-green-glow);
      }

      .zeus-toast.success::before {
        content: '✓ ';
        color: var(--acid-green, #39FF14);
        font-weight: 700;
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
    button.textContent = '';

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
    let toastTimer = null;
    let toastDismissTimer = null;
    let toastViewportListening = false;

    function handleToastViewportChange() {
      if (toastElement && toastElement.isConnected) {
        updateToastPosition();
      }
    }

    function removeToastViewportListeners() {
      if (!toastViewportListening) {
        return;
      }
      toastViewportListening = false;
      window.removeEventListener('scroll', handleToastViewportChange, true);
      window.removeEventListener('resize', handleToastViewportChange);
    }

    function addToastViewportListeners() {
      if (toastViewportListening) {
        return;
      }
      toastViewportListening = true;
      window.addEventListener('scroll', handleToastViewportChange, { passive: true, capture: true });
      window.addEventListener('resize', handleToastViewportChange, { passive: true });
    }

    function clearToast() {
      if (toastTimer) {
        clearTimeout(toastTimer);
        toastTimer = null;
      }
      if (toastDismissTimer) {
        clearTimeout(toastDismissTimer);
        toastDismissTimer = null;
      }
      removeToastViewportListeners();
      if (toastElement) {
        toastElement.remove();
        toastElement = null;
      }
    }

    function updateToastPosition() {
      if (!toastElement || !toastElement.isConnected) {
        return;
      }
      const winW = window.innerWidth || document.documentElement?.clientWidth || 1024;
      const winH = window.innerHeight || document.documentElement?.clientHeight || 768;

      if (button && button.isConnected) {
        const btnRect = button.getBoundingClientRect();
        if (btnRect.width > 0 || btnRect.height > 0) {
          const right = Math.max(12, Math.min(winW - 20, Math.round(winW - btnRect.right)));
          const bottom = Math.max(12, Math.min(winH - 20, Math.round(winH - btnRect.top + 8)));
          toastElement.style.right = `${right}px`;
          toastElement.style.bottom = `${bottom}px`;
          toastElement.style.maxWidth = `${Math.min(380, Math.max(140, winW - right - 12))}px`;
          return;
        }
      }
      toastElement.style.right = '24px';
      toastElement.style.bottom = '24px';
      toastElement.style.maxWidth = '380px';
    }

    function showToast(message, type = 'info', durationMs = 3000) {
      clearToast();

      toastElement = document.createElement('div');
      toastElement.className = `zeus-toast ${type}`;
      toastElement.style.position = 'fixed';
      toastElement.style.zIndex = '2147483647';
      toastElement.textContent = message;

      const mountRoot = document.body || document.documentElement;
      if (mountRoot) {
        mountRoot.appendChild(toastElement);
        updateToastPosition();
        addToastViewportListeners();
      }

      if (durationMs > 0) {
        toastTimer = setTimeout(() => {
          if (toastElement && toastElement.isConnected) {
            toastElement.style.opacity = '0';
            toastElement.style.transform = 'translateY(-4px) scale(0.96)';
            toastDismissTimer = setTimeout(() => {
              clearToast();
            }, 220);
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
      floatingController.update(true);
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

      if (!visible) {
        clearToast();
      }
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
      floatingController?.update(true);
      updateToastPosition();
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
      showToast,
      clearToast,
      hideToast: clearToast
    });
  }

  globalScope.ZeusInjector = Object.freeze({
    create
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
