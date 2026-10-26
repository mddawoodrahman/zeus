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
  const multimodalContainer = document.getElementById('multimodal-attachments-container');
  const multimodalFileInput = document.getElementById('multimodal-file-input');
  let activeAttachments = [];

  // Privacy Shield Elements
  const privacyShieldBar = document.getElementById('privacy-shield-bar');
  const privacyShieldIcon = document.getElementById('privacy-shield-icon');
  const privacyShieldText = document.getElementById('privacy-shield-text');
  const privacyDetectedCount = document.getElementById('privacy-detected-count');
  const btnTogglePrivacyShield = document.getElementById('btn-toggle-privacy-shield');
  let isPrivacyShieldActive = false;

  function refreshPrivacyShieldStatus() {
    chrome.runtime.sendMessage({ action: 'getSettings' }, (response) => {
      const settings = response?.settings || {};
      isPrivacyShieldActive = Boolean(settings.privacyModeEnabled);
      updatePrivacyShieldUI();
    });
  }

  function updatePrivacyShieldUI() {
    if (!privacyShieldBar) return;
    if (isPrivacyShieldActive) {
      privacyShieldBar.style.display = 'flex';
      privacyShieldBar.style.borderColor = 'rgba(0, 240, 255, 0.4)';
      privacyShieldBar.style.background = 'rgba(0, 240, 255, 0.08)';
      if (privacyShieldIcon) privacyShieldIcon.textContent = '🛡️';
      if (privacyShieldText) {
        privacyShieldText.textContent = 'PRIVACY SHIELD ACTIVE';
        privacyShieldText.style.color = 'var(--net-cyan)';
      }
      if (btnTogglePrivacyShield) btnTogglePrivacyShield.textContent = 'DISABLE';
    } else {
      privacyShieldBar.style.display = 'flex';
      privacyShieldBar.style.borderColor = 'rgba(255, 255, 255, 0.1)';
      privacyShieldBar.style.background = 'rgba(255, 255, 255, 0.02)';
      if (privacyShieldIcon) privacyShieldIcon.textContent = '🛡️';
      if (privacyShieldText) {
        privacyShieldText.textContent = 'PRIVACY SHIELD OFF';
        privacyShieldText.style.color = 'var(--text-muted)';
      }
      if (btnTogglePrivacyShield) btnTogglePrivacyShield.textContent = 'ENABLE';
    }
    checkInputPII();
  }

  function checkInputPII() {
    const text = originalInput?.value || '';
    if (!privacyDetectedCount) return;
    if (!isPrivacyShieldActive || !text.trim()) {
      privacyDetectedCount.style.display = 'none';
      return;
    }

    const privacy = globalThis.ZeusPrivacy;
    if (privacy && typeof privacy.scanPromptForPII === 'function') {
      const scan = privacy.scanPromptForPII(text);
      if (scan.hasPII) {
        privacyDetectedCount.style.display = 'inline';
        privacyDetectedCount.textContent = `${scan.count} PII DETECTED (WILL MASK)`;
      } else {
        privacyDetectedCount.style.display = 'none';
      }
    }
  }

  btnTogglePrivacyShield?.addEventListener('click', () => {
    isPrivacyShieldActive = !isPrivacyShieldActive;
    chrome.runtime.sendMessage({ action: 'getSettings' }, (response) => {
      const current = response?.settings || {};
      const updated = { ...current, privacyModeEnabled: isPrivacyShieldActive };
      if (chrome.storage?.sync?.set) {
        chrome.storage.sync.set({ privacyModeEnabled: isPrivacyShieldActive }, () => {
          chrome.runtime.sendMessage({ action: 'settingsUpdated', settings: updated });
          updatePrivacyShieldUI();
          showToast(isPrivacyShieldActive ? 'PRIVACY SHIELD ENGAGED' : 'PRIVACY SHIELD DISENGAGED', 'info', 1500);
        });
      } else {
        updatePrivacyShieldUI();
      }
    });
  });

  originalInput?.addEventListener('input', () => {
    checkInputPII();
  });

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
  const transformShortcutField = document.getElementById('transform-shortcut');
  const transformEditorStatus = document.getElementById('transform-editor-status');

  const transformsModule = globalThis.ZeusTransforms || null;
  const shortcutEngine = globalThis.ZeusShortcuts || null;

  // Transform records currently loaded from the shared zeus_transforms store.
  let currentTransforms = [];
  let editingTransformId = null;

  // Modal Elements
  const modalFillVariables = document.getElementById('modal-fill-variables');
  const modalVariablesInputs = document.getElementById('modal-variables-inputs');
  const btnModalFill = document.getElementById('btn-modal-fill');
  const btnModalClose = document.getElementById('btn-modal-close');

  // Toast holder
  const toastHolder = document.getElementById('sidepanel-toast-holder');

  // Close Panel Elements
  const btnClosePanel = document.getElementById('btn-close-panel');
  if (btnClosePanel) {
    btnClosePanel.addEventListener('click', () => {
      window.close();
    });
  }

  // Command Palette & Keyboard Shortcuts
  const btnOpenPalette = document.getElementById('btn-open-palette');
  const paletteModule = globalThis.ZeusCommandPalette || null;
  let paletteController = null;

  function initCommandPalette() {
    if (!paletteModule) return;

    paletteController = paletteModule.createPalette({
      container: document.querySelector('.sidepanel-container') || document.body,
      getCommands: () => {
        const cmds = [];

        // Primary Actions
        cmds.push({
          id: 'action-optimize',
          title: 'Optimize Prompt',
          description: 'Rewrite prompt with AI provider framework',
          category: 'Actions',
          shortcut: 'Ctrl+Enter',
          icon: '⚡',
          handler: () => {
            switchTab('editor');
            btnEnhance?.click();
          }
        });

        cmds.push({
          id: 'action-capture',
          title: 'Capture from Page',
          description: 'Pull prompt from active chat composer into workbench',
          category: 'Actions',
          shortcut: 'Ctrl+Shift+U',
          icon: '📥',
          handler: () => {
            switchTab('editor');
            btnCapture?.click();
          }
        });

        cmds.push({
          id: 'action-insert',
          title: 'Insert into Chat',
          description: 'Inject optimized output back into the chat input',
          category: 'Actions',
          shortcut: 'Ctrl+Shift+I',
          icon: '📤',
          handler: () => {
            switchTab('editor');
            btnInsert?.click();
          }
        });

        cmds.push({
          id: 'action-copy',
          title: 'Copy Output to Clipboard',
          description: 'Copy the optimized output prompt',
          category: 'Actions',
          shortcut: 'Ctrl+Shift+C',
          icon: '📋',
          handler: () => {
            btnCopy?.click();
          }
        });

        cmds.push({
          id: 'action-privacy-toggle',
          title: isPrivacyShieldActive ? 'Disable Privacy Shield' : 'Enable Privacy Shield',
          description: 'Toggle client-side PII redaction and restoration',
          category: 'Actions',
          shortcut: 'Ctrl+Shift+P',
          icon: '🛡️',
          handler: () => {
            btnTogglePrivacyShield?.click();
          }
        });

        cmds.push({
          id: 'action-ab-compare',
          title: 'A/B Compare Variants',
          description: 'Compare quality score and metrics between original and optimized',
          category: 'Actions',
          icon: '⚖️',
          handler: () => {
            switchTab('editor');
            document.getElementById('btn-ab-compare')?.click();
          }
        });

        cmds.push({
          id: 'action-clear',
          title: 'Clear Inputs & Output',
          description: 'Reset input payload, attachments, and output fields',
          category: 'Actions',
          icon: '🧹',
          handler: () => {
            if (originalInput) originalInput.value = '';
            if (enhancedOutput) enhancedOutput.value = '';
            if (diffCard) diffCard.style.display = 'none';
            activeAttachments = [];
            renderMultimodalAttachments();
            checkInputPII();
            showToast('EDITOR CLEARED', 'info', 1500);
          }
        });

        cmds.push({
          id: 'action-settings',
          title: 'Open Extension Settings',
          description: 'Configure API keys, models, and smart router',
          category: 'Actions',
          icon: '⚙️',
          handler: () => {
            if (chrome.runtime?.openOptionsPage) {
              chrome.runtime.openOptionsPage();
            }
          }
        });

        // Navigation
        cmds.push({
          id: 'nav-editor',
          title: 'Switch to Enhance Editor',
          description: 'Primary prompt editing workspace',
          category: 'Navigation',
          icon: '📝',
          handler: () => switchTab('editor')
        });

        cmds.push({
          id: 'nav-history',
          title: 'Switch to History Archive',
          description: 'Browse past prompt enhancement logs',
          category: 'Navigation',
          icon: '🕒',
          handler: () => switchTab('history')
        });

        cmds.push({
          id: 'nav-transforms',
          title: 'Switch to Transforms',
          description: 'Manage prompt rewrite styles and templates',
          category: 'Navigation',
          icon: '🔄',
          handler: () => switchTab('templates')
        });

        cmds.push({
          id: 'nav-library',
          title: 'Switch to Prompt Library',
          description: 'Browse and load pre-configured prompt templates',
          category: 'Navigation',
          icon: '📚',
          handler: () => switchTab('library')
        });

        cmds.push({
          id: 'nav-workflows',
          title: 'Switch to Workflows',
          description: 'Execute multi-step prompt chaining pipelines',
          category: 'Navigation',
          icon: '⛓️',
          handler: () => switchTab('workflows')
        });

        // Dynamic Transforms
        if (Array.isArray(currentTransforms)) {
          for (const t of currentTransforms) {
            if (t && t.name) {
              cmds.push({
                id: `transform-${t.id}`,
                title: `Transform: ${t.name}`,
                description: t.description || 'Apply custom rewrite transform',
                category: 'Transforms',
                shortcut: t.shortcut || '',
                icon: '🎯',
                handler: () => {
                  switchTab('editor');
                  const text = originalInput.value.trim();
                  if (!text) {
                    showToast('PLEASE ENTER A PROMPT FIRST', 'error', 2000);
                    return;
                  }
                  btnEnhance.disabled = true;
                  btnEnhance.textContent = 'TRANSFORMING...';
                  chrome.runtime.sendMessage({ action: 'enhancePrompt', prompt: text, transformId: t.id }, (res) => {
                    btnEnhance.disabled = false;
                    btnEnhance.textContent = 'OPTIMIZE PROMPT';
                    if (res && res.success) {
                      enhancedOutput.value = res.enhancedPrompt;
                      diffCard.style.display = 'block';
                      renderDiff(text, res.enhancedPrompt);
                      updateQualityMetrics(res.enhancedPrompt);
                      saveCurrentToHistory(text, res.enhancedPrompt);
                      showToast(`${t.name.toUpperCase()} APPLIED`, 'success', 2000);
                    }
                  });
                }
              });
            }
          }
        }

        // Dynamic Prompt Library Prompts
        const promptLib = globalThis.ZeusPromptLibrary;
        if (promptLib && typeof promptLib.getAllPrompts === 'function') {
          try {
            const prompts = promptLib.getAllPrompts();
            if (Array.isArray(prompts)) {
              for (const p of prompts) {
                if (p && p.title) {
                  cmds.push({
                    id: `library-${p.id}`,
                    title: `Library: ${p.title}`,
                    description: p.description || p.category || 'Insert prompt from library',
                    category: 'Library',
                    icon: '📖',
                    handler: () => {
                      switchTab('editor');
                      if (originalInput) {
                        originalInput.value = p.template || p.title;
                        checkInputPII();
                      }
                      showToast(`LOADED: ${p.title.toUpperCase()}`, 'info', 1500);
                    }
                  });
                }
              }
            }
          } catch (_) {}
        }

        // Dynamic Workflows
        const workflowsMod = globalThis.ZeusWorkflows;
        if (workflowsMod && typeof workflowsMod.createDefaultWorkflows === 'function') {
          try {
            const wfs = workflowsMod.createDefaultWorkflows();
            if (Array.isArray(wfs)) {
              for (const wf of wfs) {
                if (wf && wf.name) {
                  cmds.push({
                    id: `workflow-${wf.id}`,
                    title: `Workflow: ${wf.name}`,
                    description: wf.description || 'Run multi-step workflow',
                    category: 'Workflows',
                    icon: '🚀',
                    handler: () => {
                      switchTab('workflows');
                      const wfSelect = document.getElementById('workflow-select');
                      if (wfSelect) {
                        wfSelect.value = wf.id;
                        wfSelect.dispatchEvent(new Event('change'));
                      }
                    }
                  });
                }
              }
            }
          } catch (_) {}
        }

        return cmds;
      }
    });

    btnOpenPalette?.addEventListener('click', () => {
      paletteController?.toggle();
    });

    // Global keyboard listener
    window.addEventListener('keydown', (e) => {
      // Toggle palette on Ctrl+K or Cmd+K
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        paletteController?.toggle();
        return;
      }

      // If palette is open, don't execute editor shortcuts
      if (paletteController?.isOpen()) {
        return;
      }

      // Ctrl+Enter or Cmd+Enter: Optimize prompt
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        btnEnhance?.click();
        return;
      }

      // Ctrl+Shift+C: Copy Output
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'c' || e.key === 'C')) {
        if (enhancedOutput && enhancedOutput.value.trim()) {
          e.preventDefault();
          btnCopy?.click();
        }
        return;
      }

      // Ctrl+Shift+I: Insert Output into Chat
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'i' || e.key === 'I')) {
        if (enhancedOutput && enhancedOutput.value.trim()) {
          e.preventDefault();
          btnInsert?.click();
        }
        return;
      }

      // Ctrl+Shift+U: Capture prompt from page
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'u' || e.key === 'U')) {
        e.preventDefault();
        btnCapture?.click();
        return;
      }

      // Ctrl+Shift+P: Toggle Privacy Shield
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        btnTogglePrivacyShield?.click();
        return;
      }
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
      loadTransforms();
      cancelTemplateEdit();
    } else if (tabName === 'library') {
      loadPromptLibrary();
    } else if (tabName === 'workflows') {
      loadWorkflowsUI();
    }
  }

  function setEditorStatus(text, variant) {
    if (!transformEditorStatus) return;
    transformEditorStatus.textContent = text || '';
    transformEditorStatus.className = variant ? `status ${variant}` : 'status';
  }

  // Recorder for the transform currently open in the editor.
  let activeRecorder = null;

  function ensureRecorder() {
    if (activeRecorder || !transformShortcutField || !shortcutEngine) {
      return activeRecorder;
    }

    activeRecorder = shortcutEngine.createRecorder(transformShortcutField, {
      onCommit(combo) {
        if (!editingTransformId) {
          setEditorStatus('SAVE THE TRANSFORM FIRST', 'error');
          return;
        }

        const duplicate = shortcutEngine.findDuplicateShortcut(currentTransforms, combo, editingTransformId);
        if (combo && duplicate) {
          setEditorStatus(`${shortcutEngine.formatCombo(combo)} IS ALREADY USED BY ${duplicate.name.toUpperCase()}`, 'error');
          activeRecorder.setCombo(getEditingTransform()?.shortcut || '');
          return;
        }

        const transform = getEditingTransform();
        if (transform) {
          transform.shortcut = combo;
        }

        setEditorStatus(combo ? `${shortcutEngine.formatCombo(combo)} READY — SAVE TRANSFORM` : 'SHORTCUT CLEARED', 'success');
      },
      onReject(reason) {
        setEditorStatus(String(reason || 'THAT COMBINATION CANNOT BE USED').toUpperCase(), 'error');
        activeRecorder.setCombo(getEditingTransform()?.shortcut || '');
      }
    });

    return activeRecorder;
  }

  function getEditingTransform() {
    return currentTransforms.find((transform) => transform.id === editingTransformId) || null;
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

  function renderMultimodalAttachments() {
    if (!multimodalContainer) return;
    if (activeAttachments.length === 0) {
      multimodalContainer.style.display = 'none';
      multimodalContainer.innerHTML = '';
      return;
    }

    multimodalContainer.style.display = 'flex';
    multimodalContainer.innerHTML = '';

    const multimodalMod = globalThis.ZeusMultimodal;

    activeAttachments.forEach((att, idx) => {
      const chip = document.createElement('div');
      chip.style.display = 'inline-flex';
      chip.style.alignItems = 'center';
      chip.style.gap = '6px';
      chip.style.padding = '3px 8px';
      chip.style.background = 'rgba(0, 240, 255, 0.08)';
      chip.style.border = '1px solid var(--net-cyan)';
      chip.style.borderRadius = '3px';
      chip.style.fontSize = '11px';
      chip.style.fontFamily = "'JetBrains Mono', monospace";
      chip.style.color = 'var(--net-cyan)';

      const category = (multimodalMod && multimodalMod.detectVisualAttachmentType(att)) || att.category || 'image';

      const label = document.createElement('span');
      label.textContent = `[${category.toUpperCase()}] ${att.name || 'image_' + (idx + 1)}`;
      chip.appendChild(label);

      const removeBtn = document.createElement('button');
      removeBtn.textContent = '✕';
      removeBtn.style.background = 'none';
      removeBtn.style.border = 'none';
      removeBtn.style.color = 'var(--hot-red, #ff3366)';
      removeBtn.style.cursor = 'pointer';
      removeBtn.style.fontWeight = 'bold';
      removeBtn.style.padding = '0 2px';
      removeBtn.addEventListener('click', () => {
        activeAttachments.splice(idx, 1);
        renderMultimodalAttachments();
      });
      chip.appendChild(removeBtn);

      multimodalContainer.appendChild(chip);
    });
  }

  if (multimodalFileInput) {
    multimodalFileInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files || []);
      const multimodalMod = globalThis.ZeusMultimodal;

      files.forEach((file) => {
        const reader = new FileReader();
        reader.onload = (loadEvent) => {
          const raw = {
            name: file.name,
            mimeType: file.type,
            sizeBytes: file.size,
            dataUrl: loadEvent.target.result
          };
          const normalized = multimodalMod && multimodalMod.normalizeAttachment
            ? multimodalMod.normalizeAttachment(raw)
            : raw;
          activeAttachments.push(normalized);
          renderMultimodalAttachments();
        };
        reader.readAsDataURL(file);
      });
      multimodalFileInput.value = '';
    });
  }

  // Capture input from page
  btnCapture.addEventListener('click', () => {
    btnCapture.disabled = true;
    showToast('CAPTURING COMPOSER INPUT...', 'info', 1500);

    chrome.runtime.sendMessage({ type: 'sidePanel:getCurrentInput' }, (response) => {
      btnCapture.disabled = false;
      if (response && response.value !== undefined) {
        originalInput.value = response.value;
        if (Array.isArray(response.attachments) && response.attachments.length > 0) {
          activeAttachments = response.attachments.slice();
          renderMultimodalAttachments();
        }
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

    const payload = { action: 'enhancePrompt', prompt: text };
    if (activeAttachments.length > 0) {
      payload.attachments = activeAttachments;
    }

    chrome.runtime.sendMessage(payload, (response) => {
      btnEnhance.disabled = false;
      btnEnhance.textContent = 'OPTIMIZE PROMPT';

      // Clear the "routing" toast by appending a success or error one
      if (response && response.success) {
        showToast('INJECTION COMPLETE', 'success', 2000);
        enhancedOutput.value = response.enhancedPrompt;
        
        // Show and render diff
        diffCard.style.display = 'block';
        renderDiff(text, response.enhancedPrompt);

        // Update Quality Score
        updateQualityMetrics(response.enhancedPrompt);

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
        const err = response?.error ? response.error.toUpperCase() : 'INJECTION FAILED. COMPOSER OUT OF FOCUS.';
        showToast(err, 'error', 3000);
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
    if (oldStr === newStr) {
      return oldStr ? [{ type: 'common', value: oldStr }] : [];
    }
    if (!oldStr) {
      return newStr ? [{ type: 'add', value: newStr }] : [];
    }
    if (!newStr) {
      return [{ type: 'del', value: oldStr }];
    }

    const one = oldStr.split(/(\s+)/);
    const other = newStr.split(/(\s+)/);

    // Fast trim common prefix
    let start = 0;
    while (start < one.length && start < other.length && one[start] === other[start]) {
      start++;
    }

    // Fast trim common suffix
    let endOne = one.length - 1;
    let endOther = other.length - 1;
    while (endOne >= start && endOther >= start && one[endOne] === other[endOther]) {
      endOne--;
      endOther--;
    }

    const prefix = [];
    for (let k = 0; k < start; k++) {
      prefix.push({ type: 'common', value: one[k] });
    }

    const suffix = [];
    for (let k = endOne + 1; k < one.length; k++) {
      suffix.push({ type: 'common', value: one[k] });
    }

    const midOne = one.slice(start, endOne + 1);
    const midOther = other.slice(start, endOther + 1);
    const n = midOne.length;
    const m = midOther.length;

    if (n === 0 && m === 0) {
      return [...prefix, ...suffix];
    }

    // Workload limit: if sub-problem is too large, fallback to block replacement
    const MAX_DP_CELLS = 40000;
    if (n * m > MAX_DP_CELLS) {
      const midDiff = [];
      if (n > 0) midDiff.push({ type: 'del', value: midOne.join('') });
      if (m > 0) midDiff.push({ type: 'add', value: midOther.join('') });
      return [...prefix, ...midDiff, ...suffix];
    }

    const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        if (midOne[i - 1] === midOther[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    let i = n;
    let j = m;
    const midDiff = [];
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && midOne[i - 1] === midOther[j - 1]) {
        midDiff.unshift({ type: 'common', value: midOne[i - 1] });
        i--;
        j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        midDiff.unshift({ type: 'add', value: midOther[j - 1] });
        j--;
      } else {
        midDiff.unshift({ type: 'del', value: midOne[i - 1] });
        i--;
      }
    }

    return [...prefix, ...midDiff, ...suffix];
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

  // Transforms Management (shared zeus_transforms store)
  function loadTransforms() {
    chrome.runtime.sendMessage({ action: 'getTransforms' }, (response) => {
      currentTransforms = Array.isArray(response?.transforms) ? response.transforms : [];
      renderTransforms();
    });
  }

  function renderTransforms() {
    if (!templateList) return;
    templateList.innerHTML = '';

    if (currentTransforms.length === 0) {
      templateList.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 20px;">NO CONFIGURED TRANSFORMS.</p>';
      return;
    }

    currentTransforms.forEach((transform) => {
      const card = document.createElement('div');
      card.className = 'template-item';
      card.style.cssText = 'display: flex; flex-direction: column; gap: 8px; border: 1px solid rgba(255,255,255,0.12); padding: 12px; border-radius: 4px; background: var(--void-elevated);';

      // Header row: Title + Builtin Badge + Toggle
      const headerRow = document.createElement('div');
      headerRow.style.cssText = 'display: flex; justify-content: space-between; align-items: center; gap: 8px;';

      const titleWrap = document.createElement('div');
      titleWrap.style.cssText = 'display: flex; align-items: center; gap: 6px;';

      const title = document.createElement('span');
      title.className = 'template-title';
      title.style.cssText = 'font-weight: 700; font-size: 0.85rem; color: var(--cyber-yellow); font-family: Orbitron, sans-serif;';
      title.textContent = transform.name;
      titleWrap.appendChild(title);

      if (transform.builtin) {
        const builtinBadge = document.createElement('span');
        builtinBadge.textContent = 'BUILTIN';
        builtinBadge.style.cssText = 'font-size: 8px; padding: 1px 4px; border-radius: 2px; background: rgba(0,255,255,0.15); color: var(--net-cyan); font-family: monospace; letter-spacing: 0.5px;';
        titleWrap.appendChild(builtinBadge);
      }

      const toggleLabel = document.createElement('label');
      toggleLabel.style.cssText = 'display: flex; align-items: center; gap: 4px; font-size: 10px; cursor: pointer; font-family: monospace;';

      const toggleInput = document.createElement('input');
      toggleInput.type = 'checkbox';
      toggleInput.checked = transform.enabled !== false;
      toggleInput.setAttribute('aria-label', `Enable ${transform.name}`);
      toggleInput.addEventListener('change', () => {
        transform.enabled = toggleInput.checked;
        toggleText.textContent = toggleInput.checked ? 'ON' : 'OFF';
        toggleText.style.color = toggleInput.checked ? 'var(--acid-green)' : 'var(--text-muted)';
        chrome.runtime.sendMessage({ action: 'saveTransforms', transforms: currentTransforms });
        showToast(`${transform.name.toUpperCase()} ${toggleInput.checked ? 'ENABLED' : 'DISABLED'}`, 'info', 1500);
      });

      const toggleText = document.createElement('span');
      toggleText.textContent = transform.enabled !== false ? 'ON' : 'OFF';
      toggleText.style.color = transform.enabled !== false ? 'var(--acid-green)' : 'var(--text-muted)';

      toggleLabel.appendChild(toggleInput);
      toggleLabel.appendChild(toggleText);

      headerRow.appendChild(titleWrap);
      headerRow.appendChild(toggleLabel);

      // Shortcut badge row
      const shortcutRow = document.createElement('div');
      shortcutRow.style.cssText = 'display: flex; align-items: center; gap: 6px; font-size: 10px; font-family: monospace;';

      const shortcutLabel = document.createElement('span');
      shortcutLabel.style.color = 'var(--text-muted)';
      shortcutLabel.textContent = 'HOTKEY:';

      const shortcutVal = document.createElement('span');
      if (transform.shortcut && shortcutEngine) {
        shortcutVal.style.cssText = 'color: var(--cyber-yellow); background: rgba(252,238,10,0.1); padding: 1px 6px; border-radius: 2px; border: 1px solid rgba(252,238,10,0.3);';
        shortcutVal.textContent = shortcutEngine.formatCombo(transform.shortcut);
      } else {
        shortcutVal.style.color = 'var(--text-muted)';
        shortcutVal.textContent = '[NO SHORTCUT]';
      }

      shortcutRow.appendChild(shortcutLabel);
      shortcutRow.appendChild(shortcutVal);

      // Instruction preview
      const preview = document.createElement('div');
      preview.className = 'template-preview';
      preview.style.cssText = 'font-size: 11px; color: var(--text-secondary); max-height: 38px; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; line-height: 1.4;';
      preview.textContent = transform.instruction || transform.template || '';

      // Actions row
      const actionsRow = document.createElement('div');
      actionsRow.style.cssText = 'display: flex; gap: 8px; margin-top: 4px;';

      const btnExec = document.createElement('button');
      btnExec.type = 'button';
      btnExec.className = 'zeus-btn zeus-btn-cyan';
      btnExec.style.cssText = 'padding: 3px 10px; font-size: 10px;';
      btnExec.textContent = 'RUN IN WORKBENCH';
      btnExec.addEventListener('click', (e) => {
        e.stopPropagation();
        executeTransform(transform);
      });

      const btnEdit = document.createElement('button');
      btnEdit.type = 'button';
      btnEdit.className = 'zeus-btn zeus-btn-ghost';
      btnEdit.style.cssText = 'padding: 3px 10px; font-size: 10px; border: 1px solid rgba(255,255,255,0.15);';
      btnEdit.textContent = 'EDIT';
      btnEdit.addEventListener('click', (e) => {
        e.stopPropagation();
        startTemplateEdit(transform.id);
      });

      const btnDel = document.createElement('button');
      btnDel.type = 'button';
      btnDel.className = 'zeus-btn zeus-btn-ghost';
      btnDel.style.cssText = 'padding: 3px 8px; font-size: 10px; color: var(--arasaka-red);';
      btnDel.textContent = 'DELETE';
      if (transform.builtin) {
        btnDel.disabled = true;
        btnDel.style.opacity = '0.3';
        btnDel.style.cursor = 'not-allowed';
      } else {
        btnDel.addEventListener('click', (e) => {
          e.stopPropagation();
          if (confirm(`Delete transform "${transform.name}"?`)) {
            const nextList = currentTransforms.filter((t) => t.id !== transform.id);
            chrome.runtime.sendMessage({ action: 'saveTransforms', transforms: nextList }, () => {
              showToast('TRANSFORM DELETED', 'success', 1500);
              loadTransforms();
            });
          }
        });
      }

      actionsRow.appendChild(btnExec);
      actionsRow.appendChild(btnEdit);
      actionsRow.appendChild(btnDel);

      card.appendChild(headerRow);
      card.appendChild(shortcutRow);
      card.appendChild(preview);
      card.appendChild(actionsRow);

      templateList.appendChild(card);
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

  // New Transform creation
  btnNewTemplate.addEventListener('click', () => {
    editingTemplateIndex = -1;
    editingTransformId = null;
    templateNameInput.value = '';
    templateTextInput.value = '';
    if (activeRecorder) activeRecorder.setCombo('');
    setEditorStatus('');
    btnDeleteTemplate.style.display = 'none';
    templatesListView.style.display = 'none';
    templatesEditorView.style.display = 'block';
  });

  function startTemplateEdit(transformId) {
    const tpl = currentTransforms.find((transform) => transform.id === transformId);
    if (!tpl) return;

    editingTemplateIndex = currentTransforms.indexOf(tpl);
    editingTransformId = tpl.id;
    templateNameInput.value = tpl.name || '';
    templateTextInput.value = tpl.builtin
      ? (tpl.instruction || '')
      : (tpl.template || tpl.instruction || '');
    if (activeRecorder) activeRecorder.setCombo(tpl.shortcut || '');
    setEditorStatus('');
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
    const body = templateTextInput.value.trim();

    if (!name || !body) {
      showToast('FIELDS CANNOT BE EMPTY', 'error', 2000);
      return;
    }

    const nameTaken = currentTransforms.some((transform) =>
      transform.id !== editingTransformId &&
      String(transform.name || '').toLowerCase() === name.toLowerCase()
    );

    if (nameTaken) {
      showToast('A TRANSFORM WITH THAT NAME EXISTS', 'error', 2500);
      return;
    }

    // Detect {{var}} placeholders in either the instruction or the template.
    const varsRegex = /\{\{\s*([\w]+)\s*\}\}/g;
    const variables = [];
    let match;
    while ((match = varsRegex.exec(body)) !== null) {
      if (!variables.includes(match[1])) {
        variables.push(match[1]);
      }
    }

    // Preserve the record's existing shape: a built-in rewrites via instruction,
    // a user transform rewrites or injects via template.
    const previous = getEditingTransform();
    const next = {
      id: editingTransformId || (transformsModule ? transformsModule.createTransformId(name) : `custom-${Date.now()}`),
      name,
      description: previous?.description || '',
      instruction: previous?.instruction || '',
      template: previous?.template || '',
      variables,
      shortcut: previous?.shortcut || '',
      enabled: previous ? previous.enabled !== false : true,
      builtin: Boolean(previous?.builtin)
    };

    if (previous?.builtin) {
      next.instruction = body;
    } else {
      next.template = body;
    }

    if (editingTemplateIndex === -1 || !previous) {
      currentTransforms.push(next);
    } else {
      currentTransforms[editingTemplateIndex] = next;
    }

    editingTransformId = next.id;
    saveTemplates();
  });

  btnDeleteTemplate.addEventListener('click', () => {
    if (!editingTransformId) {
      showToast('NOTHING TO DELETE', 'error', 2000);
      return;
    }

    currentTransforms = currentTransforms.filter((transform) => transform.id !== editingTransformId);
    editingTransformId = null;
    saveTemplates();
  });

  function saveTemplates() {
    chrome.runtime.sendMessage({
      action: 'saveTransforms',
      transforms: currentTransforms
    }, (response) => {
      if (response && response.success) {
        currentTransforms = Array.isArray(response.transforms) ? response.transforms : currentTransforms;
        showToast('TRANSFORMS COMMITTED', 'success', 2000);
        cancelTemplateEdit();
        renderTransforms();
        notifyTabsOfTransforms();
      } else {
        showToast(String(response?.error || 'FAILED TO COMMIT TRANSFORMS').toUpperCase(), 'error', 3000);
      }
    });
  }

  // Push the change to open tabs so shortcuts apply without a page reload.
  function notifyTabsOfTransforms() {
    chrome.tabs.query({}, (tabs) => {
      for (const tab of tabs || []) {
        if (tab?.id) {
          chrome.tabs.sendMessage(tab.id, { action: 'transformsUpdated' }).catch(() => {});
        }
      }
    });
  }

  // ==========================================
  // PROMPT LIBRARY + VERSIONING CONTROLLER
  // ==========================================
  const libraryList = document.getElementById('library-prompts-list');
  const btnNewLibraryPrompt = document.getElementById('btn-new-library-prompt');
  const librarySearchInput = document.getElementById('library-search-input');
  const libraryPromptModal = document.getElementById('library-prompt-modal');
  const libraryModalTitle = document.getElementById('library-modal-title');
  const libraryEditPromptId = document.getElementById('library-edit-prompt-id');
  const libraryPromptName = document.getElementById('library-prompt-name');
  const libraryPromptDesc = document.getElementById('library-prompt-desc');
  const libraryPromptTags = document.getElementById('library-prompt-tags');
  const libraryPromptContent = document.getElementById('library-prompt-content');
  const libraryVersionNotes = document.getElementById('library-version-notes');
  const btnSaveLibraryVersion = document.getElementById('btn-save-library-version');
  const btnCancelLibraryModal = document.getElementById('btn-cancel-library-modal');

  let currentLibraryPrompts = [];
  const promptLibModule = globalThis.ZeusPromptLibrary || null;

  function loadPromptLibrary() {
    chrome.runtime.sendMessage({ action: 'promptLibrary:getAll' }, (response) => {
      if (response && response.success && Array.isArray(response.prompts)) {
        currentLibraryPrompts = response.prompts;
      } else if (promptLibModule) {
        currentLibraryPrompts = promptLibModule.createDefaultPrompts();
      }
      renderPromptLibrary();
    });
  }

  function renderPromptLibrary() {
    if (!libraryList) return;
    libraryList.innerHTML = '';

    const query = librarySearchInput ? librarySearchInput.value.trim().toLowerCase() : '';
    const prompts = promptLibModule && query
      ? promptLibModule.searchPrompts(currentLibraryPrompts, { query })
      : currentLibraryPrompts;

    if (!prompts || prompts.length === 0) {
      libraryList.innerHTML = '<p class="helper-text" style="text-align: center; padding: 20px;">NO PROMPTS IN ARCHIVE.</p>';
      return;
    }

    prompts.forEach((prompt) => {
      const activeVer = (promptLibModule && promptLibModule.getActiveVersion(prompt)) || prompt.versions?.[0] || {};
      const card = document.createElement('div');
      card.className = 'history-item zeus-terminal-card';
      card.setAttribute('data-variant', 'cyan');
      card.style.marginBottom = '12px';

      const header = document.createElement('div');
      header.style.display = 'flex';
      header.style.justifyContent = 'space-between';
      header.style.alignItems = 'center';

      const title = document.createElement('span');
      title.className = 'history-time';
      title.style.color = 'var(--cyber-yellow)';
      title.style.fontWeight = 'bold';
      title.textContent = prompt.title;

      const badge = document.createElement('span');
      badge.className = 'selected-model-badge';
      badge.textContent = `[${activeVer.versionId || 'v1'}] (${prompt.versions?.length || 1} revs)`;
      badge.style.display = 'inline-block';

      header.appendChild(title);
      header.appendChild(badge);
      card.appendChild(header);

      if (prompt.description) {
        const desc = document.createElement('p');
        desc.className = 'helper-text';
        desc.style.margin = '4px 0';
        desc.textContent = prompt.description;
        card.appendChild(desc);
      }

      // Version selector dropdown
      const versionRow = document.createElement('div');
      versionRow.style.margin = '8px 0';
      versionRow.style.display = 'flex';
      versionRow.style.gap = '8px';
      versionRow.style.alignItems = 'center';

      const verSelectLabel = document.createElement('span');
      verSelectLabel.className = 'helper-text';
      verSelectLabel.textContent = 'VERSION:';

      const verSelect = document.createElement('select');
      verSelect.className = 'zeus-input zeus-select';
      verSelect.style.padding = '2px 6px';
      verSelect.style.fontSize = '11px';
      verSelect.style.flex = '1';

      (prompt.versions || []).forEach((ver) => {
        const opt = document.createElement('option');
        opt.value = ver.versionId;
        opt.textContent = `${ver.versionId} — ${ver.notes || 'Revision'} (${new Date(ver.createdAt).toLocaleDateString()})`;
        if (ver.versionId === prompt.activeVersionId) {
          opt.selected = true;
        }
        verSelect.appendChild(opt);
      });

      versionRow.appendChild(verSelectLabel);
      versionRow.appendChild(verSelect);
      card.appendChild(versionRow);

      // Content preview
      const preview = document.createElement('div');
      preview.className = 'history-text';
      preview.style.maxHeight = '60px';
      preview.style.overflowY = 'hidden';
      preview.style.fontSize = '11px';
      preview.textContent = activeVer.content || '';
      card.appendChild(preview);

      // Buttons
      const btnRow = document.createElement('div');
      btnRow.className = 'button-row';
      btnRow.style.marginTop = '10px';

      const btnInject = document.createElement('button');
      btnInject.className = 'zeus-btn zeus-btn-cyan';
      btnInject.style.padding = '4px 8px';
      btnInject.style.fontSize = '11px';
      btnInject.textContent = 'USE PROMPT';
      btnInject.addEventListener('click', () => {
        const selectedVer = prompt.versions?.find((v) => v.versionId === verSelect.value) || activeVer;
        injectPromptToEditor(selectedVer);
      });

      const btnAddRev = document.createElement('button');
      btnAddRev.className = 'zeus-btn zeus-btn-yellow';
      btnAddRev.style.padding = '4px 8px';
      btnAddRev.style.fontSize = '11px';
      btnAddRev.textContent = '+ REVISION';
      btnAddRev.addEventListener('click', () => {
        openNewRevisionModal(prompt);
      });

      const btnRevert = document.createElement('button');
      btnRevert.className = 'zeus-btn zeus-btn-ghost';
      btnRevert.style.padding = '4px 8px';
      btnRevert.style.fontSize = '11px';
      btnRevert.textContent = 'REVERT TO THIS';
      btnRevert.addEventListener('click', () => {
        const targetVerId = verSelect.value;
        if (targetVerId === prompt.activeVersionId) {
          showToast('ALREADY ACTIVE VERSION', 'info', 1500);
          return;
        }
        chrome.runtime.sendMessage({
          action: 'promptLibrary:revertVersion',
          promptId: prompt.id,
          versionId: targetVerId
        }, (res) => {
          if (res && res.success) {
            currentLibraryPrompts = res.prompts;
            renderPromptLibrary();
            showToast(`REVERTED TO ${targetVerId.toUpperCase()}`, 'success', 2000);
          } else {
            showToast('FAILED TO REVERT VERSION', 'error', 2000);
          }
        });
      });

      const btnDelete = document.createElement('button');
      btnDelete.className = 'zeus-btn zeus-btn-red';
      btnDelete.style.padding = '4px 8px';
      btnDelete.style.fontSize = '11px';
      btnDelete.textContent = 'DELETE';
      btnDelete.addEventListener('click', () => {
        chrome.runtime.sendMessage({
          action: 'promptLibrary:delete',
          promptId: prompt.id
        }, (res) => {
          if (res && res.success) {
            currentLibraryPrompts = res.prompts;
            renderPromptLibrary();
            showToast('PROMPT REMOVED FROM LIBRARY', 'success', 2000);
          }
        });
      });

      btnRow.appendChild(btnInject);
      btnRow.appendChild(btnAddRev);
      btnRow.appendChild(btnRevert);
      btnRow.appendChild(btnDelete);
      card.appendChild(btnRow);

      libraryList.appendChild(card);
    });
  }

  function injectPromptToEditor(versionObj) {
    const content = versionObj.content || '';
    const vars = versionObj.variables || (promptLibModule ? promptLibModule.extractVariables(content) : []);

    if (vars.length === 0) {
      originalInput.value = content;
      switchTab('editor');
      showToast('PROMPT INJECTED INTO WORKBENCH', 'success', 2000);
      return;
    }

    currentFillingTemplateText = content;
    modalVariablesInputs.innerHTML = '';
    vars.forEach((v) => {
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

  function openNewRevisionModal(existingPrompt) {
    if (!libraryPromptModal) return;
    if (existingPrompt) {
      libraryModalTitle.textContent = `/// NEW REVISION: ${existingPrompt.title.toUpperCase()}`;
      libraryEditPromptId.value = existingPrompt.id;
      libraryPromptName.value = existingPrompt.title;
      libraryPromptName.disabled = true;
      libraryPromptDesc.value = existingPrompt.description || '';
      libraryPromptDesc.disabled = true;
      libraryPromptTags.value = (existingPrompt.tags || []).join(', ');
      libraryPromptTags.disabled = true;
      const activeVer = (promptLibModule && promptLibModule.getActiveVersion(existingPrompt)) || existingPrompt.versions?.[0] || {};
      libraryPromptContent.value = activeVer.content || '';
      libraryVersionNotes.value = '';
    } else {
      libraryModalTitle.textContent = '/// CREATE NEW PROMPT';
      libraryEditPromptId.value = '';
      libraryPromptName.value = '';
      libraryPromptName.disabled = false;
      libraryPromptDesc.value = '';
      libraryPromptDesc.disabled = false;
      libraryPromptTags.value = '';
      libraryPromptTags.disabled = false;
      libraryPromptContent.value = '';
      libraryVersionNotes.value = 'Initial version';
    }
    libraryPromptModal.style.display = 'flex';
  }

  if (btnNewLibraryPrompt) {
    btnNewLibraryPrompt.addEventListener('click', () => {
      openNewRevisionModal(null);
    });
  }

  if (btnCancelLibraryModal) {
    btnCancelLibraryModal.addEventListener('click', () => {
      if (libraryPromptModal) libraryPromptModal.style.display = 'none';
    });
  }

  if (librarySearchInput) {
    librarySearchInput.addEventListener('input', () => {
      renderPromptLibrary();
    });
  }

  if (btnSaveLibraryVersion) {
    btnSaveLibraryVersion.addEventListener('click', () => {
      const promptId = libraryEditPromptId.value;
      const content = libraryPromptContent.value.trim();
      const notes = libraryVersionNotes.value.trim();

      if (!content) {
        showToast('CONTENT CANNOT BE EMPTY', 'error', 2000);
        return;
      }

      if (promptId) {
        chrome.runtime.sendMessage({
          action: 'promptLibrary:addVersion',
          promptId,
          versionData: { content, notes }
        }, (res) => {
          if (res && res.success) {
            currentLibraryPrompts = res.prompts;
            if (libraryPromptModal) libraryPromptModal.style.display = 'none';
            renderPromptLibrary();
            showToast('NEW REVISION COMMITTED', 'success', 2000);
          } else {
            showToast(String(res?.error || 'FAILED TO COMMIT REVISION').toUpperCase(), 'error', 3000);
          }
        });
      } else {
        const title = libraryPromptName.value.trim();
        const description = libraryPromptDesc.value.trim();
        const tags = libraryPromptTags.value.split(',').map((t) => t.trim()).filter(Boolean);

        if (!title) {
          showToast('TITLE IS REQUIRED', 'error', 2000);
          return;
        }

        chrome.runtime.sendMessage({
          action: 'promptLibrary:save',
          prompt: { title, description, tags, content, notes }
        }, (res) => {
          if (res && res.success) {
            currentLibraryPrompts = res.prompts;
            if (libraryPromptModal) libraryPromptModal.style.display = 'none';
            renderPromptLibrary();
            showToast('PROMPT CREATED & SAVED', 'success', 2000);
          } else {
            showToast(String(res?.error || 'FAILED TO SAVE PROMPT').toUpperCase(), 'error', 3000);
          }
        });
      }
    });
  }

  // Quality Score & A/B Testing Controls
  const qualityScoreBadge = document.getElementById('quality-score-badge');
  const qualityScoreValue = document.getElementById('quality-score-value');
  const qualityGradeBadge = document.getElementById('quality-grade-badge');
  const qualitySuggestionsPanel = document.getElementById('quality-suggestions-panel');
  const qualitySuggestionsList = document.getElementById('quality-suggestions-list');
  const btnAbCompare = document.getElementById('btn-ab-compare');

  const modalAbCompare = document.getElementById('modal-ab-compare');
  const btnCloseAbModal = document.getElementById('btn-close-ab-modal');
  const abScoreA = document.getElementById('ab-score-a');
  const abScoreB = document.getElementById('ab-score-b');
  const abContentA = document.getElementById('ab-content-a');
  const abContentB = document.getElementById('ab-content-b');
  const abScoreDelta = document.getElementById('ab-score-delta');
  const abDimensionBreakdown = document.getElementById('ab-dimension-breakdown');
  const btnVoteA = document.getElementById('btn-vote-a');
  const btnVoteB = document.getElementById('btn-vote-b');

  function updateQualityMetrics(promptText) {
    if (!promptText) {
      if (qualityScoreBadge) qualityScoreBadge.style.display = 'none';
      if (qualitySuggestionsPanel) qualitySuggestionsPanel.style.display = 'none';
      return;
    }

    const scorer = globalThis.ZeusQualityScorer;
    if (!scorer) return;

    const evaluation = scorer.evaluateQuality(promptText);
    if (qualityScoreValue) qualityScoreValue.textContent = `${evaluation.score}/100`;
    if (qualityGradeBadge) qualityGradeBadge.textContent = evaluation.grade;
    if (qualityScoreBadge) qualityScoreBadge.style.display = 'inline-flex';

    if (qualitySuggestionsList && evaluation.suggestions && evaluation.suggestions.length > 0) {
      qualitySuggestionsList.innerHTML = '';
      evaluation.suggestions.slice(0, 3).forEach((s) => {
        const li = document.createElement('li');
        li.textContent = s;
        qualitySuggestionsList.appendChild(li);
      });
      if (qualitySuggestionsPanel) qualitySuggestionsPanel.style.display = 'block';
    }
  }

  btnAbCompare?.addEventListener('click', () => {
    const textA = originalInput.value.trim();
    const textB = enhancedOutput.value.trim();

    if (!textA || !textB) {
      showToast('BOTH ORIGINAL & ENHANCED PROMPTS REQUIRED FOR A/B COMPARE', 'error', 2500);
      return;
    }

    const scorer = globalThis.ZeusQualityScorer;
    if (!scorer) return;

    const comp = scorer.compareVariants(textA, textB, { labelA: 'Original Input', labelB: 'Optimized Prompt' });

    if (abScoreA) abScoreA.textContent = `${comp.variantA.score}/100 [${comp.variantA.grade}]`;
    if (abScoreB) abScoreB.textContent = `${comp.variantB.score}/100 [${comp.variantB.grade}]`;
    if (abContentA) abContentA.textContent = textA;
    if (abContentB) abContentB.textContent = textB;

    if (abScoreDelta) {
      const sign = comp.delta > 0 ? '+' : '';
      abScoreDelta.textContent = `${sign}${comp.delta} PTS (${comp.winner === 'B' ? 'OPTIMIZED WINS' : comp.winner === 'A' ? 'ORIGINAL WINS' : 'TIE'})`;
      abScoreDelta.style.color = comp.delta > 0 ? 'var(--acid-green)' : (comp.delta < 0 ? 'var(--arasaka-red)' : 'var(--text-muted)');
    }

    if (abDimensionBreakdown) {
      abDimensionBreakdown.innerHTML = '';
      const dims = ['clarity', 'structure', 'context', 'examples', 'efficiency'];
      dims.forEach((d) => {
        const div = document.createElement('div');
        div.style.padding = '4px';
        div.style.background = 'rgba(255,255,255,0.03)';
        div.style.borderRadius = '3px';
        const diff = comp.dimensionDeltas[d];
        const diffText = diff > 0 ? `+${diff}` : String(diff);
        const diffColor = diff > 0 ? 'var(--acid-green)' : (diff < 0 ? 'var(--arasaka-red)' : 'var(--text-muted)');
        div.innerHTML = `<div style="color:var(--text-muted);text-transform:uppercase;">${d.slice(0, 4)}</div><div style="color:${diffColor};font-weight:bold;">${diffText}</div>`;
        abDimensionBreakdown.appendChild(div);
      });
    }

    if (modalAbCompare) modalAbCompare.style.display = 'flex';
  });

  btnCloseAbModal?.addEventListener('click', () => {
    if (modalAbCompare) modalAbCompare.style.display = 'none';
  });

  btnVoteA?.addEventListener('click', () => {
    saveExperimentVote('A');
  });

  btnVoteB?.addEventListener('click', () => {
    saveExperimentVote('B');
  });

  function saveExperimentVote(chosen) {
    const textA = originalInput.value.trim();
    const textB = enhancedOutput.value.trim();
    const scorer = globalThis.ZeusQualityScorer;
    if (scorer) {
      const record = scorer.createExperimentRecord({
        title: `Compare: ${textA.slice(0, 30)}...`,
        promptA: textA,
        promptB: textB,
        userWinner: chosen
      });
      chrome.runtime.sendMessage({ action: 'ab:saveExperiment', experiment: record });
    }
    showToast(`VARIANT ${chosen} RECORDED AS EXPERIMENT WINNER`, 'success', 2000);
    if (modalAbCompare) modalAbCompare.style.display = 'none';
  }

  // ==========================================
  // WORKFLOWS / PROMPT CHAINING CONTROLLER
  // ==========================================
  const workflowSelect = document.getElementById('workflow-select');
  const workflowDesc = document.getElementById('workflow-description');
  const workflowStepsCountBadge = document.getElementById('workflow-steps-count-badge');
  const workflowStepsPipeline = document.getElementById('workflow-steps-pipeline');
  const workflowInputPrompt = document.getElementById('workflow-input-prompt');
  const btnWorkflowSyncInput = document.getElementById('btn-workflow-sync-input');
  const btnWorkflowRun = document.getElementById('btn-workflow-run');
  const workflowExecutionCard = document.getElementById('workflow-execution-card');
  const workflowExecStatusBadge = document.getElementById('workflow-exec-status-badge');
  const workflowTraceTimeline = document.getElementById('workflow-trace-timeline');
  const workflowFinalOutput = document.getElementById('workflow-final-output');
  const btnWorkflowApplyEditor = document.getElementById('btn-workflow-apply-editor');
  const btnWorkflowCopy = document.getElementById('btn-workflow-copy');

  let currentWorkflows = [];
  let selectedWorkflow = null;
  let activeWorkflowResult = null;

  function loadWorkflowsUI() {
    chrome.runtime.sendMessage({ action: 'workflow:getAll' }, (response) => {
      if (response && response.success && Array.isArray(response.workflows)) {
        currentWorkflows = response.workflows;
      } else if (globalThis.ZeusWorkflows) {
        currentWorkflows = globalThis.ZeusWorkflows.createDefaultWorkflows();
      }

      if (!workflowSelect) return;
      workflowSelect.innerHTML = '';

      currentWorkflows.forEach((wf, idx) => {
        const opt = document.createElement('option');
        opt.value = wf.id;
        opt.textContent = `${wf.name} (${wf.steps?.length || 0} stages)`;
        workflowSelect.appendChild(opt);
      });

      if (!selectedWorkflow && currentWorkflows.length > 0) {
        selectedWorkflow = currentWorkflows[0];
      } else if (selectedWorkflow) {
        selectedWorkflow = currentWorkflows.find(w => w.id === selectedWorkflow.id) || currentWorkflows[0];
      }

      if (selectedWorkflow) {
        workflowSelect.value = selectedWorkflow.id;
        renderSelectedWorkflow();
      }
    });
  }

  function renderSelectedWorkflow() {
    if (!selectedWorkflow) return;
    if (workflowDesc) workflowDesc.textContent = selectedWorkflow.description || '';
    if (workflowStepsCountBadge) {
      workflowStepsCountBadge.textContent = `${selectedWorkflow.steps?.length || 0} STAGES`;
    }

    if (!workflowStepsPipeline) return;
    workflowStepsPipeline.innerHTML = '';

    (selectedWorkflow.steps || []).forEach((step, idx) => {
      const stepCard = document.createElement('div');
      stepCard.style.padding = '8px 10px';
      stepCard.style.background = 'rgba(255, 255, 255, 0.03)';
      stepCard.style.border = '1px solid rgba(0, 240, 255, 0.2)';
      stepCard.style.borderRadius = '4px';
      stepCard.style.display = 'flex';
      stepCard.style.flexDirection = 'column';
      stepCard.style.gap = '4px';

      const header = document.createElement('div');
      header.style.display = 'flex';
      header.style.justifyContent = 'space-between';
      header.style.alignItems = 'center';

      const title = document.createElement('span');
      title.style.fontFamily = "'JetBrains Mono', monospace";
      title.style.fontSize = '11px';
      title.style.fontWeight = 'bold';
      title.style.color = 'var(--cyber-yellow)';
      title.textContent = `STAGE ${idx + 1}: ${step.name.toUpperCase()}`;

      const idBadge = document.createElement('span');
      idBadge.style.fontSize = '10px';
      idBadge.style.color = 'var(--text-muted)';
      idBadge.textContent = step.id;

      header.appendChild(title);
      header.appendChild(idBadge);

      const instruction = document.createElement('div');
      instruction.style.fontSize = '10px';
      instruction.style.color = 'var(--text-secondary)';
      instruction.style.lineHeight = '1.3';
      instruction.textContent = step.instruction;

      stepCard.appendChild(header);
      stepCard.appendChild(instruction);
      workflowStepsPipeline.appendChild(stepCard);
    });
  }

  workflowSelect?.addEventListener('change', () => {
    const id = workflowSelect.value;
    selectedWorkflow = currentWorkflows.find(w => w.id === id) || null;
    renderSelectedWorkflow();
  });

  btnWorkflowSyncInput?.addEventListener('click', () => {
    const text = originalInput?.value?.trim() || enhancedOutput?.value?.trim() || '';
    if (workflowInputPrompt) {
      workflowInputPrompt.value = text;
      showToast('PAYLOAD SYNCED FROM EDITOR', 'info', 1500);
    }
  });

  btnWorkflowRun?.addEventListener('click', () => {
    const text = workflowInputPrompt?.value?.trim() || originalInput?.value?.trim() || '';
    if (!text) {
      showToast('WORKFLOW INPUT DETECTED AS VOID', 'error', 2000);
      return;
    }
    if (!selectedWorkflow) {
      showToast('NO WORKFLOW SELECTED', 'error', 2000);
      return;
    }

    btnWorkflowRun.disabled = true;
    btnWorkflowRun.textContent = 'RUNNING PIPELINE...';
    if (workflowExecutionCard) workflowExecutionCard.style.display = 'block';
    if (workflowExecStatusBadge) {
      workflowExecStatusBadge.textContent = 'EXECUTING PIPELINE...';
      workflowExecStatusBadge.style.color = 'var(--cyber-yellow)';
    }
    if (workflowTraceTimeline) workflowTraceTimeline.innerHTML = '<p style="color:var(--text-muted);font-size:11px;">Initializing stages...</p>';

    const payload = {
      action: 'workflow:execute',
      prompt: text,
      workflowId: selectedWorkflow.id,
      workflow: selectedWorkflow
    };

    chrome.runtime.sendMessage(payload, (response) => {
      btnWorkflowRun.disabled = false;
      btnWorkflowRun.textContent = 'RUN WORKFLOW';

      if (response && response.success) {
        activeWorkflowResult = response;
        if (workflowExecStatusBadge) {
          workflowExecStatusBadge.textContent = `COMPLETED IN ${response.totalLatencyMs}ms`;
          workflowExecStatusBadge.style.color = 'var(--acid-green)';
        }
        if (workflowFinalOutput) {
          workflowFinalOutput.value = response.finalPrompt || '';
        }
        renderWorkflowTrace(response.trace || []);
        showToast('WORKFLOW PIPELINE COMPLETED', 'success', 2500);
      } else {
        if (workflowExecStatusBadge) {
          workflowExecStatusBadge.textContent = 'PIPELINE FAILED';
          workflowExecStatusBadge.style.color = 'var(--arasaka-red)';
        }
        if (response?.trace) {
          renderWorkflowTrace(response.trace);
        }
        showToast(String(response?.error || 'WORKFLOW EXECUTION FAILED').toUpperCase(), 'error', 3000);
      }
    });
  });

  function renderWorkflowTrace(traceList) {
    if (!workflowTraceTimeline) return;
    workflowTraceTimeline.innerHTML = '';

    traceList.forEach((trace, idx) => {
      const card = document.createElement('div');
      card.style.padding = '8px 10px';
      card.style.background = 'rgba(0, 0, 0, 0.4)';
      card.style.border = trace.status === 'completed'
        ? '1px solid rgba(57, 255, 20, 0.3)'
        : '1px solid rgba(255, 0, 60, 0.4)';
      card.style.borderRadius = '4px';

      const header = document.createElement('div');
      header.style.display = 'flex';
      header.style.justifyContent = 'space-between';
      header.style.alignItems = 'center';

      const name = document.createElement('span');
      name.style.fontFamily = "'JetBrains Mono', monospace";
      name.style.fontSize = '11px';
      name.style.color = trace.status === 'completed' ? 'var(--acid-green)' : 'var(--arasaka-red)';
      name.textContent = `STAGE ${idx + 1}: ${trace.stepName} [${trace.status.toUpperCase()}]`;

      const latency = document.createElement('span');
      latency.style.fontSize = '10px';
      latency.style.color = 'var(--text-muted)';
      latency.textContent = `${trace.latencyMs}ms`;

      header.appendChild(name);
      header.appendChild(latency);
      card.appendChild(header);

      if (trace.output) {
        const outBox = document.createElement('div');
        outBox.style.marginTop = '6px';
        outBox.style.fontSize = '10px';
        outBox.style.fontFamily = "'JetBrains Mono', monospace";
        outBox.style.maxHeight = '80px';
        outBox.style.overflowY = 'auto';
        outBox.style.background = 'rgba(255,255,255,0.02)';
        outBox.style.padding = '4px 6px';
        outBox.style.borderRadius = '3px';
        outBox.style.whiteSpace = 'pre-wrap';
        outBox.style.wordBreak = 'break-word';
        outBox.textContent = trace.output;
        card.appendChild(outBox);
      }

      workflowTraceTimeline.appendChild(card);
    });
  }

  btnWorkflowApplyEditor?.addEventListener('click', () => {
    if (!workflowFinalOutput || !workflowFinalOutput.value.trim()) {
      showToast('NO WORKFLOW OUTPUT TO APPLY', 'error', 2000);
      return;
    }
    const finalVal = workflowFinalOutput.value.trim();
    if (enhancedOutput) enhancedOutput.value = finalVal;
    if (workflowInputPrompt && originalInput) {
      originalInput.value = workflowInputPrompt.value.trim();
    }
    diffCard.style.display = 'block';
    renderDiff(originalInput.value, finalVal);
    updateQualityMetrics(finalVal);
    saveCurrentToHistory(originalInput.value, finalVal);
    switchTab('editor');
    showToast('WORKFLOW RESULT APPLIED TO EDITOR', 'success', 2000);
  });

  btnWorkflowCopy?.addEventListener('click', () => {
    if (!workflowFinalOutput || !workflowFinalOutput.value.trim()) {
      showToast('NO RESULT TO COPY', 'error', 2000);
      return;
    }
    navigator.clipboard.writeText(workflowFinalOutput.value.trim()).then(() => {
      showToast('RESULT COPIED TO CLIPBOARD', 'success', 2000);
    }).catch(() => {
      showToast('CLIPBOARD ACCESS DENIED', 'error', 2000);
    });
  });

  ensureRecorder();
  refreshPrivacyShieldStatus();
  initCommandPalette();
});
