(function registerGeminiAdapter(globalScope) {
  const adapters = globalScope.ZeusContentAdapters || (globalScope.ZeusContentAdapters = []);

  const INPUT_SELECTORS = [
    'rich-textarea div[contenteditable="true"]',
    'rich-textarea [role="textbox"]',
    'div.ql-editor[contenteditable="true"]',
    'div[role="textbox"][contenteditable="true"]',
    'textarea',
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
    if (active instanceof Element && active.matches?.('div[contenteditable="true"], textarea, [role="textbox"]') && isVisible(active)) {
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
      inputEl.closest('rich-textarea') ||
      inputEl.closest('input-area-v2') ||
      inputEl.closest('[class*="input-area"]') ||
      inputEl.closest('form') ||
      inputEl.parentElement
    );
  }

  function getPositionStrategy(inputEl) {
    const anchor = getAnchorContainer(inputEl);
    const sendButton = anchor?.querySelector('button[aria-label*="Send"], button[aria-label*="send"], button.send-button');

    if (!anchor || !sendButton) {
      const rect = inputEl?.getBoundingClientRect?.() || { width: 0, height: 0 };
      return {
        mode: 'fixed',
        offsetX: Math.max(10, Math.round(rect.width * 0.02)),
        offsetY: Math.max(10, Math.round(rect.height * 0.2)),
        viewportPadding: 10,
        zIndex: 2147483000
      };
    }

    const sendWidth = Math.round(sendButton.getBoundingClientRect().width || 0);

    return {
      mode: 'anchored',
      right: Math.max(10, sendWidth + 14),
      bottom: 10,
      avoidSelector: 'button[aria-label*="Send"], button[aria-label*="send"], button.send-button, button[aria-label*="microphone"]',
      zIndex: 30
    };
  }

  adapters.push({
    id: 'gemini',
    matches(hostname) {
      return hostname.includes('gemini.google.com') || hostname.includes('bard.google.com');
    },
    inputSelectors: INPUT_SELECTORS,
    getInputElement,
    getAnchorContainer,
    getPositionStrategy
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
