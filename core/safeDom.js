(function initZeusSafeDOM(globalScope) {
  'use strict';

  function diffWords(oldStr, newStr) {
    const one = String(oldStr || '').split(/(\s+)/);
    const other = String(newStr || '').split(/(\s+)/);
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

  function renderDiff(arg1, arg2, arg3) {
    let target;
    let oldText;
    let newText;

    if (arg1 && typeof arg1 === 'object' && typeof arg1.replaceChildren === 'function') {
      // Called as: renderDiff(container, oldText, newText)
      target = arg1;
      oldText = arg2;
      newText = arg3;
    } else {
      // Called as: renderDiff(original, enhanced, targetElement)
      oldText = arg1;
      newText = arg2;
      target = arg3 || (typeof document !== 'undefined' ? document.getElementById('diff-view') : null);
    }

    if (!target) return;
    target.replaceChildren();
    const diffs = diffWords(oldText, newText);
    const fragment = document.createDocumentFragment();
    for (const part of diffs) {
      if (part.type === 'add') {
        const span = document.createElement('span');
        span.className = 'diff-add';
        span.textContent = part.value;
        fragment.appendChild(span);
      } else if (part.type === 'del') {
        const span = document.createElement('span');
        span.className = 'diff-del';
        span.textContent = part.value;
        fragment.appendChild(span);
      } else {
        fragment.appendChild(document.createTextNode(part.value));
      }
    }
    target.appendChild(fragment);
  }

  function isSafeUrl(url) {
    if (!url || typeof url !== 'string') return false;
    // Strip control characters (\x00-\x20) and any whitespace
    const cleaned = url.replace(/[\x00-\x20\s]+/g, '');
    // Explicitly reject dangerous or scriptable protocols
    if (/^(?:javascript|data|vbscript|file):/i.test(cleaned)) {
      return false;
    }
    // Must strictly start with http:// or https://
    return /^https?:\/\//i.test(cleaned);
  }

  function renderSafeMarkdown(container, text) {
    if (!container) return;
    container.replaceChildren();
    if (!text) return;

    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let lastIndex = 0;
    let match;

    while ((match = linkRegex.exec(text)) !== null) {
      const matchIndex = match.index;
      if (matchIndex > lastIndex) {
        container.appendChild(document.createTextNode(text.slice(lastIndex, matchIndex)));
      }

      const linkText = match[1];
      const rawUrl = match[2];
      const linkUrl = rawUrl?.trim();

      if (isSafeUrl(linkUrl)) {
        const a = document.createElement('a');
        a.href = linkUrl;
        a.textContent = linkText;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        container.appendChild(a);
      } else {
        // Neutralize unsafe protocols (javascript:, data:, etc.) as inert plain text
        container.appendChild(document.createTextNode(`[${linkText}](${rawUrl})`));
      }

      lastIndex = linkRegex.lastIndex;
    }

    if (lastIndex < text.length) {
      container.appendChild(document.createTextNode(text.slice(lastIndex)));
    }
  }

  const ZeusSafeDOM = Object.freeze({
    isSafeUrl,
    renderMarkdown: renderSafeMarkdown,
    renderSafeMarkdown,
    renderDiff,
    diffWords
  });

  globalScope.ZeusSafeDOM = ZeusSafeDOM;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ZeusSafeDOM;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
