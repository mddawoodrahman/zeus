# Specification: Codebase Architecture Deepening & Module Consolidation

## Problem Statement

Users and developers of the Zeus Prompt Enhancement Extension face architectural fragility, maintenance overhead, and security exposure stemming from shallow modules and leaky seams across four core subsystems:

1. **Scattered Prompt Enhancement Choreography Across MV3 Boundaries**:
   - The lifecycle of enhancing a prompt—redacting sensitive credentials, selecting model routing, dispatching runtime messages, executing network retries, and rehydrating tokens—is not concentrated in one place.
   - Instead, three distinct user-facing entry points (the in-page composer button, the Side Panel Workbench editor, and the context menu) independently coordinate scrubbing, messaging, and rehydration.
   - Collapsing this pipeline carelessly into a monolithic background service risks sending raw plaintext secrets across Manifest V3 IPC boundaries (`chrome.runtime.sendMessage`), violating zero-trust memory isolation in multi-process architectures.
   - Returning unstructured bare strings causes dropped-placeholder warnings and telemetry metadata to be discarded before reaching UI alert surfaces.

2. **Divergent UI and Leaky DOM Sanitization**:
   - The Side Panel Workbench module mixes user interface button, tab, and form handlers with domain-wide DOM sanitization utilities, Myers word diffing, and Markdown parsing.
   - Because sanitization logic is trapped inside a browser page script, automated test suites and external caller scripts must instantiate or simulate full browser UI contexts just to verify text diffs or link safety.
   - Clearing DOM nodes with `innerHTML = ''` or using naïve regex allowlists leaves pages vulnerable to case-, whitespace-, or control-character-obfuscated `javascript:` and `data:` URIs.

3. **Duplicated Network and Provider Boilerplate with Inconsistent Streaming**:
   - Each model provider integration operates as a shallow wrapper around network communication.
   - Every provider independently re-implements fetch timeout aborts, server-sent event (SSE) stream parsing, JSON error decoding, and exponential retry backoff.
   - While unary requests have basic retry loops, Copilot streaming bypasses shared error handling, risking retry storms after stream chunks have already been emitted to user input fields or after explicit user aborts.
   - Redundant network helper functions in utility files duplicate transport responsibilities.

4. **Leaky Settings Storage, Sibling Overwrites & Cache Invalidation**:
   - The settings system exposes callers to the internal complexity of storage partitioning between non-sensitive sync preferences and local API key storage.
   - Naïve shallow updates risk overwriting unmentioned sibling API keys (e.g. updating an OpenAI key accidentally wiping Anthropic or Gemini keys).
   - In-memory settings caches across MV3 service workers, popups, and side panels can go stale if cache invalidation does not monitor both `sync` and `local` storage change events.

---

## Solution

The extension will undergo a comprehensive architectural deepening refactor that turns shallow, leaky modules into deep, high-leverage modules with minimal, stable interfaces:

1. **MV3 Process-Split Prompt Architecture (`PromptClient` & `PromptEngine`)**:
   - Split prompt enhancement across the Manifest V3 IPC boundary:
     - **Client-Side Seam (`PromptClient.enhance(rawText, options)`)**: Runs in the initiating context (content script, side panel, or delegated context menu). Owns client-side redaction scrubbing, IPC message dispatch, IPC error normalization, and client-side safe rehydration. Plaintext secrets NEVER cross the IPC boundary.
     - **Background Seam (`PromptEngine`)**: Runs in the background service worker. Owns settings resolution, router evaluation, candidate provider execution, fallback retry orchestration, telemetry recording, and defense-in-depth scrubbing for direct background calls.
   - Both seams return a structured payload: `{ enhancedText, originalText, warnings, meta }`, preserving dropped-placeholder warnings, token metrics, and routing metadata for UI presentation.

2. **Dedicated Safe DOM Construction Module (`SafeDOM`)**:
   - Extract word diffing, Markdown parsing, and URL protocol allowlisting into `core/safeDom.js`.
   - Clear target containers strictly via `replaceChildren()` (zero `innerHTML = ''`).
   - Automatically inject `rel="noopener noreferrer"` and `target="_blank"` on all valid links.
   - Enforce rigorous protocol validation that rejects case-, whitespace-, and control-character-obfuscated `javascript:` and `data:` schemes.

