
const DEBUG = false;

let settings = {};
let domObserver = null;
let lastUrl = location.href;
let injectionDebounceTimer = null;

const INJECTION_DEBOUNCE_MS = 250;
const MESSAGE_TIMEOUT_MS = 20000; // 20s for sending messages to background

const LIGHTNING_SVG = `<svg width="16" height="16" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg"><polygon style="fill:#FFD500;" points="382.395,228.568 291.215,228.568 330.762,10.199 129.603,283.43 220.785,283.43 181.238,501.799"/><g><path style="fill:#3D3D3D;" d="M181.234,512c-1.355,0-2.726-0.271-4.033-0.833c-4.357-1.878-6.845-6.514-5.999-11.184l37.371-206.353h-78.969c-3.846,0-7.367-2.164-9.103-5.597c-1.735-3.433-1.391-7.55,0.889-10.648L322.548,4.153c2.814-3.822,7.891-5.196,12.25-3.32c4.357,1.878,6.845,6.514,5.999,11.184L303.427,218.37h78.969c3.846,0,7.367,2.164,9.103,5.597c1.735,3.433,1.391,7.55-0.889,10.648L189.451,507.846C187.481,510.523,184.399,512,181.234,512z M149.777,273.231h71.007c3.023,0,5.89,1.341,7.828,3.662c1.938,2.32,2.747,5.38,2.208,8.355l-31.704,175.065l163.105-221.545h-71.007c-3.023,0-5.89-1.341-7.828-3.661c-1.938-2.32-2.747-5.38-2.208-8.355l31.704-175.065L149.777,273.231z"/><path style="fill:#3D3D3D;" d="M267.666,171.348c-0.604,0-1.215-0.054-1.829-0.165c-5.543-1.004-9.223-6.31-8.22-11.853l0.923-5.1c1.003-5.543,6.323-9.225,11.852-8.219c5.543,1.004,9.223,6.31,8.22,11.853l-0.923,5.1C276.797,167.892,272.503,171.348,267.666,171.348z"/><path style="fill:#3D3D3D;" d="M255.455,238.77c-0.604,0-1.215-0.054-1.83-0.165c-5.543-1.004-9.222-6.31-8.218-11.853l7.037-38.864c1.004-5.543,6.317-9.225,11.854-8.219c5.543,1.004,9.222,6.31,8.219,11.853l-7.037,38.864C264.587,235.314,260.293,238.77,255.455,238.77z"/></g></svg>`;

/* --------------------------
   Helpers
   -------------------------- */

function debug(...args) {
  if (DEBUG) console.debug('Zeus:', ...args);
}

function isVisible(el) {
  if (!el) return false;
  try {
    const cs = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && el.offsetParent !== null && rect.width > 0 && rect.height > 0;
  } catch (e) {
    return false;
  }
}

function findMainInputForGeminiGrok(inputs) {
  inputs = inputs.filter(isVisible);
  if (!inputs.length) return [];
  let main = inputs[0];
  let maxBottom = main.getBoundingClientRect().bottom;
  for (const el of inputs) {
    const r = el.getBoundingClientRect();
    if (r.bottom > maxBottom) {
      main = el;
      maxBottom = r.bottom;
    }
  }
  return [main];
}

function findAllInputElements() {
  const selectors = [
    'textarea',
    '[contenteditable="true"]',
    'input[type="text"]',
    'input[type="search"]',
    '[data-testid*="input"]',
    '[data-testid*="textarea"]',
    '[class*="input"]',
    '[class*="textarea"]',
    '[id*="input"]',
    '[id*="textarea"]',
    'div[role="textbox"]',
    'input:not([type])',
    'input[type="email"]',
    'input[type="url"]',
    'input[type="tel"]',
    'input[type="password"]'
  ];
  const all = Array.from(new Set(selectors.flatMap(s => Array.from(document.querySelectorAll(s)))));
  let eligible = all.filter(el => {
    if (!isVisible(el)) return false;
    if (el.disabled || el.readOnly) return false;
    if (el.isContentEditable && el.getAttribute('contenteditable') !== 'true') return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 50 || rect.height < 20) return false;
    return true;
  });

  const hostname = window.location.hostname;
  if (hostname.includes('gemini.google.com') || hostname.includes('grok.com')) {
    eligible = findMainInputForGeminiGrok(eligible);
  }

  debug('eligible inputs', eligible);
  return eligible;
}

