# Specification: Critical Runtime, Provider, Trust-Boundary, and UI Fixes

## Problem Statement

Users of the Zeus Chrome Extension currently encounter silent runtime failures, broken provider compatibility, security trust-boundary gaps, and non-functional UI controls across core workflows:

1. **Missing MV3 Network Permissions & Incomplete Site Matching**: Production builds omit explicit host permissions for cloud provider APIs (OpenAI, Gemini, Anthropic) and local loopback IP Ollama connections, while DeepSeek and Kimi site matchers diverge between the manifest and site adapters—leaving bare domains without specialized composer detection or breaking API calls outside mock environments.
2. **Provider Request Failures & Unbounded OpenRouter Cascading**: Inline Copilot suggestions fail with HTTP 400 errors on modern OpenAI and OpenRouter models (`gpt-5*`, `o1`, `o3`, `o4`) due to hardcoded legacy parameters and forced `temperature` values on reasoning models. Meanwhile, OpenRouter failures (`404`/`429`) sweep across dozens of unvetted public catalog models, risking unintended prompt exposure and rate-limit storms, while Gemini thinking-model responses can misread internal reasoning parts as prompt output.
3. **Redaction Trust-Boundary Leakage, False Blocks & Runaway Timeouts**: Background Copilot streams evaluate redaction flags sent from untrusted content-script contexts before loading authoritative persisted settings and overwrite saved preferences with `undefined` fields. Conversely, manual enhancements run background defense-in-depth scrubbing before loading settings, ignoring disabled-redaction preferences and triggering misleading warnings that prevent in-page insertion. Background retries also ignore client timeout limits and continue executing after the client gives up.
4. **Broken Settings Sync, Side Panel Gestures, Router Edge Cases & Dead UI Controls**: Configuration updates notify only a single active tab instead of all open chat tabs; context menu registration fails to clear prior entries; keyboard shortcuts invoke Side Panel opening asynchronously (risking user-gesture loss); `sidePanelEnabled` never updates Chrome toolbar behavior; Auto Mode omits OpenRouter, misclassifies domain vocabulary as low-cost intent, and stalls Copilot when Ollama is offline or unconfigured; the Side Panel stores its own extension URL in history, corrupts template replacements containing `$` patterns, drops settings/timeout options, and mismanages toasts; and several Popup/Options controls (Ollama host URL, Popup Auto-mode keys, Copilot token clamping, telemetry ordering/counts, and content-script error surfacing) are dead or misleading.

---

## Solution

Resolve all production blockers, trust-boundary violations, routing edge cases, and dead UI controls before introducing new features:

1. **Complete Host Permissions & Site Coverage**: Authorize all cloud LLM endpoints and both `localhost` and `127.0.0.1` Ollama loopback hosts in the manifest, and align DeepSeek and Kimi domain matching across the manifest and site adapters.
2. **Fix Provider Parameter Negotiation, Gemini Thinking Extraction & OpenRouter Fallback Bounds**: Use model-aware token parameter negotiation in Copilot streaming, omit unsupported `temperature` on reasoning models, extract only non-thought text parts from Gemini responses, and restrict OpenRouter fallbacks to curated and user-configured models rather than sweeping the public catalog.
3. **Enforce Authoritative Settings & Cooperative Timeout Cancellation**: Load authoritative settings from `SettingsStore` before evaluating redaction rules or Copilot runtime overrides, ignore untrusted renderer redaction toggles in the background worker, respect user-configured `redactionEnabled` and custom patterns cleanly without spurious insertion blocks, and enforce request-level `AbortController` timeouts across background execution and retries.
4. **Fix Cross-Tab Sync, Side Panel Lifecycle, Router Logic & UI Controls**: Broadcast settings across all matching tabs and windows, clear context menus idempotently on install, open the Side Panel synchronously from command gestures and wire `sidePanelEnabled` to Chrome panel behavior, add OpenRouter to Auto routing, refine intent classification, add availability checks and clean port termination for Copilot `auto`, repair Side Panel history URLs, template substitution, enhancement options, and toasts, wire `ollama.host` and Popup Auto-mode keys, clamp `copilotMaxTokens`, fix telemetry sorting/counting, surface specific error guidance in-page, and remove dead theme-toggle code.

---

## User Stories

