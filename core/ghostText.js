(function initZeusGhostText(globalScope) {
  let overlay = null;
  let currentTarget = null;
  let mirrorDiv = null;

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

    document.body.appendChild(overlay);
    
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

    if (inputElement.tagName === 'TEXTAREA' || inputElement.tagName === 'INPUT') {
      const coords = getCaretCoordinates(inputElement);
      overlay.style.left = `${coords.left}px`;
      overlay.style.top = `${coords.top}px`;
    } else {
      try {
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          const rects = range.getClientRects();
          const targetRect = rects.length > 0 ? rects[0] : range.getBoundingClientRect();
          if (targetRect.width || targetRect.height) {
            overlay.style.left = `${targetRect.right + window.scrollX}px`;
            overlay.style.top = `${targetRect.top + window.scrollY}px`;
          } else {
            const inputRect = inputElement.getBoundingClientRect();
            overlay.style.left = `${inputRect.left + window.scrollX}px`;
            overlay.style.top = `${inputRect.top + window.scrollY}px`;
          }
        } else {
          const inputRect = inputElement.getBoundingClientRect();
          overlay.style.left = `${inputRect.left + window.scrollX}px`;
          overlay.style.top = `${inputRect.top + window.scrollY}px`;
        }
      } catch (_) {
        const inputRect = inputElement.getBoundingClientRect();
        overlay.style.left = `${inputRect.left + window.scrollX}px`;
        overlay.style.top = `${inputRect.top + window.scrollY}px`;
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

  globalScope.ZeusGhostText = Object.freeze({
    createOverlay,
    setText,
    show,
    hide,
    destroy,
    positionOverlay
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
