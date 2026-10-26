(function initZeusCommandPalette(globalScope) {
  'use strict';

  const DEFAULT_CATEGORIES = Object.freeze([
    'Actions',
    'Navigation',
    'Transforms',
    'Library',
    'Workflows',
    'Providers'
  ]);

  function normalizeText(str) {
    return String(str || '').toLowerCase().trim();
  }

  function getAcronym(str) {
    return String(str || '')
      .split(/[\s\-_]+/)
      .map((w) => w[0])
      .join('')
      .toLowerCase();
  }

  function scoreCommand(item, query) {
    if (!query) return 10; // Base score for unscoped browse

    const q = normalizeText(query);
    const title = normalizeText(item.title);
    const desc = normalizeText(item.description);
    const category = normalizeText(item.category);
    const shortcut = normalizeText(item.shortcut);
    const id = normalizeText(item.id);

    let score = 0;

    // Exact match in title
    if (title === q) {
      score += 120;
    } else if (title.startsWith(q)) {
      score += 90;
    } else if (title.includes(q)) {
      score += 60;
    }

    // Word boundary matches in title
    const words = title.split(/\s+/);
    for (const w of words) {
      if (w.startsWith(q)) {
        score += 35;
        break;
      }
    }

    // Acronym match
    const acronym = getAcronym(item.title);
    if (acronym && acronym.startsWith(q)) {
      score += 50;
    }

    // Shortcut match
    if (shortcut && (shortcut.includes(q) || q.includes(shortcut))) {
      score += 45;
    }

    // Description match
    if (desc && desc.includes(q)) {
      score += 25;
    }

    // Category match
    if (category && (category === q || category.startsWith(q))) {
      score += 30;
    } else if (category && category.includes(q)) {
      score += 15;
    }

    // ID match
    if (id && id.includes(q)) {
      score += 10;
    }

    // Subsequence fuzzy match for title if no substring found
    if (score === 0) {
      let qIdx = 0;
      for (let i = 0; i < title.length && qIdx < q.length; i++) {
        if (title[i] === q[qIdx]) {
          qIdx++;
        }
      }
      if (qIdx === q.length) {
        score += 15;
      }
    }

    return score;
  }

  function fuzzySearch(query, commands = []) {
    const list = Array.isArray(commands) ? commands : [];
    if (!query || !query.trim()) {
      return list.slice();
    }

    const scored = [];
    for (const item of list) {
      const score = scoreCommand(item, query);
      if (score > 0) {
        scored.push({ item, score });
      }
    }

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return String(a.item.title || '').localeCompare(String(b.item.title || ''));
    });

    return scored.map((s) => s.item);
  }

  class CommandRegistry {
    constructor() {
      this._commands = new Map();
    }

    register(command) {
      if (!command || !command.id || !command.title) {
        throw new Error('Command must contain an id and title.');
      }
      const normalized = {
        id: String(command.id),
        title: String(command.title),
        description: String(command.description || ''),
        category: String(command.category || 'Actions'),
        shortcut: String(command.shortcut || ''),
        icon: String(command.icon || '⚡'),
        keywords: Array.isArray(command.keywords) ? command.keywords.map(String) : [],
        handler: typeof command.handler === 'function' ? command.handler : () => {}
      };
      this._commands.set(normalized.id, normalized);
      return normalized;
    }

    registerAll(commands) {
      if (Array.isArray(commands)) {
        commands.forEach((c) => this.register(c));
      }
    }

    unregister(id) {
      return this._commands.delete(String(id));
    }

    get(id) {
      return this._commands.get(String(id)) || null;
    }

    getAll() {
      return Array.from(this._commands.values());
    }

    clear() {
      this._commands.clear();
    }

    search(query) {
      return fuzzySearch(query, this.getAll());
    }

    execute(id, context = {}) {
      const cmd = this.get(id);
      if (!cmd) {
        throw new Error(`Command '${id}' not found.`);
      }
      return cmd.handler(context);
    }
  }

  function createPalette(options = {}) {
    const registry = options.registry || new CommandRegistry();
    const container = options.container || (typeof document !== 'undefined' ? document.body : null);
    const getDynamicCommands = typeof options.getCommands === 'function' ? options.getCommands : () => registry.getAll();
    const onExecute = typeof options.onExecute === 'function' ? options.onExecute : null;
    const onClose = typeof options.onClose === 'function' ? options.onClose : null;

    let overlayEl = null;
    let inputEl = null;
    let listEl = null;
    let isOpen = false;
    let currentResults = [];
    let selectedIndex = 0;
    let previousActiveElement = null;

    function buildDOM() {
      if (!container || overlayEl) return;

      overlayEl = document.createElement('div');
      overlayEl.className = 'zeus-palette-overlay';
      overlayEl.style.cssText = [
        'position: fixed',
        'top: 0',
        'left: 0',
        'width: 100%',
        'height: 100%',
        'background: rgba(0, 0, 0, 0.75)',
        'backdrop-filter: blur(4px)',
        'z-index: 99999',
        'display: none',
        'align-items: flex-start',
        'justify-content: center',
        'padding-top: 60px',
        'box-sizing: border-box'
      ].join(';');

      const dialog = document.createElement('div');
      dialog.className = 'zeus-palette-dialog';
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
      dialog.setAttribute('aria-label', 'Command Palette');
      dialog.style.cssText = [
        'width: 90%',
        'max-width: 520px',
        'background: #0a0b10',
        'border: 1px solid #00F0FF',
        'box-shadow: 0 0 25px rgba(0, 240, 255, 0.35)',
        'border-radius: 4px',
        'overflow: hidden',
        'display: flex',
        'flex-direction: column',
        'font-family: "JetBrains Mono", monospace'
      ].join(';');

      const header = document.createElement('div');
      header.className = 'zeus-palette-header';
      header.style.cssText = [
        'display: flex',
        'align-items: center',
        'padding: 10px 14px',
        'background: rgba(0, 240, 255, 0.05)',
        'border-bottom: 1px solid rgba(0, 240, 255, 0.2)'
      ].join(';');

      const promptIcon = document.createElement('span');
      promptIcon.textContent = '>';
      promptIcon.style.cssText = 'color: #00F0FF; font-weight: bold; margin-right: 10px; font-size: 14px;';

      inputEl = document.createElement('input');
      inputEl.type = 'text';
      inputEl.className = 'zeus-palette-input';
      inputEl.placeholder = 'Type a command or search (e.g. optimize, formal, library)...';
      inputEl.setAttribute('role', 'combobox');
      inputEl.setAttribute('aria-autocomplete', 'list');
      inputEl.setAttribute('aria-expanded', 'true');
      inputEl.style.cssText = [
        'flex: 1',
        'background: transparent',
        'border: none',
        'outline: none',
        'color: #fff',
        'font-family: "JetBrains Mono", monospace',
        'font-size: 13px'
      ].join(';');

      header.appendChild(promptIcon);
      header.appendChild(inputEl);
      dialog.appendChild(header);

      listEl = document.createElement('div');
      listEl.className = 'zeus-palette-list';
      listEl.setAttribute('role', 'listbox');
      listEl.style.cssText = [
        'max-height: 320px',
        'overflow-y: auto',
        'padding: 6px 0',
        'display: flex',
        'flex-direction: column'
      ].join(';');
      dialog.appendChild(listEl);

      const footer = document.createElement('div');
      footer.className = 'zeus-palette-footer';
      footer.style.cssText = [
        'display: flex',
        'justify-content: space-between',
        'padding: 6px 12px',
        'background: rgba(255, 255, 255, 0.02)',
        'border-top: 1px solid rgba(255, 255, 255, 0.08)',
        'font-size: 10px',
        'color: #888'
      ].join(';');
      footer.innerHTML = '<span>[↑↓] Navigate</span><span>[↵] Execute</span><span>[ESC] Close</span>';
      dialog.appendChild(footer);

      overlayEl.appendChild(dialog);
      container.appendChild(overlayEl);

      // Event listeners
      overlayEl.addEventListener('click', (e) => {
        if (e.target === overlayEl) {
          close();
        }
      });

      inputEl.addEventListener('input', () => {
        render();
      });

      inputEl.addEventListener('keydown', handleKeydown);
    }

    function handleKeydown(e) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (currentResults.length > 0) {
          selectedIndex = (selectedIndex + 1) % currentResults.length;
          updateSelectedHighlight();
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (currentResults.length > 0) {
          selectedIndex = (selectedIndex - 1 + currentResults.length) % currentResults.length;
          updateSelectedHighlight();
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        executeCurrent();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    }

    function render() {
      if (!listEl) return;
      const query = inputEl ? inputEl.value : '';
      const all = getDynamicCommands();
      currentResults = fuzzySearch(query, all);

      if (selectedIndex >= currentResults.length) {
        selectedIndex = Math.max(0, currentResults.length - 1);
      }

      listEl.innerHTML = '';

      if (currentResults.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'zeus-palette-empty';
        empty.style.cssText = 'padding: 18px 14px; color: #666; font-size: 12px; text-align: center;';
        empty.textContent = 'NO COMMANDS MATCHED QUERY';
        listEl.appendChild(empty);
        return;
      }

      let currentCategory = '';
      currentResults.forEach((cmd, idx) => {
        if (cmd.category && cmd.category !== currentCategory && !query.trim()) {
          currentCategory = cmd.category;
          const catHeader = document.createElement('div');
          catHeader.className = 'zeus-palette-category-header';
          catHeader.style.cssText = [
            'padding: 4px 12px',
            'font-size: 9px',
            'font-weight: bold',
            'color: #FCEE0A',
            'letter-spacing: 1px',
            'text-transform: uppercase',
            'background: rgba(252, 238, 10, 0.05)',
            'margin-top: 4px'
          ].join(';');
          catHeader.textContent = `/// ${currentCategory}`;
          listEl.appendChild(catHeader);
        }

        const item = document.createElement('div');
        item.className = 'zeus-palette-item';
        item.setAttribute('role', 'option');
        item.setAttribute('id', `palette-item-${cmd.id}`);
        item.dataset.index = String(idx);
        item.style.cssText = [
          'display: flex',
          'align-items: center',
          'justify-content: space-between',
          'padding: 8px 12px',
          'cursor: pointer',
          'transition: background 0.1s ease',
          'font-size: 12px'
        ].join(';');

        const left = document.createElement('div');
        left.style.cssText = 'display: flex; align-items: center; gap: 8px; overflow: hidden;';

        const icon = document.createElement('span');
        icon.textContent = cmd.icon || '⚡';
        icon.style.cssText = 'font-size: 12px; margin-right: 4px;';

        const textWrap = document.createElement('div');
        textWrap.style.cssText = 'display: flex; flex-direction: column; overflow: hidden;';

        const title = document.createElement('span');
        title.className = 'zeus-palette-item-title';
        title.textContent = cmd.title;
        title.style.cssText = 'color: #fff; font-weight: 500; white-space: nowrap; text-overflow: ellipsis; overflow: hidden;';

        textWrap.appendChild(title);

        if (cmd.description) {
          const desc = document.createElement('span');
          desc.className = 'zeus-palette-item-desc';
          desc.textContent = cmd.description;
          desc.style.cssText = 'color: #888; font-size: 10px; white-space: nowrap; text-overflow: ellipsis; overflow: hidden;';
          textWrap.appendChild(desc);
        }

        left.appendChild(icon);
        left.appendChild(textWrap);
        item.appendChild(left);

        if (cmd.shortcut) {
          const badge = document.createElement('kbd');
          badge.className = 'zeus-palette-badge';
          badge.textContent = cmd.shortcut;
          badge.style.cssText = [
            'font-size: 10px',
            'background: rgba(255, 255, 255, 0.08)',
            'border: 1px solid rgba(255, 255, 255, 0.15)',
            'padding: 2px 6px',
            'border-radius: 3px',
            'color: #00F0FF',
            'font-family: monospace'
          ].join(';');
          item.appendChild(badge);
        }

        item.addEventListener('mouseenter', () => {
          selectedIndex = idx;
          updateSelectedHighlight();
        });

        item.addEventListener('click', () => {
          selectedIndex = idx;
          executeCurrent();
        });

        listEl.appendChild(item);
      });

      updateSelectedHighlight();
    }

    function updateSelectedHighlight() {
      if (!listEl) return;
      const items = listEl.querySelectorAll('.zeus-palette-item');
      items.forEach((item, idx) => {
        const isSelected = idx === selectedIndex;
        item.setAttribute('aria-selected', isSelected ? 'true' : 'false');
        if (isSelected) {
          item.style.background = 'rgba(0, 240, 255, 0.15)';
          item.style.borderLeft = '3px solid #00F0FF';
          if (typeof item.scrollIntoView === 'function') {
            item.scrollIntoView({ block: 'nearest' });
          }
          if (inputEl) {
            inputEl.setAttribute('aria-activedescendant', item.id);
          }
        } else {
          item.style.background = 'transparent';
          item.style.borderLeft = '3px solid transparent';
        }
      });
    }

    function executeCurrent() {
      if (currentResults.length === 0 || selectedIndex < 0 || selectedIndex >= currentResults.length) {
        return;
      }
      const cmd = currentResults[selectedIndex];
      close();
      try {
        if (typeof cmd.handler === 'function') {
          cmd.handler();
        }
        if (onExecute) {
          onExecute(cmd);
        }
      } catch (err) {
        console.error('Command palette execution error:', err);
      }
    }

    function open() {
      buildDOM();
      if (!overlayEl) return;
      if (typeof document !== 'undefined') {
        previousActiveElement = document.activeElement;
      }
      isOpen = true;
      overlayEl.style.display = 'flex';
      if (inputEl) {
        inputEl.value = '';
        inputEl.focus();
      }
      selectedIndex = 0;
      render();
    }

    function close() {
      if (!overlayEl || !isOpen) return;
      isOpen = false;
      overlayEl.style.display = 'none';
      if (previousActiveElement && typeof previousActiveElement.focus === 'function') {
        try {
          previousActiveElement.focus();
        } catch (_) {}
      }
      if (onClose) {
        onClose();
      }
    }

    function toggle() {
      if (isOpen) {
        close();
      } else {
        open();
      }
    }

    function destroy() {
      if (overlayEl && overlayEl.parentNode) {
        overlayEl.parentNode.removeChild(overlayEl);
      }
      overlayEl = null;
      inputEl = null;
      listEl = null;
      isOpen = false;
    }

    return {
      registry,
      open,
      close,
      toggle,
      destroy,
      render,
      isOpen: () => isOpen,
      getResults: () => currentResults.slice(),
      getSelectedIndex: () => selectedIndex,
      selectNext: () => {
        if (currentResults.length > 0) {
          selectedIndex = (selectedIndex + 1) % currentResults.length;
          updateSelectedHighlight();
        }
      },
      selectPrev: () => {
        if (currentResults.length > 0) {
          selectedIndex = (selectedIndex - 1 + currentResults.length) % currentResults.length;
          updateSelectedHighlight();
        }
      },
      executeSelected: executeCurrent
    };
  }

  globalScope.ZeusCommandPalette = Object.freeze({
    DEFAULT_CATEGORIES,
    fuzzySearch,
    scoreCommand,
    CommandRegistry,
    createPalette
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
