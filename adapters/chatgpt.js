(function registerChatGptAdapter(globalScope) {
  const adapters = globalScope.ZeusContentAdapters || (globalScope.ZeusContentAdapters = []);

  const INPUT_SELECTORS = [
    'textarea[data-testid="prompt-textarea"]',
    'textarea#prompt-textarea',
    'textarea[data-id="root"]',
    'textarea',
    'div[role="textbox"][contenteditable="true"]'
  ];

  function isVisible(element) {
    if (!element) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function findInputs() {
    const found = [];
    for (const selector of INPUT_SELECTORS) {
      try {
        found.push(...Array.from(document.querySelectorAll(selector)));
      } catch (_) {
        // Skip invalid selector matches.
      }
    }

    return Array.from(new Set(found)).filter(isVisible);
  }

  function getInputElement() {
    const active = document.activeElement;
    if (active instanceof Element && INPUT_SELECTORS.some((selector) => {
      try {
        return active.matches(selector);
      } catch (_) {
        return false;
      }
    }) && isVisible(active)) {
      return active;
    }

    const inputs = findInputs();
    if (inputs.length === 0) {
      return null;
    }

    return inputs.sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0];
  }

  function getAnchorContainer(inputEl) {
    if (!inputEl) {
      return null;
    }

    return (
      inputEl.closest('form') ||
      inputEl.closest('[data-testid="composer"]') ||
      inputEl.closest('[class*="composer"]') ||
      inputEl.parentElement
    );
  }

  function getRightControlsInset(anchor) {
    if (!anchor) {
      return 0;
    }

    const anchorRect = anchor.getBoundingClientRect();
    if (!anchorRect.width || !anchorRect.height) {
      return 0;
    }

    const trailingSelectors = [
      '[data-testid*="composer-trailing"]',
      '[class*="composer-trailing"]',
      '[class*="trailing-actions"]',
      '[class*="trailingActions"]',
      '[class*="right-controls"]'
    ];

    for (const selector of trailingSelectors) {
      try {
        const trailing = anchor.querySelector(selector);
        if (!trailing || !isVisible(trailing)) {
          continue;
        }

        const rect = trailing.getBoundingClientRect();
        const inset = Math.round(anchorRect.right - rect.left + 8);
        if (inset > 0) {
          return inset;
        }
      } catch (_) {
        // Ignore selector errors and fall through to heuristic scan.
      }
    }

    const controls = Array.from(anchor.querySelectorAll('button, [role="button"]'))
      .filter((element) => isVisible(element) && !element.classList?.contains('zeus-enhance-btn') && !element.classList?.contains('zeus-enhance-button'));

    const rightSideControls = controls.filter((element) => {
      const rect = element.getBoundingClientRect();
      const centerX = rect.left + (rect.width / 2);
      const centerY = rect.top + (rect.height / 2);

      return (
        centerX >= anchorRect.left + (anchorRect.width * 0.58) &&
        centerY >= anchorRect.top + (anchorRect.height * 0.45)
      );
    });

    if (rightSideControls.length === 0) {
      return 0;
    }

    let leftMost = Number.POSITIVE_INFINITY;
    for (const control of rightSideControls) {
      const rect = control.getBoundingClientRect();
      leftMost = Math.min(leftMost, rect.left);
    }

    if (!Number.isFinite(leftMost)) {
      return 0;
    }

    return Math.max(0, Math.round(anchorRect.right - leftMost + 8));
  }

  function getPositionStrategy(inputEl) {
    const anchor = getAnchorContainer(inputEl);
    const sendButton = anchor?.querySelector('button[data-testid="send-button"], button[aria-label*="Send"]');
    const sendWidth = sendButton ? Math.round(sendButton.getBoundingClientRect().width || 0) : 0;
    const controlsInset = getRightControlsInset(anchor);

    return {
      mode: 'anchored',
      right: Math.max(10, sendWidth + 12, controlsInset),
      bottom: 10,
      avoidSelector: 'button[data-testid="send-button"], button[aria-label*="Send"], button[aria-label*="voice"], button[aria-label*="Voice"], button[aria-label*="microphone"], button[aria-label*="Microphone"]',
      zIndex: 30
    };
  }

  adapters.push({
    id: 'chatgpt',
    matches(hostname) {
      return hostname.includes('chatgpt.com') || hostname.includes('chat.openai.com');
    },
    inputSelectors: INPUT_SELECTORS,
    getInputElement,
    getAnchorContainer,
    getPositionStrategy
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
