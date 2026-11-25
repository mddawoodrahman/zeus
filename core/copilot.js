(function (scope) {
  if (scope.ZeusCopilot) return;
  const bridge = scope.ZeusEditorBridge;
  let binding;
  function init(editor, settings, layer) {
    if (binding?.editor === editor && binding.settings === settings) return;
    destroy();
    if (!settings?.copilotEnabled || !bridge.capabilities(editor).canReplace) return;
    const overlay = scope.ZeusGhostText.create(editor, layer);
    const controller = new AbortController();
    const { signal } = controller;
    let timer,
      port,
      suggestion = '',
      original,
      revision,
      paused = false;
    function stopPort(abort) {
      const old = port;
      port = null;
      if (!old) return;
      try {
        if (abort) old.postMessage({ type: 'copilot:abort' });
      } catch {}
      try {
        old.disconnect();
      } catch {}
    }
    function reset() {
      clearTimeout(timer);
      stopPort(true);
      original = undefined;
      suggestion = '';
      overlay.setText('');
      paused = false;
      overlay.paused(false);
    }
    function sensitive(text) {
      return (
        settings.redactionEnabled !== false &&
        (!scope.ZeusRedactor || scope.ZeusRedactor.hasSensitive(text, settings))
      );
    }
    function pause() {
      reset();
      paused = true;
      overlay.paused(true);
    }
    function current() {
      return (
        !signal.aborted &&
        editor.isConnected &&
        bridge.atEnd(editor) &&
        original === bridge.read(editor) &&
        revision === bridge.version(editor)
      );
    }
    function fetchSuggestion() {
      if (!current()) return reset();
      if (sensitive(original)) return pause();
      try {
        const stream = chrome.runtime.connect({ name: 'copilot-stream' });
        port = stream;
        stream.onMessage.addListener((msg) => {
          if (port !== stream) return;
          if (sensitive(bridge.read(editor)) || msg.type === 'paused') return pause();
          if (!current()) return reset();
          if (msg.type === 'chunk') {
            suggestion += msg.text;
            overlay.setText(suggestion);
          } else if (msg.type === 'done') stopPort(false);
          else if (msg.type === 'error') reset();
        });
        stream.onDisconnect.addListener(() => {
          if (port === stream) reset();
        });
        stream.postMessage({
          type: 'copilot:start',
          text: original,
          cursorPos: original.length,
          settings: {
            copilotMode: settings.copilotMode,
            copilotProvider: settings.copilotProvider,
            copilotMaxTokens: settings.copilotMaxTokens,
            customRedactionPatterns: settings.customRedactionPatterns,
            redactionEnabled: settings.redactionEnabled
          }
        });
      } catch {
        reset();
      }
    }
    let accepting = false;
    function input(event) {
      reset();
      if (accepting) return;
      if (event.isComposing || bridge.isComposing(editor)) return;
      original = bridge.read(editor);
      if (sensitive(original)) return pause();
      if (!bridge.atEnd(editor) || original.length < 10) return;
      revision = bridge.version(editor);
      timer = setTimeout(fetchSuggestion, settings.copilotMode === 'aggressive' ? 400 : 800);
    }
    function keydown(event) {
      if (event.isComposing || event.keyCode === 229) return reset();
      if (
        event.key === 'Tab' &&
        !event.shiftKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.metaKey &&
        suggestion &&
        current() &&
        overlay.position()
      ) {
        const value = original + suggestion;
        reset();
        event.preventDefault();
        event.stopPropagation();
        accepting = true;
        bridge
          .replace(editor, value, () => !signal.aborted && editor.isConnected, value.length)
          .catch(reset)
          .finally(() => {
            accepting = false;
          });
      } else if (!['Shift', 'Alt', 'Control', 'Meta'].includes(event.key)) {
        if (event.key === 'Escape' && suggestion && current() && overlay.position()) {
          event.preventDefault();
          event.stopPropagation();
        }
        reset();
      }
    }
    function reposition() {
      if (original !== undefined && !current()) reset();
      else if (suggestion) overlay.position();
    }
    editor.addEventListener('input', input, { signal });
    editor.addEventListener('keydown', keydown, { signal, capture: true });
    for (const type of ['blur', 'compositionstart', 'pointerdown'])
      editor.addEventListener(type, reset, { signal });
    document.addEventListener('selectionchange', reposition, { signal });
    window.addEventListener('scroll', reposition, { capture: true, passive: true, signal });
    window.addEventListener('resize', reposition, { signal });
    for (const type of ['resize', 'scroll'])
      window.visualViewport?.addEventListener(type, reposition, { signal });
    const resize = typeof ResizeObserver === 'function' && new ResizeObserver(reposition);
    resize && resize.observe(editor);
    binding = {
      editor,
      settings,
      paused: () => paused,
      destroy() {
        controller.abort();
        reset();
        overlay.destroy();
        resize && resize.disconnect();
      }
    };
  }
  function destroy() {
    binding?.destroy();
    binding = null;
  }
  scope.ZeusCopilot = Object.freeze({
    init,
    destroy,
    isPaused: (el) => !!binding && (!el || binding.editor === el) && binding.paused()
  });
})(globalThis);
