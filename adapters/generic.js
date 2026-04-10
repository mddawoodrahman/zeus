(function registerGenericAdapter(globalScope) {
  const adapters = globalScope.ZeusContentAdapters || (globalScope.ZeusContentAdapters = []);

  const INPUT_SELECTORS = [
    'textarea',
    'div[role="textbox"][contenteditable="true"]',
    '[contenteditable="true"]',
    'input[type="text"]',
    'input[type="search"]'
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
    if (active instanceof Element && active.matches?.('textarea, div[role="textbox"][contenteditable="true"], [contenteditable="true"], input[type="text"], input[type="search"]') && isVisible(active)) {
      return active;
    }

    const inputs = findInputs();
    return inputs[0] || null;
  }

  function getAnchorContainer(inputEl) {
    if (!inputEl) {
      return null;
    }

    return inputEl.closest('form') || inputEl.parentElement;
  }

  function getPositionStrategy() {
    return {
      mode: 'anchored',
      right: 10,
      bottom: 10,
      zIndex: 20
    };
  }

  adapters.push({
    id: 'generic',
    matches() {
      return true;
    },
    inputSelectors: INPUT_SELECTORS,
    getInputElement,
    getAnchorContainer,
    getPositionStrategy
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
