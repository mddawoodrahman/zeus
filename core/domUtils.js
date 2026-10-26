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
      const attributeValue = String(el.getAttribute('contenteditable') || '').toLowerCase();
      return attributeValue !== 'false';
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

  function collectSearchRoots(rootNode, roots) {
    if (!rootNode || !roots) {
      return;
    }

    roots.push(rootNode);

    const hostCandidates = rootNode.querySelectorAll ? Array.from(rootNode.querySelectorAll('*')) : [];
    for (const host of hostCandidates) {
      if (host?.shadowRoot) {
        collectSearchRoots(host.shadowRoot, roots);
      }
    }
  }

  function findCandidates(selectors, rootNode) {
    const root = rootNode || document;
    const selectorList = Array.isArray(selectors) && selectors.length > 0 ? selectors : DEFAULT_INPUT_SELECTORS;

    const all = [];

    const searchRoots = [];
    collectSearchRoots(root, searchRoots);

    for (const searchRoot of searchRoots) {
      for (const selector of selectorList) {
        try {
          all.push(...Array.from(searchRoot.querySelectorAll(selector)));
        } catch (_) {
          // Skip invalid selectors from custom adapters.
        }
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

  function getActiveElementRecursive() {
    let active = document.activeElement;
    while (active && active.shadowRoot && active.shadowRoot.activeElement) {
      active = active.shadowRoot.activeElement;
    }
    return active;
  }

  function getActiveInputValue() {
    const active = getActiveElementRecursive();
    if (isEligibleInput(active)) {
      return getInputText(active);
    }
    return '';
  }

  function setInputValue(text) {
    const active = getActiveElementRecursive();
    if (isEligibleInput(active)) {
      setInputText(active, text);
      active.dispatchEvent(new InputEvent('input', { bubbles: true }));
      return true;
    }
    return false;
  }

  function filterEligibleInputs(list) {
    const eligible = dedupeElements(list).filter(isEligibleInput);
    debug('eligible inputs', eligible);
    return eligible;
  }

  function extractConversationTurns(rootDoc, options = {}) {
    const doc = rootDoc || (typeof document !== 'undefined' ? document : null);
    if (!doc) return [];

    const maxTurns = Math.max(1, Math.min(10, Number(options.maxTurns) || 4));
    const maxCharsPerTurn = Math.max(100, Math.min(2000, Number(options.maxCharsPerTurn) || 500));
    const maxTotalChars = Math.max(200, Math.min(10000, Number(options.maxTotalChars) || 2000));

    const turns = [];

    const messageSelectors = [
      { selector: '[data-message-author-role]', roleAttr: 'data-message-author-role' },
      { selector: '[class*="font-user-message"], [class*="font-claude-message"], [data-is-streaming]', detectRole: (el) => (el.className && el.className.includes('user') ? 'user' : 'assistant') },
      { selector: 'user-query, model-response', detectRole: (el) => (el.tagName && el.tagName.toLowerCase().includes('user') ? 'user' : 'assistant') },
      { selector: '.chat-message, [class*="message-item"]', detectRole: (el) => (el.className && el.className.includes('user') ? 'user' : 'assistant') },
      { selector: 'article[data-role], [data-role]', roleAttr: 'data-role' }
    ];

    let foundElements = [];

    for (const rule of messageSelectors) {
      try {
        const matches = Array.from(doc.querySelectorAll(rule.selector));
        if (matches.length > 0) {
          foundElements = matches.map((el) => {
            let role = 'user';
            if (rule.roleAttr) {
              const attrVal = String(el.getAttribute(rule.roleAttr) || '').toLowerCase();
              role = attrVal.includes('user') ? 'user' : 'assistant';
            } else if (typeof rule.detectRole === 'function') {
              role = rule.detectRole(el);
            }
            const text = (el.innerText || el.textContent || '').trim();
            return { role, text };
          }).filter((m) => m.text.length > 0);
          break;
        }
      } catch (_) {
        // Fall through to next selector
      }
    }

    if (foundElements.length === 0) {
      return [];
    }

    const recent = foundElements.slice(-maxTurns);
    let totalChars = 0;

    for (let i = recent.length - 1; i >= 0; i--) {
      const item = recent[i];
      let cleanText = item.text.replace(/\s+/g, ' ').trim();
      if (cleanText.length > maxCharsPerTurn) {
        cleanText = cleanText.slice(0, maxCharsPerTurn) + '...';
      }

      if (totalChars + cleanText.length > maxTotalChars && turns.length > 0) {
        break;
      }

      totalChars += cleanText.length;
      turns.unshift({
        role: item.role,
        text: cleanText
      });
    }

    return turns;
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
    setInputText,
    getActiveInputValue,
    setInputValue,
    extractConversationTurns
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