### Host Permissions & Site Coverage
1. As an OpenAI user, I want the extension manifest to declare permission for the OpenAI API origin, so that prompt enhancement and Copilot requests succeed without MV3 network blocks.
2. As a Gemini user, I want the extension manifest to declare permission for the Google Generative Language API origin, so that Gemini requests execute reliably in packaged builds.
3. As a Claude user, I want the extension manifest to declare permission for the Anthropic API origin, so that Claude requests execute reliably in packaged builds.
4. As a local Ollama user running on `127.0.0.1:11434`, I want loopback IP permission granted alongside `localhost:11434`, so that local connections work regardless of loopback hostname.
5. As a user visiting `deepseek.com`, I want the DeepSeek adapter to recognize both the root portal and `chat.deepseek.com`, so that specialized composer integration works instead of falling back to generic heuristics.
6. As a user visiting bare `kimi.com`, I want both manifest matching and the Kimi adapter to match `kimi.com` alongside `www.kimi.com`, so that Zeus mounts consistently across both domains.

### Provider Request Compatibility & Cascading Bounds
7. As a Copilot user using OpenAI `gpt-5*`, `o1`, `o3`, or `o4` models, I want streaming completions to negotiate `max_completion_tokens` instead of hardcoding `max_tokens`, so that suggestions do not fail with HTTP 400 errors.
8. As a Copilot user using OpenRouter routed to modern OpenAI reasoning models, I want streaming completions to use the model-appropriate token parameter, so that requests succeed without parameter errors.
9. As a user enhancing prompts or receiving Copilot completions with OpenAI reasoning models, I want unsupported `temperature` parameters omitted automatically, so that reasoning models accept requests cleanly.
10. As an OpenRouter user encountering a `404` or `429` error, I want automatic fallbacks bounded strictly to curated and configured models (and `429` handled via bounded retry rather than sweeping dozens of random catalog entries), so that prompts are never silently forwarded to unvetted providers or trapped in request storms.
11. As a user of Gemini thinking models, I want response extraction to filter out `{ thought: true }` parts and return only non-thought text, so that enhancements and Copilot suggestions never break or surface internal thought blocks.

### Redaction Trust Boundaries & Request Timeouts
12. As a security-conscious user, I want background Copilot stream handlers to evaluate `redactionEnabled` and custom patterns strictly from persisted `SettingsStore` configuration rather than trusting renderer-supplied flags, so that compromised page contexts cannot bypass secret protection.
13. As a Copilot user, I want partial runtime settings in Copilot messages merged safely without overwriting persisted `SettingsStore` fields with `undefined`, so that saved preferences stay intact.
14. As a user who intentionally disables redaction (`redactionEnabled: false`), I want background prompt execution to load settings first and honor my preference without emitting spurious defense-in-depth notices that block in-page insertion.
15. As a user with custom redaction patterns configured, I want background defense-in-depth scrubbing to apply those same patterns consistently when triggered directly.
16. As a user whose prompt enhancement exceeds its timeout budget, I want the background engine to abort in-flight upstream requests and cancel pending retries via an `AbortController`, so that stale requests do not keep consuming API quota after the UI times out.

### Cross-Tab Sync, Side Panel Lifecycle & Router Behavior
17. As a user with multiple AI chat tabs and browser windows open, I want saving settings to broadcast `settingsUpdated` across every matching tab in all windows, so that every open composer immediately reflects new configuration.
18. As a user or developer updating or reloading the extension, I want context menu initialization to clear prior menu registrations before creating entries, so that duplicate menu ID errors never occur.
19. As a keyboard user pressing the Side Panel shortcut, I want the extension to invoke Side Panel opening synchronously from the command's tab context without async window queries, so that Chrome's user-gesture check never fails.
20. As a user toggling `sidePanelEnabled`, I want toolbar action behavior synchronized with `chrome.sidePanel.setPanelBehavior`, so that clicking the toolbar icon opens the Side Panel or Popup according to my setting.
21. As an Auto Mode user with an OpenRouter key configured, I want OpenRouter included in Auto Mode routing candidates, so that OpenRouter can participate in automatic routing and fallback chains.
22. As a user drafting domain prompts containing words like `"budget"` or `"lightweight"`, I want Auto Mode intent detection not to misclassify domain content as a cheap-model directive, so that complex domain prompts retain full model quality.
23. As a Copilot `auto` user with a saved Ollama model who is not currently running Ollama, I want Copilot to check availability and fall back to configured cloud providers instead of failing silently on offline Ollama.
24. As a Copilot `auto` user with no Ollama availability and no cloud API keys configured, I want the stream handler to emit an actionable error and disconnect the port cleanly, so that background keep-alive timers do not leak indefinitely.

