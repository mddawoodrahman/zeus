# Implementation Plan: Transforms System & Shortcut Redesign

**Feature:** Transforms Subsystem & Keyboard Shortcut Architecture  
**Status:** In Progress / Ready for Full Verification  
**PRD Reference:** `docs/product/transforms-redesign-prd.md`  
**Artifact Location:** `docs/product/transforms-implementation-plan.md`  

---

## 1. Traceability Matrix: Requirements to Code & Tests

| PRD Item | Functional Scope | Existing / Modified Files | Proposed Changes / Implementation Notes | Target Test Suite |
| :--- | :--- | :--- | :--- | :--- |
| **FR-1, AC-3, US-002** | Physical vs Character Key Matching (`event.code` vs `event.key`) | `core/shortcuts.js` | Add `PHYSICAL_KEY_CODES` lookup table (`Digit1`..`Digit0`). Implement `normalizeEventKey(event)` to prioritize `event.code` over shifted `event.key` (`"!"` -> `"1"`). | `tests/unit/shortcuts.test.js`, `tests/dom/transform-shortcut.test.js` |
| **FR-1, AC-8** | Lock Keys & Modifier Guardrails | `core/shortcuts.js` | Define `LOCK_KEYS` (`CapsLock`, `NumLock`, `ScrollLock`) in `requiresModifier()`. Reject bare lock keys to avoid typing interruptions. | `tests/unit/shortcuts.test.js` |
| **FR-2, AC-5, US-005** | Synchronous Capture Listener Startup | `content.js` | Attach `transformKeydownHandler` to `document` (capture: true) synchronously in `initialize()` *before* awaiting settings/transforms. Add `transformsPromise` resolution for early presses. | `tests/dom/transform-shortcut.test.js` |
| **FR-3, AC-4, AC-6, US-003** | Focused Input & Shadow Root Piercing | `core/domUtils.js`, `content.js` | Implement `domUtils.getActiveElementRecursive()` to pierce nested Shadow DOMs. Replace fallback `resolveActiveEditableInput()` with strict `resolveFocusedEditableInput()` for shortcuts (return `null` instead of `collectInputs()[0]`). | `tests/dom/transform-shortcut.test.js` |
| **FR-4, AC-1, AC-2, US-001** | Transform Execution Pipeline & Toasts | `content.js`, `messaging/messageHandler.js` | Handle prompt replacement, dispatch `input` & `change` events. Integrate `conversationContext` & multimodal `attachments`. Show status toasts (`/// TRANSFORMING...`, `TRANSFORM APPLIED`). | `tests/dom/transform-shortcut.test.js`, `tests/smoke/settings-and-messaging.smoke.mjs` |
| **FR-5, AC-9** | Storage Quota, Deduplication & Migration | `core/transforms.js` | Enforce 90KB max payload guard. Seed default "Polish" (`Ctrl+Shift+1`) & "Prompt Engineer" (`Ctrl+Shift+2`). Deduplicate shortcuts per collection. Migrate legacy `zeus_templates`. | `tests/unit/transforms.test.js` |
| **FR-6, AC-7, US-004** | Interactive UI Recorder & Multi-Surface Sync | `sidepanel.js`, `popup.js`, `options.js` | Integrate `ZeusShortcuts.createRecorder()` in Side Panel and Popup. Add full Transforms management section to Options page. Hook `chrome.storage.onChanged` for live cross-tab updates. | `tests/dom/transform-shortcut.test.js`, live browser devtools verification |
| **AC-10** | Re-injection & Teardown Lifecycle | `content.js` | Provide `ZeusContentRuntime.destroy()` cleanup hook to unbind `keydown` and message listeners before re-injection. | `tests/dom/transform-shortcut.test.js` |
| **AC-11, AC-12, US-006** | Browser Diagnostic & Test Suite Verification | `scripts/diagnose-shortcuts.js` | Develop operator-facing diagnostic script evaluating 5 operational layers (runtime, synthetic event, focus, real press, storage bindings). Run full vitest suite. | `tests/dom/diagnose-shortcuts.test.js`, Chrome DevTools MCP |

