# Specification: Critical Risks & Architectural Red Flags Remediation

## Problem Statement

Users of the Zeus Chrome Extension face severe security, privacy, reliability, and store compliance risks stemming from five core architectural flaws:

1. **Insecure Storage of Paid Credentials & Quota Exhaustion**: API keys for paid services (OpenAI, Gemini, Claude, OpenRouter) are stored in `chrome.storage.sync`, silently synchronizing plaintext secrets across any browser profile the user signs into (such as shared, public, or employer-owned machines). Furthermore, persistent dual-writing of legacy schema keys accelerates quota consumption toward Chrome's strict 100 KB total and 8 KB per-item limits, risking silent write failures and settings loss.
2. **Copilot Silent Data Exfiltration & Token-Burn**: The automated Copilot feature triggers background LLM completions after short typing pauses (400ms to 800ms) with no sensitive data detection. Pasting `.env` files, API keys, credentials, or customer PII into AI interfaces results in immediate, unauthorized exfiltration of sensitive information to third-party model providers. Additionally, full-prompt re-transmission on every keystroke pause burns paid token quotas and triggers frequent HTTP 429 rate-limit errors.
3. **Manifest V3 Service Worker Lifecycle Violation**: A 15-second heartbeat ping loop runs across open tabs to keep the background service worker alive perpetually. This fights Chrome's Manifest V3 process lifecycle, draining laptop battery and system memory, and violating Web Store background execution guidelines.
4. **Trademark & Copyright Takedown Exposure**: The extension's UI stylesheets, option pages, and documentation utilize protected third-party intellectual property ("Arasaka Red" and "Night City" from the Cyberpunk franchise), creating an immediate risk of rejection or permanent suspension from the Chrome Web Store.
5. **Build Pipeline & Manifest Configuration Drift**: The build packaging script relies on a manually curated file allowlist that drifts from actual extension requirements, creating the risk of distributing packages missing critical interface components (options page, side panel workbench, or stylesheets). Concurrently, background network permissions omit essential provider endpoints, risking silent runtime network failures.

## Solution

The extension architecture will be overhauled to eliminate these vulnerabilities before introducing new features:

1. **Storage Partitioning, One-Time Migration, and Optional Vault Mode**:
   - Partition storage into non-sensitive Preferences (`chrome.storage.sync`) and sensitive Secrets (`chrome.storage.local`).
   - Execute a destructive one-time migration (`schemaVersion: 2 -> 3`) that moves API keys into local storage, deletes all legacy compatibility keys (`zeus_*`), and permanently halts dual-writing.
   - Introduce an optional passphrase-protected "Vault Mode" using Web Crypto AES-GCM (PBKDF2 key derivation), storing ciphertext in local storage and holding decrypted keys only in ephemeral `chrome.storage.session` memory.
2. **Client-Side Redactor, Smart Triggering, and Cost Guardrails**:
   - Introduce a local regex and entropy-based redactor. For Copilot auto-completions, auto-dispatch is blocked entirely when secrets or PII are detected. For manual prompt enhancement, secrets are replaced with deterministic placeholders (`{{REDACTED_SECRET_1}}`) before leaving the browser and restored locally upon injection.
   - Guard Copilot dispatch with a minimum length threshold (>= 20 characters), boundary condition checks (whitespace, punctuation, or newline), active request cancellation via `AbortController`, configurable daily token/request caps, and cost-effective default models (e.g., Gemini Flash-Lite or GPT-4o-mini).
3. **Ephemeral Messaging Port Architecture**:
   - Remove the 15-second heartbeat ping loop entirely.
   - Transition Copilot streaming to an on-demand, ephemeral message port that opens when a completion request is fired, streams response tokens, and calls `port.disconnect()` immediately upon completion, error, or user interruption, allowing the background service worker to suspend naturally.
4. **Brand-Safe Design System Refactoring**:
   - Rename all design tokens and CSS variables referencing third-party IP to original names (e.g., `--arasaka-red` becomes `--crimson-signal`, and "Night City" becomes "Obsidian Circuit"), updating all stylesheets, UI templates, scripts, and documentation.
