# ZEUS — Prompt Enhancement System

Zeus is a Manifest V3 Chrome extension that optimizes user prompts directly inside supported AI chat applications. It preserves core user intent while restructuring prompts for cognitive clarity, precision, and execution quality, then routes requests through cloud or local LLM providers.

Built for mission-critical engineering and research workflows, Zeus combines a cyberpunk HUD aesthetic with enterprise-grade security boundaries: client-side secret redaction and rehydration, isolated storage partitions, SafeDOM XSS neutralization, strict Content Security Policies, and real-time Copilot inline streaming completions.

---

## Table of Contents

- [Overview](#overview)
- [Key Capabilities](#key-capabilities)
- [Technology Stack](#technology-stack)
- [Architecture](#architecture)
  - [Service Worker Composition](#service-worker-composition)
  - [MV3 Process Boundary and End-to-End Prompt Flow](#mv3-process-boundary-and-end-to-end-prompt-flow)
  - [Provider Transport Engine](#provider-transport-engine)
  - [SafeDOM Rendering and XSS Protection](#safedom-rendering-and-xss-protection)
  - [Content Runtime Layers](#content-runtime-layers)
- [Repository Structure](#repository-structure)
  - [Development Source Tree](#development-source-tree)
  - [Production Package Layout (dist/extension/)](#production-package-layout-distextension)
- [Supported Sites and Providers](#supported-sites-and-providers)
  - [Host Permissions and Supported Chat Surfaces](#host-permissions-and-supported-chat-surfaces)
  - [Provider Backends and API Endpoints](#provider-backends-and-api-endpoints)
  - [Default Models and Fallback Chains](#default-models-and-fallback-chains)
- [Installation and Setup](#installation-and-setup)
  - [End Users (Load Unpacked)](#end-users-load-unpacked)
  - [Developers and Contributors](#developers-and-contributors)
  - [Local API Key Storage Expectations](#local-api-key-storage-expectations)
- [Usage and Interface Workflows](#usage-and-interface-workflows)
  - [Cyberpunk HUD Popup (popup.html)](#cyberpunk-hud-popup-popuphtml)
  - [In-Page Enhance Reticle](#in-page-enhance-reticle)
  - [Context Menu Flow](#context-menu-flow)
  - [Side Panel Workbench (sidepanel.html)](#side-panel-workbench-sidepanelhtml)
  - [Copilot Inline Ghost Text Completion](#copilot-inline-ghost-text-completion)
  - [Config Dashboard Control Center (options.html)](#config-dashboard-control-center-optionshtml)
- [Configuration and Data Model](#configuration-and-data-model)
  - [Storage Partitioning Architecture](#storage-partitioning-architecture)
  - [Canonical Schema (Schema Version 3)](#canonical-schema-schema-version-3)
  - [SettingsStore Public API](#settingsstore-public-api)
  - [One-Time v2 to v3 Migration and Legacy Key Purge](#one-time-v2-to-v3-migration-and-legacy-key-purge)
  - [Public Settings Masking](#public-settings-masking)
- [Security, Privacy, and Permissions](#security-privacy-and-permissions)
  - [Manifest Permissions Matrix](#manifest-permissions-matrix)
  - [Content Security Policy (CSP)](#content-security-policy-csp)
  - [Client-Side Secret and PII Scrubbing (ZeusRedactor)](#client-side-secret-and-pii-scrubbing-zeusredactor)
  - [Copilot Sensitive-Data Auto-Pause and Recovery](#copilot-sensitive-data-auto-pause-and-recovery)
  - [SafeDOM Protection and Scheme Neutralization](#safedom-protection-and-scheme-neutralization)
  - [Storage Sync Guard](#storage-sync-guard)
- [Runtime Message API and Long-Lived Ports](#runtime-message-api-and-long-lived-ports)
  - [Standard Message Handlers](#standard-message-handlers)
  - [Long-Lived Connection Ports](#long-lived-connection-ports)
- [Telemetry and Latency Monitoring](#telemetry-and-latency-monitoring)
- [Testing, Scripts, CI/CD, and Verification](#testing-scripts-cicd-and-verification)
  - [NPM Scripts Matrix](#npm-scripts-matrix)
  - [Test Suites and Categories](#test-suites-and-categories)
  - [Release Scripts (scripts/)](#release-scripts-scripts)
  - [Packaged Browser CDP Verification Harness](#packaged-browser-cdp-verification-harness)
  - [CI/CD Pipeline Workflow](#cicd-pipeline-workflow)
- [Git Ignore Policy](#git-ignore-policy)
- [Troubleshooting](#troubleshooting)
  - [Ollama Setup and Scoped CORS Configuration](#ollama-setup-and-scoped-cors-configuration)
  - [Enhance Button and Reticle Not Appearing](#enhance-button-and-reticle-not-appearing)
  - [Copilot Paused on Sensitive Data](#copilot-paused-on-sensitive-data)
  - [Dropped-Placeholder Warnings](#dropped-placeholder-warnings)
  - [Provider API Errors and Quota Limits](#provider-api-errors-and-quota-limits)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

Zeus is architected around deep, decoupled modules with strict Manifest V3 process isolation and authoritative single sources of truth:

- **`model-registry.js`**: Authoritative registry for supported provider metadata, grouped model hierarchies, speed/cost badges, defaults, and multi-tier fallback chains.
- **`settings/settingsStore.js`** (mirrored by `settings/settings.js`): Single source of truth for schema definitions (`schemaVersion: 3`), cryptographic storage partitioning, nested section merging, dual-area cache invalidation, and one-time migration.
- **`core/promptClient.js` & `core/promptEngine.js`**: MV3 process-split architecture guaranteeing that plaintext secrets and PII never traverse extension IPC boundaries.
- **`core/providerTransport.js`**: Unified network engine handling unary executions, streaming decoders (SSE and NDJSON), pre-first-byte exponential backoff retries, and strict post-first-byte non-retry invariants.
- **`core/safeDom.js`**: Strict HTML sanitization, Myers word diffing, and Markdown parsing enforcing modern `replaceChildren()` container clearing and dangerous protocol blocking.
- **Site Adapters (`adapters/`)**: Modular host decoders isolating site-specific DOM selectors from generic extension mechanics.

---

## Key Capabilities

- **Military-Grade Cyberpunk HUD Popup (`popup.html`)**: Rogue AI aesthetic featuring high-contrast neon accents (Cyber Yellow `#FFD500`, Netrunner Cyan `#00F0FF`, Arasaka Red `#FF003C`, Acid Green `#39FF14`), CRT scanline overlays, system telemetry monitors, and custom model search dropdowns.
- **In-page composer action** — A lightning SVG opens enhancement beside the active draft. A closed shadow root isolates the action, status, Copilot layer and review dialog.
- **Chrome Side Panel API Workbench (`sidepanel.html`)**: Comprehensive prompt workspace accessible via persistent keyboard shortcut (`Alt+Shift+Z` / `Option+Shift+Z` on macOS). Includes live composer input capturing (`CAPTURE FROM PAGE`), inline Myers word diff visualizer (`.diff-add`, `.diff-del`), reverse-chronological session history archive (storing only scrubbed text with placeholders), and a template library with dynamic variable replacement.
- **Copilot-Style Inline Ghost Text Completion (`core/copilot.js` & `core/ghostText.js`)**: Real-time inline suggestion engine streaming completions word-by-word into textareas and `contenteditable` inputs. Keystrokes are debounced (400ms aggressive, 800ms conservative). Features single-key acceptance (`Tab`), dismissal (`Escape` or type-through), and automatic pause upon detecting sensitive credentials.
- **Real-Time Status Toast Overlays**: In-page visual notifications (`ESTABLISHING NEURAL LINK...`, `INJECTION COMPLETE`, `LINK FAILURE`, `WARNING: SENSITIVE PLACEHOLDER OMITTED BY AI`) informing users of enhancement state without modal interruptions.
- **Config Dashboard Control Center (`options.html`)**: Full-page options console featuring sidebar navigation, provider health status indicators, interactive model pickers with search filtering, provider token inputs, Copilot parameter tuning, live telemetry tail feed, and copy-pasteable scoped Ollama launch commands.
- **Multi-Provider Cloud & Local Support**: Native integration with Google Gemini, OpenAI, Anthropic Claude, OpenRouter, and local Ollama daemons.
- **Smart Auto Mode**: Intent-based semantic routing (analyzing `coding`, `long-form`, `cheap`, and `default` intent signals) with automatic fallback cascade across configured provider candidates.
- **Split Storage & Client-Side PII Redaction**: Strict credential partitioning ensuring API keys remain device-local in `chrome.storage.local`, while 7-tier regex scrubbing replaces credentials and PII with ephemeral placeholders before prompts leave the client.

---

## Technology Stack

- **Runtime Platform**: Plain ECMAScript (ES2022+), Google Chrome Manifest V3.
- **Test Framework**: Vitest (`^2.1.8`) with V8 coverage collection (`@vitest/coverage-v8`).
- **DOM Test Environment**: jsdom (`^24.1.3`).
- **File System & Glob Tooling**: Node.js built-in APIs (`fs`, `path`, `child_process`, `http`) and glob (`^9.3.5`).
- **Archive Generation**: archiver (`^7.0.1`) for deterministic zip packaging without external OS dependencies.
- **Browser Automation Verification**: Isolated headless Google Chrome verification over Chrome DevTools Protocol (`ws` WebSocket CDP).
- **CI/CD Platform**: GitHub Actions runner (`ubuntu-latest`, Node.js 18).
- **Engine Requirements**: Node.js `>=18`.

---

## Architecture

### Service Worker Composition

The background service worker (`background.js`) runs in an isolated MV3 background execution environment. It establishes global telemetry styling flags and loads runtime modules in a strict, deterministic sequence:

```javascript
importScripts(
  'model-registry.js',           // 1. Model metadata, groups, defaults, and fallbacks
  'settings/settingsStore.js',    // 2. Canonical settings store and migration logic
  'settings/settings.js',         // 3. Settings compatibility bridge
  'core/retry.js',                // 4. Exponential backoff and fetch timeout helpers
  'core/prompts.js',              // 5. System optimization prompt templates and constraints
  'core/errors.js',               // 6. ProviderHttpError class and error classifiers
  'core/telemetry.js',            // 7. Event tracking and fallback metrics buffer
  'core/providerTransport.js',    // 8. Unary execute() & streaming stream() network engine
  'providers/utils.js',           // 9. Candidate model resolution and token param negotiators
  'providers/gemini.js',          // 10. Gemini generateContent API integration
  'providers/openai.js',          // 11. OpenAI chat completions API integration
  'providers/claude.js',          // 12. Anthropic Messages API integration
  'providers/openrouter.js',      // 13. OpenRouter multi-model router integration
  'providers/ollama.js',          // 14. Local Ollama generate and stream API integration
  'core/redactor.js',             // 15. Regex-based PII/secret scrubbing and hydration
  'core/router.js',               // 16. Pure route planner and intent analyzer
  'core/promptEngine.js',         // 17. Privileged enhancement dispatcher & fallback executor
  'messaging/messageHandler.js'   // 18. Runtime message listeners, context menus, and ports
);
```

---

### MV3 Process Boundary and End-to-End Prompt Flow

Zeus enforces strict separation between untrusted renderer contexts (content scripts, popups, side panels) and the privileged background service worker. Plaintext secrets and sensitive PII are **never** permitted to cross the Chrome IPC boundary.

```
+-----------------------------------------------------------------------------------+
|                        RENDERER CONTEXT (UNTRUSTED DOM)                           |
|       [Content Script / Side Panel Workbench / In-Page Enhance Reticle]           |
|                                                                                   |
|  1. User initiates prompt enhancement with raw prompt text                        |
|  2. ZeusPromptClient.enhance(rawPrompt, options)                                  |
|       |                                                                           |
|       v                                                                           |
|  3. ZeusRedactor.scrub(rawPrompt, redactionOptions)                               |
|       |--> Local in-memory secretMap: { "[[ZEUS_SECRET_1]]": "sk-ant-api03..." }  |
|       +--> Scrubbed text with placeholders: "Review this key [[ZEUS_SECRET_1]]"   |
+-----------------------------------------------------------------------------------+
                                         |
                                         | IPC (chrome.runtime.sendMessage)
                                         | Action: 'enhancePrompt'
                                         | Prompt: scrubbedText (ZERO PLAINTEXT SECRETS)
                                         v
+-----------------------------------------------------------------------------------+
|                    MV3 BACKGROUND SERVICE WORKER (PRIVILEGED)                     |
|                                                                                   |
|  4. messaging/messageHandler.js receives 'enhancePrompt'                          |
|  5. ZeusPromptEngine.execute(scrubbedPrompt, options)                             |
|       |                                                                           |
|       +--> [Defense-in-Depth]: Re-scrubs if invoked outside PromptClient          |
|       +--> ZeusSettingsStore.loadSettings(): reads sync prefs + local apiKeys     |
|       +--> ZeusRouter.calculateRoutePlan(): resolves provider & model candidates  |
|       +--> ZeusProviderTransport.execute() / stream():                           |
|       |      - Pre-first-byte exponential backoff retry                           |
|       |      - HTTP dispatch to LLM endpoint (Gemini, OpenAI, Claude, etc.)       |
|       +--> ZeusTelemetry.trackFallback() on candidate error                       |
|       |                                                                           |
|  6. Background responds with structured payload:                                   |
|       { success: true, enhancedText, warnings, meta }                             |
+-----------------------------------------------------------------------------------+
                                         |
                                         | IPC Response
                                         | Enhanced text with preserved placeholders
                                         v
+-----------------------------------------------------------------------------------+
|                        RENDERER CONTEXT (LOCAL REHYDRATION)                       |
|                                                                                   |
|  7. ZeusPromptClient receives response                                            |
|  8. ZeusRedactor.hydrateWithDetails(enhancedText, secretMap)                      |
|       |--> Replaces [[ZEUS_*]] tokens with original plaintext secrets in memory   |
|       +--> Tolerant matching handles model casing/markdown formatting drift       |
|       +--> Identifies any dropped placeholders -> populates client warnings       |
|  9. Returns structured result: { enhancedText, originalText, warnings, meta }     |
| 10. Injects rehydrated prompt into DOM input OR renders SafeDOM diff              |
+-----------------------------------------------------------------------------------+
```

---

### Provider Transport Engine

Network requests to AI backends are centralized in `core/providerTransport.js`. This module abstracts HTTP semantics, streaming decoders, and retry policies:

- **Unary `execute(requestSpec)`**: Dispatches JSON requests with configurable timeouts and exponential backoff jitter.
- **Streaming `stream(requestSpec, options)`**: Decodes streaming chunks using built-in Server-Sent Events (`parseSseStream`) or newline-delimited JSON (`parseNdjsonStream`) parsers.
- **Pre-First-Byte Retry Invariant**: Retries on transient status codes (`408`, `429`, `500`, `502`, `503`, `504`) and network interruptions are strictly limited to the pre-first-byte phase. Once the first chunk is emitted (`hasEmittedFirstChunk = true`), retries are permanently prohibited to prevent response corruption and duplicated token generation.
- **Cancellation**: Full support for `AbortController` signals to immediately terminate hanging connections when requests are aborted or ports disconnect.

---

### SafeDOM Rendering and XSS Protection

The `core/safeDom.js` module provides safe DOM construction mechanisms that prevent Cross-Site Scripting (XSS) across extension interfaces:

- **Myers Word-Level Diffing (`diffWords`)**: Computes Longest Common Subsequence (LCS) matrix comparisons between original and enhanced prompts, generating visual `.diff-add` and `.diff-del` spans.
- **Safe Markdown Rendering (`renderSafeMarkdown`)**: Parses markdown links (e.g. `[label](https://example.com)`) safely using `document.createElement('a')` and `document.createTextNode()`. Sets `target="_blank"` and `rel="noopener noreferrer"`.
- **Dangerous Scheme Neutralization (`isSafeUrl`)**: Strips control characters (`\x00-\x20`) and rejects unsafe or executable schemes (`javascript:`, `data:`, `vbscript:`, `file:`). Only URLs strictly starting with `http://` or `https://` are permitted as hyperlinks; all others are rendered as inert text.
- **Container Replacement via `replaceChildren()`**: Containers are cleared exclusively via `target.replaceChildren()` rather than `target.innerHTML = ''`, completely eliminating DOM-based XSS vectors.

---

### Content Runtime Layers

In-page interaction is structured into dedicated modular layers loaded in sequence:

The manifest loads the editor bridge, adapter factory, positioner, UI and observers before starting `content.js`. The runtime resolves an allowed host, binds one eligible composer and tracks its draft through asynchronous work. The adapter identifies editors and native controls. The bridge owns text extraction, replacement and verification. Copilot and the enhancement button share an extension-owned overlay.

Provider requests continue through the content-side redactor and PromptClient to the background service worker. The implementation report records adapter capabilities, reproductions, browser tests and live coverage. [Composer engineering report](specs/composer-integration.md)

---

## Repository Structure

### Development Source Tree

```text
.
├── .github/
│   └── workflows/
│       └── test.yml                         # CI workflow definition
├── .gitignore                               # Root ignore rules for Git
├── CONTRIBUTING.md                          # Contribution guidelines
├── LICENSE                                  # ISC License
├── README.md                                # Comprehensive documentation
├── adapters/                                # Site-specific chat UI adapters
│   ├── chatgpt.js                           # Adapter for chatgpt.com & chat.openai.com
│   ├── claude.js                            # Adapter for claude.ai
│   ├── deepseek.js                          # Adapter for chat.deepseek.com
│   ├── gemini.js                            # Adapter for gemini.google.com & bard.google.com
│   ├── generic.js                           # Fallback adapter for standard textareas/inputs
│   ├── grok.js                              # Adapter for grok.com
│   ├── kimi.js
│   └── openrouter.js                        # Adapter for openrouter.ai
├── background.js                            # MV3 background service worker entry point
├── content.js                               # Content script lifecycle orchestrator
├── core/                                    # Deep functional modules
│   ├── copilot.js                           # Inline suggestion state machine & key handlers
│   ├── domUtils.js                          # Composer discovery and adapter contract
│   ├── editorBridge.js
│   ├── errors.js                            # Error classification & ProviderHttpError
│   ├── ghostText.js                         # Ghost text overlay DOM rendering & positioning
│   ├── injector.js                          # Enhance reticle button mounting & toast UI
│   ├── observer.js                          # MutationObserver & DOM change debouncer
│   ├── promptClient.js                      # Client-side scrubbing, IPC dispatch & rehydration
│   ├── promptEngine.js                      # Privileged background prompt router & executor
│   ├── prompts.js                           # System prompt templates & placeholder rules
│   ├── providerTransport.js                 # Unary execute & SSE/NDJSON streaming transport
│   ├── redactor.js                          # 7-tier secret/PII regex scrubbing & rehydration
│   ├── retry.js                             # Exponential backoff and fetch timeout utility
│   ├── router.js                            # Pure intent classifier & route candidate builder
│   ├── safeDom.js                           # Myers diffing, Markdown parser & XSS sanitization
│   ├── telemetry.js                         # In-memory & storage.local telemetry buffer
│   └── useFloatingPosition.js               # Anchored floating coordinate calculator
├── icons/                                   # Extension icons and SVG artwork
│   ├── icon16.png
│   ├── icon48.png
│   ├── icon128.png
│   ├── lightning-flash-svgrepo-com.svg
│   ├── zeus-16.png
│   ├── zeus-32.png
│   ├── zeus-48.png
│   ├── zeus-128.png
│   └── zeus.png
├── manifest.json                            # Manifest V3 extension configuration
├── messaging/
│   └── messageHandler.js                    # Runtime message listeners, context menus, ports
├── model-registry.js                        # Authoritative provider & model catalog
├── options.html                             # Full-page options dashboard UI
├── options.js                               # Options dashboard controller & Ollama generator
├── package-lock.json                        # Locked dependency tree
├── package.json                             # Node package configuration, scripts & engines
├── popup.html                               # Cyberpunk HUD popup UI
├── popup.js                                 # HUD popup controller & model selector
├── providers/                               # Provider API implementations
│   ├── claude.js                            # Anthropic Messages API client
│   ├── gemini.js                            # Google Gemini generateContent API client
│   ├── ollama.js                            # Local Ollama generate/stream client
│   ├── openai.js                            # OpenAI Chat Completions API client
│   ├── openrouter.js                        # OpenRouter completions & catalog client
│   └── utils.js                             # Model fallback lists & token parameter helpers
├── scripts/                                 # Build, verification, and packaging tools
│   ├── build-extension.js                   # Production dist/extension builder
│   ├── check-syntax.js                      # Node.js syntax verification script
│   ├── verify-browser-packaged.mjs          # Headless Chrome CDP verification harness
│   └── zip-extension.js                     # Store-ready extension.zip archiver
├── settings/                                # Storage & settings management
│   ├── settings.js                          # Compatibility bridge exporting settingsStore
│   └── settingsStore.js                     # Partitioned storage, migration & merge logic
├── sidepanel.css                            # Side Panel Workbench styling
├── sidepanel.html                           # Side Panel Workbench UI
├── sidepanel.js                             # Side Panel controller (diffs, history, templates)
├── specs/                                   # Architectural specifications & audits
│   ├── codebase-architecture-deepening.md
│   ├── critical-risks-architectural-red-flags.md
│   └── security-and-privacy-overhaul.md
├── styles.css                               # Extension-page styles
├── tests/                                   # Comprehensive automated test suite
│   ├── dom/                                 # JSDOM tests for content scripts, reticle, safeDom
│   │   ├── content-dom.test.js
│   │   ├── copilot-redaction.test.js
│   │   └── safe-dom-csp.test.js
│   ├── harness/                             # Browser fixture pages for site adapters
│   │   ├── chatgpt.html
│   │   ├── claude.html
│   │   ├── deepseek.html
│   │   ├── gemini.html
│   │   ├── generic.html
│   │   ├── grok.html
│   │   ├── harness.css
│   │   ├── kimi.html
│   │   ├── openrouter.html
│   │   └── harness.mjs
│   ├── integration/                         # Cross-boundary IPC & security packaging tests
│   │   ├── dispatch-redaction.test.js
│   │   ├── e2e-security-packaging.test.js
│   │   └── router-provider.test.js
│   ├── mocks/                               # Chrome extension API mocks
│   │   └── chrome.js
│   ├── providers/                           # Provider client mocking & streaming tests
│   │   ├── claude-provider.test.js
│   │   ├── gemini-provider.test.js
│   │   ├── ollama-provider.test.js
│   │   ├── openai-provider.test.js
│   │   ├── openrouter-provider.test.js
│   │   └── provider-transport.test.js
│   ├── smoke/                               # Node.js settings migration smoke tests
│   │   └── settings-and-messaging.smoke.mjs
│   ├── unit/                                # Unit tests for redactor, router, transport, etc.
│   │   ├── ollama-origin.test.js
│   │   ├── prompt-client-engine.test.js
│   │   ├── provider-utils.test.js
│   │   ├── redactor.test.js
│   │   ├── router.test.js
│   │   └── settings.test.js
│   └── utils/                               # Test helpers & runtime fixtures
│       └── runtime.js
└── vitest.config.js                         # Vitest runner configuration
```

---

### Production Package Layout (dist/extension/)

Executing `npm run build` generates a clean, production-ready directory in `dist/extension/` strictly containing runtime allowlisted assets. All tests, build scripts, development tools, markdown files, and hidden directories are excluded:

```text
dist/extension/
├── adapters/
│   ├── chatgpt.js
│   ├── claude.js
│   ├── deepseek.js
│   ├── gemini.js
│   ├── generic.js
│   ├── grok.js
│   ├── kimi.js
│   └── openrouter.js
├── background.js
├── content.js
├── core/
│   ├── copilot.js
│   ├── domUtils.js
│   ├── editorBridge.js
│   ├── errors.js
│   ├── ghostText.js
│   ├── injector.js
│   ├── observer.js
│   ├── promptClient.js
│   ├── promptEngine.js
│   ├── prompts.js
│   ├── providerTransport.js
│   ├── redactor.js
│   ├── retry.js
│   ├── router.js
│   ├── safeDom.js
│   ├── telemetry.js
│   └── useFloatingPosition.js
├── icons/
│   ├── zeus-16.png
│   ├── zeus-32.png
│   ├── zeus-48.png
│   └── zeus-128.png
├── manifest.json
├── messaging/
│   └── messageHandler.js
├── model-registry.js
├── options.html
├── options.js
├── popup.html
├── popup.js
├── providers/
│   ├── claude.js
│   ├── gemini.js
│   ├── ollama.js
│   ├── openai.js
│   ├── openrouter.js
│   └── utils.js
├── settings/
│   ├── settings.js
│   └── settingsStore.js
├── sidepanel.css
├── sidepanel.html
├── sidepanel.js
└── styles.css
```

---

## Supported Sites and Providers

### Host Permissions and Supported Chat Surfaces

Zeus is authored for Manifest V3 (`manifest_version: 3`, extension version `2.1.2`, minimum Chrome version `114`). It declares 11 explicit `host_permissions` in `manifest.json`. Ten of these are web-based AI chat surfaces that are also matched by `content_scripts.matches` (where the in-page reticle and Copilot suggestions mount), while `http://localhost:11434/*` is strictly an API permission for network communication with local Ollama daemons without content script injection:

| Host Pattern | Content Script Target | Purpose / Surface |
|---|---|---|
| `https://chatgpt.com/*` | Yes | OpenAI ChatGPT modern web interface |
| `https://chat.openai.com/*` | Yes | Legacy OpenAI ChatGPT web interface |
| `https://claude.ai/*` | Yes | Anthropic Claude web interface |
| `https://gemini.google.com/*` | Yes | Google Gemini chat application |
| `https://bard.google.com/*` | Yes | Legacy Google Bard redirect endpoint |
| `https://deepseek.com/*` | Yes | DeepSeek AI portal |
| `https://chat.deepseek.com/*` | Yes | DeepSeek chat interface |
| `https://grok.com/*` | Yes | xAI Grok chat interface |
| `https://openrouter.ai/*` | Yes | OpenRouter chat interface and completions API |
| `https://www.kimi.com/*` | Yes | Moonshot Kimi chat platform |
| `http://localhost:11434/*` | No (API Only) | Local Ollama REST daemon (`/api/generate`, `/api/tags`, etc.) |

---

### Provider Backends and API Endpoints

1. **Google Gemini**:
   - Endpoint: `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
   - Authentication: Query parameter `?key={api_key}`
2. **OpenAI**:
   - Endpoint: `https://api.openai.com/v1/chat/completions`
   - Authentication: Header `Authorization: Bearer {api_key}`
3. **Anthropic Claude**:
   - Endpoint: `https://api.anthropic.com/v1/messages`
   - Authentication: Headers `x-api-key: {api_key}` and `anthropic-version: 2023-06-01`
4. **OpenRouter**:
   - Endpoint: `https://openrouter.ai/api/v1/chat/completions`
   - Authentication: Headers `Authorization: Bearer {api_key}`, `HTTP-Referer: https://zeus-extension.local`, `X-Title: Zeus Prompt Enhancer`
5. **Local Ollama Daemon**:
   - Endpoints: `http://localhost:11434/api/generate`, `/api/version`, `/api/ps`, `/api/tags`
   - Authentication: None (Local daemon; requires scoped origin header)

---

### Default Models and Fallback Chains

All default models and fallback sequences are centrally declared in `model-registry.js`:

| Provider | Default Model | Fallback Sequence |
|---|---|---|
| **Gemini** | `gemini-flash-latest` | `gemini-flash-latest` &rarr; `gemini-3.5-flash-lite` &rarr; `gemini-3.1-flash-lite` |
| **OpenAI** | `gpt-5.4-mini` | `gpt-5.4-mini` &rarr; `gpt-5.4-nano` &rarr; `gpt-5.2` &rarr; `gpt-5.3-codex` |
| **Claude** | `claude-sonnet-4.6` | `claude-sonnet-4.6` &rarr; `claude-4.5-sonnet` &rarr; `claude-opus-4.6` &rarr; `claude-4.5-opus` |
| **OpenRouter** | `openai/gpt-5.4` | `openai/gpt-5.4` &rarr; `anthropic/claude-opus-4.6` &rarr; `google/gemini-3-pro` &rarr; `mistralai/mistral-large-3` &rarr; `deepseek/deepseek-v3.2` &rarr; `qwen/qwen-3.5` |
| **Ollama** | Automatic | Discovers active running models (`/api/ps`) or locally installed tags (`/api/tags`). Suggested local models in catalog: `llama4`, `qwen3:8b`, `mistral-large`, `deepseek-coder-v2` |

---

## Installation and Setup

### End Users (Load Unpacked)

1. Clone or download this repository to your local machine.
2. Build the extension bundle:
   ```bash
   npm install
   npm run build
   ```
3. Open Google Chrome and navigate to `chrome://extensions`.
4. Enable the **Developer mode** toggle in the top-right corner.
5. Click **Load unpacked** in the top-left toolbar.
6. Select the **`dist/extension`** directory (or the repository root folder during development).

---

### Developers and Contributors

1. Verify that your environment runs **Node.js 18 or newer**:
   ```bash
   node --version
   ```
2. Install project dependencies:
   ```bash
   npm ci
   ```
3. Run the automated test suite:
   ```bash
   npm test
   ```

---

### Local API Key Storage Expectations

- API keys are **never synced** to your Google account or across devices.
- Because credentials are saved in `chrome.storage.local`, configuring Zeus on a new machine, browser profile, or device requires entering API keys for that specific browser instance.
- Preferences (selected provider, chosen models, Copilot modes, UI toggles, custom redaction rules) are synced seamlessly via `chrome.storage.sync`.

---

## Usage and Interface Workflows

### Cyberpunk HUD Popup (popup.html)

Clicking the Zeus lightning bolt icon in the Chrome extension toolbar opens the HUD popup:

1. **Provider Selection**: Select your desired active AI provider (`Gemini`, `OpenAI`, `Claude`, `OpenRouter`, `Ollama`, or `Auto`).
2. **Model Selection**: When using model-selectable providers, click the model picker dropdown to search and choose from curated tiers (`Recommended`, `Fast / Cheap`, `High Intelligence`, `Coding / Agents`).
3. **API Key Input**: Enter your provider API key. Toggle the `Show`/`Hide` button to reveal or mask key inputs.
4. **Save Configuration**: Click **EXECUTE CONFIG**. Settings take effect immediately across all open tabs.

---

### In-Page Enhance Reticle

Focus the chat composer and activate the lightning button by mouse or keyboard. Zeus measures the editor and toolbar before placing the action. When there is insufficient room, use the composer context menu or the side panel.

The bolt stays visible during processing and errors. Zeus verifies the replacement before announcing success. A changed draft, unsupported editor, or provider warning offers **Review enhanced prompt**. Open the review to copy the result or select it manually. Switching conversations discards pending results.

---

### Context Menu Flow

1. Focus an eligible chat composer on a permitted site.
2. Right-click to open Chrome's context menu.
3. Select **Enhance Prompt with Zeus**.
4. Zeus automatically targets the active element, scrubs sensitive data, executes prompt optimization, and injects the enhanced prompt back into the input.

---

### Side Panel Workbench (sidepanel.html)

The Side Panel Workbench offers a comprehensive command center for prompt engineering:

1. **Opening and Closing**:
   - **Keyboard Shortcut**: Press **`Alt + Shift + Z`** (or **`Option + Shift + Z`** on macOS, per Chrome's `Alt` key command mapping). This shortcut functions as a state-aware toggle: pressing it opens the side panel; pressing it again closes it (users can customize this shortcut at `chrome://extensions/shortcuts`).
   - **Chrome Toolbar**: Click the Side Panel icon in Chrome's top-right toolbar and select **ZEUS — Prompt Enhancement System**.
   - **Close Button**: Click the red **`✕`** close button (`#btn-close-panel`) in the top-right corner of the workbench header.
2. **Composer Capture**: Click **CAPTURE FROM PAGE** (`#btn-capture`) to pull text directly from the active tab's chat composer into the workbench editor.
3. **Prompt Optimization and Diff Viewer**: Click **OPTIMIZE PROMPT** (`#btn-enhance`). The workbench displays the enhanced prompt alongside an interactive word-level difference view highlighting additions (`.diff-add`) and deletions (`.diff-del`). Results can be injected back into the active tab via **INSERT INTO CHAT** (`#btn-insert`) or copied via **COPY TO CLIPBOARD** (`#btn-copy`).
4. **Session History Archive**: Navigate to the **History** tab (`#tab-history`) to inspect prior prompt transformations. History items persist only scrubbed text with placeholders, never sensitive credentials (capped at 100 entries in `chrome.storage.local`). Each entry provides **RESTORE TO EDITOR** and **DELETE** actions.
5. **Template Library**: Navigate to the **Templates** tab (`#tab-templates`) to manage reusable prompt skeletons with dynamic variables (e.g., `{{task}}`, `{{constraints}}`). Clicking **FILL & INSERT** opens a variable compilation modal; clicking **INJECT LOADOUT** compiles the variables and injects the populated template directly into your prompt input. You can also create new patterns (**CREATE NEW TEMPLATE**), **EDIT**, or **DELETE** existing templates (stored in `chrome.storage.sync`).

---

### Copilot Inline Ghost Text Completion

When enabled in options, Zeus acts as an inline prompt completion copilot:

1. Place a collapsed caret at the end of a supported chat draft.
2. If your input exceeds 10 characters and typing stops for 400ms (aggressive) or 800ms (conservative), Zeus opens a streaming port (`copilot-stream`) and displays suggested completions as a ghost text overlay.
3. **Accepting Suggestions**: Press **`Tab`** to accept the suggestion. The completion text is inserted at the caret, triggering native input events.
4. **Dismissing Suggestions**: Press **`Escape`** or continue typing any other key to reject and dismiss the ghost overlay.
5. **Sensitive Token Detection**: If sensitive data or secrets are typed, Copilot immediately pauses execution, aborts active streams, hides ghost text, and displays a status indicator: `Copilot paused (sensitive data)`. When the sensitive text is deleted, Copilot automatically resumes completions on subsequent keystrokes.

---

### Config Dashboard Control Center (options.html)

Access the full options dashboard by right-clicking the Zeus extension icon and selecting **Options** (or navigating from the popup):

- **Sidebar Navigation**: Dedicated tabs for **ACCESS LOADOUT** (`config-section`) and **SYSTEM LOGS** (`telemetry-section`), with a live telemetry console tail (`#optionsConsole`).
- **Core Router Setup**: Select active provider (`Gemini`, `OpenAI`, `Claude`, `OpenRouter`, `Ollama`, or `Auto`).
- **Advanced Modules**: Toggle the Chrome Side Panel Workbench and configure Copilot inline suggestions (provider, response mode 400ms vs 800ms, and token bounds 10–250).
- **Runtime Loadout**: Interactive model search picker with group categorization (`Recommended`, `Fast / Cheap`, `High Intelligence`, `Coding / Agents`).
- **Token Storage**: Enter, mask, or reveal API keys for cloud providers (`Gemini`, `OpenAI`, `Claude`, `OpenRouter`) with real-time status indicator lights.
- **Local Ollama Loadout & Origin Helper**: Configure local Ollama host URL, model ID, and generate 1-click copyable platform-specific launch commands (`macOS / Linux`, `macOS Desktop`, `Windows PowerShell`, `Windows CMD`) using your extension's actual ID.
- **Data Purge & Telemetry**: Execute configuration updates via **EXECUTE CONFIG**, purge stored credentials via **PURGE LOCAL MEMORY**, or clear diagnostic logs via **PURGE TELEMETRY LOGS**.

---

## Configuration and Data Model

### Storage Partitioning Architecture

To guarantee that API credentials are never transmitted through Chrome sync channels, Zeus physically partitions extension storage into two isolated domains:

```
+-----------------------------------------------------------------------------------+
|                        CHROME STORAGE PARTITIONING                                |
+-----------------------------------------------------------------------------------+
|  chrome.storage.sync (Synced Preferences) |  chrome.storage.local (Device-Local)  |
|  - schemaVersion                          |  - apiKeys.gemini                     |
|  - provider                               |  - apiKeys.openai                     |
|  - models                                 |  - apiKeys.claude                     |
|  - ollama                                 |  - apiKeys.openrouter                 |
|  - sidePanelEnabled                       |  - zeus_prompt_history (max 100)      |
|  - copilotEnabled                         |  - zeus_fallback_telemetry (max 250)  |
|  - copilotMode                            |  - zeus_last_latency                  |
|  - copilotProvider                        |                                       |
|  - copilotMaxTokens                       |  Device-local storage only.           |
|  - redactionEnabled                       |  NEVER synced across devices.         |
|  - customRedactionPatterns                |  Protected by sync storage guard.     |
|  - zeus_templates (prompt skeletons)      |                                       |
+-----------------------------------------------------------------------------------+
```

---

### Canonical Schema (Schema Version 3)

The authoritative settings schema is defined in `settings/settingsStore.js`:

```javascript
{
  schemaVersion: 3,
  provider: "gemini", // "gemini" | "openai" | "claude" | "openrouter" | "ollama" | "auto"
  sidePanelEnabled: true,
  copilotEnabled: false,
  copilotMode: "conservative", // "conservative" | "aggressive"
  copilotProvider: "auto",
  copilotMaxTokens: 60,
  redactionEnabled: true,
  customRedactionPatterns: [],
  apiKeys: {
    gemini: "",
    openai: "",
    claude: "",
    openrouter: ""
  },
  models: {
    gemini: "gemini-flash-latest",
    openai: "gpt-5.4-mini",
    claude: "claude-sonnet-4.6",
    openrouter: "openai/gpt-5.4"
  },
  ollama: {
    model: ""
  }
}
```

---

### SettingsStore Public API

The `ZeusSettingsStore` module exposes a clean asynchronous API:

- **`get(forceFresh = false)`**: Retrieves normalized settings. Returns cached settings when valid; reads sync and local storage when fresh read is requested.
- **`update(diff)`**: Executes section-level nested merges. Preserves unmentioned keys, updates specific model entries or API keys (allowing `""` to clear/delete), writes secrets to `storage.local` first, purges legacy keys, and commits sync preferences.
- **`getPublic(settingsInput)`**: Masks all raw API keys into boolean indicators (`hasApiKey: { gemini: true, ... }`), producing a safe payload suitable for untrusted content scripts.
- **`invalidateCache()`**: Invalidates in-memory cache upon storage mutations.
- **`onChanged` Dual-Area Listener**: Automatically invalidates cached settings whenever either the `sync` or `local` storage area emits change events.

---

### One-Time v2 to v3 Migration and Legacy Key Purge

When upgrading from legacy versions:

1. **Write-Before-Delete Ordering**: `executeLoadSettings()` reads both `sync` and `local` storage areas. If `schemaVersion !== 3` or legacy `zeus_*` keys are detected, the store merges data giving precedence to local keys.
2. Credentials are immediately saved to `chrome.storage.local.set({ apiKeys })`.
3. All legacy keys (`zeus_selected_provider`, `zeus_*_api_key`, `zeus_*_model`, `zeus_provider_configs`, and sync `apiKeys`) are **completely purged** from `chrome.storage.sync` via `storage.sync.remove()`.
4. Normalized preferences are saved to `chrome.storage.sync` with `schemaVersion: 3`.
5. **No Legacy Dual-Writing**: Legacy `zeus_*` keys are permanently deleted and never written back to storage.

---

### Public Settings Masking

Content scripts and untrusted UI pages obtain settings through the `getSettings` message action or `ZeusSettingsStore.getPublic()`. The payload strictly replaces plaintext credentials with boolean existence flags:

```javascript
{
  schemaVersion: 3,
  provider: "gemini",
  sidePanelEnabled: true,
  copilotEnabled: false,
  // ... preferences ...
  hasApiKey: {
    gemini: true,
    openai: false,
    claude: true,
    openrouter: false
  }
}
```

---

## Security, Privacy, and Permissions

### Manifest Permissions Matrix

Zeus declares only the minimal permissions required for operation:

| Permission | Purpose |
|---|---|
| `activeTab` | Access the currently active tab when the user clicks the toolbar icon or context menu. |
| `scripting` | Dynamically inject content scripts on user action via `forceInject`. |
| `storage` | Read and write partitioned preferences (`storage.sync`) and API keys (`storage.local`). |
| `contextMenus` | Register the right-click "Enhance Prompt with Zeus" context action for editable elements. |
| `sidePanel` | Register and toggle the Side Panel Workbench (`sidepanel.html`). |

---

### Content Security Policy (CSP)

Extension pages (`popup.html`, `options.html`, `sidepanel.html`) operate under an explicit, hardened Content Security Policy declared in `manifest.json`:

```text
script-src 'self'; object-src 'none'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; base-uri 'none'; frame-ancestors 'none';
```

- **`script-src 'self'`**: Completely blocks inline scripts, `eval()`, and remotely hosted executable code.
- **`object-src 'none'`**: Disallows Flash, Java, or plugin objects.
- **`base-uri 'none'`**: Prevents `<base>` tag hijacking.
- **`frame-ancestors 'none'`**: Protects extension pages against clickjacking inside iframes.

---

### Client-Side Secret and PII Scrubbing (ZeusRedactor)

Before any prompt leaves the user's browser, `core/redactor.js` executes 7-tier deterministic regex scrubbing in strict order of precedence:

1. **Tier 1: PEM Private Keys**: Detects `-----BEGIN ... PRIVATE KEY-----` blocks.
2. **Tier 2: Connection URIs & Credentials**: Detects database and protocol connection strings (`postgres://`, `mysql://`, `mongodb://`, `redis://`, `amqp://`, etc.).
3. **Tier 3: Bearer & JWT Tokens**: Detects JSON Web Tokens (`eyJ...`).
4. **Tier 4: Known API Key Prefixes**: Identifies vendor prefixes (`sk-ant-...`, `sk-...`, `AIza...`, `AKIA...`).
5. **Tier 5: Credential Assignments**: Identifies key-value assignments for `api_key`, `secret`, `password`, or `auth_token`.
6. **Tier 6: Email Addresses**: Matches standard RFC email address patterns.
7. **Tier 7: Public IPv4 Addresses**: Matches IPv4 addresses with context-aware exclusions for loopback (`127.0.0.0/8`), local broadcast (`255.0.0.0/8`), `0.0.0.0/8`, semantic versions (`v1.2.3.4`, `1.2.3.4-beta`), and package specifiers (`@1.2.3.4`).
- **Custom Regex Patterns**: The redaction engine supports custom user regex patterns via the `customRedactionPatterns` settings option in `chrome.storage.sync` (managed programmatically via `ZeusSettingsStore.update({ customRedactionPatterns: [...] })`), which execute prior to the built-in tiers.
- **Collision-Safe Indexing**: `ZeusRedactor` pre-scans incoming prompts for pre-existing lookalike tokens (`[[ZEUS_*_N]]` or `[ZEUS_*_N]`) using `findHighestExistingIndices()` and starts replacement counters strictly above existing numbers, guaranteeing user-authored tokens are never clobbered or mismatched during hydration.

**Placeholder Format**: Ephemeral placeholders use uppercase bracketed syntax:
`[[ZEUS_SECRET_1]]`, `[[ZEUS_SECRET_2]]`, `[[ZEUS_EMAIL_1]]`, `[[ZEUS_IPV4_1]]`.

**Tolerant Rehydration**: When restoring text, Zeus uses exact literal replacement (`split().join()`) to avoid regex replacement token corruption (`$$`, `$&`), with fallback regex handling case drift (`[zeus_secret_1]`), markdown formatting (`\[ZEUS_SECRET_1\]`), or added whitespace. If a model drops a placeholder, a warning is emitted and logged.

---

### Copilot Sensitive-Data Auto-Pause and Recovery

- **Instant Abort**: When sensitive data is detected in the input, Copilot immediately terminates active streaming connections and removes ghost text.
- **Defense-in-Depth Guard**: In `messaging/messageHandler.js`, the service worker inspects `msg.text` on `copilot:start`. If sensitive content is present, the connection is rejected with `{ type: 'paused', reason: 'sensitive_data' }` and disconnected.
- **Visual Alert**: An amber `.zeus-copilot-paused` indicator appears directly below the active input: `Copilot paused (sensitive data)`.
- **Automatic Recovery**: As soon as the user removes or redacts the sensitive token, Copilot automatically clears the pause state, dismisses the warning indicator, and resumes completions on subsequent keystrokes.

---

### SafeDOM Protection and Scheme Neutralization

All HTML rendering across extension pages uses `core/safeDom.js`:

- Unsafe protocols (`javascript:`, `data:`, `vbscript:`, `file:`) in markdown links are rejected.
- Sanitized links force `target="_blank"` and `rel="noopener noreferrer"`.
- Container elements are cleared exclusively via `replaceChildren()`.

---

### Storage Sync Guard

The `installStorageSyncGuard()` method wraps `chrome.storage.sync.set()` to inspect incoming keys. Any attempt to store sensitive credentials (`apiKeys`, `/api[_-]?key/i`, or OpenRouter keys in provider configs) into sync storage immediately throws:
`Error: Security Violation: API keys cannot be stored in chrome.storage.sync.`

---

## Runtime Message API and Long-Lived Ports

### Standard Message Handlers

Runtime messages are processed by `messaging/messageHandler.js`:

| Action | Sender | Parameters | Response Payload | Description |
|---|---|---|---|---|
| `ping` | Any | None | `{ status: 'pong' }` | Verifies service worker responsiveness. |
| `getSettings` | Renderer | None | `{ settings: publicSettings }` | Returns public settings with masked API key flags (`hasApiKey`). |
| `enhancePrompt` | Renderer | `{ prompt, options }` | `{ success: true, enhancedText, warnings, meta }` | Executes privileged prompt optimization with routing, retries, and defense-in-depth scrubbing. |
| `settingsUpdated` | Options/Popup | `{ settings }` | `{ success: true }` | Broadcasts sanitized settings updates to active browser tabs. |
| `forceInject` | Popup/Options | None | `{ success: boolean, message?: string }` | Dynamically executes content script files on the active tab via `chrome.scripting.executeScript`. |
| `getTelemetrySummary`| Options/Popup | None | `{ summary: { totalEvents, byProvider, byReason, recent } }` | Retrieves diagnostic telemetry summary metrics. |
| `clearTelemetry` | Options | None | `{ success: true }` | Clears stored telemetry events from `chrome.storage.local`. |
| `sidePanel:getCurrentInput` | Side Panel | None | `{ value: string, url?: string, site?: string }` | Captures active prompt text from the active tab's chat composer. |
| `sidePanel:setInputValue` | Side Panel | `{ value: string }` | `{ success: boolean }` | Injects text directly into the active tab's chat composer input. |
| `sidePanel:getHistory` | Side Panel | None | `{ history: Array<HistoryEntry> }` | Retrieves session prompt history (capped at 100 entries in `storage.local`). |
| `sidePanel:saveHistory` | Side Panel | `{ entry: HistoryEntry }` | `{ success: boolean }` | Appends a scrubbed prompt entry to history in `storage.local`. |
| `sidePanel:getTemplates` | Side Panel | None | `{ templates: Array<TemplateEntry> }` | Retrieves saved prompt templates from `storage.sync`. |
| `sidePanel:saveTemplates`| Side Panel | `{ templates }` | `{ success: boolean, error?: string }` | Persists validated prompt templates to `storage.sync`. |
| `contextEnhancePrompt` | Background | None | `{ status: 'enhanced' \| 'failed' \| 'no-input' }` | Sent by background to active tab on context menu click to trigger enhancement of focused input. |
| `forceInjectButton` | Background | None | `{ status: 'injected' }` | Sent by background to active tab after script injection to mount or refresh the reticle button. |
| `commands:debugToast` | Background | `{ text }` | `{ success: true }` | Sent by background to active tab to display HUD toast confirming keyboard command execution. |

---

### Long-Lived Connection Ports

1. **`'copilot-stream'`**:
   - Used by `core/copilot.js` to establish streaming prompt completions.
   - **Client to Background**:
     - `{ type: 'copilot:start', text, cursorPos, settings }`: Initiates completion stream.
     - `{ type: 'copilot:abort' }` or `{ type: 'abort' }`: Aborts active stream.
   - **Background to Client**:
     - `{ type: 'chunk', text }`: Emits an incremental completion token.
     - `{ type: 'paused', reason: 'sensitive_data' }`: Alerts client of sensitive token detection.
     - `{ type: 'done' }`: Signals completion of stream.
     - `{ type: 'error', message }`: Communicates streaming failure.
     - `{ type: 'ping' }`: Sent every 15 seconds to keep the background service worker alive.
2. **`'zeus-sidepanel'`**:
   - Maintained by `sidepanel.js` while the workbench is open.
   - Used by the service worker to track workbench state and post `{ type: 'close' }` when the `open-side-panel` toggle command is executed.

---

## Telemetry and Latency Monitoring

Diagnostic metrics are managed in `core/telemetry.js`:

- **Storage Location**: `chrome.storage.local`.
- **Storage Keys**:
  - `zeus_fallback_telemetry`: FIFO sliding window containing up to **250 events**.
  - `zeus_last_latency`: Duration in milliseconds of the most recent enhancement transaction.
- **Privacy Sanitization**: Before telemetry events are persisted, sensitive attributes (`secretMap`, `mappings`, `apiKeys`, `apiKey`, `prompt`, `rawPrompt`, `enhancedPrompt`) are completely deleted.
- **Event Categories**:
  - `auto-route-fallback`: Triggered when smart auto-routing cascades across candidate providers.
  - `provider-candidate-error`: Recorded when an individual provider endpoint rejects a request.
  - `provider-fallback`: Triggered when model fallbacks occur within a single provider.

---

## Testing, Scripts, CI/CD, and Verification

### NPM Scripts Matrix

The repository defines the following scripts in `package.json`:

```bash
# Full test pipeline: syntax validation + vitest suites + smoke test
npm test

# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:integration

# Run provider mock tests only
npm run test:providers

# Run JSDOM DOM manipulation tests only
npm run test:dom

# Run smoke test for storage migration & messaging in Node
npm run test:smoke

# Validate JavaScript syntax across all source files via node --check
npm run test:syntax

# Run test suite with V8 code coverage analysis
npm run test:coverage

# Run Vitest in interactive watch mode
npm run test:watch

# Rebuild dist/extension from runtime allowlist
npm run build

# Package dist/extension into dist/extension.zip
npm run zip

# Clean build and package release zip bundle
npm run package

# Remove build directory
npm run clean
```

---

### Test Suites and Categories

1. **Unit Tests (`tests/unit/`)**:
   - `tests/unit/redactor.test.js`: Validates 7-tier regex scrubbing, custom patterns, collision avoidance, and tolerant hydration.
   - `tests/unit/settings.test.js`: Validates schema normalization, split storage, sync guard, and migration.
   - `tests/unit/prompt-client-engine.test.js`: Validates client scrubbing, IPC dispatch, defense-in-depth, and rehydration.
   - `tests/unit/router.test.js`: Validates intent classification and candidate route generation.
   - `tests/unit/ollama-origin.test.js`: Validates origin construction and command generators.
   - `tests/unit/provider-utils.test.js`: Validates token limit calculations and error classifiers.
2. **Integration Tests (`tests/integration/`)**:
   - `tests/integration/dispatch-redaction.test.js`: Verifies that plaintext credentials never cross IPC boundaries during end-to-end enhancement.
   - `tests/integration/router-provider.test.js`: Verifies auto-mode cascades and fallback handling across providers.
   - `tests/integration/e2e-security-packaging.test.js`: Verifies file allowlists, build packaging, and SafeDOM container clearing.
3. **Provider Tests (`tests/providers/`)**:
   - Mocks network responses and verifies streaming decoders, retry policies, and error handling for `claude`, `gemini`, `openai`, `openrouter`, and `ollama`.
   - `tests/providers/provider-transport.test.js`: Validates pre-first-byte retry behavior and streaming decoders.
   - `tests/providers/claude-provider.test.js`: Validates Anthropic Claude Messages API integration.
   - `tests/providers/gemini-provider.test.js`: Validates Google Gemini generateContent API integration.
   - `tests/providers/openai-provider.test.js`: Validates OpenAI Chat Completions API integration.
   - `tests/providers/openrouter-provider.test.js`: Validates OpenRouter API integration.
   - `tests/providers/ollama-provider.test.js`: Validates Ollama local runtime integration.
4. **DOM Tests (`tests/dom/`)**:
   - `tests/dom/content-dom.test.js`: Validates input detection, reticle button mounting, and text insertion.
   - `tests/dom/copilot-redaction.test.js`: Validates ghost text overlays, sensitive data pausing, and tab acceptance.
   - `tests/dom/safe-dom-csp.test.js`: Validates Myers diffing, URL sanitization, and protocol neutralization.
5. **Smoke Tests (`tests/smoke/`)**:
   - `tests/smoke/settings-and-messaging.smoke.mjs`: Standalone Node.js script verifying storage migration and message routing without external runners.

---

### Release Scripts (scripts/)

- **`scripts/build-extension.js`**: Cleans `dist/extension` and copies runtime files using an explicit allowlist. Blocks tests, `.env*`, and source maps.
- **`scripts/check-syntax.js`**: Iterates through all `.js` and `.mjs` files using `node --check` to catch syntax errors before test execution.
- **`scripts/zip-extension.js`**: Packages `dist/extension` into a high-compression `dist/extension.zip` using `archiver`.

---

### Packaged composer tests

Run `npm run package` before the full Vitest suite on a fresh checkout. The packaging tests read both the build directory and ZIP archive.

Install the test browser with `npx playwright-core install chromium` and run `npm run test:browser`. Alternatively, set `ZEUS_CHROMIUM` to a local extension-capable Chromium executable. The harness loads the packaged MV3 extension in a temporary profile, serves local site fixtures and supplies synthetic provider responses. Fixture screenshots are saved in `dist/composer-evidence/`.

Run `node scripts/verify-composer.mjs --live` after building for the separate public-site check. It uses a disposable profile and a synthetic provider response. On an empty eligible composer it enters a test draft, exercises the action, checks the result and clears the test draft. It never submits a message.

### Packaged Browser CDP Verification Harness

To verify production readiness in real browser runtimes, `scripts/verify-browser-packaged.mjs` provides an automated harness:

- Spawns Google Chrome in isolated headless mode with a dedicated temporary profile.
- Connects via Chrome DevTools Protocol (CDP) WebSocket.
- Hosts packaged `dist/extension` assets over a local HTTP server applying the exact declared Manifest CSP.
- Injects a synthetic extension runtime environment and evaluates `popup.html`, `options.html`, and `sidepanel.html`.
- Monitors `securitypolicyviolation` events, verifies DOM element mounting, and ensures web fonts load without CSP violations.

Run verification manually:
```bash
npm run build
node scripts/verify-browser-packaged.mjs
```

---

### CI/CD Pipeline Workflow

The GitHub Actions workflow in `.github/workflows/test.yml` executes on every push to any branch (`**`), pull request, and release tag (`v*`):

1. **Checkout & Environment**: Checks out the code and sets up Node.js 18 with npm cache.
2. **Dependency Installation**: Runs `npm ci` for clean dependency installation.
3. **Automated Testing**: Runs `npm run test` (syntax validation, full Vitest suite, and smoke test).
4. **Syntax Check**: Runs `npm run test:syntax`.
5. **Extension Build**: Executes `npm run build` to verify clean output generation.
6. **Release Packaging**: When tagged with `v*`, executes `npm run zip` and uploads `dist/extension.zip` as a release artifact.

---

## Git Ignore Policy

The `.gitignore` policy strictly prohibits committing build outputs, local dependencies, and secrets:

- **Build & Distribution**: `dist/`, `*.zip`.
- **Dependencies**: `node_modules/`.
- **Test & Coverage Outputs**: `coverage/`, `.vitest/`, `.nyc_output/`.
- **Environment & Secrets**: `.env`, `.env.*`, `*.local` (except `.env.example`).
- **Logs**: `*.log`, `npm-debug.log*`, `yarn-debug.log*`.
- **Operating System & Editor Files**: `.DS_Store`, `Thumbs.db`, `.idea/`, `.vscode/*` (except `.vscode/extensions.json`).

---

## Troubleshooting

### Ollama Setup and Scoped CORS Configuration

Ollama enforces Cross-Origin Resource Sharing (CORS) security. Because Zeus runs as a Chrome extension, browser requests originate from `chrome-extension://<EXTENSION_ID>`.

To allow Zeus to communicate with your local Ollama daemon, launch Ollama with your specific extension origin:

#### Finding Your Extension ID
Navigate to `chrome://extensions` in Google Chrome and locate the **ID** string under **ZEUS — Prompt Enhancement System** (e.g., `abcdefghijklmnopqrstuvwxyz123456`).

> [!TIP]
> You do not need to construct these commands manually. Open the Zeus Options page (`options.html`) and select **Ollama (Local)**. Zeus automatically detects `chrome.runtime.id`, populates your scoped origin (`chrome-extension://<id>`), and provides 1-click **Copy Origin** and **Copy Command** buttons tailored to each platform.

#### Windows (PowerShell)
```powershell
$env:OLLAMA_ORIGINS="chrome-extension://<YOUR_EXTENSION_ID>"; ollama serve
```

#### Windows (Command Prompt / CMD)
```cmd
set OLLAMA_ORIGINS=chrome-extension://<YOUR_EXTENSION_ID> && ollama serve
```

#### macOS and Linux (Terminal CLI)
```bash
OLLAMA_ORIGINS="chrome-extension://<YOUR_EXTENSION_ID>" ollama serve
```

#### macOS (Ollama Desktop GUI App)
If you run the Ollama Desktop status bar application on macOS, set the environment variable through `launchctl` and restart the Ollama app:
```bash
launchctl setenv OLLAMA_ORIGINS "chrome-extension://<YOUR_EXTENSION_ID>"
```

> [!WARNING]
> Never set wildcard origins (`*`). Wildcards expose your local Ollama daemon to arbitrary web pages visited in your browser, creating a significant security vulnerability. Always scope `OLLAMA_ORIGINS` to your exact Chrome extension ID.

---

### Enhance Button and Reticle Not Appearing

- **Verify Supported Host**: Ensure the current website URL matches one of the declared patterns in `manifest.json`.
- **DOM Container Loading**: On dynamic SPAs, wait for the chat input to fully render.
- **Manual Reinjection**: Open the Zeus extension popup and click the settings button, or dispatch `forceInject` from the developer console.
- **Reload Tab**: If permissions were recently granted, reload the tab to initialize content scripts.

---

### Copilot Paused on Sensitive Data

If Copilot stops providing inline suggestions and displays the amber `Copilot paused (sensitive data)` banner:

- **Cause**: Zeus detected a pattern resembling an API key, private key, database URI, email address, or sensitive token in the active input.
- **Resolution**: Delete or edit the sensitive characters out of the input field. Copilot will automatically clear the pause state and resume ghost text suggestions on your next keystroke.

---

### Dropped-Placeholder Warnings

If a warning reads `WARNING: SENSITIVE PLACEHOLDER OMITTED BY AI`:

- **Cause**: An upstream AI model rewrote the prompt so aggressively that it dropped or altered a placeholder tag (e.g., `[[ZEUS_SECRET_1]]`).
- **Mitigation**: Zeus automatically attempts tolerant regex recovery. If the token cannot be located, Zeus alerts you with a warning toast so you can verify that required parameters were not omitted.

---

### Provider API Errors and Quota Limits

- **401 Unauthorized**: Invalid API key. Re-enter your provider API key in the Zeus popup or options page and click **EXECUTE CONFIG**.
- **429 Too Many Requests / Quota Exceeded**: You have reached the rate limit or credit ceiling for the selected model. Zeus will automatically attempt fallback models if configured. Alternatively, select **Auto** mode to cascade to an alternate provider.
- **Connection Refused (`http://localhost:11434`)**: Verify that your Ollama daemon is running (`ollama serve`) and reachable.

---

## Contributing

We welcome contributions! Please review [CONTRIBUTING.md](CONTRIBUTING.md) for full development workflows, branch naming conventions, and pull request guidelines.

### Core Guidelines
- Maintain `model-registry.js` as the sole source of truth for provider and model definitions.
- Maintain `settings/settingsStore.js` as the sole authority for schema definitions and storage partitioning.
- Ensure all DOM manipulation passes through `core/safeDom.js`.
- Always run `npm test` and `npm run test:syntax` before submitting changes.

---

## License

This project is licensed under the **ISC License**. See the [LICENSE](LICENSE) file for details.
