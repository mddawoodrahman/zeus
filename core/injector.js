(function (scope) {
  if (scope.ZeusInjector) return;
  function create(onEnhance) {
    const host = document.createElement('zeus-composer-root');
    host.dataset.zeusOwner = scope.chrome?.runtime?.id || 'zeus';
    const shadow = host.attachShadow({ mode: 'closed' });
    // Keep below site dialogs. The positioner also verifies the composed hit target.
    const style = document.createElement('style');
    style.textContent = `
      :host { all:initial !important; position:fixed !important; inset:0 !important;
        display:block !important; margin:0 !important; padding:0 !important; border:0 !important;
        pointer-events:none !important; overflow:clip !important; z-index:1000 !important; }
      *, *::before, *::after { box-sizing:border-box }
      .surface { --bg:#fff; --fg:#222428; --border:#9da1a6; --bolt:#765900;
        color:var(--fg); font:14px/1.45 system-ui,sans-serif; color-scheme:light; }
      .surface.dark { --bg:#27292d; --fg:#f4f4f5; --border:#6d7178; --bolt:#ffdc54; color-scheme:dark; }
      button,dialog,textarea { font:inherit; color:var(--fg); background:var(--bg); }
      button { pointer-events:auto; cursor:pointer; border:1px solid var(--border); border-radius:8px; padding:5px 10px; }
      button:focus-visible,textarea:focus-visible { outline:3px solid #1482a0; outline-offset:2px; }
      .action { position:absolute; top:0; left:0; width:34px; height:34px; visibility:hidden;
        display:grid; place-items:center; padding:0; color:var(--bolt); transition:background-color .12s; }
      .action:hover { background:color-mix(in srgb,var(--bg) 89%,var(--bolt)); }
      svg { width:19px; height:19px; fill:currentColor; }
      .indicator { position:absolute; right:2px; bottom:2px; width:7px; height:7px; border-radius:50%; }
      [data-state=processing] .indicator { border:2px solid var(--border); border-top-color:transparent; animation:spin .75s linear infinite; }
      [data-state=success] .indicator { background:#20883b; }
      [data-state=error] .indicator { background:#ce3c52; }
      @keyframes spin { to { transform:rotate(360deg); } }
      @media(prefers-reduced-motion:reduce) { * { animation:none!important; transition:none!important; } }
      .notice { position:absolute; left:0; top:0; width:max-content; max-width:min(36ch,90vw);
        background:var(--bg); border-radius:8px; box-shadow:0 2px 10px #0002; }
      .notice.minimized { clip-path:inset(50%); pointer-events:none }
      [role=status]:not(:empty) { display:block; padding:8px 12px; }
      dialog { pointer-events:auto; width:min(32rem,90vw); border:1px solid var(--border); border-radius:12px; }
      dialog textarea { width:100%; min-height:12em; display:block; margin:8px 0; }
      dialog button + button { margin-inline-start:8px; }
    `;
    function make(tag, cls, parent) {
      const node = document.createElement(tag);
      if (cls) node.className = cls;
      parent.append(node);
      return node;
    }
    shadow.append(style);
    const surface = make('div', 'surface', shadow);
    const button = make('button', 'action', surface);
    button.type = 'button';
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', 'M14.8 1 3.6 14h7.2L9.2 23 20.4 10h-7.2z');
    svg.append(path);
    button.append(svg);
    make('span', 'indicator', button);
    const notice = make('div', 'notice', surface);
    const status = make('span', '', notice);
    status.setAttribute('role', 'status');
    status.id = 'status';
    button.setAttribute('aria-describedby', status.id);
    const review = make('button', '', notice);
    review.textContent = 'Review enhanced prompt';
    review.hidden = true;
    const dialog = make('dialog', '', surface);
    dialog.setAttribute('aria-label', 'Enhanced prompt preview');
    const label = make('label', '', dialog);
    label.textContent = 'Enhanced prompt';
    const preview = make('textarea', '', label);
    preview.readOnly = true;
    const originalLabel = make('label', '', dialog);
    originalLabel.textContent = 'Original draft';
    const originalDraft = make('textarea', '', originalLabel);
    originalDraft.readOnly = true;
    const copy = make('button', '', dialog);
    copy.textContent = 'Copy prompt';
    const close = make('button', '', dialog);
    close.textContent = 'Close';
    review.onclick = () => {
      dialog.showModal();
      preview.focus();
      preview.select();
    };
    copy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(preview.value);
        copy.textContent = 'Copied';
      } catch {
        preview.focus();
        preview.select();
        copy.textContent = 'Use the copy shortcut';
      }
    };
    close.onclick = () => dialog.close();
    dialog.onclose = () => {
      if (dialog.open || review.hidden) return;
      reset();
      copy.textContent = 'Copy prompt';
      if (button.style.visibility === 'visible') button.focus({ preventScroll: true });
    };
    const overlays = make('div', '', surface);
    let editor = null,
      adapter = null,
      composer = null,
      positioner = null,
      editorEvents = null,
      timer;
    function placeNotice() {
      if (!status.textContent || !editor || !document.elementsFromPoint) return;
      const view = scope.ZeusFloatingPosition.viewport();
      const size = notice.getBoundingClientRect(),
        draft = composer.getBoundingClientRect();
      const action = button.getBoundingClientRect();
      const blocked = [draft, action];
      const gap = 8;
      const left = view.left + gap,
        right = view.right - size.width - gap;
      const top = view.top + gap,
        bottom = view.bottom - size.height - gap;
      const aligned = Math.max(left, Math.min(right, action.right - size.width));
      const places = [
        [aligned, draft.top - size.height - gap],
        [aligned, draft.bottom + gap],
        [right, top],
        [left, top],
        [right, bottom],
        [left, bottom]
      ];
      for (const [x, y] of places) {
        const rect = { left: x, top: y, right: x + size.width, bottom: y + size.height };
        if (
          x < left ||
          x > right ||
          y < top ||
          y > bottom ||
          blocked.some((other) => scope.ZeusFloatingPosition.intersects(rect, other, 4))
        )
          continue;
        const free = [x + 1, x + size.width / 2, rect.right - 1].every((px) =>
          [y + 1, y + size.height / 2, rect.bottom - 1].every((py) => {
            const el = document.elementsFromPoint(px, py).find((n) => n !== host);
            return (
              el && !el.closest(scope.ZeusDomUtils.interactive) && getComputedStyle(el).cursor !== 'pointer'
            );
          })
        );
        if (!free) continue;
        notice.style.left = x + 'px';
        notice.style.top = y + 'px';
        notice.classList.remove('minimized');
        review.tabIndex = 0;
        return;
      }
      notice.classList.add('minimized');
      review.tabIndex = -1;
    }
    function reset() {
      clearTimeout(timer);
      if (dialog.open) dialog.close();
      preview.value = '';
      originalDraft.value = '';
      originalLabel.hidden = true;
      review.hidden = true;
      notice.classList.remove('minimized');
      status.textContent = '';
      button.dataset.state = 'idle';
      button.setAttribute('aria-busy', 'false');
      button.setAttribute('aria-disabled', 'false');
      button.title =
        editor && !adapter.getCapabilities(editor).canReplace
          ? 'Enhance with Zeus and review a copy'
          : 'Enhance prompt with Zeus';
      button.setAttribute('aria-label', button.title);
    }
    function state(name, message, duration = 0, result, original) {
      clearTimeout(timer);
      button.dataset.state = name;
      button.setAttribute('aria-busy', String(name === 'processing'));
      button.setAttribute('aria-disabled', String(name === 'processing' || name === 'disabled'));
      status.textContent = message;
      if (result !== undefined) {
        preview.value = result;
        originalLabel.hidden = original === undefined;
        originalDraft.value = original ?? '';
        review.hidden = false;
      }
      if (!review.hidden) {
        button.title = 'Review enhanced prompt';
        button.setAttribute('aria-label', button.title);
      }
      placeNotice();
      if (duration) timer = setTimeout(reset, duration);
    }
    function theme() {
      let dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches || false;
      for (let el = editor; el; el = el.parentElement || el.getRootNode().host) {
        const rgb = getComputedStyle(el)
          .backgroundColor.match(/^rgba?\(([^)]+)\)/)?.[1]
          .split(',')
          .map(Number);
        if (rgb && (rgb.length === 3 || rgb[3] >= 0.8)) {
          dark = rgb[0] * 0.21 + rgb[1] * 0.72 + rgb[2] * 0.07 < 135;
          break;
        }
      }
      surface.classList.toggle('dark', dark);
      surface.dir = editor ? getComputedStyle(editor).direction : 'auto';
    }
    function bind(next, site) {
      if (next === editor && host.isConnected) {
        theme();
        positioner?.refresh();
        return;
      }
      positioner?.destroy();
      editorEvents?.abort();
      positioner = null;
      const changed = editor !== next;
      editor = next;
      adapter = site;
      composer = next;
      if (changed || !editor) reset();
      button.style.visibility = 'hidden';
      if (!next) {
        host.remove();
        return;
      }
      for (const orphan of document.documentElement.querySelectorAll(
        ':scope > zeus-composer-root[data-zeus-owner]'
      )) {
        if (orphan !== host && orphan.dataset.zeusOwner === host.dataset.zeusOwner) orphan.remove();
      }
      document.documentElement.append(host);
      theme();
      editorEvents = new AbortController();
      const options = { signal: editorEvents.signal };
      editor.addEventListener(
        'compositionstart',
        () => {
          if (button.dataset.state === 'idle' && review.hidden)
            state('disabled', 'Finish composing your text to enhance it.');
        },
        options
      );
      const finishComposition = () => {
        if (button.dataset.state === 'disabled') reset();
      };
      editor.addEventListener('compositionend', finishComposition, options);
      editor.addEventListener('blur', finishComposition, options);
      positioner = scope.ZeusFloatingPosition.create(button, editor, adapter, host, (root) => {
        composer = root;
        placeNotice();
      });
    }
    button.onmousedown = (e) => e.preventDefault();
    button.onclick = () => {
      if (!review.hidden) {
        review.click();
        return;
      }
      if (editor && button.getAttribute('aria-disabled') !== 'true') onEnhance(editor);
    };
    reset();
    return {
      host,
      button,
      overlays,
      bind,
      state,
      reset,
      reposition: () => positioner?.schedule(),
      destroy() {
        bind(null, null);
        host.remove();
      }
    };
  }
  scope.ZeusInjector = Object.freeze({ create });
})(globalThis);
