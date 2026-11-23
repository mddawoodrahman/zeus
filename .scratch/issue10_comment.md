Completed Zeus Issue #10 (Ticket 04) - MV3 Process-Split Prompt Architecture (PromptClient & PromptEngine) with Structured Return:

1. Client Seam (`core/promptClient.js`):
   - Implemented `ZeusPromptClient.enhance(rawText, options)` for untrusted/renderer contexts (`content.js`, `sidepanel.js`, and delegated Context Menu triggers).
   - Enforces the zero-trust privacy invariant: client-side scrubbing executes BEFORE IPC dispatch; plaintext secrets NEVER cross `chrome.runtime.sendMessage`.
   - Rehydrates sensitive tokens locally in client memory after receiving the scrubbed result from background.
   - Preserves dropped-placeholder warnings and metadata in a structured return payload: `{ enhancedText, originalText, warnings, meta }`.

2. Background Seam (`core/promptEngine.js`):
   - Implemented `ZeusPromptEngine.execute(promptText, options)` in the privileged background service worker.
   - Coordinates settings resolution via `SettingsStore`, route calculation via `router.js`, provider execution via `ProviderTransport`, fallback cascading in auto mode, and telemetry recording.
   - Keeps `core/router.js` strictly as a pure route selection calculator (`detectPromptIntent`, `autoRouteForIntent`, `buildAutoRouteCandidates`, `calculateRoutePlan`, `streamSuggest`), eliminating shallow pass-through layers.
   - Implemented defense-in-depth scrubbing for direct background calls to prevent secret leakage even if client-side scrubbing was bypassed.
   - Preserved full backward compatibility for `ZeusRouter.enhancePrompt()` and legacy messaging responses (`enhancedPrompt` and `enhancedText`).

3. Entry Point Refactoring:
   - `content.js`: Refactored `handleEnhanceClickForInput` to consume `PromptClient.enhance()`, surfacing dropped-placeholder warnings via toast.
   - `sidepanel.js`: Refactored optimize button click handler to consume `PromptClient.enhance()`, surfacing warnings via toast and persisting only scrubbed text with placeholders to history.
   - `messaging/messageHandler.js`: Updated context menu click listener to delegate through content script IPC, and updated `handleEnhancePrompt` to invoke `PromptEngine.execute()`.

4. Wiring & Load Order:
   - Added `core/promptClient.js` to `manifest.json` content scripts (before `content.js`), `CONTENT_SCRIPT_FILES` in `messaging/messageHandler.js`, and `sidepanel.html`.
   - Added `core/promptEngine.js` to `background.js` (after `core/router.js` and before `messaging/messageHandler.js`).
   - Packaged automatically into `dist/extension/core/` by `scripts/build-extension.js`.

5. Verification Results:
   - Syntax Check: Passed across all 65 files (`npm run test:syntax`).
   - Vitest: All 18 test files passed (179 tests, 100% pass rate).
   - Integration & Unit Tests: Added `tests/unit/prompt-client-engine.test.js` verifying secrecy across IPC, structured payload integrity, and defense-in-depth.
   - Smoke Tests: Passed (`npm run test:smoke`).
   - Packaged Build: Successfully created `dist/extension/` and `dist/extension.zip` (0.11 MB).
   - Packaged Browser Verification: Ran isolated headless Chrome CDP test with 0 CSP violations across Popup, Options, and Side Panel.
