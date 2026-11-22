# Specification: Security & Privacy Overhaul

## Problem Statement

Users of the Zeus Chrome Extension face severe security, privacy, and local device vulnerabilities stemming from four critical architectural weaknesses:

1. **Plaintext API Key Cloud Synchronization & Quota Waste**:
   - Current implementation stores all provider API keys (`gemini`, `openai`, `claude`, `openrouter`) in `chrome.storage.sync`, alongside dual-written legacy keys (`zeus_*_api_key`, `zeus_*_model`, `zeus_selected_provider`, and `zeus_provider_configs`).
   - From the user's perspective, this silently replicates paid credentials to Google's cloud synchronization infrastructure and syncs plaintext secrets across all browser profiles (including shared family computers, academic labs, and employer-managed devices).
   - Dual-writing legacy keys permanently duplicates secrets across multiple storage slots, consuming unnecessary sync quota against Chrome's strict 100 KB total and 8 KB per-item limits and risking silent write failures.
   - Content scripts receiving `getSettings` or `copilot:start` messages currently have access to raw `apiKeys`, violating the principle of least privilege in untrusted web page DOM contexts.

2. **Unscrubbed Prompt Exfiltration Across All Dispatch Surfaces**:
   - When a user drafts a prompt inside a web interface (such as Claude.ai, ChatGPT, DeepSeek, or Gemini) or in the Side Panel Workbench, or triggers the Context Menu action (`Enhance Prompt with Zeus`), or receives inline Copilot suggestions, Zeus transmits raw text to external model providers.
   - If the user's prompt contains confidential data—such as internal API keys, database connection strings, customer emails, IP addresses, private certificates, or JWTs—Zeus leaks this information to third-party AI provider logs.
   - In Copilot, automatic background typing completions can silently exfiltrate freshly pasted credentials without the user ever clicking an enhance button.

3. **Cross-Site Scripting (XSS) in Privileged UI Surfaces & Permissive CSP**:
   - The Side Panel Workbench, Options page, and Popup operate within a privileged `chrome-extension://` origin with access to extension storage, runtime messaging, and credentials.
   - Untrusted model outputs, word diffs, and dynamic UI elements use direct `innerHTML` / `insertAdjacentHTML` assignments, creating an attack vector where an adversarial prompt completion, prompt injection, or history restore can execute malicious scripts inside the privileged extension context.
   - Markdown links could execute `javascript:` URIs if not strictly allowlisted.
   - The extension manifest lacks an explicit, hardened Content Security Policy (CSP), leaving extension pages exposed to default permissive boundaries.

4. **Insecure Local Ollama Setup Guidance**:
   - Extension error messages and setup guides currently instruct users to start Ollama with `OLLAMA_ORIGINS=*`.
   - Wildcard cross-origin resource sharing allows any arbitrary website the user visits in their browser to send cross-origin requests to `http://localhost:11434`, exposing the user's local hardware to remote model querying, memory starvation, or local prompt injection.
   - Setup instructions lack guidance for Ollama Desktop GUI users on macOS (`launchctl setenv`).

---

## Solution

The extension will implement a comprehensive security and privacy overhaul across five architectural pillars:

1. **Storage Partitioning, Write-Before-Delete Migration, & Concurrency Locking (Schema v2 -> v3)**:
   - Partition storage into two distinct boundaries:
     - Non-sensitive user preferences (active provider, selected models, Copilot modes, UI toggles, redaction settings) remain in `chrome.storage.sync`.
     - Sensitive credentials (`apiKeys` dictionary) move strictly to `chrome.storage.local`.
   - Upgrade storage schema from version 2 to 3 with a strict write-before-delete migration pipeline:
     - Migration is guarded by an in-flight concurrency lock (`migrationPromise`) so simultaneous `loadSettings()` calls across Service Worker, popup, content scripts, and sidepanel cannot race and corrupt or wipe keys.
     - Performs an idempotent merge where non-empty `local` keys take precedence over `sync` keys.
     - `chrome.storage.local.set()` must resolve successfully before removing `sync.apiKeys` and legacy keys from `chrome.storage.sync`.
     - Purges ALL legacy keys (`zeus_selected_provider`, `zeus_*_model`, `zeus_*_api_key`, `zeus_provider_configs`) and `sync.apiKeys` from `chrome.storage.sync`.
     - Halts all legacy dual-writing in serialization routines.
   - Restrict content script access: `getSettings` and `copilot:start` responses expose sanitized settings with `apiKeys` scrubbed, keeping credentials strictly within the background service worker.

