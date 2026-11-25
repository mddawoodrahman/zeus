(function (scope) {
  if (scope.ZeusObserver) return;
  function create({ onChange, onNavigate, onLayout, root = document.documentElement, debounceMs = 40 }) {
    let timer = null,
      url = location.href;
    function trigger() {
      if (timer === null)
        timer = setTimeout(() => {
          timer = null;
          onChange();
        }, debounceMs);
    }
    function navigation() {
      if (url !== location.href) {
        url = location.href;
        onNavigate?.();
      }
      trigger();
    }
    const selector = scope.ZeusDomUtils.editors;
    function relevant(node) {
      return (
        node.nodeType === 1 &&
        !node.matches('zeus-composer-root') &&
        (node.matches(selector) || !!node.querySelector(selector))
      );
    }
    const observer = new MutationObserver((records) => {
      if (location.href !== url) return navigation();
      const portals = 'dialog,[role=dialog],[role=menu],[role=listbox],[popover],aside,nav';
      if (
        onLayout &&
        records.some(
          (m) =>
            m.target.matches?.(portals) ||
            [...m.addedNodes, ...m.removedNodes].some(
              (n) => n.matches?.(portals) || n.querySelector?.(portals)
            )
        )
      )
        onLayout();
      if (records.some((m) => [...m.removedNodes].some((n) => n.nodeName === 'ZEUS-COMPOSER-ROOT')))
        trigger();
      if (
        records.some((m) =>
          m.type === 'attributes'
            ? relevant(m.target) || m.attributeName === 'contenteditable'
            : [...m.addedNodes, ...m.removedNodes].some(relevant)
        )
      )
        trigger();
    });
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        'contenteditable',
        'hidden',
        'inert',
        'disabled',
        'readonly',
        'aria-hidden',
        'aria-disabled',
        'role',
        'open',
        'style',
        'class',
        'dir',
        'data-theme',
        'placeholder',
        'data-placeholder',
        'data-testid',
        'aria-label',
        'id'
      ]
    });
    const events = new AbortController();
    for (const type of ['popstate', 'hashchange', 'pageshow'])
      window.addEventListener(type, navigation, { signal: events.signal });
    window.navigation?.addEventListener('currententrychange', navigation, { signal: events.signal });
    return {
      trigger,
      disconnect() {
        events.abort();
        clearTimeout(timer);
        observer.disconnect();
      }
    };
  }
  scope.ZeusObserver = Object.freeze({ create });
})(globalThis);
