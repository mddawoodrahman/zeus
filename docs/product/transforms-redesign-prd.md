# Product Requirements Document (PRD): Transforms System & Shortcut Redesign

**Document Status:** Approved & Baseline Established  
**Target Module:** `core/shortcuts.js`, `core/transforms.js`, `content.js`, `messaging/messageHandler.js`, `sidepanel.js`, `popup.js`, `options.js`  
**Target Release:** Zeus v2.1.2+  
**Document Location:** `docs/product/transforms-redesign-prd.md`  

---

## 1. Executive Summary & Problem Definition

### 1.1 Context
Zeus is a Manifest V3 Chrome extension providing in-place prompt enhancement across leading AI web interfaces (ChatGPT, Claude, Gemini, DeepSeek, Grok, and OpenRouter). The Transforms subsystem allows users to define custom prompt rewrite directives (e.g., "Polish", "Prompt Engineer", "Bug Hunter") and bind them to global in-browser keyboard shortcuts (e.g., `Ctrl+Shift+1`, `Ctrl+Shift+2`).

### 1.2 The Failure
In initial implementations (commit `3164108`), keyboard shortcuts failed silently when pressed by users in live browser environments. When users positioned the caret in a prompt textarea and pressed `Ctrl+Shift+1`, nothing occurred.

Deep auditing of the codebase revealed three primary root-cause failure vectors:

1. **Shift + Digit Key Event Normalization Breakdown (Authoritative Physical vs Character Identity):**
   * *Mechanism:* Under the W3C UI Events specification, holding `Shift` while pressing a digit on a standard US keyboard produces a modified `event.key` (`"!"` for `Digit1`, `"@"` for `Digit2`, `"#'` for `Digit3`).
   * *Bug:* `core/shortcuts.js` matched shortcuts strictly via `event.key`. When the stored shortcut was `"Ctrl+Shift+1"`, `matchesEvent()` evaluated `normalizeKeyName(event.key) === "1"`. Because `event.key` was `"!"`, the check evaluated `false`. Moreover, `isKnownKeyName("!")` evaluated to `false`, treating the key as invalid text.
   * *Impact:* Shipped default shortcuts (`Ctrl+Shift+1` and `Ctrl+Shift+2`) and any user shortcut utilizing `Shift` + number row or punctuation were mathematically incapable of matching live keystrokes.

2. **Content Script Initialization Asynchrony & Race Conditions:**
   * *Mechanism:* `content.js` initialization previously executed `await fetchSettingsIfNeeded()` *before* attaching `setupTransformShortcutListener()`.
   * *Bug:* If the Manifest V3 background service worker was cold-starting or delayed in replying to the settings query, the `keydown` capture listener was not mounted to `document`. Keystrokes pressed during this window were completely lost. Furthermore, if transforms arrived after page load, early keystrokes were dropped because the in-memory array was empty.

3. **Active Element Resolution & Dangerous Fallbacks:**
   * *Mechanism:* Prompt boxes on modern AI platforms (ChatGPT, Claude) are increasingly nested inside Web Components, Shadow DOMs, or contenteditable wrappers.
   * *Bug:* `document.activeElement` returned the host container rather than the inner input. When `domUtils.isEditableElement` failed on the container, the resolver fell back to `collectInputs()[0]`. If a user pressed a shortcut without focus, or if focus was obscured, Zeus would either rewrite an arbitrary off-screen input or fail silently.

### 1.3 Verified Findings vs. Assumptions

| Finding / Factor | Status | Source in Codebase |
| :--- | :--- | :--- |
| `event.key` on US Shift+1 reports `"!"` while `event.code` reports `"Digit1"` | **Verified** | Verified via Node & W3C DOM spec; tested in `tests/unit/shortcuts.test.js` |
| `core/shortcuts.js` did not map `Digit1` through `Digit0` codes | **Verified** | Commit `3164108` only inspected `event.key` |
| Content script attached keydown listener after `await fetchSettingsIfNeeded()` | **Verified** | `content.js` lines 556-566 in commit `3164108` |
| Active element fallback grabbed first input on page when caret wasn't in prompt | **Verified** | `content.js` `resolveActiveEditableInput()` |
| Storage Sync Quota limits (8KB per item, 100KB total) | **Verified** | Chrome Extensions MV3 storage limits; enforced in `core/transforms.js` |
| Keyboard shortcuts work across all Chrome-supported OSs | **Verified** | Platform normalization handles macOS `Meta` vs Windows/Linux `Ctrl` |

