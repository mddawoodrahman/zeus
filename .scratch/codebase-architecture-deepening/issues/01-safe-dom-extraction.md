# 01: Extract SafeDOM Module, replaceChildren Clearing & Obfuscated Protocol Defense

**What to build:**
Extract all Myers token diffing, safe Markdown parsing, and URL protocol checking from `sidepanel.js` into an authoritative `core/safeDom.js` module. Enforce container clearing strictly via `element.replaceChildren()` (eliminating `innerHTML = ''`), inject `rel="noopener noreferrer"` and `target="_blank"` on all valid links, and normalize URLs to reject case-, whitespace-, and control-character-obfuscated `javascript:` and `data:` protocols. Immediately wire `core/safeDom.js` into `sidepanel.html` and `scripts/build-extension.js`, ensuring `npm test && npm run package` passes cleanly without deferring packaging.

**Blocked by:** None (can start immediately)

**Status:** closed

- [x] Create `core/safeDom.js` exposing `renderDiff(container, oldText, newText)`, `renderMarkdown(container, markdownText)`, and `isSafeUrl(url)`.
- [x] Enforce container clearing via `container.replaceChildren()` across all rendering methods (eliminating all `innerHTML = ''`).
- [x] Ensure all generated anchor tags include `rel="noopener noreferrer"` and `target="_blank"`.
- [x] Implement URL protocol validator rejecting whitespace/control-character-obfuscated `javascript:` and `data:` URIs (e.g., `\njavascript:`, `JavaSCRIPT:`, `data:text/html`).
- [x] Refactor `sidepanel.js` to consume `core/safeDom.js`, removing local diff and markdown utility duplicates.
- [x] Wire `core/safeDom.js` script tag into `sidepanel.html` and ensure `scripts/build-extension.js` copies it into `dist/extension/core/`.
- [x] Add unit and DOM tests in `tests/dom/safe-dom-csp.test.js` covering obfuscated protocols and safe node creation.
- [x] Verify `npm test`, `npm run test:syntax`, and `npm run package` pass cleanly before closing.