5. **Manifest-Driven Build Pipeline & Complete Host Permissions**:
   - Refactor `scripts/build-extension.js` to parse `manifest.json` as the single source of truth, dynamically resolving and packaging all declared HTML, script, style, and icon assets with strict pre-build file existence validation.
   - Add explicit host permissions in `manifest.json` for all external AI provider endpoints (`generativelanguage.googleapis.com`, `api.openai.com`, `api.anthropic.com`, `openrouter.ai`, and `localhost:11434`).

## User Stories

1. As a security-conscious user, I want my paid API keys stored exclusively on my local computer in `chrome.storage.local`, so that my credentials are never synchronized to other computers or shared profiles.
2. As a multi-device user, I want my non-sensitive preferences (selected models, prompt modes, UI options) synchronized across devices via `chrome.storage.sync`, so that my settings remain consistent without exposing secrets.
3. As an existing extension user upgrading from version 2, I want my existing API keys and preferences migrated automatically upon update, so that my existing setup continues to function without manual reconfiguration.
4. As an upgraded user, I want obsolete legacy compatibility keys permanently deleted from storage after migration, so that storage limits are conserved and stale keys do not linger.
5. As an enterprise user, I want an optional Vault Mode protected by a master passphrase, so that my API keys are encrypted at rest on disk using AES-GCM.
6. As a Vault Mode user, I want decrypted keys held exclusively in memory via `chrome.storage.session`, so that my secrets are automatically cleared whenever Chrome closes.
7. As a Vault Mode user, I want to manually lock my vault from the popup or options page, so that unauthorized persons cannot access my credentials when I leave my desk.
8. As a Vault Mode user entering an incorrect passphrase, I want an error notice without data corruption, so that I can re-enter my passphrase safely.
9. As a developer pasting code containing API keys into a chat interface, I want Copilot to detect secrets and abort auto-completion dispatch, so that credentials are never leaked to external model providers.
10. As a privacy-focused user pasting customer PII into a chat prompt, I want Copilot to detect sensitive patterns and block automatic dispatch, so that private information is not exfiltrated.
11. As a user executing manual prompt enhancement on text containing secrets, I want sensitive values replaced with placeholders before transmission and restored upon DOM injection, so that the LLM enhances my prompt structure without observing private values.
12. As a user typing in a prompt field, I want Copilot suggestions to trigger only after reaching at least 20 characters and pausing at a word or punctuation boundary, so that typing pauses do not trigger unnecessary completions.
13. As an active writer, I want any active Copilot completion stream aborted immediately when I resume typing, so that outdated suggestions are canceled and token consumption is minimized.
14. As a budget-conscious user, I want a configurable daily request or token cap on Copilot completions, so that automatic suggestions do not exhaust my paid API budgets.
15. As a user enabling Copilot, I want the default completion model configured to a fast, low-cost model, so that auto-suggestions remain economical.
16. As a privacy-first user, I want the option to route Copilot completions to local Ollama or Chrome Built-in AI models, so that my prompt data never leaves my device.
17. As a laptop user, I want the extension background service worker to suspend when idle, so that background CPU and battery consumption are minimized.
18. As a user receiving a Copilot stream, I want the streaming port to disconnect immediately when the suggestion finishes, so that background workers are not held open indefinitely.
19. As an extension maintainer, I want all design tokens and color variables to use original naming conventions, so that the extension avoids trademark conflicts with third-party intellectual property.
20. As a user of the extension interface, I want the dark cyberpunk aesthetic retained with original tokens (such as Crimson Signal and Obsidian Circuit), so that the visual styling remains cohesive and compliant.
21. As a release engineer, I want the build pipeline to derive packaging files dynamically from `manifest.json`, so that new pages and assets are automatically bundled without manual file allowlist updates.
22. As a developer building the extension, I want the build tool to fail with an explicit error if any file referenced in `manifest.json` is missing on disk, so that broken distributions are prevented.
23. As a user sending prompts to OpenAI, Gemini, or Claude, I want background network requests to execute reliably without CORS or network policy errors, so that prompt enhancements operate without failure.
24. As a keyboard user, I want hotkeys (such as Alt+Shift+Z for the side panel) and all UI surfaces (popup, options, sidepanel) to function out of the box in production builds, so that the extension delivers its full declared functionality.