2. **Local PII & Secret Redaction Layer with Collision-Safe In-Memory Rehydration**:
   - Introduce a zero-latency, client-side scrubber module (`core/redactor.js`) before dispatch:
     - Uses collision-safe delimiters: `[[ZEUS_SECRET_1]]`, `[[ZEUS_EMAIL_1]]`, `[[ZEUS_IPV4_1]]`.
     - Applies deterministic regex precedence: PEM private keys -> connection URIs -> Bearer/JWT tokens -> known API key prefixes (`sk-`, `sk-ant-`, `AIza`, `AKIA`) -> key/value credential assignments -> emails -> public IPv4 addresses (excluding loopback `127.0.0.1`, `0.0.0.0`, broadcast, and semver version-like patterns).
     - Redaction maps remain strictly ephemeral in-memory, never persisted to storage, telemetry, or side panel history.
     - System prompt in `core/prompts.js` explicitly commands LLMs to preserve `[[ZEUS_*]]` placeholders verbatim without alterations.
     - In `hydrate()`, replaces placeholders without `String.prototype.replace` `$&`/`$$` special-pattern corruption (using a replacer function or `split().join()`), supports repeated placeholder tokens, and emits a warning toast/log if an LLM drops a placeholder.

3. **Complete Dispatch Surface Coverage & Copilot Recovery**:
   - Redaction and rehydration cover ALL LLM dispatch points:
     - In-page Enhance button (`content.js`)
     - Inline Copilot suggestions (`core/copilot.js`)
     - Context Menu action (`background.js` / `Enhance Prompt with Zeus`)
     - Side Panel Workbench editor enhancement (`sidepanel.js`)
   - Copilot Safety & Dynamic Recovery:
     - Immediately aborts active in-flight Copilot stream requests via `AbortController` if a secret or PII is entered while streaming.
     - Sets a discreet pause state when sensitive data is detected, and automatically clears the pause state and resumes suggestion capabilities once the sensitive data is deleted or edited out of the composer.
   - Ensure proper script dependency loading in `manifest.json` (`core/redactor.js` before `content.js`, `sidepanel.js`, and `background.js`) and include it in `scripts/build-extension.js`.

4. **Hardened Side Panel & Extension UI Safe DOM Rendering with Strict CSP**:
   - Eliminate direct `innerHTML` and `insertAdjacentHTML` assignments across `sidepanel.js`, `popup.js`, `options.js`, and `core/injector.js`.
   - Construct diff views, history lists, template previews, and toasts using safe DOM APIs (`document.createElement`, `document.createTextNode`) or strict sanitization.
   - For Markdown link rendering, enforce a strict protocol allowlist permitting only `http:` and `https:`, explicitly rejecting and neutralizing `javascript:` and data URIs.
   - Enforce an explicit Content Security Policy in `manifest.json` for extension pages that locks down scripts and objects while supporting necessary font and style resources:
     `"extension_pages": "script-src 'self'; object-src 'none'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; base-uri 'none'; frame-ancestors 'none';"`

5. **Scoped, Secure Ollama Setup UX & Desktop Guidance**:
   - Eliminate all references recommending `OLLAMA_ORIGINS=*` across code, comments, UI, error handlers, and `README.md`.
   - Dynamically compute the exact extension origin (`chrome-extension://${chrome.runtime.id}`), falling back to `chrome-extension://<YOUR_EXTENSION_ID>` (never wildcard `*`) if `chrome.runtime?.id` is unavailable.
   - Provide copyable, cross-platform commands in the Options UI:
     - macOS / Linux CLI: `OLLAMA_ORIGINS="chrome-extension://<id>" ollama serve`
     - macOS Desktop GUI (launchd): `launchctl setenv OLLAMA_ORIGINS "chrome-extension://<id>"`
     - Windows PowerShell: `$env:OLLAMA_ORIGINS="chrome-extension://<id>"; ollama serve`
     - Windows Command Prompt: `set OLLAMA_ORIGINS=chrome-extension://<id> && ollama serve`

