(function registerGrokAdapter(globalScope) {
  const adapters = globalScope.ZeusContentAdapters || (globalScope.ZeusContentAdapters = []);

  const INPUT_SELECTORS = [
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

  function pickBottomMost(candidates) {
    const list = Array.isArray(candidates) ? candidates : [];
    if (list.length <= 1) return list;

    let winner = list[0];
    let maxBottom = winner.getBoundingClientRect().bottom;

    for (const element of list) {
      const bottom = element.getBoundingClientRect().bottom;
      if (bottom > maxBottom) {
        maxBottom = bottom;
        winner = element;
      }
    }

    return [winner];
  }

  function getInputElement() {
    const active = document.activeElement;
    if (active instanceof Element && active.matches?.('textarea, div[role="textbox"][contenteditable="true"], [contenteditable="true"]') && isVisible(active)) {
      return active;
    }

    const inputs = pickBottomMost(findInputs());
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
      inputEl.closest('[class*="input"]') ||
      inputEl.parentElement
    );
  }

  function getPositionStrategy(inputEl) {
    const anchor = getAnchorContainer(inputEl);
    const sendButton = anchor?.querySelector('button[type="submit"], button[aria-label*="Send"], button[aria-label*="send"]');
    const sidebar = document.querySelector('aside, [data-testid*="sidebar"]');

    const sendWidth = sendButton ? Math.round(sendButton.getBoundingClientRect().width || 0) : 0;
    const sidebarRect = sidebar?.getBoundingClientRect?.();
    const sidebarInset = sidebarRect && sidebarRect.left > window.innerWidth * 0.65 ? 6 : 0;

    return {
      mode: 'anchored',
      right: Math.max(12, sendWidth + 12 + sidebarInset),
      bottom: 10,
      avoidSelector: 'button[type="submit"], button[aria-label*="Send"], button[aria-label*="send"]',
      zIndex: 26
    };
  }

  adapters.push({
    id: 'grok',
    matches(hostname) {
      return hostname.includes('grok.com');
    },
    inputSelectors: INPUT_SELECTORS,
    pickInputs: pickBottomMost,
    getInputElement,
    getAnchorContainer,
    getPositionStrategy
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