3. **Unified Provider Transport Engine (`ProviderTransport`)**:
   - Deepen the transport seam to provide both unary `execute(requestSpec)` and streaming `stream(requestSpec, { onChunk, signal })` interfaces.
   - Provide built-in, tested frame decoders for both Server-Sent Events (SSE) and Newline-Delimited JSON (NDJSON).
   - Enforce retry safety: retries ONLY trigger on pre-first-byte transient errors, NEVER after the first streaming chunk has been emitted, and NEVER after `AbortSignal` cancellation.
   - Absorb and retire redundant fetch and retry helpers in `providers/utils.js`.

4. **Cohesive Settings Store (`SettingsStore`)**:
   - Encapsulate storage partitioning, schema migration, in-memory caching, and content script masking behind a unified `SettingsStore` module.
   - Implement section-level nested merge semantics for `update(diff)`: updating one provider key never wipes sibling keys, while explicitly setting `""` clears an individual key.
   - Invalidate in-memory caches on `chrome.storage.onChanged` for BOTH `'sync'` and `'local'` storage areas.
   - Preserve all Schema v3 invariants: write-before-delete migration, concurrency locking, and complete exclusion of API keys from public content-script settings.

---

## User Stories

### Prompt Engine & Secret Protection
1. As a user enhancing a prompt with private credentials, I want secrets scrubbed locally before any IPC message is dispatched, so that plaintext credentials are never transmitted over internal browser messaging channels.
2. As an AI prompt writer, I want dropped-placeholder warnings surfaced to the UI alongside the enhanced prompt, so that I am alerted if a model omitted a masked variable.
3. As a developer adding a new prompt dispatch surface, I want to call `PromptClient.enhance()`, so that scrubbing, IPC dispatch, error handling, and rehydration are handled automatically.
4. As a user on a slow network, I want model fallback to cascade seamlessly to secondary providers on timeout, so that my prompt is still enhanced.
5. As a developer inspecting system logs, I want enhancement telemetry metadata returned in a structured payload, so that token usage and latency can be tracked.
6. As a privacy-conscious user, I want the background engine to perform defense-in-depth scrubbing on background-initiated requests, so that secrets cannot escape even if client scrubbing was bypassed.

### Safe DOM & UI Separation
7. As a workbench user inspecting diffs, I want containers cleared using safe DOM APIs, so that unescaped markup is never parsed during view transitions.
8. As a user clicking links in enhanced markdown, I want all links to enforce `rel="noopener noreferrer"`, so that opened tabs cannot access or manipulate the extension workbench window.
9. As a security auditor, I want protocol sanitization to reject obfuscated URLs containing tabs, newlines, or mixed casing (e.g. `java\nscript:`), so that XSS bypasses are neutralized.
10. As an extension maintainer, I want DOM sanitization and Myers diffing located in `core/safeDom.js`, so that UI scripts remain strictly focused on user input and event bindings.
11. As a tester, I want to test safe DOM generation without instantiating full UI page controllers, so that tests remain fast and deterministic.

### Provider Transport & Streaming Resilience
12. As a Copilot user, I want streaming tokens delivered smoothly via `ProviderTransport.stream()`, so that inline suggestions appear with minimal latency.
13. As a local Ollama user, I want NDJSON response streams parsed seamlessly by the shared transport, so that local streaming behaves identically to cloud SSE streams.
14. As an extension user whose network drops midway through a stream, I want the system to abort cleanly rather than retrying after partial text has been rendered, so that duplicate responses are never injected.
15. As a user cancelling an in-flight prompt completion, I want the stream and underlying network connection aborted immediately, so that no wasted tokens or retries occur.
16. As a developer adding a new AI provider, I want to define a declarative adapter without writing fetch, timeout, or streaming logic, so that provider integrations remain under 100 lines of code.