---

## User Stories

### Storage Partitioning & Secret Isolation
1. As a security-conscious user, I want my paid API keys stored exclusively on my local computer in `chrome.storage.local`, so that my credentials are never synchronized to Google servers or other machines.
2. As a multi-device user, I want my general preferences (active provider, selected models, Copilot mode, UI toggles) synchronized via `chrome.storage.sync`, so that my experience remains uniform across devices without exposing secrets.
3. As an existing extension user upgrading from version 2, I want my existing API keys and preferences migrated automatically upon update, so that my existing setup continues to function without requiring manual re-entry.
4. As an upgraded user, I want all legacy synchronization keys (`zeus_*_api_key`, `zeus_*_model`, `zeus_selected_provider`, `zeus_provider_configs`) permanently deleted from `chrome.storage.sync`, so that storage quota is preserved and stale keys do not linger in the cloud.
5. As an extension user opening multiple tabs simultaneously, I want the settings migration to use a concurrency lock, so that multiple contexts loading at the same time do not race and corrupt my settings.
6. As a user with existing local keys, I want the migration merge to prioritize non-empty local keys over sync keys, so that newer local credentials are not overwritten by stale cloud data.
7. As a privacy-conscious user, I want content scripts running in web pages to never receive raw API keys in response to `getSettings` or `copilot:start`, so that untrusted web scripts cannot extract my credentials.
8. As a developer auditing the codebase, I want `chrome.storage.sync.set()` to strictly reject API key payloads, so that accidental credential sync is prevented by design.

### Local PII & Secret Redaction Layer
9. As a developer writing prompts that include database connection strings, AWS keys, or PEM private keys, I want Zeus to replace these secrets with collision-safe placeholders like `[[ZEUS_SECRET_1]]`, so that my credentials are never logged by third-party LLMs.
10. As a privacy-conscious user drafting an email prompt with recipient addresses, I want email addresses replaced with tokens like `[[ZEUS_EMAIL_1]]` during enhancement, so that personal identifying information is not sent to external model hosts.
11. As a user working with IP configurations, I want public IP addresses scrubbed while loopback addresses (`127.0.0.1`, `0.0.0.0`) and software semver strings are ignored, so that harmless development prompts are not falsely redacted.
12. As a user enhancing a prompt with sensitive values, I want the returned prompt to automatically restore the original secrets, connection strings, and emails without corruption (even if they contain `$` symbols), so that the final prompt is immediately ready to run.
13. As a user whose prompt contains repeated references to the same secret, I want the rehydration logic to restore all occurrences accurately, so that prompt coherence is preserved.
14. As an AI prompt writer, I want the LLM system prompt to explicitly command models to preserve `[[ZEUS_*]]` placeholders verbatim, so that models do not translate, drop, or alter placeholders.
15. As a user reviewing output, I want a visible warning if an LLM accidentally dropped a placeholder token, so that I am alerted to manually inspect the output before sending.
16. As a privacy-first user, I want redaction mappings kept strictly in ephemeral memory, so that sensitive tokens are never written to local storage, telemetry logs, or side panel history.

### Dispatch Coverage & Copilot Recovery
17. As a user triggering prompt enhancement from the browser Context Menu (`Enhance Prompt with Zeus`), I want the redaction and rehydration layer to run seamlessly, so that context menu enhancements enjoy the same privacy protections as in-page button clicks.
18. As a user enhancing prompts in the Side Panel Workbench editor, I want the redaction layer to scrub text before sending to the model and rehydrate before rendering in the editor, so that workbench interactions remain secure.
19. As a user typing in a prompt box with Copilot enabled, I want Copilot to detect pasted secrets or PII and halt automatic suggestion dispatches, so that typing pauses do not trigger silent credential leaks.
20. As a user actively receiving an inline Copilot stream who suddenly pastes a secret, I want the in-flight stream to be aborted immediately, so that no further tokens are processed.
21. As a user who deletes a sensitive token from the prompt input, I want Copilot to automatically clear its paused state and resume inline suggestions, so that my workflow recovers without reloading the page.
22. As an extension maintainer, I want `core/redactor.js` included in `manifest.json` in the proper dependency order and bundled in `scripts/build-extension.js`, so that content scripts and extension pages never fail with missing global reference errors.

