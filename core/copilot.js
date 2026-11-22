(function initZeusCopilot(globalScope) {
  const domUtils = globalScope.ZeusDomUtils;
  const ghostText = globalScope.ZeusGhostText;

  if (!domUtils || !ghostText) return;

  let activeAdapter = null;
  let settings = null;
  let activePort = null;
  let activeInput = null;
  let activeSuggestion = '';
  let cursorPos = 0;
  let debounceTimer = null;
  let isSensitivePaused = false;
  let activeAbortController = null;
  const inputCleanups = new Map();
  let pausedInputs = new WeakSet();

  function isSensitive(text) {
    const redactor = globalScope.ZeusRedactor;
    if (!redactor || typeof redactor.hasSensitive !== 'function') return false;
    if (settings && settings.redactionEnabled === false) return false;
    return redactor.hasSensitive(text, {
      redactionEnabled: settings ? settings.redactionEnabled !== false : true,
      customRedactionPatterns: settings?.customRedactionPatterns
    });
  }

  function showPausedIndicator(input) {
    if (!input) return;
    pausedInputs.add(input);
    if (ghostText && typeof ghostText.showPausedIndicator === 'function') {
      ghostText.showPausedIndicator(input);
    }
  }

  function hidePausedIndicator(input) {
    if (input) {
      pausedInputs.delete(input);
    } else {
      pausedInputs = new WeakSet();
    }
    if (ghostText && typeof ghostText.hidePausedIndicator === 'function') {
      ghostText.hidePausedIndicator();
    }
  }

  function abortStream() {
    if (activeAbortController) {
      try {
        activeAbortController.abort();
      } catch (_) {}
      activeAbortController = null;
    }
    if (activePort) {
      try {
        activePort.postMessage({ type: 'copilot:abort' });
      } catch (_) {}
      try {
        activePort.disconnect();
      } catch (_) {}
      activePort = null;
    }
  }

  function init(adapter, initialSettings) {
    activeAdapter = adapter;
    settings = initialSettings;
    refreshTargets();
  }

  function reconfigure(newSettings) {
    settings = newSettings;
    if (!settings?.copilotEnabled) {
      destroy();
    } else {
      refreshTargets();
    }
  }

  function getEligibleInputs() {
    if (!activeAdapter) return [];
    const selectors = activeAdapter.inputSelectors || domUtils.DEFAULT_INPUT_SELECTORS;
    let inputs = domUtils.findCandidates(selectors, document);
    inputs = domUtils.filterEligibleInputs(inputs);
    if (typeof activeAdapter.pickInputs === 'function') {
      inputs = domUtils.filterEligibleInputs(activeAdapter.pickInputs(inputs));
    }
    return inputs;
  }

  function refreshTargets() {
    if (!settings?.copilotEnabled) return;

    const currentInputs = getEligibleInputs();
    
    // Remove listeners from inputs that are no longer eligible or connected
    for (const [input, cleanup] of inputCleanups.entries()) {
      if (!currentInputs.includes(input) || !input.isConnected) {
        cleanup();
        inputCleanups.delete(input);
      }
    }

    // Attach listeners to new eligible inputs
    for (const input of currentInputs) {
      if (!inputCleanups.has(input)) {
        attachToInput(input);
      }
    }
  }

  function attachToInput(input) {
    const handleInput = (event) => onInput(input, event);
    const handleKeydown = (event) => onKeydown(input, event);
    const handleBlur = () => reject();
    const handleScroll = () => {
      if (activeSuggestion) {
        ghostText.positionOverlay(input);
      }
    };
    const handleClick = () => reject();

    input.addEventListener('input', handleInput);
    input.addEventListener('keydown', handleKeydown);
    input.addEventListener('blur', handleBlur);
    input.addEventListener('scroll', handleScroll);
    input.addEventListener('click', handleClick);

    inputCleanups.set(input, () => {
      input.removeEventListener('input', handleInput);
      input.removeEventListener('keydown', handleKeydown);
      input.removeEventListener('blur', handleBlur);
      input.removeEventListener('scroll', handleScroll);
      input.removeEventListener('click', handleClick);
    });
  }

  function onInput(input, event) {
    clearTimeout(debounceTimer);
    debounceTimer = null;

    const value = domUtils.getInputText(input);
    const hasSensitiveData = isSensitive(value);

    if (hasSensitiveData) {
      isSensitivePaused = true;
      // Immediately abort active streams and suppress in-flight chunks
      abortStream();
      ghostText.hide();
      ghostText.destroy();
      activeSuggestion = '';
      showPausedIndicator(input);
      return;
    }

    // Automatically clear the pause state and indicator when sensitive text is removed
    if (isSensitivePaused || pausedInputs.has(input)) {
      isSensitivePaused = false;
      hidePausedIndicator(input);
    }

    if (value.length < 10) {
      reject();
      return;
    }

    const pos = input.tagName === 'TEXTAREA' ? input.selectionStart : value.length;

    // Reject current suggestion on typing
    if (activeSuggestion || activePort) {
      reject();
    }

    const delay = settings?.copilotMode === 'aggressive' ? 400 : 800;
    debounceTimer = setTimeout(() => {
      fetchSuggestion(input, value, pos);
    }, delay);
  }

  function fetchSuggestion(input, text, pos) {
    const currentVal = domUtils.getInputText(input);
    if (isSensitive(text) || isSensitive(currentVal)) {
      isSensitivePaused = true;
      showPausedIndicator(input);
      reject();
      return;
    }

    reject();

    activeInput = input;
    cursorPos = pos;
    activeSuggestion = '';

    if (activeAbortController) {
      try {
        activeAbortController.abort();
      } catch (_) {}
    }
    activeAbortController = new AbortController();
    const currentAbortController = activeAbortController;

    ghostText.createOverlay(input);

    try {
      activePort = chrome.runtime.connect({ name: 'copilot-stream' });
      const currentPort = activePort;
      
      activePort.onMessage.addListener((msg) => {
        // Suppress stale chunks if stream was aborted, port disconnected, or input changed
        if (!activePort || activePort !== currentPort || activeInput !== input) return;
        if (currentAbortController.signal.aborted) return;

        // Verify current text in the input has not become sensitive in the interim
        const latestVal = domUtils.getInputText(input);
        if (isSensitive(latestVal)) {
          isSensitivePaused = true;
          abortStream();
          ghostText.hide();
          ghostText.destroy();
          activeSuggestion = '';
          showPausedIndicator(input);
          return;
        }

        if (msg.type === 'chunk') {
          activeSuggestion += msg.text;
          ghostText.setText(activeSuggestion);
          ghostText.show();
        } else if (msg.type === 'paused') {
          isSensitivePaused = true;
          abortStream();
          ghostText.hide();
          ghostText.destroy();
          activeSuggestion = '';
          showPausedIndicator(input);
        } else if (msg.type === 'done') {
          cleanupPort();
        } else if (msg.type === 'error') {
          reject();
        }
      });

      activePort.onDisconnect.addListener(() => {
        if (activePort === currentPort) {
          cleanupPort();
        }
      });

      activePort.postMessage({
        type: 'copilot:start',
        text: text,
        cursorPos: pos,
        settings: {
          copilotMode: settings?.copilotMode,
          copilotProvider: settings?.copilotProvider,
          copilotMaxTokens: settings?.copilotMaxTokens,
          redactionEnabled: settings?.redactionEnabled,
          customRedactionPatterns: settings?.customRedactionPatterns
        }
      });
    } catch (_) {
      reject();
    }
  }

  function onKeydown(input, event) {
    if (!activeSuggestion) return;

    if (event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      accept();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      reject();
    } else if (!['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) {
      // Type through dismisses suggestion
      reject();
    }
  }

  function accept() {
    if (!activeInput || !activeSuggestion) return;

    const input = activeInput;
    const suggestion = activeSuggestion;
    
    reject(); // Clear ghost and ports

    if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
      const val = input.value;
      input.value = val.slice(0, cursorPos) + suggestion + val.slice(cursorPos);
      input.selectionStart = input.selectionEnd = cursorPos + suggestion.length;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (input.isContentEditable) {
      input.focus();
      try {
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          range.deleteContents();
          const textNode = document.createTextNode(suggestion);
          range.insertNode(textNode);
          
          // Move cursor after the inserted text
          range.setStartAfter(textNode);
          range.setEndAfter(textNode);
          selection.removeAllRanges();
          selection.addRange(range);
          
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      } catch (_) {
        // Fallback simple insert
        const val = domUtils.getInputText(input);
        domUtils.setInputText(input, val + suggestion);
      }
    }
  }

  function cleanupPort() {
    if (activePort) {
      try {
        activePort.disconnect();
      } catch (_) {}
      activePort = null;
    }
  }

  function reject() {
    clearTimeout(debounceTimer);
    debounceTimer = null;
    abortStream();
    ghostText.hide();
    ghostText.destroy();
    activeInput = null;
    activeSuggestion = '';
    cursorPos = 0;
  }

  function destroy() {
    reject();
    hidePausedIndicator();
    isSensitivePaused = false;
    pausedInputs = new WeakSet();
    for (const cleanup of inputCleanups.values()) {
      cleanup();
    }
    inputCleanups.clear();
    activeAdapter = null;
    settings = null;
  }

  globalScope.ZeusCopilot = Object.freeze({
    init,
    reconfigure,
    refreshTargets,
    destroy,
    isPaused: (input) => input ? pausedInputs.has(input) : isSensitivePaused,
    getPausedIndicator: () => {
      if (ghostText && typeof ghostText.getPausedIndicator === 'function') {
        const ind = ghostText.getPausedIndicator();
        if (ind) return ind;
      }
      return document.querySelector('.zeus-copilot-paused');
    },
    abortStream,
    triggerSuggestion: fetchSuggestion
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
