(function initZeusSidePanel(globalScope) {
  let safeDOM = globalScope.ZeusSafeDOM;
  if (!safeDOM && typeof require !== 'undefined') {
    try {
      const path = typeof require === 'function' ? require('node:path') : null;
      if (path) {
        safeDOM = require(path.resolve(process.cwd(), 'core/safeDom.js'));
      }
    } catch (_) {
      try {
        safeDOM = require('./core/safeDom.js');
      } catch (_2) {}
    }
  }

  function renderDiff(original, enhanced, targetElement) {
    if (safeDOM && typeof safeDOM.renderDiff === 'function') {
      return safeDOM.renderDiff(original, enhanced, targetElement);
    }
  }

  if (!globalScope.ZeusSafeDOM && safeDOM) {
    globalScope.ZeusSafeDOM = safeDOM;
  }

  if (typeof document === 'undefined') {
    return;
  }

  document.addEventListener('DOMContentLoaded', () => {
  // Tab Elements
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabSections = document.querySelectorAll('.tab-section');

  // Editor Elements
  const originalInput = document.getElementById('original-input');
  const btnCapture = document.getElementById('btn-capture');
  const btnEnhance = document.getElementById('btn-enhance');
  const diffCard = document.getElementById('diff-card');
  const diffView = document.getElementById('diff-view');
  const enhancedOutput = document.getElementById('enhanced-output');
  const btnInsert = document.getElementById('btn-insert');
  const btnCopy = document.getElementById('btn-copy');

  // History Elements
  const historyList = document.getElementById('history-list');

  // Template Elements
  const templatesListView = document.getElementById('templates-list-view');
  const templatesEditorView = document.getElementById('templates-editor-view');
  const templateList = document.getElementById('template-list');
  const btnNewTemplate = document.getElementById('btn-new-template');
  const templateNameInput = document.getElementById('template-name');
  const templateTextInput = document.getElementById('template-text');
  const btnSaveTemplate = document.getElementById('btn-save-template');
  const btnDeleteTemplate = document.getElementById('btn-delete-template');
  const btnCancelTemplate = document.getElementById('btn-cancel-template');

  // Modal Elements
  const modalFillVariables = document.getElementById('modal-fill-variables');
  const modalVariablesInputs = document.getElementById('modal-variables-inputs');
  const btnModalFill = document.getElementById('btn-modal-fill');
  const btnModalClose = document.getElementById('btn-modal-close');

  // Toast holder
  const toastHolder = document.getElementById('sidepanel-toast-holder');

  let currentTemplates = [];
  // Close Panel Elements
  const btnClosePanel = document.getElementById('btn-close-panel');
  if (btnClosePanel) {
    btnClosePanel.addEventListener('click', () => {
      window.close();
    });
  }

  // Connect long-lived port to background script to track state and accept close messages
  if (chrome.runtime && typeof chrome.runtime.connect === 'function') {
    const sidepanelPort = chrome.runtime.connect({ name: 'zeus-sidepanel' });
    if (sidepanelPort) {
      sidepanelPort.onMessage.addListener((msg) => {
        if (msg && msg.type === 'close') {
          window.close();
        }
      });
    }
  }

  let editingTemplateIndex = -1; // -1 means creating new
  let currentFillingTemplateText = '';
  let capturedSourceUrl = '';

  if (originalInput) {
    originalInput.addEventListener('input', () => {
      if (!originalInput.value.trim()) {
        capturedSourceUrl = '';
      }
    });
  }

  // Tab switching
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.dataset.tab;
      switchTab(targetTab);
    });
  });

  function switchTab(tabName) {
    tabButtons.forEach(b => b.classList.toggle('active', b.dataset.tab === tabName));
    tabSections.forEach(s => s.classList.toggle('active', s.id === `tab-${tabName}`));

    if (tabName === 'history') {
      loadHistory();
    } else if (tabName === 'templates') {
      loadTemplates();
      cancelTemplateEdit();
    }
  }

  // Toast helper
  function showToast(message, type = 'info', durationMs = 3000) {
    if (!toastHolder) return null;
    const toast = document.createElement('div');
    toast.className = `zeus-toast ${type}`;
    toast.textContent = `> ${message}`;
    toastHolder.appendChild(toast);

    const dismiss = () => {
      if (!toast.isConnected) return;
      toast.style.opacity = '0';
      setTimeout(() => {
        toast.remove();
      }, 300);
    };

    if (Number(durationMs) > 0) {
      setTimeout(dismiss, durationMs);
    }

    return { element: toast, dismiss };
  }

  // Capture input from page
  if (btnCapture) {
    btnCapture.addEventListener('click', () => {
      btnCapture.disabled = true;
      showToast('CAPTURING COMPOSER INPUT...', 'info', 1500);

      chrome.runtime.sendMessage({ type: 'sidePanel:getCurrentInput' }, (response) => {
        btnCapture.disabled = false;
        if (response && response.value !== undefined) {
          capturedSourceUrl = typeof response.url === 'string' ? response.url : '';
          if (originalInput) originalInput.value = response.value;
          if (response.value) {
            showToast('INPUT RETRIEVED SUCCESSFULLY', 'success', 2000);
          } else {
            showToast('COMPOSER IS EMPTY', 'error', 2500);
          }
        } else {
          showToast('NO ACTIVE COMPOSER DETECTED', 'error', 2500);
        }
      });
    });
  }

  // Enhance prompt
  if (btnEnhance) {
    btnEnhance.addEventListener('click', async () => {
      const text = originalInput?.value?.trim() || '';
      if (!text) {
        showToast('INPUT DETECTED AS VOID', 'error', 2000);
        return;
      }

      btnEnhance.disabled = true;
      btnEnhance.textContent = 'ESTABLISHING NEURAL LINK...';
      const loadingToast = showToast('ROUTING TO COGNITIVE LOADOUT...', 'info', 0);

      try {
        const promptClient = window.ZeusPromptClient || globalThis.ZeusPromptClient;
        if (!promptClient || typeof promptClient.enhance !== 'function') {
          throw new Error('ZeusPromptClient is not available');
        }

        const enhanceOptions = { timeoutMs: 20000 };
        const settingsModule = window.ZeusSettingsStore || globalThis.ZeusSettingsStore || window.ZeusSettings || globalThis.ZeusSettings;
        let loadedSettings = null;
        if (settingsModule && typeof settingsModule.getPublic === 'function') {
          loadedSettings = await settingsModule.getPublic().catch(() => null);
        } else if (settingsModule && typeof settingsModule.getPublicSettings === 'function') {
          loadedSettings = await settingsModule.getPublicSettings().catch(() => null);
        } else if (typeof promptClient.dispatchMessage === 'function') {
          const settingsResponse = await promptClient.dispatchMessage({ action: 'getSettings' }, 3000).catch(() => null);
          loadedSettings = settingsResponse?.settings || null;
        }
        if (loadedSettings) {
          enhanceOptions.redactionEnabled = loadedSettings.redactionEnabled;
          enhanceOptions.customRedactionPatterns = loadedSettings.customRedactionPatterns;
        }

        const result = await promptClient.enhance(text, enhanceOptions);

        loadingToast?.dismiss();
        showToast('INJECTION COMPLETE', 'success', 2000);

        const actionableWarnings = (result.warnings || []).filter((w) => !/^NOTICE:/i.test(String(w || '').trim()));
        if (actionableWarnings.length > 0) {
          showToast('WARNING: SOME SENSITIVE TOKENS WERE OMITTED BY AI', 'warning', 4000);
        }

        if (enhancedOutput) enhancedOutput.value = result.enhancedText;

        // Show and render diff with rehydrated output
        if (diffCard) diffCard.style.display = 'block';
        renderDiff(text, result.enhancedText);

        // Keep mappings and restored sensitive values OUT of persistent history
        // Persist only scrubbed text with placeholders if redactions were present
        const historyOriginal = result.meta?.hasRedactions ? (result.meta?.scrubbedOriginal || text) : text;
        const historyEnhanced = result.meta?.hasRedactions ? (result.meta?.scrubbedEnhanced || result.enhancedText) : result.enhancedText;
        saveCurrentToHistory(historyOriginal, historyEnhanced);
      } catch (err) {
        loadingToast?.dismiss();
        showToast('LINK FAILURE', 'error', 3000);
        console.error('Enhance failed:', err);
      } finally {
        loadingToast?.dismiss();
        btnEnhance.disabled = false;
        btnEnhance.textContent = 'OPTIMIZE PROMPT';
      }
    });
  }

  // Insert into Chat
  if (btnInsert) {
    btnInsert.addEventListener('click', () => {
      const text = enhancedOutput?.value?.trim() || '';
      if (!text) {
        showToast('NO OPTIMIZED LOADOUT YET', 'error', 2000);
        return;
      }

      btnInsert.disabled = true;
      chrome.runtime.sendMessage({ type: 'sidePanel:setInputValue', value: text }, (response) => {
        btnInsert.disabled = false;
        if (response && response.success) {
          showToast('INJECTED INTO ACTIVE SESSION', 'success', 2000);
        } else {
          showToast('INJECTION FAILED. COMPOSER OUT OF FOCUS.', 'error', 3000);
        }
      });
    });
  }

  // Copy to Clipboard
  if (btnCopy) {
    btnCopy.addEventListener('click', () => {
      const text = enhancedOutput?.value?.trim() || '';
      if (!text) {
        showToast('NO OUTPUT TO COPY', 'error', 2000);
        return;
      }

      navigator.clipboard.writeText(text).then(() => {
        showToast('COPIED TO MEMORY BUFFER', 'success', 2000);
      }).catch(() => {
        showToast('CLIPBOARD ACCESS DENIED', 'error', 2500);
      });
    });
  }

  // History Archiving
  function loadHistory() {
    chrome.runtime.sendMessage({ type: 'sidePanel:getHistory' }, (response) => {
      const list = response?.history || [];
      historyList.replaceChildren();

      if (list.length === 0) {
        const emptyMsg = document.createElement('p');
        emptyMsg.style.color = 'var(--text-muted)';
        emptyMsg.style.textAlign = 'center';
        emptyMsg.style.marginTop = '20px';
        emptyMsg.textContent = 'ARCHIVE EMPTY.';
        historyList.appendChild(emptyMsg);
        return;
      }

      // Reverse list to show reverse-chronological order
      list.slice().reverse().forEach((item, index) => {
        const actualIndex = list.length - 1 - index;
        const div = document.createElement('div');
        div.className = 'history-item';

        const meta = document.createElement('div');
        meta.className = 'history-meta';
        const dateStr = new Date(item.timestamp).toLocaleString();
        let site = 'DIRECT';
        try {
          if (item.url) site = new URL(item.url).hostname;
        } catch (_) {}

        const spanDate = document.createElement('span');
        spanDate.textContent = dateStr;
        const spanSite = document.createElement('span');
        spanSite.textContent = site;
        meta.appendChild(spanDate);
        meta.appendChild(spanSite);

        const preview = document.createElement('div');
        preview.className = 'history-text-preview';
        preview.textContent = item.original;

        const actions = document.createElement('div');
        actions.className = 'history-actions';

        const btnRestore = document.createElement('button');
        btnRestore.className = 'zeus-btn zeus-btn-cyan';
        btnRestore.textContent = 'RESTORE';
        btnRestore.addEventListener('click', () => {
          originalInput.value = item.original;
          enhancedOutput.value = item.enhanced;
          diffCard.style.display = 'block';
          renderDiff(item.original, item.enhanced);
          switchTab('editor');
          showToast('ENTRY RESTORED TO EDITOR', 'success', 2000);
        });

        const btnDelete = document.createElement('button');
        btnDelete.className = 'zeus-btn zeus-btn-red';
        btnDelete.textContent = 'PURGE';
        btnDelete.addEventListener('click', () => {
          list.splice(actualIndex, 1);
          chrome.storage.local.set({ zeus_prompt_history: list }, () => {
            showToast('ENTRY PURGED', 'success', 1500);
            loadHistory();
          });
        });

        actions.appendChild(btnRestore);
        actions.appendChild(btnDelete);

        div.appendChild(meta);
        div.appendChild(preview);
        div.appendChild(actions);

        historyList.appendChild(div);
      });
    });
  }

  function saveCurrentToHistory(original, enhanced) {
    const entry = {
      original,
      enhanced,
      timestamp: Date.now(),
      url: capturedSourceUrl
    };

    chrome.runtime.sendMessage({ type: 'sidePanel:saveHistory', entry });
  }

  // Templates Management
  function loadTemplates() {
    chrome.runtime.sendMessage({ type: 'sidePanel:getTemplates' }, (response) => {
      currentTemplates = response?.templates || [];
      templateList.replaceChildren();

      if (currentTemplates.length === 0) {
        const emptyMsg = document.createElement('p');
        emptyMsg.style.color = 'var(--text-muted)';
        emptyMsg.style.textAlign = 'center';
        emptyMsg.style.padding = '20px';
        emptyMsg.textContent = 'NO CONFIGURED PATTERNS.';
        templateList.appendChild(emptyMsg);
        return;
      }

      currentTemplates.forEach((tpl, index) => {
        const div = document.createElement('div');
        div.className = 'template-item';

        const title = document.createElement('div');
        title.className = 'template-title';
        title.textContent = tpl.name;

        const preview = document.createElement('div');
        preview.className = 'template-preview';
        preview.textContent = tpl.template;

        div.appendChild(title);
        div.appendChild(preview);

        // Click on template item triggers execution
        div.addEventListener('click', (event) => {
          // Avoid triggering on doubleclick or child selectors if any
          executeTemplate(tpl);
        });

        // Long-press or right click edit pattern
        div.addEventListener('contextmenu', (event) => {
          event.preventDefault();
          startTemplateEdit(index);
        });

        templateList.appendChild(div);
      });
    });
  }

  function executeTemplate(tpl) {
    const varsRegex = /{{\s*([\w]+)\s*}}/g;
    const variables = [];
    let match;
    
    // Find all distinct variables
    while ((match = varsRegex.exec(tpl.template)) !== null) {
      if (!variables.includes(match[1])) {
        variables.push(match[1]);
      }
    }

    if (variables.length === 0) {
      // Direct loadout injection
      capturedSourceUrl = '';
      originalInput.value = tpl.template;
      switchTab('editor');
      showToast('PATTERN INJECTED INTO INPUT', 'success', 2000);
      return;
    }

    // Show Fill Variables Modal
    currentFillingTemplateText = tpl.template;
    modalVariablesInputs.replaceChildren();

    variables.forEach(v => {
      const div = document.createElement('div');
      div.className = 'form-group';
      
      const label = document.createElement('label');
      label.className = 'zeus-label';
      label.textContent = v.toUpperCase();
      
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'zeus-input';
      input.dataset.variable = v;
      input.placeholder = `Enter value for ${v}...`;

      div.appendChild(label);
      div.appendChild(input);
      modalVariablesInputs.appendChild(div);
    });

    modalFillVariables.style.display = 'flex';
  }

  if (btnModalFill) {
    btnModalFill.addEventListener('click', () => {
      let text = currentFillingTemplateText;
      const inputs = modalVariablesInputs?.querySelectorAll('input') || [];
      
      inputs.forEach(input => {
        const variable = input.dataset.variable;
        const value = input.value.trim();
        const regex = new RegExp(`{{\\s*${variable}\\s*}}`, 'g');
        text = text.replace(regex, () => value);
      });

      capturedSourceUrl = '';
      if (originalInput) originalInput.value = text;
      if (modalFillVariables) modalFillVariables.style.display = 'none';
      switchTab('editor');
      showToast('PATTERN VARIABLES COMPILED & INJECTED', 'success', 2000);
    });
  }

  if (btnModalClose) {
    btnModalClose.addEventListener('click', () => {
      if (modalFillVariables) modalFillVariables.style.display = 'none';
    });
  }

  // New Template creation
  if (btnNewTemplate) {
    btnNewTemplate.addEventListener('click', () => {
      editingTemplateIndex = -1;
      if (templateNameInput) templateNameInput.value = '';
      if (templateTextInput) templateTextInput.value = '';
      if (btnDeleteTemplate) btnDeleteTemplate.style.display = 'none';
      if (templatesListView) templatesListView.style.display = 'none';
      if (templatesEditorView) templatesEditorView.style.display = 'block';
    });
  }

  function startTemplateEdit(index) {
    const tpl = currentTemplates[index];
    editingTemplateIndex = index;
    if (templateNameInput) templateNameInput.value = tpl?.name || '';
    if (templateTextInput) templateTextInput.value = tpl?.template || '';
    if (btnDeleteTemplate) btnDeleteTemplate.style.display = 'inline-block';
    if (templatesListView) templatesListView.style.display = 'none';
    if (templatesEditorView) templatesEditorView.style.display = 'block';
  }

  function cancelTemplateEdit() {
    if (templatesEditorView) templatesEditorView.style.display = 'none';
    if (templatesListView) templatesListView.style.display = 'block';
  }

  if (btnCancelTemplate) {
    btnCancelTemplate.addEventListener('click', cancelTemplateEdit);
  }

  if (btnSaveTemplate) {
    btnSaveTemplate.addEventListener('click', () => {
      const name = templateNameInput?.value?.trim() || '';
      const template = templateTextInput?.value?.trim() || '';

      if (!name || !template) {
        showToast('FIELDS CANNOT BE EMPTY', 'error', 2000);
        return;
      }

      // Detect variables
      const varsRegex = /{{\s*([\w]+)\s*}}/g;
      const variables = [];
      let match;
      while ((match = varsRegex.exec(template)) !== null) {
        if (!variables.includes(match[1])) {
          variables.push(match[1]);
        }
      }

      const tplObject = { name, template, variables };

      if (editingTemplateIndex === -1) {
        currentTemplates.push(tplObject);
      } else {
        currentTemplates[editingTemplateIndex] = tplObject;
      }

      saveTemplates();
    });
  }

  if (btnDeleteTemplate) {
    btnDeleteTemplate.addEventListener('click', () => {
      if (editingTemplateIndex >= 0) {
        currentTemplates.splice(editingTemplateIndex, 1);
        saveTemplates();
      }
    });
  }

  function saveTemplates() {
    chrome.runtime.sendMessage({
      type: 'sidePanel:saveTemplates',
      templates: currentTemplates
    }, (response) => {
      if (response && response.success) {
        showToast('PATTERN BUFFER COMMITTED', 'success', 2000);
        cancelTemplateEdit();
        loadTemplates();
      } else {
        showToast('FAILED TO COMMIT PATTERN', 'error', 3000);
      }
    });
  }
});
})(typeof globalThis !== 'undefined' ? globalThis : this);