---

## 2. User Personas & User Stories

### Persona 1: Fast-Paced Prompt Engineer (Alex)
* Needs to quickly cycle through prompt variations ("Polish", "Make Concise", "Format as JSON") without leaving the prompt input or reaching for the mouse.
* Values predictable shortcuts that never misfire or overwrite other tabs.

### Persona 2: Cross-Platform AI Developer (Morgan)
* Works across Windows, macOS, and Linux on international keyboard layouts (AZERTY, QWERTZ).
* Expects default shortcuts (`Ctrl+Shift+1` / `Cmd+Shift+1`) to trigger reliably regardless of the physical key symbol mappings.

### Persona 3: Extension Power User (Devon)
* Creates complex custom transforms with instructions and variables (`{{language}}`, `{{tone}}`).
* Needs seamless cross-surface management (Side Panel, Popup, and Options page) with real-time synchronization.

### User Stories

#### US-001: Immediate In-Place Transform via Shortcut
**Description:** As a user typing in a prompt input on ChatGPT, Claude, or any supported AI chat page, I want to press `Ctrl+Shift+1` (or `Cmd+Shift+1` on Mac) so that my prompt is rewritten in place using the "Polish" transform without losing focus.  
**Acceptance Criteria:**
- [x] Caret must be in an editable input element or contenteditable container.
- [x] Shortcut press halts default event propagation (`preventDefault`, `stopPropagation`).
- [x] Input text is preserved if enhancement fails.
- [x] Input dispatches standard `input` and `change` events upon replacement.
- [x] Verify in browser using Chrome DevTools.

#### US-002: Reliable Shift+Digit and Layout-Agnostic Matching
**Description:** As a user with a standard keyboard, I want pressing `Ctrl+Shift+1` to trigger even though my browser dispatches `key: "!"` and `code: "Digit1"`.  
**Acceptance Criteria:**
- [x] Matcher prioritizes `event.code` mapping for physical keys (`Digit1`..`Digit0`).
- [x] AZERTY and non-US layouts resolve to canonical numbers based on physical key positions.
- [x] Non-shifted keys (e.g., `Ctrl+1`) do not collide with shifted keys (`Ctrl+Shift+1`).
- [x] Typecheck/lint and unit tests pass.

#### US-003: Non-Destructive Focus Guardrails
**Description:** As a user browsing an AI tool, I want Zeus to ignore transform shortcuts when I do not have a prompt input focused, so that my off-screen inputs or previous messages are never overwritten.  
**Acceptance Criteria:**
- [x] Resolver inspects active element recursively through shadow roots.
- [x] If no prompt input is focused, the shortcut passes through or displays a status toast `"FOCUS A PROMPT INPUT FIRST"`.
- [x] Never falls back to `collectInputs()[0]` on shortcut keydown.
- [x] Typecheck/lint and DOM integration tests pass.

#### US-004: Interactive Shortcut Recorder in UI
**Description:** As a user configuring transforms in the Side Panel, Popup, or Options HUD, I want an interactive input field that records my physical key combinations, detects duplicate shortcuts, and allows clearing with Backspace.  
**Acceptance Criteria:**
- [x] Clicking the shortcut field enters listening mode with visual indicator.
- [x] Pressing keys updates draft display in real-time (`Ctrl + Shift + 1`).
- [x] Disallows modifier-only presses (`Shift`, `Ctrl`) and reserved browser keys (`Ctrl+T`, `Ctrl+W`).
- [x] Backspace or Delete clears the assigned shortcut.
- [x] Warns when a combination is already bound to another transform.
- [x] Verify in browser using Chrome DevTools.

#### US-005: Resilient Content Script Initialization
**Description:** As a user loading a chat tab, I want shortcuts to be active immediately upon page ready, even if the extension background worker is slow to wake up.  
**Acceptance Criteria:**
- [x] `keydown` listener attaches synchronously in `initialize()` before any `await`.
- [x] If transforms arrive after keypress, pending promise resolves and matches the shortcut without dropping the key.
- [x] Re-injecting the script (via `forceInject` or reload) safely tears down prior listeners via `ZeusContentRuntime.destroy()`.

---

## 3. Functional Requirements

