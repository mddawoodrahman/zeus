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
  const inputCleanups = new Map();

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
    if (value.length < 10) {
      reject();
      return;
    }

    const pos = input.tagName === 'TEXTAREA' ? input.selectionStart : value.length;

    // Reject current suggestion on typing
    if (activeSuggestion) {
      reject();
    }

    const delay = settings.copilotMode === 'aggressive' ? 400 : 800;
    debounceTimer = setTimeout(() => {
      fetchSuggestion(input, value, pos);
    }, delay);
  }

  function fetchSuggestion(input, text, pos) {
    reject();

    activeInput = input;
    cursorPos = pos;
    activeSuggestion = '';

    ghostText.createOverlay(input);

    try {
      activePort = chrome.runtime.connect({ name: 'copilot-stream' });
      
      activePort.onMessage.addListener((msg) => {
        if (!activePort || activeInput !== input) return;

        if (msg.type === 'chunk') {
          activeSuggestion += msg.text;
          ghostText.setText(activeSuggestion);
          ghostText.show();
        } else if (msg.type === 'done') {
          cleanupPort();
        } else if (msg.type === 'error') {
          reject();
        }
      });

      activePort.onDisconnect.addListener(() => {
        cleanupPort();
      });

      activePort.postMessage({
        type: 'copilot:start',
        text: text,
        cursorPos: pos,
        settings: {
          copilotMode: settings.copilotMode,
          copilotProvider: settings.copilotProvider,
          copilotMaxTokens: settings.copilotMaxTokens
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
    cleanupPort();
    ghostText.hide();
    ghostText.destroy();
    activeInput = null;
    activeSuggestion = '';
    cursorPos = 0;
  }

  function destroy() {
    reject();
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
    destroy
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