### Settings Store & Storage Isolation
17. As a user updating my OpenAI API key, I want my Anthropic and Gemini keys preserved untouched, so that partial updates never wipe unmentioned credentials.
18. As a user removing an individual API key by clearing the input field, I want that key explicitly erased, so that revocation is immediate.
19. As a user with multiple extension tabs open, I want settings changes made in the Options page reflected instantly in the Side Panel, so that in-memory caches never serve stale configuration.
20. As a content script running on an untrusted web page, I want `getPublic()` to return zero API keys, so that web scripts cannot extract paid tokens.
21. As an upgrading user, I want existing v2 settings migrated with write-before-delete concurrency locking, so that simultaneous browser restarts never corrupt stored keys.

---

## Implementation Decisions

### 1. MV3-Split Prompt Architecture (`PromptClient` & `PromptEngine`)
- **Two Seams Across the MV3 Process Boundary**:
  - **Client Seam (`core/promptClient.js`)**:
    - Runs in untrusted/renderer contexts: content scripts, Side Panel Workbench, and delegated context menu handlers.
    - Interface: `enhance(rawText, options): Promise<{ enhancedText, originalText, warnings, meta }>`
    - Workflow: `scrub(rawText)` $\rightarrow$ dispatch `chrome.runtime.sendMessage({ action: 'enhancePrompt', scrubbedText, ... })` $\rightarrow$ catch/normalize errors $\rightarrow$ `hydrate(enhancedScrubbedText, secretMap)` $\rightarrow$ return structured payload.
    - Security Invariant: Plaintext secrets NEVER cross `chrome.runtime.sendMessage`.
  - **Background Seam (`core/promptEngine.js` / `core/router.js`)**:
    - Runs in the privileged background service worker.
    - Interface: `execute(scrubbedText, options): Promise<{ enhancedText, warnings, meta }>`
    - Workflow: Resolve settings $\rightarrow$ evaluate router candidates $\rightarrow$ execute via `ProviderTransport` $\rightarrow$ cascade fallbacks on failure $\rightarrow$ record telemetry $\rightarrow$ return enhanced scrubbed text and metadata.
    - Defense-in-depth: If invoked directly from background context without prior scrubbing, performs internal scrubbing.

### 2. Standalone Safe DOM Module (`core/safeDom.js`)
- **Container Clearing**: Clear target containers strictly via `container.replaceChildren()` (banning `innerHTML = ''` and `textContent = ''`).
- **Link Hardening**: All generated anchor tags set `rel="noopener noreferrer"` and `target="_blank"`.
- **Strict Protocol Validation**: Normalize URL strings by stripping whitespace and control characters (`[\x00-\x20]`), downcasing, and matching against strict `^https?://`. Explicitly reject `javascript:`, `data:`, `vbscript:`, and relative paths.
- **Interface Surface**:
  - `renderDiff(container, oldText, newText)`: Builds token-level diff nodes (`span.diff-added`, `span.diff-removed`, `span.diff-unchanged`).
  - `renderMarkdown(container, markdownText)`: Constructs safe DOM tree for paragraphs, lists, code spans, and links.
  - `isSafeUrl(url)`: Pure boolean validator for URL allowlisting.

### 3. Unified Provider Transport Engine (`core/providerTransport.js`)
- **Dual Interface**:
  - Unary: `execute(requestSpec): Promise<ResponsePayload>`
  - Streaming: `stream(requestSpec, { onChunk, signal }): Promise<void>`
- **Frame Decoders**:
  - Built-in SSE parser handling `data: [JSON]` and `data: [DONE]`.
  - Built-in NDJSON parser handling line-delimited JSON objects.
- **Retry Safety Invariants**:
  - Retries with exponential backoff are permitted ONLY on pre-first-byte transient errors (HTTP 429, 500, 502, 503, 504, fetch network errors).
  - Retries are strictly forbidden after the first chunk has been dispatched via `onChunk()`.
  - Retries are strictly forbidden if `signal.aborted` is true.
- **Consolidation**: Retire duplicate `fetchWithTimeout` and JSON reading routines in `providers/utils.js` in favor of the transport module.

