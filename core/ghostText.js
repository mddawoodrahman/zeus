(function initZeusGhostText(globalScope) {
  let overlay = null;
  let currentTarget = null;
  let mirrorDiv = null;
  let pausedIndicator = null;

  function createMirrorDiv() {
    if (mirrorDiv) return;
    mirrorDiv = document.createElement('div');
    mirrorDiv.style.position = 'absolute';
    mirrorDiv.style.visibility = 'hidden';
    mirrorDiv.style.pointerEvents = 'none';
    mirrorDiv.style.top = '-9999px';
    mirrorDiv.style.left = '-9999px';
    mirrorDiv.style.whiteSpace = 'pre-wrap';
    mirrorDiv.style.wordBreak = 'break-word';
    document.body.appendChild(mirrorDiv);
  }

  function getCaretCoordinates(textarea) {
    createMirrorDiv();
    const style = window.getComputedStyle(textarea);
    
    const properties = [
      'fontFamily', 'fontSize', 'fontWeight', 'lineHeight',
      'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
      'borderWidth', 'borderStyle', 'boxSizing', 'width', 'textIndent',
      'letterSpacing', 'textTransform', 'wordSpacing'
    ];
    for (const prop of properties) {
      mirrorDiv.style[prop] = style[prop];
    }
    
    mirrorDiv.style.overflowY = 'auto';

    const textBeforeCaret = textarea.value.slice(0, textarea.selectionStart);
    mirrorDiv.textContent = textBeforeCaret;

    const span = document.createElement('span');
    span.textContent = '\u200b'; // zero-width space
    mirrorDiv.appendChild(span);

    mirrorDiv.scrollTop = textarea.scrollTop;

    const textareaRect = textarea.getBoundingClientRect();
    const spanRect = span.getBoundingClientRect();
    const mirrorRect = mirrorDiv.getBoundingClientRect();

    const relativeLeft = spanRect.left - mirrorRect.left;
    const relativeTop = spanRect.top - mirrorRect.top;

    return {
      left: textareaRect.left + relativeLeft + window.scrollX - textarea.scrollLeft,
      top: textareaRect.top + relativeTop + window.scrollY - textarea.scrollTop,
      height: parseFloat(style.lineHeight) || 16
    };
  }

  function createOverlay(inputElement) {
    destroy();
    currentTarget = inputElement;

    overlay = document.createElement('div');
    overlay.className = 'zeus-ghost';
    overlay.setAttribute('contenteditable', 'false');
    overlay.style.position = 'absolute';
    overlay.style.pointerEvents = 'none';
    overlay.style.userSelect = 'none';
    overlay.style.webkitUserSelect = 'none';
    overlay.style.zIndex = '2147483647';
    overlay.style.whiteSpace = 'pre-wrap';
    overlay.style.color = '#8A8A8F';
    overlay.style.opacity = '0.65';
    overlay.style.display = 'none';

    if (inputElement.tagName === 'TEXTAREA') {
      document.body.appendChild(overlay);
    } else {
      inputElement.appendChild(overlay);
    }
    
    updateOverlayStyles(inputElement);
  }

  function updateOverlayStyles(inputElement) {
    if (!overlay) return;
    const style = window.getComputedStyle(inputElement);
    overlay.style.fontFamily = style.fontFamily;
    overlay.style.fontSize = style.fontSize;
    overlay.style.lineHeight = style.lineHeight;
    overlay.style.letterSpacing = style.letterSpacing;
  }

  function positionOverlay(inputElement) {
    if (!overlay || !inputElement) return;

    if (inputElement.tagName === 'TEXTAREA') {
      const coords = getCaretCoordinates(inputElement);
      overlay.style.left = `${coords.left}px`;
      overlay.style.top = `${coords.top}px`;
    } else {
      try {
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          const rects = range.getClientRects();
          if (rects.length > 0) {
            const rect = rects[0];
            const parentRect = inputElement.getBoundingClientRect();
            overlay.style.left = `${rect.left - parentRect.left}px`;
            overlay.style.top = `${rect.top - parentRect.top}px`;
          } else {
            const rangeRect = range.getBoundingClientRect();
            const parentRect = inputElement.getBoundingClientRect();
            overlay.style.left = `${rangeRect.left - parentRect.left}px`;
            overlay.style.top = `${rangeRect.top - parentRect.top}px`;
          }
        }
      } catch (_) {
        overlay.style.left = '0px';
        overlay.style.top = '0px';
      }
    }
  }

  function setText(text) {
    if (!overlay) return;
    overlay.textContent = text;
  }

  function show() {
    if (!overlay || !currentTarget) return;
    positionOverlay(currentTarget);
    overlay.style.display = 'block';
  }

  function hide() {
    if (overlay) {
      overlay.style.display = 'none';
    }
  }

  function destroy() {
    if (overlay) {
      overlay.remove();
      overlay = null;
    }
    currentTarget = null;
  }

  function showPausedIndicator(inputElement, text) {
    hidePausedIndicator();
    if (!inputElement) return;

    pausedIndicator = document.createElement('div');
    pausedIndicator.className = 'zeus-copilot-paused zeus-copilot-indicator';
    pausedIndicator.setAttribute('data-zeus-copilot-status', 'paused');
    pausedIndicator.setAttribute('role', 'status');
    pausedIndicator.setAttribute('aria-live', 'polite');
    pausedIndicator.textContent = text || 'Copilot paused (sensitive data)';

    pausedIndicator.style.position = 'absolute';
    pausedIndicator.style.pointerEvents = 'none';
    pausedIndicator.style.userSelect = 'none';
    pausedIndicator.style.webkitUserSelect = 'none';
    pausedIndicator.style.zIndex = '2147483647';
    pausedIndicator.style.fontFamily = 'system-ui, -apple-system, sans-serif';
    pausedIndicator.style.fontSize = '11px';
    pausedIndicator.style.lineHeight = '14px';
    pausedIndicator.style.fontWeight = '500';
    pausedIndicator.style.color = '#F59E0B';
    pausedIndicator.style.backgroundColor = 'rgba(24, 24, 27, 0.9)';
    pausedIndicator.style.border = '1px solid rgba(245, 158, 11, 0.4)';
    pausedIndicator.style.borderRadius = '4px';
    pausedIndicator.style.padding = '2px 6px';
    pausedIndicator.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.25)';
    pausedIndicator.style.display = 'inline-flex';
    pausedIndicator.style.alignItems = 'center';

    try {
      const rect = inputElement.getBoundingClientRect ? inputElement.getBoundingClientRect() : null;
      if (rect && typeof rect.top === 'number' && typeof rect.left === 'number') {
        const top = (window.scrollY || 0) + rect.bottom + 4;
        const left = (window.scrollX || 0) + rect.left;
        pausedIndicator.style.top = `${top}px`;
        pausedIndicator.style.left = `${left}px`;
      }
    } catch (_) {}

    if (inputElement.parentElement) {
      inputElement.parentElement.appendChild(pausedIndicator);
    } else if (document.body) {
      document.body.appendChild(pausedIndicator);
    }
  }

  function hidePausedIndicator() {
    if (pausedIndicator) {
      if (pausedIndicator.parentNode) {
        pausedIndicator.parentNode.removeChild(pausedIndicator);
      }
      pausedIndicator = null;
    }
  }

  function getPausedIndicator() {
    return pausedIndicator;
  }

  globalScope.ZeusGhostText = Object.freeze({
    createOverlay,
    setText,
    show,
    hide,
    destroy,
    positionOverlay,
    showPausedIndicator,
    hidePausedIndicator,
    getPausedIndicator
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
