(function (scope) {
  if (scope.ZeusGhostText) return;
  function create(editor, layer) {
    const mirror = document.createElement('div');
    const ghost = document.createElement('span');
    const pause = document.createElement('span');
    ghost.className = 'zeus-ghost';
    ghost.setAttribute('aria-hidden', 'true');
    pause.className = 'zeus-copilot-paused';
    pause.dataset.zeusCopilotStatus = 'paused';
    pause.setAttribute('role', 'status');
    pause.style.cssText =
      'position:absolute;left:8px;top:8px;background:Canvas;color:CanvasText;padding:3px 6px;border-radius:4px;pointer-events:none';
    ghost.style.cssText =
      'position:absolute;pointer-events:none;user-select:none;white-space:pre;overflow:hidden;opacity:.65;';
    mirror.style.cssText =
      'position:absolute;visibility:hidden;pointer-events:none;left:0;top:0;overflow:hidden;overflow-wrap:break-word;';
    layer.append(mirror, ghost, pause);
    function coordinates(style, rect) {
      if (editor.matches('input,textarea')) {
        for (const prop of [
          'font',
          'direction',
          'textAlign',
          'textIndent',
          'letterSpacing',
          'wordSpacing',
          'tabSize',
          'padding',
          'border',
          'lineHeight'
        ]) {
          mirror.style[prop] = style[prop];
        }
        mirror.style.boxSizing = 'border-box';
        mirror.style.width =
          editor.clientWidth + editor.clientLeft + parseFloat(style.borderRightWidth || 0) + 'px';
        mirror.style.whiteSpace = editor.matches('input,[wrap=off]') ? 'pre' : 'pre-wrap';
        mirror.textContent = editor.value.slice(0, editor.selectionStart);
        const marker = document.createElement('span');
        marker.textContent = '\u200b';
        mirror.append(marker);
        const point = marker.getBoundingClientRect(),
          origin = mirror.getBoundingClientRect();
        return {
          left: rect.left + point.left - origin.left - editor.scrollLeft,
          top: rect.top + point.top - origin.top - editor.scrollTop,
          height: point.height
        };
      }
      const sel = window.getSelection();
      if (sel?.isCollapsed && sel.rangeCount && editor.contains(sel.anchorNode)) {
        return sel.getRangeAt(0).getClientRects?.()[0];
      }
      return null;
    }
    function position() {
      ghost.hidden = true;
      if (!ghost.textContent || !editor.isConnected || !scope.ZeusEditorBridge.atEnd(editor)) return false;
      const style = getComputedStyle(editor),
        rect = editor.getBoundingClientRect();
      const caret = coordinates(style, rect);
      if (!caret?.height || caret.top < rect.top || caret.top + caret.height > rect.bottom + 1) return false;
      const rtl = style.direction === 'rtl';
      const width = rtl
        ? caret.left - rect.left - editor.clientLeft
        : rect.right - caret.left - parseFloat(style.paddingRight || 0);
      if (width < 8 || caret.left < rect.left || caret.left > rect.right) return false;
      const hit = document.elementFromPoint?.(caret.left, caret.top + caret.height / 2);
      if (hit && !editor.contains(hit) && hit !== editor.getRootNode().host) return false;
      Object.assign(ghost.style, {
        font: style.font,
        letterSpacing: style.letterSpacing,
        lineHeight: style.lineHeight,
        color: style.color,
        direction: style.direction,
        textAlign: rtl ? 'right' : 'left',
        left: (rtl ? caret.left - width : caret.left) + 'px',
        top: caret.top + 'px',
        width: width + 'px',
        maxHeight: rect.bottom - caret.top + 'px'
      });
      ghost.hidden = false;
      return true;
    }
    function paused(value) {
      pause.hidden = !value;
      pause.textContent = value ? 'Copilot paused (sensitive data)' : '';
    }
    paused(false);
    ghost.hidden = true;
    return {
      position,
      setText(text) {
        ghost.textContent = text;
        return position();
      },
      paused,
      destroy() {
        mirror.remove();
        ghost.remove();
        pause.remove();
      }
    };
  }
  scope.ZeusGhostText = Object.freeze({ create });
})(globalThis);