### 4. Cohesive Settings Store (`settings/settingsStore.js`)
- **Nested Section-Level Merge**:
  - `update(diff)` merges nested objects at the section level:
    ```javascript
    // Example: updating openai key preserves existing claude and gemini keys
    const newApiKeys = { ...currentLocal.apiKeys, ...diff.apiKeys };
    ```
  - Empty string values (`""`) explicitly clear a key from the map.
- **Dual Storage Cache Invalidation**:
  - Register `chrome.storage.onChanged` listening to both `'sync'` and `'local'` changes.
  - Invalidate in-memory caches immediately upon storage events across any extension context.
- **Issue #4 Invariants Preserved**:
  - Write-before-delete ordering: `chrome.storage.local.set()` succeeds before `chrome.storage.sync.remove()`.
  - Concurrency lock (`migrationPromise`) prevents race conditions during v2 $\rightarrow$ v3 migration.
  - `getPublic()` strictly excludes `apiKeys` and provides boolean flags (`hasApiKey: { [provider]: boolean }`).

---

## Testing Decisions

### What Makes a Good Test
- Tests must assert on observable behavior and contracts at the module interface, never on internal private state.
- Client/Background separation tests must inspect IPC payloads and assert that plaintext secrets never appear in `chrome.runtime.sendMessage`.
- Safe DOM tests must feed adversarial strings (`\njavascript:`, `JavaSCRIPT:`, `data:text/html`, `<img onerror=>`) and assert that containers contain zero script nodes and zero unallowlisted schemes.
- Streaming transport tests must verify that SSE and NDJSON decode identical token streams, and that mid-stream aborts do not trigger retries.
- Settings store tests must perform partial nested updates and verify that sibling keys are preserved in local storage.

### Target Test Seams
1. **Client Seam (`PromptClient.enhance`) & Background Seam (`PromptEngine.execute`)**:
   - Client Seam: Takes raw text with secrets; asserts IPC message receives masked tokens (`[[ZEUS_*]]`) and caller receives hydrated text + warnings.
   - Background Seam: Takes scrubbed text; asserts router execution, provider fallback, and telemetry generation.
2. **Safe DOM Seam (`SafeDOM.renderDiff`, `SafeDOM.renderMarkdown`)**:
   - Takes target element + markup; asserts child DOM structure, `replaceChildren()` usage, `rel="noopener noreferrer"`, and protocol safety.
3. **Provider Transport Seam (`ProviderTransport.execute`, `ProviderTransport.stream`)**:
   - Exercises unary and streaming requests against mock SSE/NDJSON streams; verifies retry constraints.
4. **Settings Store Seam (`SettingsStore.get`, `SettingsStore.update`, `SettingsStore.getPublic`)**:
   - Interacts with storage mocks; asserts nested merging, dual-area cache invalidation, and public settings masking.

### Prior Art
- `tests/integration/dispatch-redaction.test.js`: Dispatch redaction and IPC testing.
- `tests/dom/safe-dom-csp.test.js`: Safe DOM tree building and CSP verification.
- `tests/providers/openai-provider.test.js`: Provider response mocking.
- `tests/unit/settings.test.js`: Settings migration and normalization.

---

## Out of Scope
- Introducing third-party frontend frameworks (React, Vue, Svelte).
- Rewriting content script adapters to use shadow DOMs or iframe-based UI embedding.
- Implementing cloud-hosted server proxies or remote proxy servers for AI API calls.
- Adding new AI provider integrations beyond the existing five (OpenAI, Gemini, Claude, OpenRouter, Ollama).
- Modifying CSS themes or visual branding assets.

---

## Further Notes
- Strict vertical ticket sequencing (`SafeDOM` $\rightarrow$ `SettingsStore` $\rightarrow$ `ProviderTransport` $\rightarrow$ `PromptClient`/`PromptEngine` $\rightarrow$ Build/Manifest/Packaging) guarantees that `npm test` and `npm run package` remain green at each step.
- All new core modules will be explicitly registered in `manifest.json`, `sidepanel.html`, and `scripts/build-extension.js`.