## Implementation Decisions

### Storage Architecture & Vault Mode
- Preferences and Secrets will be completely isolated:
  - `chrome.storage.sync` will store non-sensitive preferences (`schemaVersion`, `provider`, `models`, `ollama`, `sidePanelEnabled`, `copilotEnabled`, `copilotMode`, `copilotProvider`, `copilotMaxTokens`, `copilotDailyCap`, `vaultEnabled`).
  - `chrome.storage.local` will store secret credentials (`apiKeys` dictionary containing `gemini`, `openai`, `claude`, `openrouter`) and the Vault salt/ciphertext when Vault Mode is active.
- `schemaVersion` will be incremented from `2` to `3`.
- Destructive migration will run during settings initialization:
  - Read legacy keys from `chrome.storage.sync`.
  - Extract and persist `apiKeys` into `chrome.storage.local`.
  - Remove all legacy keys (`zeus_selected_provider`, `zeus_*_api_key`, `zeus_*_model`, `zeus_provider_configs`) and `apiKeys` from `chrome.storage.sync`.
  - Permanently remove dual-write serialization from `serializeSettings`.
- Vault Mode implementation:
  - Cryptographic standard: AES-GCM (256-bit key length) with a 96-bit initialization vector (IV) generated per encryption operation.
  - Key derivation: PBKDF2 using SHA-256 with 100,000 iterations and a cryptographically secure 16-byte salt generated via `crypto.getRandomValues`.
  - Session caching: Decrypted credentials reside exclusively in `chrome.storage.session`, cleared when the browser closes or the user explicitly clicks "Lock Vault".

### Client-Side Redactor & Copilot Guardrails
- A dedicated client-side Redactor module will evaluate text before dispatch:
  - Secret patterns: OpenAI API keys (`sk-[a-zA-Z0-9_-]{20,}`), Anthropic API keys (`sk-ant-[a-zA-Z0-9_-]{20,}`), AWS Access Keys (`AKIA[0-9A-Z]{16}`), Google AI Studio keys (`AIza[0-9A-Za-z-_]{35}`), generic JSON Web Tokens, and private key blocks (`-----BEGIN (RSA|EC|PGP|OPENSSH|ENCRYPTED)? PRIVATE KEY-----`).
  - PII patterns: Email addresses (`[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}`) and credential assignment patterns (`(api[_-]?key|secret|password|token)\s*[:=]\s*['"][^'"]+['"]`).
  - Copilot behavior: If any match is detected, Copilot cancels dispatch and presents a discrete UI status indicator stating suggestions are paused for sensitive content.
  - Enhancement behavior: Detected matches are replaced with indexed tokens (`{{REDACTED_SECRET_1}}`, `{{REDACTED_SECRET_2}}`). The mapping is stored in local execution memory, the sanitized text is sent to the LLM, and placeholders are substituted with the original values before DOM write-back.
- Copilot dispatch controls:
  - Minimum text length increased from 10 to 20 characters.
  - Word boundary validation requires the preceding character to be whitespace, punctuation (`.`, `,`, `;`, `:`, `!`, `?`), or newline.
  - In-flight requests are immediately aborted using `AbortController.abort()` upon any subsequent keystroke or input event.
  - Daily suggestion counter recorded in `chrome.storage.local` with date-based rollover; dispatches pause once the configured limit is reached.
  - Default Copilot provider configured to cost-effective models (`gemini-2.0-flash-lite` or `gpt-4o-mini`).

### Ephemeral Port Messaging & Service Worker Lifecycle
- The 15-second heartbeat ping interval in `messageHandler.js` will be removed entirely.
- Copilot streaming will use an ephemeral `chrome.runtime.connect` channel:
  - Content script initiates connection on `copilot-stream` only when an eligible dispatch occurs.
  - Stream chunks are pushed to the content script.
  - Upon receiving `done`, `error`, or upon user cancellation, `port.disconnect()` is executed immediately.
  - Background service worker listens for port disconnection and aborts any active upstream fetch stream.
  - The service worker relies entirely on standard Chrome MV3 event-driven wakeups, allowing natural suspension.