### Safe DOM & Extension CSP Hardening
23. As an extension user, I want the Side Panel Workbench, Popup, and Options UI to render model responses, history previews, and diffs without executing untrusted script tags, so that malicious LLM outputs cannot exploit my browser.
24. As a user inspecting word diffs in the workbench, I want added, removed, and unchanged words constructed using pure DOM text nodes, so that formatting characters or HTML entities in my prompt do not trigger HTML parsing exploits.
25. As a user clicking links rendered in the Side Panel, I want only `http:` and `https:` links to be clickable, so that malicious `javascript:` URIs are neutralized.
26. As a developer auditing extension security, I want the extension manifest to declare a strict `content_security_policy` prohibiting `eval()` and unauthorized remote scripts while preserving Google Fonts and local CSS, so that the extension origin adheres to strict browser security boundaries.
27. As a user of the Options page, I want Google Fonts (`Orbitron`, `Rajdhani`, `JetBrains Mono`) to load cleanly under the hardened CSP, so that the cyberpunk visual theme remains intact.

### Ollama Setup & Local Origin Security
28. As a local AI enthusiast, I want Zeus to provide the exact, copyable command using my specific Chrome extension ID to configure Ollama, so that I do not have to manually construct origin strings.
29. As a security-aware user, I want Zeus to never advise setting `OLLAMA_ORIGINS=*`, so that my local Ollama server is never opened up to arbitrary websites on the internet.
30. As a macOS Ollama Desktop GUI user, I want setup instructions with `launchctl setenv OLLAMA_ORIGINS ...`, so that I can configure my desktop daemon without running terminal servers.
31. As a Windows user (PowerShell or Command Prompt) or Linux user, I want Ollama startup command snippets formatted specifically for my shell, so that I can copy and run them with one click.
32. As a user whose extension ID is temporarily unavailable, I want setup instructions to fall back to `<YOUR_EXTENSION_ID>` rather than wildcard `*`, so that secure guidance is consistently enforced.
33. As an open-source contributor browsing the repository, I want `README.md` completely sanitized of all `OLLAMA_ORIGINS=*` references, so that documentation matches production security practices.

---

## Implementation Decisions

### Storage Architecture & Schema Migration (v2 -> v3)
- **Storage Partitioning**:
  - `chrome.storage.sync` holds only public, non-sensitive preferences:
    - `schemaVersion` (number: 3)
    - `provider` (string enum)
    - `models` (map of provider to model ID)
    - `ollama` (object containing `model`)
    - `sidePanelEnabled` (boolean)
    - `copilotEnabled` (boolean)
    - `copilotMode` (string: `'conservative'` | `'aggressive'`)
    - `copilotProvider` (string)
    - `copilotMaxTokens` (number)
    - `redactionEnabled` (boolean, default: true)
    - `customRedactionPatterns` (array of strings)
  - `chrome.storage.local` holds all sensitive credentials:
    - `apiKeys` (map of provider to API key string: `gemini`, `openai`, `claude`, `openrouter`)