---

## 2. Component Implementation Details

### Phase 1: Core Engine Hardening (`core/shortcuts.js`)
* **Objective:** Ensure any valid keystroke combination is canonically parsed and matched, regardless of keyboard layout, shift status, or OS platform.
* **Key Mechanisms:**
  1. `PHYSICAL_KEY_CODES` map for top digit row and common punctuation.
  2. `normalizeEventKey(event)`:
     * Check `/^Key[A-Z]$/` -> code without prefix.
     * Check `PHYSICAL_KEY_CODES[code]` -> canonical unshifted symbol.
     * Check `code` in named keys -> normalized name.
     * Fallback to `event.key` for synthetic events.
  3. Strict validation in `requiresModifier(key)`: Include `Space` and `LOCK_KEYS`.

### Phase 2: Content Script Resilience & DOM Guardrails (`content.js`, `core/domUtils.js`)
* **Objective:** Prevent missed shortcuts, race conditions, and accidental out-of-focus input rewrites.
* **Key Mechanisms:**
  1. Synchronous listener mounting:
     ```javascript
     setupRuntimeMessageListener();
     setupTransformChangeListener();
     setupTransformShortcutListener();
     setupVisibilityListener();
     ```
  2. Async fallback resolution with `transformsPromise`.
  3. `resolveFocusedEditableInput()`:
     * Recursively traverses `active.shadowRoot.activeElement`.
     * Validates `isEditableElement` and `isEligibleInput`.
     * Returns `null` if the caret is not in a valid prompt element.
  4. Expose `ZeusContentRuntime` with `destroy()` method.

### Phase 3: Multi-Surface UI Architecture
* **Objective:** Provide a uniform, polished experience across Side Panel, Popup, and Options page.
* **Key Mechanisms:**
  1. Side Panel (`sidepanel.html` / `sidepanel.js`):
     * Transforms list with status toggles, shortcut badges, and edit modals.
     * Interactive recorder wired to `#transform-shortcut`.
  2. Popup (`popup.html` / `popup.js`):
     * Inline quick-edit transforms list with instant shortcut recorders.
  3. Options Page (`options.html` / `options.js`):
     * Dedicated `/// TRANSFORMS HUD` section with comprehensive table view, template variable guidance, and live shortcut tester.

### Phase 4: Verification & Diagnostic Tooling (`scripts/diagnose-shortcuts.js`)
* **Objective:** Allow instant, non-intrusive verification in production browser tabs.
* **Layers Checked:**
  1. Script presence (`ZeusShortcuts`, `ZeusTransforms`, `ZeusContentRuntime`).
  2. Synthetic event dispatch (positive bound check on `Ctrl+Shift+2`, negative check on `Ctrl+Shift+0`).
  3. Active element eligibility (tag, contenteditable, dimensions).
  4. Live keydown event capture with detailed property readout.
  5. Storage synchronization via `chrome.runtime.sendMessage('getTransforms')`.

---

## 3. Execution & Verification Steps

1. **Verify Unit & DOM Integration Test Suite:**
   Run `npm test` to ensure all 197+ tests pass.
2. **Review Options Page & Extension Surfaces:**
   Ensure Options page includes full transform configuration support with the Cyberpunk HUD design.
3. **Build the Production Extension:**
   Execute `npm run build` and ensure all runtime files in `manifest.json` are packaged to `dist/extension`.
4. **Live Chrome Browser Verification (DevTools MCP):**
   * Load test harness in browser via `chrome-devtools-mcp`.
   * Simulate focused prompt typing and shortcut execution.
   * Run `scripts/diagnose-shortcuts.js` and verify all diagnostic checks report `PASS`.
   * Capture execution evidence and console output.

