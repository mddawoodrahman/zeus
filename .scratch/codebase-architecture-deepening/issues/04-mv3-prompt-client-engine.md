# 04: MV3 Process-Split Prompt Architecture (PromptClient & PromptEngine) with Structured Return

**What to build:**
Consolidate prompt enhancement across the Manifest V3 process boundary into two coordinated deep modules: `core/promptClient.js` for renderer/untrusted contexts (`content.js`, `sidepanel.js`, and delegated Context Menu triggers) and `core/promptEngine.js` for the privileged background service worker. `PromptClient` owns local redaction scrubbing before message dispatch, IPC error normalization, and local rehydration, guaranteeing plaintext secrets never cross `chrome.runtime.sendMessage`. `PromptEngine` coordinates settings resolution, model routing, `ProviderTransport` execution, fallback retry cascades, and telemetry (eliminating shallow pass-through layers between router and engine by keeping `core/router.js` strictly as a pure route-selection calculator). Both seams return a structured payload `{ enhancedText, originalText, warnings, meta }`, preserving dropped-placeholder warnings and metadata. Wire both modules into `manifest.json`, `sidepanel.html`, and `scripts/build-extension.js`, verifying `npm test && npm run package` passes cleanly.

**Blocked by:** 02: Deepen SettingsStore with Section-Level Nested Merge & Dual-Area Cache Invalidation, 03B: Complete Provider Migration to ProviderTransport & Streaming Copilot Consolidation

**Status:** completed

- [x] Implement `core/promptClient.js` in renderer contexts: executes `scrub()` $\rightarrow$ dispatches `enhancePrompt` message $\rightarrow$ executes `hydrate()` $\rightarrow$ returns structured payload `{ enhancedText, originalText, warnings, meta }`.
- [x] Implement `core/promptEngine.js` in background worker: consumes `SettingsStore` and `ProviderTransport`, uses `router.js` strictly for pure model route selection, manages fallback cascades, records telemetry, and provides defense-in-depth scrubbing.
- [x] Refactor `content.js`, `sidepanel.js`, and background Context Menu click handlers to delegate enhancement exclusively through `PromptClient.enhance()`.
- [x] Wire dropped-placeholder redaction warnings from the structured return payload into user-facing UI notifications.
- [x] Register `core/promptClient.js` in `manifest.json` content scripts & `sidepanel.html`, and register `core/promptEngine.js` in background service worker.
- [x] Update `scripts/build-extension.js` to package both modules into `dist/extension/core/`.
- [x] Add integration tests in `tests/integration/dispatch-redaction.test.js` asserting plaintext secrets never appear in `chrome.runtime.sendMessage` and structured payloads return intact.
- [x] Verify `npm test`, `tests/smoke/settings-and-messaging.smoke.mjs`, and `npm run package` pass cleanly before closing.