- **Write-Before-Delete & Concurrency Lock**:
  - Concurrency Lock: A module-level `migrationPromise` ensures that concurrent calls to `loadSettings()` from multiple extension contexts (background service worker, content scripts, popup, side panel) share a single execution thread and do not trigger duplicate migration routines.
  - Idempotent Merge: Migration inspects existing keys in `chrome.storage.local`. Non-empty local keys take precedence over sync keys to prevent stale sync data from overwriting newer local edits.
  - Write-Before-Delete Ordering:
    1. Read both `chrome.storage.sync` and `chrome.storage.local`.
    2. Extract all API keys from existing `sync.apiKeys` and legacy sync keys (`zeus_gemini_api_key`, `zeus_openai_api_key`, `zeus_claude_api_key`, `zeus_openrouter_api_key`, `zeus_provider_configs`).
    3. Persist extracted `apiKeys` to `chrome.storage.local.set()`.
    4. ONLY after `local.set()` resolves successfully, proceed to delete from `chrome.storage.sync`.
    5. Call `chrome.storage.sync.remove()` passing all legacy keys and `sync.apiKeys`:
       `['zeus_selected_provider', 'zeus_gemini_api_key', 'zeus_gemini_model', 'zeus_openai_api_key', 'zeus_openai_model', 'zeus_claude_api_key', 'zeus_claude_model', 'zeus_openrouter_api_key', 'zeus_openrouter_model', 'zeus_ollama_model', 'zeus_provider_configs', 'apiKeys']`.
    6. Write updated preferences with `schemaVersion: 3` to `chrome.storage.sync`.
  - Content Script Isolation: In `background.js` and `messageHandler.js`, handlers for `getSettings` and `copilot:start` strip the `apiKeys` property from the returned settings payload, ensuring content scripts in web pages never observe credentials.

### Local Scrubber & Rehydration Engine
- **Module Architecture**:
  - Implement `core/redactor.js` loaded across content scripts, background worker, and extension pages.
  - Placeholder Format: `[[ZEUS_SECRET_N]]`, `[[ZEUS_EMAIL_N]]`, `[[ZEUS_IPV4_N]]` where `N` is a 1-based index.
- **Deterministic Regex Precedence**:
  1. PEM private keys: `/-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z]+ )?PRIVATE KEY-----/g`
  2. Database / Connection URIs: `/(?:postgres|mysql|mongodb|redis|amqp|mssql):\/\/[^\s"'<>]+/gi`
  3. Bearer & JWT tokens: `/eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g`
  4. Known API key prefixes:
     - OpenAI: `/sk-[a-zA-Z0-9_-]{20,}/g`
     - Anthropic: `/sk-ant-[a-zA-Z0-9_-]{20,}/g`
     - Google: `/AIza[0-9A-Za-z-_]{35}/g`
     - AWS Access Key: `/AKIA[0-9A-Z]{16}/g`
  5. Key-value credential patterns: `/(?:api[_-]?key|secret|password|auth_token)\s*[:=]\s*['"]?([a-zA-Z0-9_\-.~!@#$%^&*]{8,})['"]?/gi`
  6. Email addresses: `/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g`
  7. Public IPv4 addresses:
     - Regex matches standard IPv4 decimal blocks.
     - Lookaround / filter excludes loopback `127.0.0.1`, `0.0.0.0`, broadcast `255.255.255.255`, and version numbers (preceded or followed by dots, e.g., `1.2.3.4`).
- **Prompt Architect Integration**:
  - Update `core/prompts.js`:
    ```
    SAFETY RULES (NON-NEGOTIABLE):
       - Preserve all [[ZEUS_*]] placeholder tokens (e.g., [[ZEUS_SECRET_1]], [[ZEUS_EMAIL_1]]) EXACTLY as written.
       - Do NOT translate, modify, expand, or remove any [[ZEUS_*]] placeholder tags.
    ```
- **Safe Rehydration**:
  - `hydrate(text, secretMap)`: Iterates over placeholder entries and performs split-join replacement: `text = text.split(placeholder).join(originalValue)`. This avoids JavaScript regex special replacement sequences (such as `$$`, `$&`, `$'`).
  - Detects if any placeholder from `secretMap` is missing from the enhanced output and surfaces a non-blocking warning.
  - Redaction maps remain strictly in memory and are never persisted to storage or telemetry.