function getInputText(el) {
  if (!el) return '';
  if (el.tagName === 'TEXTAREA') return el.value;
  if (el.isContentEditable) return el.innerText;
  return '';
}
function setInputText(el, text) {
  if (!el) return;
  if (el.tagName === 'TEXTAREA') {
    el.value = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  } else if (el.isContentEditable) {
    el.innerText = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  el.focus();
}

/* --------------------------
   Create and inject enhance button
   -------------------------- */

function createEnhanceButton(inputElement) {
  const btn = document.createElement('button');
  btn.className = 'zeus-enhance-button';
  btn.innerHTML = LIGHTNING_SVG;
  btn.title = 'Enhance Prompt';
  btn.setAttribute('aria-label', 'Enhance prompt (Zeus)');
  btn.style.cssText = `background:transparent;color:#4a90e2;border:none;padding:0;font-size:16px;font-weight:bold;cursor:pointer;z-index:9999;height:32px;width:32px;display:flex;align-items:center;justify-content:center;`;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    handleEnhanceClickForInput(inputElement, btn);
  });
  return btn;
}

function injectButtonsOnce() {
  if (domObserver) domObserver.disconnect();

  try {
    const inputs = findAllInputElements();
    if (!inputs.length) return;
    for (const inputElement of inputs) {
      if (inputElement.closest('.zeus-enhance-wrapper')?.querySelector('.zeus-enhance-button')) continue;
      if (inputElement.parentElement?.querySelector('.zeus-enhance-button')) continue;

      let wrapper = inputElement.closest('.zeus-enhance-wrapper');
      if (!wrapper) {
        wrapper = document.createElement('div');
        wrapper.className = 'zeus-enhance-wrapper';

        try {
          const cs = window.getComputedStyle(inputElement);
          const disp = cs.display || 'inline-block';
          wrapper.style.display = (disp === 'inline' || disp === 'inline-block') ? 'inline-block' : disp;
          if (disp !== 'inline' && cs.width) {
            wrapper.style.width = cs.width;
            wrapper.style.maxWidth = '100%';
          }
          const flex = cs.getPropertyValue('flex');
          if (flex) wrapper.style.flex = flex;
          const align = cs.getPropertyValue('align-self');
          if (align) wrapper.style.alignSelf = align;
        } catch (_) { /* ignore */ }

        const parent = inputElement.parentNode;
        if (!parent) continue;

        try {
          parent.replaceChild(wrapper, inputElement);
        } catch (err) {
          // node may have been removed by SPA re-render — skip this input
          debug('replaceChild failed, skipping input', err);
          continue;
        }
        wrapper.appendChild(inputElement);
      }

      wrapper.style.position = wrapper.style.position || 'relative';

      try {
        const cs = window.getComputedStyle(inputElement);
        const currentPaddingRight = parseFloat(cs.paddingRight || '0');
        const neededPadding = 40;
        if (currentPaddingRight < neededPadding) {
          inputElement.style.paddingRight = (currentPaddingRight + neededPadding) + 'px';
        }
      } catch (_) { /* ignore */ }

      if (!wrapper.querySelector('.zeus-enhance-button')) {
        const btn = createEnhanceButton(inputElement);
        wrapper.appendChild(btn);
      }
    }
  } catch (err) {
    debug('injectButtonsOnce error', err);
  } finally {
    setupUnifiedObserver();
  }
}

/* --------------------------
   Unified observer & SPA handling
   -------------------------- */

function debouncedInject() {
  clearTimeout(injectionDebounceTimer);
  injectionDebounceTimer = setTimeout(() => injectButtonsOnce(), INJECTION_DEBOUNCE_MS);
}

function setupUnifiedObserver() {
  if (domObserver) domObserver.disconnect();

  const hostname = window.location.hostname;
  const isGeminiOrGrok = hostname.includes('gemini.google.com') || hostname.includes('grok.com');

  if (isGeminiOrGrok) {
    const mainInput = document.querySelector('textarea, [contenteditable="true"]');
    if (mainInput) {
      domObserver = new MutationObserver(() => debouncedInject());
      domObserver.observe(mainInput, { childList: true, subtree: true });
    }
  } else {
    domObserver = new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        setTimeout(debouncedInject, 500);
        return;
      }
      debouncedInject();
    });
    domObserver.observe(document.body, { childList: true, subtree: true, attributes: false });
  }
}

function setupVisibilityListener() {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) setTimeout(injectButtonsOnce, 800);
  });
}

/* --------------------------
   Messaging helpers
   -------------------------- */

