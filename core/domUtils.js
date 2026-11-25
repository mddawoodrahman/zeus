(function (scope) {
  if (scope.ZeusDomUtils) return;
  const editors =
    'textarea,input[type=text],input:not([type]),[contenteditable=true],[contenteditable=""],[contenteditable=plaintext-only]';
  const interactive =
    'button,a[href],label,select,input,textarea,[contenteditable]:not([contenteditable=false]),[tabindex]:not([tabindex="-1"]),[aria-haspopup],[role=button],[role=combobox],[role=switch],[role=menuitem],summary';
  const excluded =
    '[hidden],[inert],[aria-hidden=true],[aria-disabled=true],[role=search],[role=searchbox],nav,aside,zeus-composer-root';
  const composer = '[data-testid*=composer i],[data-composer],chat-input,form';
  const action = 'button,[role=button],[aria-haspopup],[role=combobox],select,input[type=submit]';
  const bridge = scope.ZeusEditorBridge;
  function activeElement() {
    let el = document.activeElement;
    while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
    return el;
  }
  function available(el) {
    if (
      !el?.isConnected ||
      !el.matches(editors) ||
      el.disabled ||
      el.readOnly ||
      el.closest(excluded) ||
      el.parentElement?.closest('[contenteditable]') ||
      el.querySelector('input,textarea,[contenteditable=true],[contenteditable=plaintext-only]') ||
      el.closest('form')?.querySelector('input[type=password]')
    )
      return false;
    const hints = ['aria-label', 'placeholder', 'data-placeholder', 'name', 'id', 'autocomplete']
      .map((key) => el.getAttribute(key) || '')
      .join(' ');
    if (/search|password|username|e-mail|settings|feedback|rename|filter|contact support/i.test(hints))
      return false;
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return (
      rect.width >= 40 &&
      rect.height >= 20 &&
      style.visibility !== 'hidden' &&
      style.display !== 'none' &&
      (!el.checkVisibility || el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }))
    );
  }

  function* composerAncestors(el) {
    const draft = el.getBoundingClientRect();
    for (let p = el.parentElement; p && !p.matches('body,html,main'); p = p.parentElement) {
      const r = p.getBoundingClientRect();
      if (r.height > draft.height + 240) break;
      if (r.width && r.height && r.bottom > draft.top && r.top < draft.bottom) yield p;
      if (p.matches('form,dialog,[role=dialog]')) break;
    }
  }

  function paintedShell(el) {
    const s = getComputedStyle(el);
    // The chat box can be a plain div, with the editor and toolbar in different branches.
    return parseFloat(s.borderTopLeftRadius) > 0 && (
      parseFloat(s.borderTopWidth) > 0 || (s.boxShadow && s.boxShadow !== 'none') ||
      (s.backgroundColor && !['transparent', 'rgba(0, 0, 0, 0)'].includes(s.backgroundColor)) ||
      (s.backgroundImage && s.backgroundImage !== 'none')
    );
  }

  function visibleAction(el) {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 &&
      (el.checkVisibility ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
        : getComputedStyle(el).visibility === 'visible');
  }

  function register({ id, hosts, signature, roots = composer, sideDock = false, generic = false }) {
    const registry = (scope.ZeusContentAdapters ||= []);
    if (registry.some((adapter) => adapter.id === id)) return;
    function accepts(el) {
      if (!available(el)) return false;
      if (signature && el.matches(signature)) return true;
      const hint = ['aria-label', 'placeholder', 'data-placeholder', 'aria-placeholder']
        .map((k) => el.getAttribute(k) || '')
        .join(' ');
      const explicitRoot = el.closest('[data-composer],[data-testid*=composer i],chat-input');
      const form = el.closest('form');
      const send = form?.querySelector(
        'button[type=submit],button[aria-label*=send i],[data-testid=send-button]'
      );
      return !!(explicitRoot || (/\b(message|prompt|ask|reply|chat)\b/i.test(hint) && (!generic || send)));
    }
    function getComposerRoot(el) {
      let firstActions, surface, semantic;
      for (const parent of composerAncestors(el)) {
        if ([...parent.querySelectorAll(editors)].some((other) => other !== el && available(other))) break;
        if (!firstActions && [...parent.querySelectorAll(action)].some(
          (control) => !el.contains(control) && !control.contains(el) && visibleAction(control)
        )) firstActions = parent;
        if (paintedShell(parent)) {
          if (firstActions) return parent;
          surface ||= parent;
        }
        if (parent.matches(roots)) {
          semantic ||= parent;
          if (firstActions && parent.matches('form') && !surface) return parent;
        }
      }
      return surface || firstActions || semantic || el.parentElement || el;
    }
    function getLayoutRegion(el) {
      // Watch sibling toolbars as they hydrate, including when the initial editor has no actions.
      let region = el.parentElement || el;
      for (const ancestor of composerAncestors(el)) region = ancestor;
      return region;
    }
    function findEditors() {
      const found = [...document.querySelectorAll(editors)].filter(accepts);
      const focused = activeElement();
      if (focused?.getRootNode() instanceof ShadowRoot && accepts(focused)) found.push(focused);
      return found;
    }
    function getActiveEditor(list = findEditors(), previous) {
      const focused = activeElement();
      if (list.includes(focused)) return focused;
      if (focused?.matches('input,textarea,[contenteditable]')) return null;
      if (!generic && list.includes(previous)) return previous;
      return list.length === 1 ? list[0] : null;
    }
    registry.push(
      Object.freeze({
        id,
        sideDock,
        matches(host) {
          if (hosts) return hosts.includes(host);
          return (
            scope.chrome?.runtime
              ?.getManifest?.()
              .content_scripts?.some((script) => script.matches.includes('https://' + host + '/*')) || false
          );
        },
        findEditors,
        getActiveEditor,
        isEditorAvailable: accepts,
        getComposerRoot,
        getLayoutRegion,
        getNativeControls: (root) => [...root.querySelectorAll(interactive)],
        readText: bridge.read,
        replaceText: bridge.replace,
        getCapabilities: bridge.capabilities
      })
    );
  }
  scope.ZeusDomUtils = Object.freeze({ editors, interactive, available, activeElement, register });
})(globalThis);
