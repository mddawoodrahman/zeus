(function (scope) {
  if (scope.ZeusFloatingPosition) return;
  const gap = 6;
  const intersects = (a, b, margin = 0) =>
    a.left < b.right + margin &&
    a.right > b.left - margin &&
    a.top < b.bottom + margin &&
    a.bottom > b.top - margin;
  const contains = (outer, inner, inset = 0) =>
    inner.left >= outer.left + inset &&
    inner.right <= outer.right - inset &&
    inner.top >= outer.top + inset &&
    inner.bottom <= outer.bottom - inset;
  function viewport() {
    const v = window.visualViewport;
    const left = v?.offsetLeft || 0,
      top = v?.offsetTop || 0;
    return {
      left,
      top,
      right: left + (v?.width ?? document.documentElement.clientWidth),
      bottom: top + (v?.height ?? document.documentElement.clientHeight)
    };
  }
  function choose({ editor, root, controls, size, view, rtl, sideDock, clear = () => true }) {
    if (!size.width || !size.height || !intersects(editor, view)) return null;
    const { width, height } = size;
    const start = root.left + gap,
      end = root.right - gap - width;
    const trailing = rtl ? start : end;
    const leading = rtl ? end : start;
    const obstacles = [editor, ...controls];
    const candidates = [];
    function add(x, y, placement) {
      const r = { left: x, top: y, right: x + width, bottom: y + height, placement };
      if (placement !== 'toolbar' || contains(root, r)) candidates.push(r);
    }
    // Try the free spaces next to actual controls, closest to the trailing end first.
    const sorted = [...controls].sort((a, b) => (rtl ? a.left - b.left : b.right - a.right));
    const after = rtl ? root.left - gap - width : root.right + gap;
    const before = rtl ? root.right + gap : root.left - gap - width;
    const row = sorted.find((r) => contains(root, r) && r.top >= editor.bottom - gap)
      || sorted.find((r) => contains(root, r)) || root;
    const rowTop = Math.max(root.top, Math.min(root.bottom - height, (row.top + row.bottom - height) / 2));
    // A compact pill and a two-row composer use the same dock, aligned to their actual controls.
    if (sideDock) add(after, rowTop, 'side');
    for (const control of sorted) {
      const y = (control.top + control.bottom - height) / 2;
      add(rtl ? control.right + gap : control.left - gap - width, y, 'toolbar');
      add(rtl ? control.left - gap - width : control.right + gap, y, 'toolbar');
    }
    if (sideDock) add(before, rowTop, 'side');
    else for (const x of [trailing, leading]) {
        add(x, root.bottom - gap - height, 'toolbar');
        add(x, root.top + gap, 'toolbar');
      }
    for (const x of [trailing, leading]) {
      add(x, root.top - height - gap, 'outside');
      add(x, root.bottom + gap, 'outside');
    }
    if (!sideDock) {
      for (const x of [after, before]) add(x, (root.top + root.bottom - height) / 2, 'outside');
      for (const x of rtl
        ? [view.left + gap, view.right - width - gap]
        : [view.right - width - gap, view.left + gap]) {
        add(x, Math.min(view.bottom - gap - height, Math.max(view.top + gap, editor.bottom - height)), 'edge');
      }
    }
    return (
      candidates.find(
        (r) => contains(view, r, gap) && !obstacles.some((o) => intersects(r, o, gap)) && clear(r)
      ) || null
    );
  }

  function create(button, editor, adapter, host, onPosition) {
    const controller = new AbortController();
    const { signal } = controller;
    let frame = 0,
      visible = true;
    let root, region, layoutDirty = true;
    const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(refresh) : null;
    let controls = [];
    function syncLayout() {
      const nextRoot = adapter.getComposerRoot(editor);
      if (root !== nextRoot) {
        if (root && root !== editor) resize?.unobserve(root);
        root = nextRoot;
        resize?.observe(root);
      }
      const nextRegion = adapter.sideDock ? adapter.getLayoutRegion(editor) : root;
      if (region !== nextRegion) {
        region = nextRegion;
        mutations.disconnect();
        mutations.observe(region, { subtree: true, attributes: true, childList: true, characterData: true });
      }
      const next = adapter.getNativeControls(root).filter((el) => !editor.contains(el) && !el.contains(editor));
      for (const el of controls) if (!next.includes(el)) resize?.unobserve(el);
      for (const el of next) if (!controls.includes(el)) resize?.observe(el);
      controls = next;
    }
    function clear(r) {
      if (!document.elementsFromPoint) return true;
      for (const x of [r.left + 1, (r.left + r.right) / 2, r.right - 1]) {
        for (const y of [r.top + 1, (r.top + r.bottom) / 2, r.bottom - 1]) {
          const el = document.elementsFromPoint(x, y).find((node) => node !== host);
          if (!el || el.closest(scope.ZeusDomUtils.interactive) || getComputedStyle(el).cursor === 'pointer')
            return false;
          if (r.placement === 'toolbar' && !root.contains(el) && el !== editor.getRootNode().host)
            return false;
          if (!(root.contains(el) || el.contains(root) || el === editor.getRootNode().host)) return false;
          if ([...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return false;
        }
      }
      return true;
    }
    function update() {
      frame = 0;
      if (layoutDirty) {
        layoutDirty = false;
        syncLayout();
      }
      const view = viewport();
      const r =
        visible &&
        adapter.isEditorAvailable(editor) &&
        root.isConnected &&
        choose({
          editor: editor.getBoundingClientRect(),
          root: root.getBoundingClientRect(),
          size: button.getBoundingClientRect(),
          controls: controls.map((el) => el.getBoundingClientRect()).filter((box) => box.width && box.height),
          view,
          rtl: getComputedStyle(editor).direction === 'rtl',
          sideDock: adapter.sideDock,
          clear
        });
      button.style.visibility = r ? 'visible' : 'hidden';
      if (!r) {
        onPosition?.(root);
        return;
      }
      button.style.left = r.left + 'px';
      button.style.top = r.top + 'px';
      button.dataset.placement = r.placement;
      // A transformed document root or a higher stacking context can invalidate
      // otherwise sound viewport math. Hide an unreachable button.
      const actual = button.getBoundingClientRect();
      if (
        Math.abs(actual.left - r.left) > 1 ||
        Math.abs(actual.top - r.top) > 1 ||
        (document.elementFromPoint &&
          document.elementFromPoint((actual.left + actual.right) / 2, (actual.top + actual.bottom) / 2) !==
            host)
      ) {
        button.style.visibility = 'hidden';
      }
      onPosition?.(root);
    }
    function schedule() {
      if (!signal.aborted && !frame) frame = requestAnimationFrame(update);
    }
    function refresh() {
      layoutDirty = true;
      schedule();
    }
    const mutations = new MutationObserver((records) => {
      if (
        records.some(
          (m) =>
            m.type === 'attributes' ||
            (m.type === 'childList' && [...m.addedNodes, ...m.removedNodes].some((n) => n.nodeType === 1))
        )
      )
        layoutDirty = true;
      schedule();
    });
    for (const target of [editor, button]) resize?.observe(target);
    const intersection =
      typeof IntersectionObserver === 'function' &&
      new IntersectionObserver((entries) => {
        visible = entries[0].isIntersecting;
        schedule();
      });
    intersection && intersection.observe(editor);
    const shifts =
      scope.PerformanceObserver?.supportedEntryTypes?.includes('layout-shift') &&
      new PerformanceObserver(schedule);
    if (shifts) shifts.observe({ type: 'layout-shift' });
    for (const type of ['resize', 'scroll', 'transitionend', 'animationend']) {
      window.addEventListener(type, type === 'scroll' ? schedule : refresh, { signal, passive: true, capture: true });
    }
    for (const type of ['resize', 'scroll'])
      window.visualViewport?.addEventListener(type, type === 'scroll' ? schedule : refresh, { signal });
    editor.addEventListener('input', schedule, { signal });
    schedule();
    return {
      schedule,
      refresh,
      destroy() {
        controller.abort();
        cancelAnimationFrame(frame);
        mutations.disconnect();
        resize?.disconnect();
        intersection && intersection.disconnect();
        shifts && shifts.disconnect();
      }
    };
  }
  scope.ZeusFloatingPosition = Object.freeze({ choose, create, viewport, intersects });
})(globalThis);