### Side Panel Workbench, Options, Popup & Error Surfacing
25. As a Side Panel user reviewing Prompt History, I want each saved entry to record the active chat page URL captured from the tab rather than the Side Panel page URL, so that history entries identify which AI site each prompt came from.
26. As a Side Panel template user substituting variables containing `$&`, `$'`, or `$$`, I want template compilation to insert literal strings without JavaScript replacement-pattern corruption, so that code snippets and dollar amounts stay intact.
27. As a Side Panel user enhancing a prompt, I want the workbench to pass current `redactionEnabled`, `customRedactionPatterns`, and `timeoutMs` settings to `PromptClient`, so that workbench behavior matches in-page enhancement.
28. As a Side Panel user waiting on prompt enhancement, I want persistent loading toasts (`durationMs <= 0`) to remain visible until completion or error, and warning toasts to display distinct warning styling.
29. As a local Ollama user configuring a custom host URL in Popup or Options, I want that host validated, saved in `SettingsStore`, and honored by all Ollama API requests, so that non-default ports or loopback hosts work end-to-end.
30. As a maintainer of the Popup interface, I want orphaned theme-toggle listeners and storage calls removed when no corresponding UI control exists, so that Popup execution stays clean and free of dead code.
31. As a Popup user selecting `auto` mode, I want cloud provider API key inputs to remain accessible just like in Options, so that I can configure Auto Mode keys from the Popup without opening the full Options page.
32. As an Options user adjusting Copilot token bounds, I want `copilotMaxTokens` clamped programmatically between `10` and `250`, so that out-of-range inputs or programmatic updates cannot send invalid limits.
33. As an Options user inspecting System Logs, I want the fallback counter to report true fallback events (`type === 'fallback'`) rather than all telemetry events, and the event list to render newest-first so recent failures appear immediately.
34. As a user encountering provider quota, rate-limit, model availability, invalid-request, or Ollama origin errors in-page, I want the content runtime to surface the normalized error message rather than replacing it with generic failure text.

---

## Implementation Decisions

### 1. Manifest Host Permissions & Site Adapter Alignment
- **Manifest Host Permissions**: Add explicit API origin patterns for OpenAI, Google Gemini, Anthropic Claude, and `127.0.0.1:11434` alongside existing chat hosts and `localhost:11434`.
- **Site Domain Alignment**: Align DeepSeek and Kimi host matchers across manifest `host_permissions`, manifest `content_scripts`, and the DeepSeek and Kimi site adapters so both root and `www`/`chat` variants receive identical adapter matching.

### 2. Provider Modules (`OpenAI`, `OpenRouter`, `Gemini`, `Ollama`)
- **Token Limit & Temperature Negotiation**:
  - Reuse `inferChatTokenParam` and `buildChatTokenLimit` inside OpenAI and OpenRouter `suggest()` streaming payloads instead of hardcoding `max_tokens`.
  - Detect OpenAI reasoning models (such as `o1`, `o3`, `o4`, and reasoning-series `gpt-5*` models where custom temperature is rejected) and omit `temperature` from both unary `enhance()` and streaming `suggest()` payloads (with fallback stripping if an API rejects `temperature` with HTTP 400).
- **OpenRouter Candidate Boundaries**:
  - Stop seeding automatic fallback candidates with up to 50 arbitrary models fetched from the public OpenRouter `/models` endpoint; restrict automatic fallback candidates to curated registry models and the user's configured model.
  - Keep `429` rate-limit handling on pre-first-byte transient retries rather than blindly cascading across external models.
- **Gemini Thinking-Model Extraction**:
  - Extract text across candidate `parts` by ignoring parts marked `{ thought: true }` and concatenating non-thought text parts in both unary and streaming Gemini handlers.
- **Configurable Ollama Host**:
  - Accept normalized `ollama.host` configuration (defaulting to `http://localhost:11434`, validated as `http:`/`https:` origin with trailing slashes stripped) across `Ollama` health checks, model detection, enhancement, and Copilot suggestions.