### Brand & Design System Renaming
- All CSS variables and selectors will be updated across `styles.css`, `sidepanel.css`, and related JavaScript files:
  - `--arasaka-red` -> `--crimson-signal`
  - `--arasaka-red-dim` -> `--crimson-dim`
  - `--arasaka-red-glow` -> `--crimson-glow`
  - `--arasaka-red-faint` -> `--crimson-faint`
- All UI strings, options page descriptions, tooltips, and documentation referencing "Arasaka Red" or "Night City" will be replaced with original terms ("Crimson Signal", "Obsidian Circuit", "Neon Grid").

### Manifest-Driven Build Pipeline & Host Permissions
- `scripts/build-extension.js` will be rewritten to:
  - Read and parse `manifest.json`.
  - Extract all declared files automatically (`background.service_worker`, `content_scripts[].js`, `content_scripts[].css`, `action.default_popup`, `options_ui.page`, `side_panel.default_path`, `icons`).
  - Parse referenced HTML files to discover locally linked `<script>` and `<link>` dependencies.
  - Validate that every resolved file exists on disk, throwing an explicit build-time exception if any asset is missing.
- `manifest.json` `host_permissions` will be updated to explicitly include all supported external AI provider endpoints:
  - `https://generativelanguage.googleapis.com/*`
  - `https://api.openai.com/*`
  - `https://api.anthropic.com/*`
  - `https://openrouter.ai/*`
  - `http://localhost:11434/*`

## Testing Decisions

### Good Test Principles
- Tests must verify external observable behavior at architectural boundaries rather than asserting on internal implementation details or private helper functions.
- Storage tests must assert on what exists in `chrome.storage.sync` and `chrome.storage.local` after public actions (`loadSettings`, `saveSettings`, migration).
- Messaging tests must assert on message payloads, stream chunk delivery, and port connection lifecycle.
- Redaction tests must assert that sensitive strings never appear in the payload passed to provider adapters, and that the text injected into the DOM contains the restored secrets.

### Target Test Seams
1. **Extension Runtime Integration Seam (`chrome.storage` & `chrome.runtime` bus)**:
   - Exercises settings loading, schema migration (v2 -> v3), legacy key purging, and secret isolation without mocking internal helper methods.
   - Tests Vault Mode lifecycle (passphrase derivation, encrypted persistence in `storage.local`, ephemeral session memory in `storage.session`, locking, and bad passphrase handling).
   - Tests Copilot message handling, stream chunk delivery, ephemeral port termination, and absence of 15s heartbeat pings.
2. **Redactor & Guardrail Seam**:
   - Tests input evaluation: ensures inputs with API keys or PII trigger auto-dispatch abort for Copilot.
   - Tests enhancement workflow: ensures outbound prompt contains placeholders and write-back text contains restored values.
   - Tests boundary and length conditions (ignoring strings < 20 chars, ignoring mid-word typing).
3. **Build Pipeline & Packaging Seam**:
   - Runs `scripts/build-extension.js` in a test environment to verify that `dist/extension` contains all manifest-declared assets, and verifies that the build fails if a declared asset is deleted.

### Prior Art
- `tests/smoke/settings-and-messaging.smoke.mjs` (smoke test running in simulated Chrome runtime)
- `tests/unit/settings.test.js` (settings migration and serialization tests)
- `tests/integration/router-provider.test.js` (router to provider integration)
- `tests/mocks/chrome.js` (Chrome API mock harness)

## Out of Scope
- Hardware-backed biometric authentication (WebAuthn / Windows Hello / Touch ID) for Vault Mode.
- Complex on-device machine-learning models (e.g., local BERT/transformer NER models) for entity extraction.
- User-customizable CSS theme builders or custom color pickers.
- Cross-browser packaging for Safari or Firefox Manifest V2/V3 variants.

## Further Notes
- The destructive storage migration is irreversible for legacy keys once executed; users downgrading to extension version 1.x or 2.x would need to re-enter their API keys.
- Host permissions declared in `manifest.json` for Google, OpenAI, Anthropic, and OpenRouter must be documented in `PRIVACY.md` to satisfy Chrome Web Store single-purpose and permission justification reviews.