### Dispatch Surface Coverage & Copilot Recovery
- **Surface Interception**:
  - In-Page Enhance (`content.js`): Scrubs prompt before `sendMessage({ action: 'enhancePrompt' })` and hydrates response before injecting.
  - Context Menu (`background.js`): Scrubs selected text before dispatching to provider router, then hydrates before writing back to active tab.
  - Side Panel Workbench (`sidepanel.js`): Scrubs `originalInput.value` before calling enhancement, hydrates before populating `enhancedOutput` and diff views.
  - Copilot (`core/copilot.js`):
    - On typing idle, runs `scrub()`. If sensitive tokens are detected, aborts dispatch and shows a discrete pause indicator.
    - If user types or pastes a secret during an active completion stream, executes `port.disconnect()` and `abortController.abort()` immediately.
    - When user edits or removes the sensitive content, automatically clears the pause indicator and re-arms suggestion capability.

### Safe DOM Rendering & Content Security Policy
- **DOM Sanitization**:
  - `sidepanel.js`:
    - `renderDiff()`: Uses `document.createElement('span')` and `document.createTextNode()` to build diff elements, completely removing `diffView.innerHTML = html`.
    - History & Templates: Replace `meta.innerHTML = ...` and list rendering with `document.createElement` and text content assignment.
    - Links: Markdown link parser enforces `^https?:\/\/` protocol check. Any `javascript:`, `data:`, or relative URIs are stripped or converted to plain text.
  - `popup.js`, `options.js`, `core/injector.js`:
    - Audit and replace all unescaped `innerHTML` / `insertAdjacentHTML` with safe text nodes or sanitized elements.
- **Manifest CSP**:
  - Update `manifest.json`:
    ```json
    "content_security_policy": {
      "extension_pages": "script-src 'self'; object-src 'none'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; base-uri 'none'; frame-ancestors 'none';"
    }
    ```

### Scoped Ollama Configuration & Multi-Platform Guidance
- **Command Formatter**:
  - Helper generates copyable commands based on `chrome.runtime?.id || '<YOUR_EXTENSION_ID>'`:
    - macOS / Linux Terminal: `OLLAMA_ORIGINS="chrome-extension://<id>" ollama serve`
    - macOS Desktop (launchd): `launchctl setenv OLLAMA_ORIGINS "chrome-extension://<id>"`
    - Windows PowerShell: `$env:OLLAMA_ORIGINS="chrome-extension://<id>"; ollama serve`
    - Windows Command Prompt: `set OLLAMA_ORIGINS=chrome-extension://<id> && ollama serve`
  - Update `providers/ollama.js` error messages to display the scoped origin command.
  - Update `options.html` and `options.js` with platform tabs and copy buttons.
  - Sanitize `README.md` to remove all instances of `OLLAMA_ORIGINS=*`.

---

## Testing Decisions

### What Makes a Good Test
- Tests must assert on external, observable behaviors and boundary contracts rather than internal implementation details.
- Storage tests must assert directly on the contents of `chrome.storage.sync` and `chrome.storage.local` before and after public method execution.
- Redaction tests must verify that sensitive inputs produce sanitized outbound payloads with collision-safe tags, and that the hydrated text exactly matches original values without mangling surrounding text (including `$` symbols).
- Rendering tests must verify that markup strings containing script tags or event handlers result in inert text nodes, never executable script elements.
- Security tests must assert that `OLLAMA_ORIGINS=*` is never emitted by provider error builders or helper utilities.

### Target Test Seams
1. **Storage & Migration Public Seam (`ZeusSettings.loadSettings` / `ZeusSettings.saveSettings`)**:
   - Primary boundary: Interacts directly with simulated `chrome.storage.sync` and `chrome.storage.local`.
   - Verifies write-before-delete: `chrome.storage.local.set()` succeeds before `chrome.storage.sync.remove()` is called.
   - Verifies concurrency lock: Concurrent `loadSettings()` calls resolve to a single migration pass without duplicate writes.
   - Verifies idempotent merge: Non-empty local keys take precedence over sync keys.
   - Verifies complete purge of all legacy keys (`zeus_*`).
   - Verifies content script settings masking: `getSettings` response excludes `apiKeys`.
   - Verifies `tests/smoke/settings-and-messaging.smoke.mjs` passes under `schemaVersion: 3`.