### FR-1: Canonical Shortcut Normalization & Resolution
* The shortcut engine (`core/shortcuts.js`) must define:
  * Strict canonical format: `[Ctrl+][Alt+][Shift+][Meta+]Key` (e.g. `Ctrl+Shift+1`).
  * `PHYSICAL_KEY_CODES` dictionary mapping `Digit1`-`Digit0`, punctuation, and alphanumeric keys from `event.code`.
  * `normalizeEventKey(event)` resolving `event.code` first, falling back to `event.key` for synthetic or unmapped keys.
  * Rejection of modifier-only combinations (`Ctrl`, `Shift`, `Alt`, `Meta`).
  * Rejection of bare typing keys without modifiers (`P`, `1`, `Space`).
  * Rejection of Lock keys (`CapsLock`, `NumLock`, `ScrollLock`) without modifiers.
  * Reservation check against browser/OS shortcuts (`Ctrl+T`, `Ctrl+N`, `Ctrl+W`, `Alt+F4`, etc.).

### FR-2: Immediate Capture-Phase Listener Registration
* `content.js` must attach the `keydown` listener to `document` using `useCapture = true` during synchronous script startup.
* The listener must execute before host page event listeners to prevent host SPA frameworks from intercepting or suppressing the combination.

### FR-3: Strict Focused Input Resolution
* When a bound shortcut fires:
  * Call `domUtils.getActiveElementRecursive(document)` to pierce open shadow roots.
  * Validate that the element is an editable textarea, text input, or contenteditable node.
  * Validate that the element meets minimum dimensions (min 40x20px) and eligibility.
  * If ineligible or null, display a 3000ms warning toast and abort enhancement without altering DOM.

### FR-4: Transform Execution Pipeline
* On valid shortcut trigger:
  1. Halt browser default and propagation (`e.preventDefault()`, `e.stopPropagation()`).
  2. Extract raw input text. If empty, abort quietly without API call.
  3. Show in-page toast: `/// TRANSFORMING: [NAME]...`.
  4. Collect conversation context turns (if enabled) and visual attachments (multimodal).
  5. Dispatch `enhancePrompt` message to background runtime with `transformId`.
  6. On success: replace text via `domUtils.setInputText()`, trigger synthetic `input` and `change` events, and display `/// TRANSFORM APPLIED`.
  7. On error: retain original prompt text, log error to console, and display `TRANSFORM FAILED`.

