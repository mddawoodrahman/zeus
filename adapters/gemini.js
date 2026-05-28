(function registerGeminiAdapter(globalScope) {
  const adapters = globalScope.ZeusContentAdapters || (globalScope.ZeusContentAdapters = []);

  const INPUT_SELECTORS = [
    'rich-textarea div[contenteditable="true"]',
    'div[role="textbox"][contenteditable="true"]',
    'div[contenteditable="true"][aria-label*="prompt" i]',
    'div[contenteditable="true"][aria-label*="message" i]',
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
      inputEl.closest('chat-input') ||
      inputEl.closest('[class*="input-area"]') ||
      inputEl.closest('[class*="inputArea"]') ||
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

    const controls = Array.from(anchor.querySelectorAll('button, [role="button"]'))
      .filter((element) => isVisible(element) && !element.classList?.contains('zeus-enhance-btn') && !element.classList?.contains('zeus-enhance-button'));

    const rightSideControls = controls.filter((element) => {
      const rect = element.getBoundingClientRect();
      const centerX = rect.left + (rect.width / 2);
      const centerY = rect.top + (rect.height / 2);

      return (
        centerX >= anchorRect.left + (anchorRect.width * 0.58) &&
        centerY >= anchorRect.top + (anchorRect.height * 0.42)
      );
    });

    if (rightSideControls.length === 0) {
      return 0;
    }

    let leftMost = Number.POSITIVE_INFINITY;
    for (const control of rightSideControls) {
      leftMost = Math.min(leftMost, control.getBoundingClientRect().left);
    }

    if (!Number.isFinite(leftMost)) {
      return 0;
    }

    return Math.max(0, Math.round(anchorRect.right - leftMost + 8));
  }

  function getPositionStrategy(inputEl) {
    const anchor = getAnchorContainer(inputEl);

    return {
      mode: 'anchored',
      right: Math.max(12, getRightControlsInset(anchor)),
      bottom: 10,
      avoidSelector: 'button[aria-label*="Send"], button[aria-label*="send"], button[aria-label*="voice"], button[aria-label*="Voice"], button[aria-label*="microphone"], button[aria-label*="Microphone"]',
      zIndex: 28
    };
  }

  adapters.push({
    id: 'gemini-site',
    matches(hostname) {
      return hostname.includes('gemini.google.com') || hostname.includes('bard.google.com');
    },
    inputSelectors: INPUT_SELECTORS,
    getInputElement,
    getAnchorContainer,
    getPositionStrategy
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