### 3. MV3 Trust Boundaries, `SettingsStore`, `PromptEngine` & `Router`
- **Authoritative Background Settings (`MessageHandler` & `PromptEngine`)**:
  - In `copilot:start`, load persisted configuration from `SettingsStore` *first*. Evaluate background redaction strictly against persisted `config.redactionEnabled` and `config.customRedactionPatterns`, never trusting renderer-supplied redaction toggles. Merge only explicitly defined, validated Copilot runtime preferences (`copilotMode`, `copilotProvider`, `copilotMaxTokens`) onto `config` so omitted fields never overwrite saved values with `undefined`.
  - In `PromptEngine.execute()`, resolve and merge `SettingsStore` settings *before* performing defense-in-depth scrubbing so `redactionEnabled: false` and `customRedactionPatterns` are honored faithfully. Keep informational defense-in-depth audit notes separate from actionable dropped-placeholder safety warnings so `redactionEnabled: false` never blocks in-page prompt insertion.
  - Enforce `options.timeoutMs` inside `PromptEngine.execute()` via a request-scoped `AbortController` wired through provider calls and `ProviderTransport` so client timeouts cancel ongoing upstream fetches and retry loops.
- **Settings Broadcast, Context Menus & Side Panel Lifecycle (`MessageHandler`)**:
  - Update `notifyTabsOfUpdate()` to query all tabs across all browser windows matching content-script host patterns and broadcast `settingsUpdated` to every matching tab.
  - Wrap context menu creation on install/startup with `chrome.contextMenus.removeAll()` before calling `create()`.
  - Update `commands.onCommand` so `chrome.sidePanel.open` executes synchronously using `tab.windowId` or `tab.id` provided by the command event without deferring to an async `windows.getLastFocused` lookup.
  - Synchronize `sidePanelEnabled` with `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick })` during extension startup and whenever settings change.
- **Router Intent, Candidate List & Copilot Auto Mode (`Router`)**:
  - Add `openrouter` to `buildAutoRouteCandidates()` when configured with an API key.
  - Tighten `detectPromptIntent()` cheap-intent patterns so explicit cost/brevity directives trigger fast-cheap routing while ordinary domain nouns (such as financial `"budget"` or physical `"lightweight"`) do not downgrade prompt quality.
  - In `streamSuggest()` `auto` mode, treat Ollama as a candidate only after a quick health/availability probe (or fall back cleanly across configured cloud providers: Gemini, OpenAI, Claude, OpenRouter, Ollama) and ensure that when no provider is configured or eligible, `streamSuggest()` sends a terminal `error` frame and closes/disconnects the port instead of returning silently.

### 4. Settings Schema & UI Controllers (`SettingsStore`, `Side Panel`, `Popup`, `Options`, `Content Runtime`)
- **Settings Normalization & Clamping (`SettingsStore`)**:
  - Persist `ollama.host` (default `http://localhost:11434`, normalized/validated origin) inside synced preferences, and clamp `copilotMaxTokens` to `[10, 250]` during normalization and updates.
- **Side Panel Workbench (`Side Panel`)**:
  - Track the captured page URL (passed from active tab capture) alongside the draft and store that URL (or `'direct'` / empty when uncaptured) in history rather than `window.location.href`.
  - Compile template `{{variable}}` placeholders using a function replacer `() => value` so `$` replacement tokens in user values are inserted literally.
  - Load settings before calling `PromptClient.enhance()`, forwarding `redactionEnabled`, `customRedactionPatterns`, and `timeoutMs`.
  - Update `showToast(message, type, durationMs)` so `durationMs <= 0` creates a persistent toast dismissed explicitly when the async step finishes or fails, and define `.warning` toast styling in the Side Panel stylesheet.
- **Popup & Options UI (`Popup`, `Options`)**:
  - Bind `#ollamaHost` in both Popup and Options to `ollama.host` in `SettingsStore` and enforce `[10, 250]` clamping on `copilotMaxTokens` in Options.
  - Remove dead `darkModeToggle` listeners and orphaned `zeus_dark_mode_preference` sync reads/writes from Popup.
  - Keep cloud provider API key sections accessible when `auto` is selected in Popup (matching Options).
  - Display `getFallbackCount` (or `type === 'fallback'` count) rather than `summary.totalEvents` for the Options fallback counter, and sort `summary.recent` in reverse-chronological (newest-first) order.
