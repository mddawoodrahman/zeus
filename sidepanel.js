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
  let editingTemplateIndex = -1; // -1 means creating new
  let currentFillingTemplateText = '';

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
    if (!toastHolder) return;
    const toast = document.createElement('div');
    toast.className = `zeus-toast ${type}`;
    toast.textContent = `> ${message}`;
    toastHolder.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => {
        toast.remove();
      }, 300);
    }, durationMs);
  }

  // Capture input from page
  btnCapture.addEventListener('click', () => {
    btnCapture.disabled = true;
    showToast('CAPTURING COMPOSER INPUT...', 'info', 1500);

    chrome.runtime.sendMessage({ type: 'sidePanel:getCurrentInput' }, (response) => {
      btnCapture.disabled = false;
      if (response && response.value !== undefined) {
        originalInput.value = response.value;
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

  // Enhance prompt
  btnEnhance.addEventListener('click', () => {
    const text = originalInput.value.trim();
    if (!text) {
      showToast('INPUT DETECTED AS VOID', 'error', 2000);
      return;
    }

    btnEnhance.disabled = true;
    btnEnhance.textContent = 'ESTABLISHING NEURAL LINK...';
    showToast('ROUTING TO COGNITIVE LOADOUT...', 'info', 0);

    chrome.runtime.sendMessage({ action: 'enhancePrompt', prompt: text }, (response) => {
      btnEnhance.disabled = false;
      btnEnhance.textContent = 'OPTIMIZE PROMPT';

      // Clear the "routing" toast by appending a success or error one
      if (response && response.success) {
        showToast('INJECTION COMPLETE', 'success', 2000);
        enhancedOutput.value = response.enhancedPrompt;
        
        // Show and render diff
        diffCard.style.display = 'block';
        renderDiff(text, response.enhancedPrompt);

        // Save to history
        saveCurrentToHistory(text, response.enhancedPrompt);
      } else {
        showToast('LINK FAILURE', 'error', 3000);
        if (response && response.error) {
          console.error('Enhance failed:', response.error);
        }
      }
    });
  });

  // Insert into Chat
  btnInsert.addEventListener('click', () => {
    const text = enhancedOutput.value.trim();
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

  // Copy to Clipboard
  btnCopy.addEventListener('click', () => {
    const text = enhancedOutput.value.trim();
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

  // Dynamic Word Diff implementation
  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function diffWords(oldStr, newStr) {
    const one = oldStr.split(/(\s+)/);
    const other = newStr.split(/(\s+)/);
    const n = one.length;
    const m = other.length;
    const dp = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));

    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        if (one[i - 1] === other[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    let i = n;
    let j = m;
    const result = [];

    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && one[i - 1] === other[j - 1]) {
        result.unshift({ type: 'common', value: one[i - 1] });
        i--;
        j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        result.unshift({ type: 'add', value: other[j - 1] });
        j--;
      } else {
        result.unshift({ type: 'del', value: one[i - 1] });
        i--;
      }
    }
    return result;
  }

  function renderDiff(original, enhanced) {
    if (!diffView) return;
    const diffs = diffWords(original, enhanced);
    const html = diffs.map(part => {
      const escaped = escapeHtml(part.value);
      if (part.type === 'add') {
        return `<span class="diff-add">${escaped}</span>`;
      } else if (part.type === 'del') {
        return `<span class="diff-del">${escaped}</span>`;
      } else {
        return escaped;
      }
    }).join('');
    diffView.innerHTML = html;
  }

  // History Archiving
  function loadHistory() {
    chrome.runtime.sendMessage({ type: 'sidePanel:getHistory' }, (response) => {
      const list = response?.history || [];
      historyList.innerHTML = '';

      if (list.length === 0) {
        historyList.innerHTML = '<p style="color: var(--text-muted); text-align: center; margin-top: 20px;">ARCHIVE EMPTY.</p>';
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
        const site = item.url ? new URL(item.url).hostname : 'DIRECT';
        meta.innerHTML = `<span>${dateStr}</span><span>${site}</span>`;

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
      url: window.location.href
    };

    chrome.runtime.sendMessage({ type: 'sidePanel:saveHistory', entry });
  }

  // Templates Management
  function loadTemplates() {
    chrome.runtime.sendMessage({ type: 'sidePanel:getTemplates' }, (response) => {
      currentTemplates = response?.templates || [];
      templateList.innerHTML = '';

      if (currentTemplates.length === 0) {
        templateList.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 20px;">NO CONFIGURED PATTERNS.</p>';
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
      originalInput.value = tpl.template;
      switchTab('editor');
      showToast('PATTERN INJECTED INTO INPUT', 'success', 2000);
      return;
    }

    // Show Fill Variables Modal
    currentFillingTemplateText = tpl.template;
    modalVariablesInputs.innerHTML = '';

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

  btnModalFill.addEventListener('click', () => {
    let text = currentFillingTemplateText;
    const inputs = modalVariablesInputs.querySelectorAll('input');
    
    inputs.forEach(input => {
      const variable = input.dataset.variable;
      const value = input.value.trim();
      const regex = new RegExp(`{{\\s*${variable}\\s*}}`, 'g');
      text = text.replace(regex, value);
    });

    originalInput.value = text;
    modalFillVariables.style.display = 'none';
    switchTab('editor');
    showToast('PATTERN VARIABLES COMPILED & INJECTED', 'success', 2000);
  });

  btnModalClose.addEventListener('click', () => {
    modalFillVariables.style.display = 'none';
  });

  // New Template creation
  btnNewTemplate.addEventListener('click', () => {
    editingTemplateIndex = -1;
    templateNameInput.value = '';
    templateTextInput.value = '';
    btnDeleteTemplate.style.display = 'none';
    templatesListView.style.display = 'none';
    templatesEditorView.style.display = 'block';
  });

  function startTemplateEdit(index) {
    const tpl = currentTemplates[index];
    editingTemplateIndex = index;
    templateNameInput.value = tpl.name;
    templateTextInput.value = tpl.template;
    btnDeleteTemplate.style.display = 'inline-block';
    templatesListView.style.display = 'none';
    templatesEditorView.style.display = 'block';
  }

  function cancelTemplateEdit() {
    templatesEditorView.style.display = 'none';
    templatesListView.style.display = 'block';
  }

  btnCancelTemplate.addEventListener('click', cancelTemplateEdit);

  btnSaveTemplate.addEventListener('click', () => {
    const name = templateNameInput.value.trim();
    const template = templateTextInput.value.trim();

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

  btnDeleteTemplate.addEventListener('click', () => {
    if (editingTemplateIndex >= 0) {
      currentTemplates.splice(editingTemplateIndex, 1);
      saveTemplates();
    }
  });

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