### FR-5: Storage Management & Quota Guardrails
* `core/transforms.js` must persist transforms in `chrome.storage.sync` under key `zeus_transforms`.
* Built-in default transforms ("Polish", "Prompt Engineer") must be automatically seeded if storage is empty.
* Legacy `zeus_templates` must be migrated non-destructively.
* All saves must calculate payload size and reject payloads exceeding 90KB (leaving safe headroom under Chrome's 100KB sync quota).
* Field limits must be enforced:
  * Name: <= 60 characters.
  * Description: <= 160 characters.
  * Instruction: <= 4,000 characters.
  * Template: <= 8,000 characters.

### FR-6: Synchronized Multi-Surface User Interface
* Transforms must be viewable, editable, and bindable across:
  * **Side Panel** (`sidepanel.html` / `sidepanel.js`) under `/// TRANSFORMS` tab.
  * **Popup** (`popup.html` / `popup.js`) under `/// TRANSFORMS` section.
  * **Options HUD** (`options.html` / `options.js`) under a dedicated transforms management view.
* Changes saved on any surface must trigger `chrome.storage.onChanged` updates across all open views and content scripts without requiring page reloads.

---

## 4. UI/UX Requirements

1. **Cyberpunk Terminal Theme Consistency:**
   * High-contrast dark aesthetic (#0a0a0c background, #00ffff cyan, #fcee0a yellow, #ff003c red accents).
   * Monospace and display typography (`Orbitron`, `JetBrains Mono`, `Rajdhani`).
2. **Interactive Shortcut Recorder Component:**
   * Renders as a clickable cyber-styled box.
   * Idle state: Displays formatted combo (e.g., `Ctrl + Shift + 1`) or `[ CLICK TO BIND ]`.
   * Recording state: Pulsing yellow border, text reads `/// PRESS KEYS...`.
   * Clear mechanism: Pressing `Backspace` or `Delete` unbinds the shortcut.
   * Collision notice: Displays amber warning badge if the entered combination collides with an existing transform.
3. **In-Page Feedback HUD:**
   * Minimal floating toast positioned unobtrusively in top-right or anchor position.
   * Status variants:
     * Info (Cyan): `/// ENHANCING PROMPT...`
     * Success (Green): `/// TRANSFORM COMPLETE`
     * Error (Red): `/// FOCUS PROMPT INPUT FIRST` or `/// TRANSFORM FAILED`

---

## 5. Browser Constraints & Platform Specifications

| Constraint | Environment | Handling Strategy |
| :--- | :--- | :--- |
| **Manifest V3 Worker Suspension** | Background | Content script registers listeners synchronously; background handles messages idempotently. |
| **Isolated Worlds** | Content Scripts | Content scripts cannot read page global variables; relies on DOM inspection and capture-phase events. |
| **Content Security Policy (CSP)** | AI Host Pages | Zero `eval()` or dynamic script generation; pure vanilla JS event handlers. |
| **Shadow DOM Encapsulation** | Web Components | Recursive `shadowRoot.activeElement` traversal down to deepest active node. |
| **Sync Storage Limits** | `chrome.storage.sync` | Total <= 90KB; JSON payload pre-flight calculation; fallback error reporting. |
| **macOS vs Windows/Linux** | OS Key Mapping | `primaryModifier()` returns `Meta` (Cmd) on Darwin and `Ctrl` on others. |

---

## 6. Testing Strategy

### 6.1 Unit Testing (`vitest`)
* `tests/unit/shortcuts.test.js`:
  * Validates canonicalization, `PHYSICAL_KEY_CODES` mapping, Shift+Digit matching, AZERTY layout support, modifier ordering, lock keys rejection, reserved combos rejection.
* `tests/unit/transforms.test.js`:
  * Validates transform normalization, ID generation, legacy migration, variable extraction `{{var}}`, duplicate shortcut stripping, quota bounds (<90KB).

### 6.2 DOM Integration Testing (`jsdom`)
* `tests/dom/transform-shortcut.test.js`:
  * Simulates realistic W3C `KeyboardEvent` dispatches (`key: "!"`, `code: "Digit1"`).
  * Validates shadow root piercing, focus validation, empty input handling, preventDefault invocation, single-fire idempotency, teardown cleanup via `ZeusContentRuntime.destroy()`.
* `tests/dom/diagnose-shortcuts.test.js`:
  * Tests the operator-facing browser diagnostic probe across healthy and degraded environments.

### 6.3 End-to-End Live Browser Verification (Chrome DevTools MCP)
* Navigate live Chrome instance to test harness (`chatgpt.html`, `generic.html`).
* Inject content script and execute real keyboard events.
* Run `scripts/diagnose-shortcuts.js` in page context to verify 100% PASS on all operational layers.

---

## 7. Measurable Acceptance Criteria

* **AC-1:** Pressing `Ctrl+Shift+1` in a focused prompt box with text dispatches `enhancePrompt` with transform ID `builtin-polish` and replaces input with enhanced text.
* **AC-2:** Pressing `Ctrl+Shift+2` dispatches `enhancePrompt` with transform ID `builtin-prompt-engineer`.
* **AC-3:** A live browser `KeyboardEvent` reporting `{ key: "!", code: "Digit1", ctrlKey: true, shiftKey: true }` matches `Ctrl+Shift+1` with `defaultPrevented === true`.
* **AC-4:** Pressing transform shortcuts while body or a non-input element is active does not alter any input element.
* **AC-5:** Transform shortcut listener is attached synchronously before any network or storage promises.
* **AC-6:** Prompt inputs nested in open Shadow DOM roots are properly recognized as focused active inputs.
* **AC-7:** Interactive shortcut recorder formats combos canonicalized (`Ctrl + Shift + 1`) and clears on Backspace.
* **AC-8:** Modifiers alone (`Shift`, `Ctrl`, `Alt`) and bare typing keys (`P`, `1`, `Space`) cannot be saved as shortcuts.
* **AC-9:** Duplicate shortcut assignments are detected and prevented across transforms.
* **AC-10:** Re-injecting content script does not duplicate event listeners or cause stacked prompt transforms.
* **AC-11:** All existing 197+ automated tests pass with 0 failures (`npm test`).
* **AC-12:** Real browser DevTools diagnostic script (`scripts/diagnose-shortcuts.js`) outputs `0 fail` and verifies synthetic and physical key matching.