- **Content Runtime Error Surfacing (`Content Runtime`)**:
  - Preserve specific user-safe normalized error messages produced by the `Errors` module (rate-limit, quota, model availability, invalid request, timeout, Ollama origin/daemon instructions) when displaying in-page error notices instead of overwriting them with generic fallback copy.

---

## Testing Decisions

### What Makes a Good Test
- Assert strictly on external observable behavior at module and process boundaries (HTTP payloads/URLs, Chrome API invocations, storage state, returned structured payloads, and rendered DOM output/state), never on internal helper functions or private variables.
- Verify error and security boundaries adversarially: untrusted renderer flags must never weaken background redaction, `AbortController` timeouts must halt subsequent fetch retries, and template replacement must preserve literal `$&`/`$$` sequences.

### Target Test Seams
1. **MV3 Runtime, Messaging & Packaging Seam**:
   - Exercises manifest validation (`host_permissions` and content script matches), `MessageHandler` listeners (`onInstalled` context menu cleanup, multi-window/multi-tab `settingsUpdated` broadcast, synchronous `commands.onCommand` side panel opening, `sidePanel.setPanelBehavior`, `copilot:start` trust boundary), `PromptEngine.execute()` (settings-first redaction + timeout `AbortController`), and `Router` (`openrouter` auto-candidate, refined intent detection, Copilot `auto` fallback and missing-key termination).
2. **Provider Contract & Settings Store Seam**:
   - Exercises `OpenAI`, `OpenRouter`, `Gemini`, and `Ollama` provider `enhance()` and `suggest()` contracts against mocked `fetch` responses (token parameter selection, reasoning-model `temperature` omission, bounded OpenRouter fallbacks, Gemini thought-part filtering, and configurable Ollama host URL), plus `SettingsStore` persistence for `ollama.host` and `copilotMaxTokens` clamping.
3. **In-Page Content Dispatch Seam**:
   - Exercises `Content Runtime` end-to-end with `redactionEnabled: false` (verifying clean editor insertion without spurious warning blocks) and normalized `ZeusErrors` display on provider failures.
4. **Extension UI Page Controller Seam (JSDOM)**:
   - Mounts Popup, Options, and Side Panel HTML/CSS/scripts with the Chrome mock harness to verify user interactions end-to-end: Side Panel sticky toasts, warning toast class, captured tab URL history, literal `$` template filling, and settings-backed enhancement; Popup `auto`-mode key visibility, `ollamaHost` persistence, and absence of dead dark-mode calls; Options `copilotMaxTokens` clamping, `ollamaHost` persistence, true fallback count, and newest-first event ordering.

### Prior Art
- Existing MV3 prompt engine, router, and packaging regression suites covering `PromptEngine`, `ZeusRouter`, `SettingsStore`, and manifest checks.
- Existing provider unit suites mocking `globalThis.fetch` for OpenAI, OpenRouter, Gemini, Claude, and Ollama.
- Existing content-script and dispatch-redaction JSDOM integration suites using the shared Chrome mock harness.
- Existing Chrome runtime smoke test harness exercising `MessageHandler` and `SettingsStore`.

---

## Out of Scope
- Implementing Passphrase Vault encryption, expanded secret regex patterns, `copilotDailyCap`, or removing the 15s keep-alive loop (tracked separately in security/architectural hardening specs).
- Adding new prompt enhancement modes, streaming review/undo modals, new LLM providers (e.g., Chrome Built-in AI), or new site adapters beyond DeepSeek and Kimi domain alignment.
- Refactoring Popup/Options into shared UI modules, renaming `--arasaka-red` design tokens, bundling local fonts for strict CSP removal of `'unsafe-inline'`, or rewriting the build pipeline.

---

## Further Notes
- **Existing Testing & Runtime Invariants**: Preserving schema v3 storage partitioning (`apiKeys` strictly in `chrome.storage.local`, preferences in `chrome.storage.sync`) and pre-first-byte streaming retry invariants remains mandatory across all fixes.
- **Test Compatibility**: Existing unit and integration tests for `OpenAI`, `OpenRouter`, `Gemini`, `Router`, and `PromptEngine` must remain green and be expanded to cover the corrected behaviors without relaxing existing security assertions.
