(function registerOpenRouterAdapter(globalScope) {
  const adapters = globalScope.ZeusContentAdapters || (globalScope.ZeusContentAdapters = []);

  const INPUT_SELECTORS = [
    'textarea[data-testid="prompt-input"]',
    'textarea',
    'div[role="textbox"][contenteditable="true"]',
    '[contenteditable="true"]'
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
    if (active instanceof Element && active.matches?.('textarea, div[role="textbox"][contenteditable="true"], [contenteditable="true"]') && isVisible(active)) {
      return active;
    }

    const inputs = findInputs();
    return inputs[0] || null;
  }

  function getAnchorContainer(inputEl) {
    if (!inputEl) {
      return null;
    }

    return (
      inputEl.closest('form') ||
      inputEl.closest('[data-testid*="composer"]') ||
      inputEl.closest('[class*="composer"]') ||
      inputEl.parentElement
    );
  }

  function getPositionStrategy(inputEl) {
    const anchor = getAnchorContainer(inputEl);
    const sendButton = anchor?.querySelector('button[type="submit"], button[aria-label*="Send"], button[aria-label*="send"]');
    const sendWidth = sendButton ? Math.round(sendButton.getBoundingClientRect().width || 0) : 0;

    return {
      mode: 'anchored',
      right: Math.max(10, sendWidth + 12),
      bottom: 10,
      avoidSelector: 'button[type="submit"], button[aria-label*="Send"], button[aria-label*="send"]',
      zIndex: 24
    };
  }

  adapters.push({
    id: 'openrouter',
    matches(hostname) {
      return hostname.includes('openrouter.ai');
    },
    inputSelectors: INPUT_SELECTORS,
    getInputElement,
    getAnchorContainer,
    getPositionStrategy
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);

