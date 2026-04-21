# Zeus Prompt Enhancer

Zeus is a Manifest V3 Chrome extension that improves user prompts directly in supported chat applications. It preserves user intent while rewriting for clarity, structure, and output quality, then routes requests through cloud or local LLM providers.

## Table of Contents

- [Overview](#overview)
- [Key Capabilities](#key-capabilities)
- [Technology Stack](#technology-stack)
- [Architecture](#architecture)
- [Repository Structure](#repository-structure)
- [Supported Sites and Providers](#supported-sites-and-providers)
- [Installation](#installation)
- [Usage](#usage)
- [Configuration and Data Model](#configuration-and-data-model)
- [Testing](#testing)
- [CI/CD and Packaging](#cicd-and-packaging)
- [Scripts Folder](#scripts-folder)
- [Development and Production Structures](#development-and-production-structures)
- [Git Ignore Policy](#git-ignore-policy)
- [Runtime Message API](#runtime-message-api)
- [Telemetry](#telemetry)
- [Security and Permissions](#security-and-permissions)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [Contributor Guide](CONTRIBUTING.md)
- [License](#license)

## Overview

Zeus is designed around maintainable modules and clean runtime boundaries:

- `model-registry.js` is the single source of truth for model metadata, defaults, and fallback lists.
- `settings/settings.js` is the single source of truth for settings schema, defaults, migration, normalization, and storage.
- Provider implementations are isolated by API backend.
- Content logic is split into generic DOM utilities and site adapters.
- Injection is non-intrusive and compatible with modern React/Vue interfaces.

## Key Capabilities

- Enhances prompts from in-page input fields via a single reusable action button that stays anchored to the prompt composer.
- Supports provider selection: Gemini, OpenAI, Claude, OpenRouter, and local Ollama.
- Supports Auto mode with prompt-intent routing and provider fallback behavior.
- Tracks fallback telemetry for model/provider churn monitoring.
- Preserves backward compatibility for legacy stored settings keys.
- Includes automated tests across unit, integration, provider-mocking, DOM, and smoke layers.

## Technology Stack

- Runtime: Plain JavaScript, Chrome Extensions Manifest V3.
- Test runner: Vitest.
- DOM environment for tests: jsdom.
- File scanning utilities: glob.
- CI/CD: GitHub Actions.
- Node requirement for tooling/tests: Node `>=18`.

## Architecture

### Service Worker Composition

`background.js` is intentionally thin and imports runtime modules in a fixed order:

1. Registry and settings modules
2. Core utilities (`retry`, `prompts`, `errors`, `telemetry`)
3. Provider modules
4. Routing logic
5. Message handler

### End-to-End Prompt Flow

1. Content script injects an enhance button for eligible input fields.
2. User clicks enhance.
3. `content.js` sends `enhancePrompt` to background.
4. `messaging/messageHandler.js` delegates to `core/router.js`.
5. `core/router.js` loads normalized settings and chooses provider (or Auto route).
6. Provider module performs API call with retry/fallback behavior.
7. Enhanced text returns to content script and replaces input content safely.

### Content Runtime Layers

- `content.js`: orchestration, refresh lifecycle, and runtime message handling.
- `core/domUtils.js`: candidate discovery and input read/write helpers.
- `core/injector.js`: single reusable button lifecycle, focus/hover visibility, and adapter-driven mounting.
- `core/useFloatingPosition.js`: anchored/fixed positioning sync logic for resize, scroll, and focus changes.
- `core/observer.js`: debounced MutationObserver and SPA URL-change refresh trigger.
- `adapters/*.js`: host matching plus site-specific selectors and positioning strategy hooks.

This separation keeps site heuristics isolated and avoids intrusive DOM reparenting.

## Repository Structure

```text
.
|- manifest.json
|- background.js
|- content.js
|- popup.html
|- popup.js
|- styles.css
|- model-registry.js
|- package.json
|- package-lock.json
|- vitest.config.js
|- .gitignore
|- adapters/
|  |- chatgpt.js
|  |- claude.js
|  |- deepseek.js
|  |- gemini.js
|  |- generic.js
|  |- grok.js
|  |- openrouter.js
|- core/
|  |- domUtils.js
|  |- errors.js
|  |- injector.js
|  |- observer.js
|  |- prompts.js
|  |- retry.js
|  |- router.js
|  |- telemetry.js
|  |- useFloatingPosition.js
|- messaging/
|  |- messageHandler.js
|- providers/
|  |- claude.js
|  |- gemini.js
|  |- ollama.js
|  |- openai.js
|  |- openrouter.js
|  |- utils.js
|- settings/
|  |- settings.js
|- scripts/
|  |- build-extension.js
|  |- check-syntax.js
|  |- zip-extension.js
|- tests/
|  |- dom/
|  |- integration/
|  |- mocks/
|  |- providers/
|  |- smoke/
|  |- unit/
|  |- utils/
|  |- harness/
|- .github/
|  |- workflows/
|     |- test.yml
```

## Supported Sites and Providers

### Site host permissions

- `https://chatgpt.com/*`
- `https://chat.openai.com/*`
- `https://claude.ai/*`
- `https://gemini.google.com/*`
- `https://bard.google.com/*`
- `https://chat.deepseek.com/*`
- `https://deepseek.com/*`
- `https://grok.com/*`
- `https://openrouter.ai/*`

### Provider endpoints

- Gemini: `https://generativelanguage.googleapis.com`
- OpenAI: `https://api.openai.com`
- Claude: `https://api.anthropic.com`
- OpenRouter: `https://openrouter.ai`
- Ollama local runtime: `http://localhost:11434`

## Installation

### End users

1. Clone or download this repository.
2. Open Chrome and navigate to `chrome://extensions`.
3. Enable Developer mode.
4. Select Load unpacked.
5. Choose the repository root folder.

### Contributors

1. Install Node 18 or newer.
2. Install dependencies:

```bash
npm install
```

3. Run tests:

```bash
npm test
```

## Usage

1. Open the extension popup.
2. Select a provider (or `Auto`).
3. Add provider API keys where needed.
4. Select a model for model-selectable providers.
5. Save settings.
6. On a supported chat page, click the Zeus enhance button in the prompt area.

Context menu flow:

- Right-click an editable prompt field and use `Enhance Prompt with Zeus`.

## Configuration and Data Model

Settings are owned by `settings/settings.js` and stored in `chrome.storage.sync`.

### Canonical settings shape

```js
{
  schemaVersion: 2,
  provider: "gemini|openai|claude|openrouter|ollama|auto",
  apiKeys: {
    gemini: "",
    openai: "",
    claude: "",
    openrouter: ""
  },
  models: {
    gemini: "",
    openai: "",
    claude: "",
    openrouter: ""
  },
  ollama: {
    model: ""
  }
}
```

### Backward compatibility

Legacy keys are still read and written for migration safety, including:

- `zeus_selected_provider`
- `zeus_*_api_key`
- `zeus_*_model`
- `zeus_provider_configs`

### Model source of truth

`model-registry.js` defines:

- Provider labels and helper text
- Model metadata and grouping
- Default model per provider
- Provider fallback model lists

Avoid duplicating model constants in providers, popup, tests, or docs.

## Testing

Zeus uses layered testing so runtime and integration risks are caught early.

### Test scripts

- `npm test`: syntax check + Vitest suites + smoke test
- `npm run test:unit`: unit tests only
- `npm run test:integration`: integration tests only
- `npm run test:providers`: provider mocking tests
- `npm run test:dom`: DOM/content tests (jsdom)
- `npm run test:smoke`: existing smoke script (`tests/smoke/settings-and-messaging.smoke.mjs`)
- `npm run test:syntax`: parses all `.js` and `.mjs` via `node --check`
- `npm run test:coverage`: coverage output via V8 provider
- `npm run test:watch`: watch mode for local development

### Test categories

- Unit: routing logic, settings normalization/migration, utility behavior
- Integration: router-provider interaction and fallback orchestration
- Provider mocking: mocked `fetch` success, failures, and fallback triggers
- DOM: input detection, injection behavior, and prompt write-back
- Smoke: end-to-end settings migration + message actions in Node

### Adapter harness pages

Use `tests/harness/*.html` for manual selector validation per supported site adapter.

## CI/CD and Packaging

GitHub Actions workflow: `.github/workflows/test.yml`

### Triggers

- Every push
- Every pull request
- Tags matching `v*`

### Pipeline behavior

1. Checkout
2. Setup Node 18
3. `npm ci`
4. `npm run test`
5. `npm run test:syntax`
6. `npm run build`
7. On tag builds: run `npm run zip`, upload `dist/extension.zip`

The zip step is fully Node-based via `archiver`, so no system-level `zip` dependency is required in CI.

### Build and package scripts

- `npm run clean`: removes `dist/`
- `npm run build`: creates `dist/extension` and copies runtime-only extension assets
- `npm run zip`: creates `dist/extension.zip` from `dist/extension` using `archiver`
- `npm run package`: runs build and zip in sequence

Packaging intentionally excludes development-only folders such as tests, scripts, and CI metadata.

The build process is deterministic and safety-focused:

- Build output is rebuilt from a strict runtime whitelist.
- Missing runtime files are skipped safely with explicit logs.
- Dev/test/config artifacts are never copied to production output.
- Common secret patterns (`.env`, `.local`) are blocked from output.

## Scripts Folder

The `scripts/` folder exists to keep build, validation, and packaging logic separate from runtime extension code.

Why this is present:

- Keeps release tooling deterministic and version-controlled.
- Ensures local development and CI produce the same output.
- Prevents accidental packaging of tests, coverage, or secrets.
- Provides one-command workflows through `package.json` scripts.

How it works:

1. `scripts/check-syntax.js`
- Scans all `.js` and `.mjs` files (excluding `node_modules/`, `dist/`, `coverage/`, `.git/`).
- Runs `node --check` on each file to catch syntax errors early.
- Fails fast with per-file error output when parsing fails.

2. `scripts/build-extension.js`
- Rebuilds `dist/extension` from scratch.
- Copies only runtime-required files/folders via explicit allowlists.
- Excludes dev-only paths (`tests`, `scripts`, `.github`, `coverage`, `dist`, `node_modules`).
- Filters risky/non-runtime files (`.env*`, `*.local`, test/spec files, sourcemaps).
- Reads `manifest.json` to include referenced static assets like icons.

3. `scripts/zip-extension.js`
- Validates `dist/extension` exists.
- Creates `dist/extension.zip` using `archiver` (Node-based, no OS zip dependency).
- Produces the store-ready artifact used by release workflows.

Execution order in normal release flow:

- `npm run test` (includes syntax + test suites)
- `npm run build` (creates clean runtime output)
- `npm run zip` (creates distributable archive)
- `npm run package` runs build + zip together

This design keeps extension runtime files clean while making packaging predictable and audit-friendly.

## Development and Production Structures

Development (GitHub) keeps the full repository for engineering workflows:

- Runtime extension code
- Tests and harness pages
- Scripts and CI/CD configuration
- Local tooling configuration

Production output is generated only in `dist/`:

```text
dist/
|- extension/
|  |- manifest.json
|  |- background.js
|  |- content.js
|  |- popup.html
|  |- popup.js
|  |- styles.css
|  |- model-registry.js
|  |- adapters/
|  |- core/
|  |- providers/
|  |- messaging/
|  |- settings/
|  |- icons/
|- extension.zip
```

Notes:

- `icons/` is included because it is referenced by `manifest.json`.
- `dist/extension.zip` is the Chrome Web Store upload artifact.
- Recommended release command: `npm run package`.

## Git Ignore Policy

The project includes a root `.gitignore` to keep source control clean and prevent accidental commits of generated output or local secrets.

### Ignored by default

- Dependencies and local installs: `node_modules/`
- Build/package output: `dist/`, `*.zip`
- Test output and coverage: `coverage/`, `.vitest/`, `.nyc_output/`
- Logs: `*.log`, npm/yarn/pnpm debug logs
- Local environment data: `.env`, `.env.*`, `*.local` (except `.env.example`)
- Caches and temporary files: `.cache/`, `.eslintcache`, `*.tmp`, `*.temp`
- OS/editor metadata: `.DS_Store`, `Thumbs.db`, `.idea/`, `.vscode/*` (except `.vscode/extensions.json`)

### Tracked intentionally

- Runtime extension source files and folders
- Test sources and harness pages under `tests/`
- Tooling and CI config (`scripts/`, `.github/workflows/`, `vitest.config.js`)

When adding new generated folders or local-only artifacts, update `.gitignore` in the same change.

## Runtime Message API

Handled by `messaging/messageHandler.js`:

- `ping`
- `getSettings`
- `enhancePrompt`
- `settingsUpdated`
- `forceInject`
- `getTelemetrySummary`
- `clearTelemetry`

## Telemetry

Fallback telemetry is implemented in `core/telemetry.js`.

- Storage location: `chrome.storage.local`
- Storage key: `zeus_fallback_telemetry`
- Event cap: last 250 events
- Main fallback categories:
  - `provider-fallback`
  - `auto-route-fallback`

Use runtime actions `getTelemetrySummary` and `clearTelemetry` for inspection/reset.

## Security and Permissions

### Extension permissions

- `activeTab`
- `scripting`
- `storage`
- `contextMenus`

### Security posture

- Least-privilege host permissions, scoped to supported chat domains plus explicitly declared external endpoints (OpenRouter and local Ollama runtime).
- Settings normalization before persistence.
- Error handling that avoids leaking sensitive details in user-facing messages.
- Non-intrusive UI injection approach that avoids replacing host DOM nodes.

## Troubleshooting

### Enhance button does not appear

- Confirm URL is in supported hosts.
- Reload the tab after changing settings.
- Trigger reinjection using runtime `forceInject` flow if needed.

### Provider errors

- Verify API key and selected model.
- Check quota and rate limits for selected provider.
- Switch model/provider or use Auto mode.

### Ollama errors

- Ensure Ollama is running on `localhost:11434`.
- If origin is blocked, start Ollama with `OLLAMA_ORIGINS=<extension-origin>` or `OLLAMA_ORIGINS=*` and restart.

## Contributing

For the full contribution workflow, development expectations, and PR process, see `CONTRIBUTING.md`.

Guidelines for safe extensions to this codebase:

- Keep model metadata in `model-registry.js` only.
- Keep settings logic in `settings/settings.js` only.
- Keep provider modules focused on transport/protocol behavior.
- Keep adapter selectors site-specific.
- Preserve Manifest V3 compatibility and low-permission design.
- Add/update tests for all behavior changes.

## License

ISC
