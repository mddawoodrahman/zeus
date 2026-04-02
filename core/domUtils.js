(function initZeusDomUtils(globalScope) {
  const DEBUG = false;

  const DEFAULT_INPUT_SELECTORS = Object.freeze([
    'textarea',
    'div[role="textbox"][contenteditable="true"]',
    '[contenteditable="true"]',
    'input[type="text"]',
    'input[type="search"]',
    'input:not([type])'
  ]);

  function debug(...args) {
    if (DEBUG) {
      console.debug('Zeus:', ...args);
    }
  }

  function isVisible(el) {
    if (!el) return false;

    try {
      const computedStyle = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return (
        computedStyle.display !== 'none' &&
        computedStyle.visibility !== 'hidden' &&
        rect.width > 0 &&
        rect.height > 0
      );
    } catch (_) {
      return false;
    }
  }

  function isEditableElement(el) {
    if (!el || !(el instanceof Element)) {
      return false;
    }

    if (el.tagName === 'TEXTAREA') {
      return !el.disabled && !el.readOnly;
    }

    if (el.tagName === 'INPUT') {
      const type = String(el.getAttribute('type') || 'text').toLowerCase();
      const allowed = ['text', 'search', 'email', 'url', 'tel', 'password'];
      return allowed.includes(type) && !el.disabled && !el.readOnly;
    }

    if (el.isContentEditable) {
      return el.getAttribute('contenteditable') === 'true';
    }

    return false;
  }

  function isEligibleInput(el) {
    if (!isEditableElement(el) || !isVisible(el)) {
      return false;
    }

    const rect = el.getBoundingClientRect();
    if (rect.width < 40 || rect.height < 20) {
      return false;
    }

    return true;
  }

  function dedupeElements(list) {
    return Array.from(new Set((Array.isArray(list) ? list : []).filter(Boolean)));
  }

  function findCandidates(selectors, rootNode) {
    const root = rootNode || document;
    const selectorList = Array.isArray(selectors) && selectors.length > 0 ? selectors : DEFAULT_INPUT_SELECTORS;

    const all = [];
    for (const selector of selectorList) {
      try {
        all.push(...Array.from(root.querySelectorAll(selector)));
      } catch (_) {
        // Skip invalid selectors from custom adapters.
      }
    }

    return dedupeElements(all);
  }

  function getInputText(el) {
    if (!el) return '';

    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      return String(el.value || '');
    }

    if (el.isContentEditable) {
      return String(el.innerText || el.textContent || '');
    }

    return '';
  }

  function setInputText(el, text) {
    if (!el) return;
    const value = String(text || '');

    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      if (el.tagName === 'TEXTAREA') {
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
      }
      el.focus();
      return;
    }

    if (el.isContentEditable) {
      el.innerText = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.focus();
    }
  }

  function filterEligibleInputs(list) {
    const eligible = dedupeElements(list).filter(isEligibleInput);
    debug('eligible inputs', eligible);
    return eligible;
  }

  globalScope.ZeusDomUtils = Object.freeze({
    DEFAULT_INPUT_SELECTORS,
    debug,
    isVisible,
    isEditableElement,
    isEligibleInput,
    findCandidates,
    filterEligibleInputs,
    getInputText,
    setInputText
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
