(function initZeusContent(globalScope) {
  const domUtils = globalScope.ZeusDomUtils;
  const observerFactory = globalScope.ZeusObserver;
  const injectorFactory = globalScope.ZeusInjector;
  const adapters = globalScope.ZeusContentAdapters || [];

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
  let activeAdapter = null;
  let observer = null;
  let injector = null;
  let refreshTimer = null;

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

  function hasKeyForProvider(provider) {
    if (settings?.hasApiKey && typeof settings.hasApiKey[provider] === 'boolean') {
      return settings.hasApiKey[provider];
    }
    if (settings?.apiKeys) {
      return Boolean(readApiKeyForProvider(provider));
    }
    return true; // Defer validation to background service worker
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

  async function handleEnhanceClickForInput(inputElement, buttonElement) {
    if (!buttonElement || buttonElement.disabled || buttonElement.classList?.contains('processing')) {
      return;
    }

    await fetchSettingsIfNeeded();

    const provider = readProviderFromSettings();
    const hasKey = hasKeyForProvider(provider);

    if (provider !== 'ollama' && provider !== 'auto' && !hasKey) {
      buttonElement.classList.remove('processing', 'success');
      buttonElement.classList.add('error');
      setTimeout(() => {
        buttonElement.classList.remove('error');
      }, 3000);
      if (injector && typeof injector.showToast === 'function') {
        injector.showToast('MISSING ACCESS TOKEN', 'error', 4000);
      } else {
        alert('Please configure an API key for the selected provider in the Zeus settings.');
      }
      return;
    }

    const originalPrompt = domUtils.getInputText(inputElement);
    if (!String(originalPrompt || '').trim()) {
      buttonElement.classList.remove('processing', 'success');
      buttonElement.classList.add('error');
      setTimeout(() => {
        buttonElement.classList.remove('error');
      }, 3000);
      if (injector && typeof injector.showToast === 'function') {
        injector.showToast('PROMPT EMPTY', 'error', 3000);
      } else {
        alert('Please enter a prompt to optimize.');
      }
      return;
    }

    buttonElement.classList.add('processing');
    buttonElement.classList.remove('error', 'success');
    buttonElement.disabled = true;
    buttonElement.style.pointerEvents = 'none';

    if (injector && typeof injector.showToast === 'function') {
      injector.showToast('ESTABLISHING NEURAL LINK...', 'info', 0);
    }

    try {
      await sendMessageWithTimeout({ action: 'ping' }, 3000).catch(() => null);

      const promptClient = globalScope.ZeusPromptClient || (typeof require !== 'undefined' ? (function() {
        try {
          const path = require('node:path');
          return require(path.resolve(process.cwd(), 'core/promptClient.js'));
        } catch (_) {
          return null;
        }
      })() : null);

      let finalEnhanced = '';
      let warnings = [];

      if (promptClient && typeof promptClient.enhance === 'function') {
        const result = await promptClient.enhance(originalPrompt, {
          redactionEnabled: settings?.redactionEnabled,
          customRedactionPatterns: settings?.customRedactionPatterns,
          timeoutMs: MESSAGE_TIMEOUT_MS
        });
        finalEnhanced = result.enhancedText;
        warnings = result.warnings || [];
      } else {
        // Fallback if PromptClient not available
        const redactor = globalScope.ZeusRedactor || null;
        const scrubResult = redactor?.scrub
          ? redactor.scrub(originalPrompt, {
              redactionEnabled: settings?.redactionEnabled,
              customRedactionPatterns: settings?.customRedactionPatterns
            })
          : { text: originalPrompt, secretMap: {}, hasRedactions: false };

        const response = await sendMessageWithTimeout({
          action: 'enhancePrompt',
          prompt: scrubResult.text
        }, MESSAGE_TIMEOUT_MS);

        if (!response?.success) {
          throw new Error(String(response?.error || 'Unknown response from extension'));
        }

        finalEnhanced = response.enhancedPrompt;
        if (scrubResult.hasRedactions && redactor?.hydrate) {
          const hydration = redactor.hydrateWithDetails
            ? redactor.hydrateWithDetails(finalEnhanced, scrubResult.secretMap)
            : { text: redactor.hydrate(finalEnhanced, scrubResult.secretMap), droppedPlaceholders: [] };
          finalEnhanced = hydration.text;
          if (hydration.droppedPlaceholders?.length > 0) {
            warnings.push('WARNING: SENSITIVE PLACEHOLDER OMITTED BY AI');
          }
        }
      }

      if (warnings.length > 0 && injector && typeof injector.showToast === 'function') {
        injector.showToast('WARNING: SENSITIVE PLACEHOLDER OMITTED BY AI', 'warning', 4000);
      }

      domUtils.setInputText(inputElement, finalEnhanced);
      
      buttonElement.classList.remove('processing', 'error');
      buttonElement.classList.add('success');
      setTimeout(() => {
        buttonElement.classList.remove('success');
      }, 2000);
      if (injector && typeof injector.showToast === 'function') {
        injector.showToast('INJECTION COMPLETE', 'success', 3000);
      }
    } catch (error) {
      buttonElement.classList.remove('processing', 'success');
      buttonElement.classList.add('error');
      setTimeout(() => {
        buttonElement.classList.remove('error');
      }, 3000);

      if (injector && typeof injector.showToast === 'function') {
        injector.showToast('LINK FAILURE', 'error', 4000);
      } else {
        alert(`Zeus: ${String(error?.message || error)}`);
      }
    } finally {
      buttonElement.disabled = false;
      buttonElement.style.pointerEvents = '';
    }
  }

  function resolveActiveEditableInput() {
    const active = document.activeElement;
    if (domUtils.isEditableElement(active) && domUtils.isEligibleInput(active)) {
      return active;
    }

    const candidates = collectInputs();
    return candidates[0] || null;
  }

  function setupRuntimeMessageListener() {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.action === 'sidePanel:getCurrentInput' || message?.type === 'sidePanel:getCurrentInput') {
        const val = domUtils.getActiveInputValue();
        if (val !== undefined && val !== null && val !== '') {
          const currentAdapter = activeAdapter || resolveAdapter();
          sendResponse({
            value: val,
            url: location.href,
            site: currentAdapter ? currentAdapter.host : window.location.hostname
          });
        } else {
          sendResponse({ value: '' });
        }
        return true;
      }

      if (message?.action === 'sidePanel:setInputValue' || message?.type === 'sidePanel:setInputValue') {
        domUtils.setInputValue(message.value);
        sendResponse({ success: true });
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
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '14');
        svg.setAttribute('height', '14');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        polygon.setAttribute('points', '13 2 3 14 12 14 11 22 21 10 12 10 13 2');
        svg.appendChild(polygon);
        tempButton.appendChild(svg);

        handleEnhanceClickForInput(targetInput, tempButton)
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
    activeAdapter = resolveAdapter();
    await fetchSettingsIfNeeded();
    setupRuntimeMessageListener();
    setupVisibilityListener();
    refreshInjection();
    startObserver();
  }

  globalScope.ZeusContentRuntime = Object.freeze({
    refresh: scheduleRefresh,
    enhanceInput: handleEnhanceClickForInput
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