function sendMessageWithTimeout(message, timeoutMs = MESSAGE_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    let finished = false;
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      reject(new Error('Extension request timed out. Try reloading the page or reopening the extension.'));
    }, timeoutMs);

    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    } catch (err) {
      if (!finished) {
        finished = true;
        clearTimeout(timer);
        reject(err);
      }
    }
  });
}

/* --------------------------
   Enhancement orchestration
   -------------------------- */

async function handleEnhanceClickForInput(inputElement, button) {
  await fetchSettingsIfNeeded();

  const provider = settings.zeus_selected_provider || 'gemini';
  const apiKey = settings[`zeus_${provider}_api_key`];
  const model = settings[`zeus_${provider}_model`];

  if (!apiKey || !model) {
    alert(`Please configure both API key and model for the selected provider (${provider}) in the Zeus popup settings.`);
    return;
  }

  const originalPrompt = getInputText(inputElement);
  if (!originalPrompt || !originalPrompt.trim()) {
    alert("Please enter a prompt to enhance.");
    return;
  }

  const prev = { inner: button.innerHTML, disabled: button.disabled };
  button.innerHTML = '⌛';
  button.disabled = true;
  button.style.pointerEvents = 'none';

  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 500;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // Ping background quickly to ensure service worker awake
      await sendMessageWithTimeout({ action: 'ping' }, 3000).catch(() => null);

      const response = await sendMessageWithTimeout({
        action: 'enhancePrompt',
        prompt: originalPrompt,
        provider,
        model,
        apiKey
      }, MESSAGE_TIMEOUT_MS);

      if (!response || !response.success) {
        // If extension context issue, retry
        const errText = response?.error || '';
        if (errText.includes('Extension context invalidated') && attempt < MAX_RETRIES - 1) {
          await new Promise(res => setTimeout(res, RETRY_DELAY_MS));
          continue;
        }
        throw new Error(errText || 'Unknown response from extension');
      }

      // Success: set text in input
      setInputText(inputElement, response.enhancedPrompt);
      break;
    } catch (err) {
      const msg = err?.message || String(err);
      if (msg.includes('Extension request timed out') || msg.includes('Extension context invalidated')) {
        alert(`Zeus: ${msg}`);
      } else {
        alert(`Error: ${msg}`);
      }
      break;
    } finally {
      button.innerHTML = prev.inner;
      button.disabled = prev.disabled;
      button.style.pointerEvents = 'auto';
    }
  }
}

/* --------------------------
   Settings & startup
   -------------------------- */

async function fetchSettingsIfNeeded() {
  if (settings && settings.zeus_selected_provider) return;
  try {
    const resp = await sendMessageWithTimeout({ action: 'getSettings' }, 5000);
    if (resp?.settings) settings = resp.settings;
  } catch (err) {
    // ignore, UI will show errors when trying to call background
  }
}

// context menu action handler (background -> content)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'settingsUpdated') {
    // Refresh local cached settings
    settings = message.settings || settings;
    sendResponse({ status: 'ok' });
    return;
  }
  if (message.action === 'forceInjectButton') {
    injectButtonsOnce();
    sendResponse({ status: 'injected' });
    return;
  }
  if (message.action === 'contextEnhancePrompt') {
    // Try active element first, then fallback to first eligible input
    let active = document.activeElement;
    if (!active || !(
      active.tagName === 'TEXTAREA' ||
      (active.isContentEditable && active.getAttribute('contenteditable') === 'true')
    )) {
      const candidates = findAllInputElements();
      if (candidates.length) active = candidates[0];
    }

    if (!active || !(
      active.tagName === 'TEXTAREA' ||
      (active.isContentEditable && active.getAttribute('contenteditable') === 'true')
    )) {
      alert('Please focus or right-click a textarea or contenteditable input to enhance the prompt.');
      sendResponse({ status: 'no-input' });
      return;
    }

    // Create a temporary button to pass UI state
    const tempBtn = document.createElement('button');
    tempBtn.innerHTML = LIGHTNING_SVG;
    tempBtn.disabled = false;

    handleEnhanceClickForInput(active, tempBtn).then(() => {
      sendResponse({ status: 'enhanced' });
    }).catch(() => {
      sendResponse({ status: 'failed' });
    });

    return true;
  }
});

// Startup
async function initialize() {
  await fetchSettingsIfNeeded();
  injectButtonsOnce();
  setupUnifiedObserver();
  setupVisibilityListener();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