2. **Scrubber & Rehydration Seam (`ZeusRedactor.scrub` / `ZeusRedactor.hydrate`)**:
   - Primary boundary: Takes raw prompt strings and returns scrubbed text with secret mappings; takes enhanced text and restores original values.
   - Verifies deterministic regex precedence (PEM -> URIs -> JWT -> known keys -> assignments -> emails -> public IPs).
   - Verifies exclusion of loopback (`127.0.0.1`, `0.0.0.0`) and semver version numbers from IP scrubbing.
   - Verifies collision-safe placeholders (`[[ZEUS_*]]`).
   - Verifies special character preservation (`$`, `&`, `\`) during rehydration without JavaScript replacement syntax corruption.
   - Verifies warning emission when placeholders are missing from the model response.

3. **Enhancement Pipeline & Copilot Recovery Seam**:
   - Primary boundary: Exercises the content script enhancement flow, context menu, workbench, and Copilot input monitor.
   - Verifies outbound payloads across ALL entry points (in-page button, context menu, side panel) contain only masked placeholders.
   - Verifies target inputs / workbench editor receive fully restored original secrets.
   - Verifies Copilot aborts an active in-flight stream when a secret is entered.
   - Verifies Copilot automatically clears pause state and resumes suggestions when secrets are removed.
   - Verifies `core/redactor.js` is bundled in `scripts/build-extension.js` and loaded in `manifest.json`.

4. **Side Panel & UI Safe DOM Seam (`renderDiff` / UI Renderers)**:
   - Primary boundary: Exercises diff rendering and UI lists given inputs with potential XSS payloads (`<img src=x onerror=alert(1)>`, `<script>`).
   - Verifies that `diffView` and history items contain zero script elements and payload strings are treated strictly as inert text nodes.
   - Verifies Markdown links allow only `http:`/`https:` and neutralize `javascript:` URIs.
   - Verifies `content_security_policy` in `manifest.json` permits required font/style resources while blocking unauthorized script execution.

5. **Ollama Provider Origin Notice Seam (`buildOllamaOriginBlockedMessage`)**:
   - Primary boundary: Exercises Ollama error message generation and Options UI command generator.
   - Verifies error messages and UI commands use the scoped extension ID and include macOS `launchctl` guidance.
   - Verifies fallback to `chrome-extension://<YOUR_EXTENSION_ID>` if `chrome.runtime?.id` is undefined.
   - Verifies that `OLLAMA_ORIGINS=*` does not appear anywhere in code, error strings, or documentation.

### Prior Art
- `tests/unit/settings.test.js`: Unit tests for settings normalization and migration.
- `tests/smoke/settings-and-messaging.smoke.mjs`: Runtime smoke testing covering settings migration and Chrome storage events.
- `tests/dom/content-dom.test.js`: DOM interaction tests verifying input selection and injection in a simulated browser environment.
- `tests/unit/provider-utils.test.js`: Unit tests for provider helpers and JSON parsing.

---

## Out of Scope
- Server-side remote redaction or cloud-hosted PII scanning APIs (all scrubbing must remain 100% on-device).
- Machine-learning-based natural language Named Entity Recognition (NER) models running in WebAssembly (regex and rule-based scrubbing only for zero latency).
- Automatic background process management to launch, terminate, or supervise the local Ollama daemon.
- Cloud-based synchronized encrypted key vaults across different browser vendors (e.g., Firefox/Safari sync).
- Hardware security key / WebAuthn token integration for API key access.

---

## Further Notes
- The storage migration from `v2` to `v3` is a destructive one-time migration for legacy keys in `chrome.storage.sync`. If a user downgrades to an older extension version, legacy keys will not be present in `chrome.storage.sync`.
- The scrubber placeholder format (`[[ZEUS_SECRET_1]]`, `[[ZEUS_EMAIL_1]]`) was selected because double brackets avoid collisions with single-bracket code constructs (such as array indexing or markdown links) and instruction-following LLMs naturally preserve double-bracketed tokens verbatim.
- All redaction maps are held in ephemeral closure memory during the active request lifecycle and garbage collected immediately after rehydration.
