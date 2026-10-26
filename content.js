(function initZeusContent(globalScope) {
  const domUtils = globalScope.ZeusDomUtils;
  const observerFactory = globalScope.ZeusObserver;
  const injectorFactory = globalScope.ZeusInjector;
  const adapters = globalScope.ZeusContentAdapters || [];
  const shortcuts = globalScope.ZeusShortcuts || null;
  const transformsModule = globalScope.ZeusTransforms || null;

  if (!domUtils || !observerFactory || !injectorFactory) {
    return;
  }

  if (globalScope.ZeusContentRuntime?.refresh) {
    globalScope.ZeusContentRuntime.refresh();
    return;
  }

  const MESSAGE_TIMEOUT_MS = 20000;
  const INJECTION_DEBOUNCE_MS = 220;

  const LIGHTNING_SVG = '<svg width="16" height="16" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg"><polygon style="fill:#FFD500;" points="382.395,228.568 291.215,228.568 330.762,10.199 129.603,283.43 220.785,283.43 181.238,501.799"/><g><path style="fill:#3D3D3D;" d="M181.234,512c-1.355,0-2.726-0.271-4.033-0.833c-4.357-1.878-6.845-6.514-5.999-11.184l37.371-206.353h-78.969c-3.846,0-7.367-2.164-9.103-5.597c-1.735-3.433-1.391-7.55,0.889-10.648L322.548,4.153c2.814-3.822,7.891-5.196,12.25-3.32c4.357,1.878,6.845,6.514,5.999,11.184L303.427,218.37h78.969c3.846,0,7.367,2.164,9.103,5.597c1.735,3.433,1.391,7.55-0.889,10.648L189.451,507.846C187.481,510.523,184.399,512,181.234,512z M149.777,273.231h71.007c3.023,0,5.89,1.341,7.828,3.662c1.938,2.32,2.747,5.38,2.208,8.355l-31.704,175.065l163.105-221.545h-71.007c-3.023,0-5.89-1.341-7.828-3.661c-1.938-2.32-2.747-5.38-2.208-8.355l31.704-175.065L149.777,273.231z"/></g></svg>';

  let settings = null;
  let transforms = [];
  let transformsPromise = null;
  let activeAdapter = null;
  let observer = null;
  let injector = null;
  let refreshTimer = null;
  let transformKeydownHandler = null;

  function dedupeElements(list) {
    return Array.from(new Set((Array.isArray(list) ? list : []).filter(Boolean)));
  }

  function resolveAdapter() {
    const hostname = window.location.hostname;
    return adapters.find((adapter) => {
      try {
        return Boolean(adapter?.matches?.(hostname));
      } catch (_) {
        return false;
      }
    }) || adapters[adapters.length - 1] || null;
  }

  function collectInputs() {
    const adapter = activeAdapter || resolveAdapter();
    const selectors = adapter?.inputSelectors?.length
      ? adapter.inputSelectors
      : domUtils.DEFAULT_INPUT_SELECTORS;

    let candidates = domUtils.findCandidates(selectors, document);
    candidates = domUtils.filterEligibleInputs(candidates);

    if (typeof adapter?.pickInputs === 'function') {
      candidates = domUtils.filterEligibleInputs(adapter.pickInputs(candidates));
    }

    if (typeof adapter?.getInputElement === 'function') {
      try {
        const preferred = adapter.getInputElement();
        if (preferred && domUtils.isEligibleInput(preferred)) {
          candidates = dedupeElements([preferred, ...candidates]);
        }
      } catch (_) {
        // Keep fallback candidates when adapter primary selection fails.
      }
    }

    return candidates;
  }

  function refreshInjection() {
    if (!injector) {
      injector = injectorFactory.create({
        svgMarkup: LIGHTNING_SVG,
        onEnhanceClick: handleEnhanceClickForInput
      });
    }

    const inputs = collectInputs();
    const adapter = activeAdapter || resolveAdapter();
    injector.inject(inputs, adapter);
    injector.refresh();

    if (settings?.copilotEnabled && globalScope.ZeusCopilot) {
      globalScope.ZeusCopilot.init(adapter, settings);
    }
  }

  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshInjection();
    }, INJECTION_DEBOUNCE_MS);
  }

  function sendMessageWithTimeout(message, timeoutMs) {
    return new Promise((resolve, reject) => {
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        reject(new Error('Extension request timed out. Try reloading the page or reopening the extension.'));
      }, Number(timeoutMs) > 0 ? Number(timeoutMs) : MESSAGE_TIMEOUT_MS);

      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (done) return;
          done = true;
          clearTimeout(timer);

          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message || 'Unknown extension runtime error'));
            return;
          }

          resolve(response);
        });
      } catch (error) {
        if (!done) {
          done = true;
          clearTimeout(timer);
          reject(error);
        }
      }
    });
  }

  function readProviderFromSettings() {
    const provider = String(settings?.provider || settings?.zeus_selected_provider || 'gemini').trim();
    return provider || 'gemini';
  }

  function readApiKeyForProvider(provider) {
    return String(
      settings?.apiKeys?.[provider] ||
      settings?.[`zeus_${provider}_api_key`] ||
      ''
    ).trim();
  }

  async function fetchSettingsIfNeeded() {
    if (settings?.provider || settings?.zeus_selected_provider) {
      return;
    }

    try {
      const response = await sendMessageWithTimeout({ action: 'getSettings' }, 5000);
      if (response?.settings) {
        settings = response.settings;
      }
    } catch (_) {
      // Defer UI errors until enhancement attempts.
    }
  }

  /**
   * Loads the transform list once per invalidation. Concurrent callers share the
   * in-flight request, and a failed load clears the cache so the next shortcut
   * press can retry instead of failing forever.
   */
  function fetchTransformsIfNeeded() {
    if (!transformsModule) {
      return Promise.resolve([]);
    }

    if (transformsPromise) {
      return transformsPromise;
    }

    transformsPromise = sendMessageWithTimeout({ action: 'getTransforms' }, 5000)
      .then((response) => {
        transforms = Array.isArray(response?.transforms) ? response.transforms : [];
        return transforms;
      })
      .catch(() => {
        transformsPromise = null;
        transforms = [];
        return [];
      });

    return transformsPromise;
  }

  function invalidateTransforms() {
    transformsPromise = null;
    transforms = [];
  }

  async function handleEnhanceClickForInput(inputElement, buttonElement, options) {
    await fetchSettingsIfNeeded();

    const transformId = String(options?.transformId || '').trim();
    const targetedButton = buttonElement && buttonElement.classList ? buttonElement : null;

    function setButtonState(action) {
      if (!targetedButton) return;
      if (action === 'processing') {
        targetedButton.classList.add('processing');
        targetedButton.classList.remove('error');
        targetedButton.disabled = true;
        targetedButton.style.pointerEvents = 'none';
        return;
      }
      targetedButton.classList.remove('processing');
    }

    // A shortcut press arrives before the transform list may have loaded.
    if (transformId && !transforms.length) {
      await fetchTransformsIfNeeded();
    }

    const transform = transformId && transformsModule
      ? transformsModule.getTransformById(transforms, transformId)
      : null;

    if (transformId && (!transform || !transform.enabled)) {
      showStatusToast('TRANSFORM UNAVAILABLE', 'error', 3000);
      return;
    }

    const provider = readProviderFromSettings();
    const apiKey = readApiKeyForProvider(provider);

    if (provider !== 'ollama' && provider !== 'auto' && !apiKey) {
      showStatusToast('MISSING ACCESS TOKEN', 'error', 4000);
      if (!(injector && typeof injector.showToast === 'function')) {
        alert('Please configure an API key for the selected provider in the Zeus settings.');
      }
      return;
    }

    const originalPrompt = domUtils.getInputText(inputElement);
    if (!String(originalPrompt || '').trim()) {
      showStatusToast('PROMPT EMPTY', 'error', 3000);
      if (!(injector && typeof injector.showToast === 'function')) {
        alert('Please enter a prompt to optimize.');
      }
      return;
    }

    setButtonState('processing');

    showStatusToast('ESTABLISHING NEURAL LINK...', 'info', 0);

    try {
      await sendMessageWithTimeout({ action: 'ping' }, 3000).catch(() => null);

      let conversationContext = null;
      if (settings?.contextAwareEnabled !== false && typeof domUtils.extractConversationTurns === 'function') {
        try {
          const maxTurns = settings?.contextMaxTurns || 4;
          const maxTotalChars = settings?.contextMaxChars || 2000;
          conversationContext = domUtils.extractConversationTurns(document, { maxTurns, maxTotalChars });
        } catch (_) {
          conversationContext = null;
        }
      }

      let attachments = null;
      if (settings?.multimodalEnabled !== false && globalScope.ZeusMultimodal?.extractAttachedImagesFromDOM) {
        try {
          const domAttachments = globalScope.ZeusMultimodal.extractAttachedImagesFromDOM(document);
          if (domAttachments && domAttachments.length > 0) {
            attachments = domAttachments;
          }
        } catch (_) {
          attachments = null;
        }
      }

      const enhancePayload = {
        action: 'enhancePrompt',
        prompt: originalPrompt,
        transformId: transform?.id || '',
        conversationContext
      };
      if (attachments && attachments.length > 0) {
        enhancePayload.attachments = attachments;
      }

      const response = await sendMessageWithTimeout(enhancePayload, MESSAGE_TIMEOUT_MS);

      if (!response?.success) {
        throw new Error(String(response?.error || 'Unknown response from extension'));
      }

      domUtils.setInputText(inputElement, response.enhancedPrompt);

      setButtonState('done');
      showStatusToast(
        transform ? `${transform.name.toUpperCase()} APPLIED` : 'INJECTION COMPLETE',
        'success',
        3000
      );
    } catch (error) {
      setButtonState('done');
      if (targetedButton) {
        targetedButton.classList.add('error');
        setTimeout(() => {
          targetedButton.classList.remove('error');
        }, 3000);
      }

      showStatusToast('LINK FAILURE', 'error', 4000);
      if (!(injector && typeof injector.showToast === 'function')) {
        alert(`Zeus: ${String(error?.message || error)}`);
      }
    } finally {
      if (targetedButton) {
        targetedButton.disabled = false;
        targetedButton.style.pointerEvents = 'auto';
      }
    }
  }

  /**
   * Resolves the editable the user is actually typing in, or null. Never falls
   * back to "some other box on the page": a shortcut must not rewrite an input the
   * caret is not in.
   *
   * Walks shadow roots first — a prompt box inside a web component leaves
   * document.activeElement pointing at the shadow host, not the editable node.
   */
  function resolveFocusedEditableInput() {
    const active = domUtils.getActiveElementRecursive
      ? domUtils.getActiveElementRecursive()
      : document.activeElement;

    if (domUtils.isEditableElement(active) && domUtils.isEligibleInput(active)) {
      return active;
    }

    return null;
  }

  /** Context-menu target: prefers the focused editable, else the first candidate. */
  function resolveActiveEditableInput() {
    return resolveFocusedEditableInput() || collectInputs()[0] || null;
  }

  function showStatusToast(message, type, durationMs) {
    if (injector && typeof injector.showToast === 'function') {
      injector.showToast(message, type, durationMs);
    }
  }

  /**
   * Applies the transform bound to a keydown event. Runs only for the input the
   * caret is already in, so a shortcut can never silently rewrite another box.
   */
  async function applyTransformShortcut(transform, event) {
    const input = resolveFocusedEditableInput();
    if (!input || (event?.target && event.target !== input && !input.contains(event.target))) {
      showStatusToast('FOCUS A PROMPT INPUT FIRST', 'error', 3000);
      return;
    }

    let promptText = domUtils.getInputText(input);

    if (transform.template) {
      const expanded = transformsModule.applyTemplateValues(transform.template, { prompt: promptText });
      const unresolved = transformsModule.findUnresolvedVariables(expanded);

      // A variable transform cannot prompt for values from a page-level hotkey, so
      // it reports what is missing instead of injecting literal placeholders.
      if (unresolved.length > 0) {
        showStatusToast(`NEEDS INPUT: ${unresolved.join(', ').toUpperCase()}`, 'error', 4000);
        return;
      }

      domUtils.setInputText(input, expanded);
      promptText = expanded;
    }

    // The transform runs through the normal enhancement pipeline, which owns the
    // API key check, empty-prompt check, and provider routing.
    if (!String(promptText || '').trim()) {
      showStatusToast('PROMPT EMPTY', 'error', 3000);
      return;
    }

    const syntheticButton = document.createElement('button');
    await handleEnhanceClickForInput(input, syntheticButton, { transformId: transform.id });
  }

  function isZeusOwnedNode(node) {
    if (!node || !node.classList) {
      return false;
    }

    return node.classList.contains('zeus-enhance-btn') ||
      node.classList.contains('zeus-toast') ||
      node.classList.contains('zeus-ghost');
  }

  function setupTransformShortcutListener() {
    if (!shortcuts || !transformsModule) {
      return;
    }

    // Capture phase: site editors (Quill/ProseMirror) stop propagation on some combos.
    transformKeydownHandler = (event) => {
      if (event.defaultPrevented || event.isComposing) {
        return;
      }

      if (isZeusOwnedNode(event.target)) {
        return;
      }

      const targetInput = resolveFocusedEditableInput();
      if (!targetInput) {
        return;
      }

      const transform = shortcuts.findTransformForEvent(event, transforms);
      if (transform) {
        event.preventDefault();
        event.stopPropagation();

        applyTransformShortcut(transform, event).catch(() => {
          showStatusToast('TRANSFORM FAILED', 'error', 3000);
        });
        return;
      }

      // The transform list arrives asynchronously, so a press landing in the first
      // few hundred milliseconds after load would otherwise be dropped in silence.
      // Wait for the list, then re-match: the keystroke is claimed only if it turns
      // out to be bound, so ordinary typing in that window is never swallowed.
      Promise.resolve(transformsPromise)
        .then(() => {
          if (transforms.length === 0) {
            return;
          }

          const lateTransform = shortcuts.findTransformForEvent(event, transforms);
          if (!lateTransform) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();

          return applyTransformShortcut(lateTransform, event).catch(() => {
            showStatusToast('TRANSFORM FAILED', 'error', 3000);
          });
        })
        .catch(() => undefined);
    };

    document.addEventListener('keydown', transformKeydownHandler, true);
  }

  /**
   * Releases everything `initialize()` created. `forceInject` re-runs this file in
   * the same tab, so without teardown each injection would leak a keydown listener
   * and a URL-polling interval.
   */
  function teardown() {
    if (transformKeydownHandler) {
      document.removeEventListener('keydown', transformKeydownHandler, true);
      transformKeydownHandler = null;
    }

    if (observer) {
      observer.disconnect();
      observer = null;
    }

    if (refreshTimer) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }
  }

  /**
   * Keeps the transform list live so an edit made in the popup or side panel takes
   * effect without reloading the page.
   */
  function setupTransformChangeListener() {
    if (!transformsModule || !chrome.storage?.onChanged) {
      return;
    }

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'sync' || !changes[transformsModule.TRANSFORMS_STORAGE_KEY]) {
        return;
      }

      invalidateTransforms();
      fetchTransformsIfNeeded();
    });
  }

  function setupRuntimeMessageListener() {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.action === 'sidePanel:getCurrentInput' || message?.type === 'sidePanel:getCurrentInput') {
        const val = domUtils.getActiveInputValue();
        let attachments = [];
        if (settings?.multimodalEnabled !== false && globalScope.ZeusMultimodal?.extractAttachedImagesFromDOM) {
          try {
            attachments = globalScope.ZeusMultimodal.extractAttachedImagesFromDOM(document);
          } catch (_) {
            attachments = [];
          }
        }
        if (val !== undefined && val !== null && val !== '') {
          const currentAdapter = activeAdapter || resolveAdapter();
          sendResponse({
            value: val,
            attachments,
            url: location.href,
            site: currentAdapter ? currentAdapter.host : window.location.hostname
          });
        } else {
          sendResponse({ value: '', attachments });
        }
        return true;
      }

      if (message?.action === 'sidePanel:setInputValue' || message?.type === 'sidePanel:setInputValue') {
        const textToInsert = String(message?.value || '');
        let targetInput = domUtils.getActiveElementRecursive();
        if (!targetInput || !domUtils.isEligibleInput(targetInput)) {
          const adapter = activeAdapter || resolveAdapter();
          if (typeof adapter?.getInputElement === 'function') {
            try {
              const preferred = adapter.getInputElement();
              if (preferred && domUtils.isEligibleInput(preferred)) {
                targetInput = preferred;
              }
            } catch (_) {}
          }
          if (!targetInput || !domUtils.isEligibleInput(targetInput)) {
            const inputs = collectInputs();
            targetInput = inputs[0] || null;
          }
        }

        if (targetInput && domUtils.isEligibleInput(targetInput)) {
          const success = domUtils.setInputValue(textToInsert, targetInput);
          sendResponse({ success: Boolean(success), error: success ? null : 'Failed to write text to editor' });
        } else {
          sendResponse({ success: false, error: 'No active chat composer detected on page' });
        }
        return true;
      }

      if (message?.action === 'settingsUpdated') {
        settings = message.settings || settings;
        if (globalScope.ZeusCopilot) {
          globalScope.ZeusCopilot.reconfigure(settings);
        }
        sendResponse({ status: 'ok' });
        return true;
      }

      // Lets the options page push transform edits to every open tab.
      if (message?.action === 'transformsUpdated') {
        invalidateTransforms();
        fetchTransformsIfNeeded();
        sendResponse({ status: 'ok' });
        return true;
      }

      if (message?.action === 'forceInjectButton') {
        scheduleRefresh();
        sendResponse({ status: 'injected' });
        return true;
      }

      if (message?.action === 'commands:debugToast') {
        const toast = document.createElement('div');
        toast.className = 'zeus-toast-overlay';
        toast.style.cssText = `
          position: fixed;
          top: 20px;
          right: 20px;
          background: rgba(0, 240, 255, 0.95);
          color: #000;
          font-family: 'JetBrains Mono', 'Rajdhani', sans-serif;
          font-size: 11px;
          font-weight: 700;
          padding: 10px 16px;
          border-left: 4px solid #FFD500;
          box-shadow: 0 4px 15px rgba(0, 240, 255, 0.4), inset 0 0 8px rgba(255, 255, 255, 0.6);
          z-index: 999999;
          letter-spacing: 1px;
          clip-path: polygon(0 0, 95% 0, 100% 30%, 100% 100%, 5% 100%, 0 70%);
          pointer-events: none;
          animation: zeus-fade-in 0.3s ease;
        `;
        toast.textContent = 'ZEUS LINK: COMMAND SIGNAL RECEIVED';
        document.body.appendChild(toast);
        setTimeout(() => {
          toast.style.transition = 'opacity 0.5s ease';
          toast.style.opacity = '0';
          setTimeout(() => toast.remove(), 500);
        }, 3000);
        sendResponse({ success: true });
        return true;
      }

      if (message?.action === 'contextEnhancePrompt') {
        const targetInput = resolveActiveEditableInput();
        if (!targetInput) {
          alert('Please focus or right-click a prompt input to enhance.');
          sendResponse({ status: 'no-input' });
          return true;
        }

        const tempButton = document.createElement('button');
        tempButton.innerHTML = LIGHTNING_SVG;

        handleEnhanceClickForInput(targetInput, tempButton, { transformId: message?.transformId })
          .then(() => sendResponse({ status: 'enhanced' }))
          .catch(() => sendResponse({ status: 'failed' }));

        return true;
      }

      return false;
    });
  }

  function setupVisibilityListener() {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        setTimeout(() => scheduleRefresh(), 600);
      }
    });
  }

  function startObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }

    const selectors = activeAdapter?.inputSelectors?.length
      ? activeAdapter.inputSelectors
      : domUtils.DEFAULT_INPUT_SELECTORS;

    observer = observerFactory.create({
      root: document.body,
      inputSelectors: selectors,
      onChange: scheduleRefresh,
      debounceMs: 160
    });
  }

  async function initialize() {
    // Register every input path BEFORE the first await. A hanging or rejected
    // settings round-trip must never be able to leave the page with no keydown
    // listener at all — that failure mode is completely silent to the user.
    setupRuntimeMessageListener();
    setupTransformChangeListener();
    setupTransformShortcutListener();
    setupVisibilityListener();

    activeAdapter = resolveAdapter();

    // Start the transform fetch now rather than after the settings round-trip:
    // the shortcut listener can only match once this list has arrived, so delaying
    // it widens the window in which a press has nothing to match against.
    fetchTransformsIfNeeded();

    // Deferred work: none of these can prevent the shortcut listener above from
    // working, so failures are contained and do not abort initialization.
    try {
      await fetchSettingsIfNeeded();
    } catch (_) {
      // Settings are retried on the first enhancement attempt.
    }

    refreshInjection();
    startObserver();
  }

  globalScope.ZeusContentRuntime = Object.freeze({
    refresh: scheduleRefresh,
    destroy: teardown
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }

  // Single, greppable confirmation that this tab has the current build and that the
  // shortcut listener is live. Absence of this line means the content script never
  // ran here, which is the fastest way to tell "stale build/injection" apart from
  // "binding does not match".
  try {
    console.log(
      `[ZEUS] content script ready (v${chrome.runtime.getManifest().version}); ` +
      'shortcut listener active; transforms loading'
    );
  } catch (_) {
    // Logging must never be able to break initialization.
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
