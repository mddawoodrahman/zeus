(function (scope) {
  if (scope.ZeusEditorBridge) return;
  const native = (el) => el.matches('textarea, input');
  const composing = new WeakSet();
  const versions = new WeakMap();
  function record(event) {
    const el = event.composedPath()[0];
    versions.set(el, version(el) + 1);
    if (event.type === 'compositionstart') composing.add(el);
    if (event.type === 'compositionend' || event.type === 'focusout') composing.delete(el);
  }
  const version = (el) => versions.get(el) || 0;

  // Hidden tabs can suspend animation frames indefinitely. Release the pending
  // verification so its caller can discard a suspended or disconnected target.
  function afterRender() {
    return new Promise((resolve) => {
      const timeout = setTimeout(done, 200);
      let frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(done);
      });
      function done() {
        clearTimeout(timeout);
        cancelAnimationFrame(frame);
        resolve();
      }
    });
  }

  function read(el) {
    if (native(el)) return el.value;
    // Paragraph separators in ProseMirror are model newlines. innerText can
    // introduce an extra blank line between paragraphs because of their CSS.
    if (el.matches('.ProseMirror,.ql-editor') && [...el.children].every((p) => p.tagName === 'P')) {
      return [...el.children].map((p) => p.innerText?.replace(/\n$/, '') ?? p.textContent).join('\n');
    }
    return el.innerText ?? el.textContent;
  }

  function capabilities(el) {
    let kind = 'preview';
    if (native(el)) kind = 'native';
    else if (!el.querySelector('[contenteditable], button, img, a, input, [role=button]')) {
      if (el.matches('.ProseMirror') && !el.querySelector(':not(p, br)')) kind = 'prosemirror';
      else if (el.matches('.ql-editor') && !el.querySelector(':not(p, br)')) kind = 'quill';
      else if (el.contentEditable === 'plaintext-only') kind = 'plaintext';
    }
    return { kind, canReplace: kind !== 'preview' };
  }

  async function write(el, value, kind, current) {
    const finish = (accepted) => ({ accepted, revision: version(el) });
    if (kind === 'native') {
      const event = new InputEvent('beforeinput', {
        bubbles: true,
        composed: true,
        cancelable: true,
        inputType: 'insertReplacementText',
        data: value
      });
      const before = read(el),
        revision = version(el);
      if (
        !el.dispatchEvent(event) ||
        !current() ||
        composing.has(el) ||
        read(el) !== before ||
        version(el) !== revision
      )
        return finish(false);
      const prototype = el.matches('textarea') ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(el, value);
      el.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          composed: true,
          inputType: 'insertReplacementText',
          data: value
        })
      );
      return finish(true);
    }

    el.focus({ preventScroll: true });
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    if (el.firstElementChild?.tagName === 'P' && el.lastElementChild?.tagName === 'P') {
      range.setStart(el.firstElementChild, 0);
      range.setEnd(el.lastElementChild, el.lastElementChild.childNodes.length);
    }
    const original = read(el),
      revision = version(el);
    const selectedText = range.toString();
    selection.removeAllRanges();
    selection.addRange(range);
    // Model-backed paste handlers consult their own selection. Let the browser
    // deliver selectionchange before dispatching paste, and recheck the draft.
    await afterRender();
    if (
      !current() ||
      composing.has(el) ||
      version(el) !== revision ||
      read(el) !== original ||
      !el.matches(':focus') ||
      selection.toString() !== selectedText
    )
      return finish(false);
    if (!selection.rangeCount || !el.contains(selection.anchorNode) || !el.contains(selection.focusNode))
      return finish(false);
    if (kind === 'plaintext') return finish(document.execCommand('insertText', false, value));
    // Let the site's paste handler parse plain text and dispatch its own model transaction.
    const data = new DataTransfer();
    data.setData('text/plain', value);
    return finish(
      !el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
    );
  }

  async function replace(el, value, current = () => el.isConnected, caret) {
    const { kind, canReplace } = capabilities(el);
    if (!canReplace || composing.has(el) || !current() || typeof value !== 'string') return false;
    if (el.matches('input') && /[\r\n]/.test(value)) return false;
    if (native(el) && el.maxLength >= 0 && value.length > el.maxLength) return false;
    const original = read(el);
    const selection = native(el) ? [el.selectionStart, el.selectionEnd, el.selectionDirection] : null;
    const previousRange =
      !selection && window.getSelection()?.rangeCount
        ? window.getSelection().getRangeAt(0).cloneRange()
        : null;
    const startRevision = version(el);
    const { accepted, revision } = await write(el, value, kind, current);
    const afterWrite = read(el);
    if (!accepted && revision !== startRevision) return false;
    // Give controlled inputs and editor views a render opportunity before acknowledging success.
    await afterRender();
    if (!current() || composing.has(el) || version(el) !== revision) return false;
    if (accepted && read(el) === value) {
      if (selection) el.setSelectionRange(caret ?? selection[0], caret ?? selection[1], selection[2]);
      return true;
    }
    // A silent value change after the edit can be a new application draft.
    // Only roll back a value still owned by this transaction.
    if (accepted && read(el) === afterWrite && afterWrite !== original)
      await write(el, original, kind, current);
    if (selection) el.setSelectionRange(...selection);
    else if (previousRange?.commonAncestorContainer.isConnected) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(previousRange);
    }
    return false;
  }

  // Copilot only offers suffixes at a collapsed end caret, so it never
  // obscures existing text and never deletes a selection on acceptance.
  function atEnd(el) {
    if (composing.has(el) || !el.matches(':focus')) return false;
    if (native(el)) return el.selectionStart === el.value.length && el.selectionEnd === el.selectionStart;
    const sel = window.getSelection();
    if (!sel?.isCollapsed || !sel.rangeCount || !el.contains(sel.anchorNode)) return false;
    const tail = sel.getRangeAt(0).cloneRange();
    tail.setEnd(el, el.childNodes.length);
    const block =
      sel.anchorNode.nodeType === Node.ELEMENT_NODE ? sel.anchorNode : sel.anchorNode.parentElement;
    const paragraph = block.closest('p, div');
    if (paragraph && paragraph !== el && paragraph.nextElementSibling) return false;
    return !tail.toString() && !tail.cloneContents().querySelector('br:not(.ProseMirror-trailingBreak)');
  }

  scope.ZeusEditorBridge = Object.freeze({
    read,
    capabilities,
    replace,
    atEnd,
    version,
    isComposing: (el) => composing.has(el),
    observe(signal) {
      for (const type of ['input', 'compositionstart', 'compositionend', 'focusout']) {
        document.addEventListener(type, record, { capture: true, signal });
      }
    }
  });
})(globalThis);
