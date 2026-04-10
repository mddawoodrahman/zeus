(function registerClaudeAdapter(globalScope) {
  const adapters = globalScope.ZeusContentAdapters || (globalScope.ZeusContentAdapters = []);

  const INPUT_SELECTORS = [
    'div[contenteditable="true"][role="textbox"]',
    'div[contenteditable="true"][data-placeholder]',
    'div[contenteditable="true"]',
    'textarea'
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
    if (active instanceof Element && active.matches?.('div[contenteditable="true"], textarea') && isVisible(active)) {
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
      inputEl.closest('[data-testid*="composer"]') ||
      inputEl.closest('[class*="Composer"]') ||
      inputEl.closest('[class*="input"]') ||
      inputEl.parentElement
    );
  }

  function getPositionStrategy(inputEl) {
    const anchor = getAnchorContainer(inputEl);
    const sendButton = anchor?.querySelector('button[type="submit"], button[aria-label*="Send"], button[aria-label*="send"]');

    let right = 12;
    let bottom = 10;

    if (sendButton) {
      const sendRect = sendButton.getBoundingClientRect();
      right = Math.max(right, Math.round(sendRect.width + 12));
      bottom = Math.max(bottom, Math.round(sendRect.height + 12));
    }

    return {
      mode: 'anchored',
      right,
      bottom,
      avoidSelector: 'button[type="submit"], button[aria-label*="Send"], button[aria-label*="send"]',
      zIndex: 28
    };
  }

  adapters.push({
    id: 'claude',
    matches(hostname) {
      return hostname.includes('claude.ai');
    },
    inputSelectors: INPUT_SELECTORS,
    getInputElement,
    getAnchorContainer,
    getPositionStrategy
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
