(function initZeusObserver(globalScope) {
  const URL_CHECK_INTERVAL_MS = 700;
  const OBSERVED_ATTRIBUTES = ['class', 'style', 'role', 'contenteditable', 'data-testid'];

  function createDebouncedCallback(callback, delayMs) {
    let timer = null;

    return function trigger() {
      clearTimeout(timer);
      timer = setTimeout(() => {
        callback();
      }, delayMs);
    };
  }

  function nodeMayContainInput(node, selectors) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) {
      return false;
    }

    const element = node;
    for (const selector of selectors) {
      try {
        if (element.matches(selector) || element.querySelector(selector)) {
          return true;
        }
      } catch (_) {
        // Skip invalid selectors.
      }
    }

    return false;
  }

  function mutationMayAffectInputs(mutation, selectors) {
    if (!mutation) {
      return false;
    }

    if (mutation.type === 'childList') {
      for (const node of mutation.addedNodes || []) {
        if (nodeMayContainInput(node, selectors)) {
          return true;
        }
      }

      for (const node of mutation.removedNodes || []) {
        if (nodeMayContainInput(node, selectors)) {
          return true;
        }
      }

      return false;
    }

    if (mutation.type === 'attributes') {
      return nodeMayContainInput(mutation.target, selectors);
    }

    return false;
  }

  function create(options) {
    const selectors = Array.isArray(options?.inputSelectors) ? options.inputSelectors : [];
    const onChange = typeof options?.onChange === 'function' ? options.onChange : () => {};
    const root = options?.root || document.body;
    const debounceMs = Number(options?.debounceMs) > 0 ? Number(options.debounceMs) : 180;

    let lastUrl = location.href;
    let observer = null;
    let urlTimer = null;

    const trigger = createDebouncedCallback(onChange, debounceMs);

    if (root) {
      observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutationMayAffectInputs(mutation, selectors)) {
            trigger();
            return;
          }
        }
      });

      observer.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: OBSERVED_ATTRIBUTES
      });
    }

    const onNavigation = () => trigger();
    window.addEventListener('popstate', onNavigation, { passive: true });
    window.addEventListener('hashchange', onNavigation, { passive: true });

    urlTimer = setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        trigger();
      }
    }, URL_CHECK_INTERVAL_MS);

    return Object.freeze({
      trigger,
      disconnect() {
        if (observer) {
          observer.disconnect();
          observer = null;
        }

        if (urlTimer) {
          clearInterval(urlTimer);
          urlTimer = null;
        }

        window.removeEventListener('popstate', onNavigation);
        window.removeEventListener('hashchange', onNavigation);
      }
    });
  }

  globalScope.ZeusObserver = Object.freeze({
    create
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
