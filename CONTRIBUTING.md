OVERVIEW
- Thank you for contributing to Zeus Prompt Enhancer.
- Zeus is a Chrome Extension built on Manifest V3 with these primary runtime components:
- Background service worker: background.js
- Content runtime: content.js, core/, adapters/
- Popup UI: popup.html, popup.js, styles.css
- Provider integration layer: providers/
- Settings and model metadata: settings/settings.js and model-registry.js
- Browser target in this repository is Chrome (Manifest V3 APIs and chrome://extensions local loading flow).

CODE OF CONDUCT
- A dedicated CODE_OF_CONDUCT file is not currently present in this repository.
- Until one is added, contributors are expected to communicate respectfully, provide constructive feedback, and avoid harassment or abusive behavior.
- Recommendation: add a CODE_OF_CONDUCT.md (for example, Contributor Covenant) and link it from README and this file.

GETTING STARTED
1. Install Node.js 18 or newer.
2. Clone the repository.
3. Install dependencies:
- npm install
4. Run the full validation suite before contributing:
- npm run test

DEVELOPMENT SETUP
- Package manager used by repository scripts and CI is npm.
- Key scripts from package.json:
- npm run test
- npm run test:unit
- npm run test:integration
- npm run test:providers
- npm run test:dom
- npm run test:smoke
- npm run test:syntax
- npm run test:coverage
- npm run test:watch
- npm run build
- npm run zip
- npm run package
- Build and packaging scripts are implemented in scripts/build-extension.js and scripts/zip-extension.js.

RUNNING THE EXTENSION LOCALLY
1. Build is optional for local unpacked testing from source, but recommended to run tests first:
- npm run test
2. Open Chrome and go to chrome://extensions.
3. Enable Developer mode.
4. Click Load unpacked.
5. Select the repository root folder.
6. Open a supported host from manifest.json host_permissions and test extension behavior.

PROJECT STRUCTURE
- manifest.json: extension metadata, permissions, host permissions, popup entry, service worker.
- background.js: service worker entrypoint.
- content.js: content runtime orchestrator.
- adapters/: host-specific input detection and button positioning strategies.
- core/: shared runtime utilities (observer, injector, dom utils, router, retry, telemetry, errors, prompts, floating position helper).
- providers/: API-provider request/response adapters.
- settings/: schema normalization and chrome.storage.sync persistence.
- messaging/: runtime message handling.
- tests/: unit, integration, provider, DOM, smoke, and harness tests.
- scripts/: deterministic extension build and zip packaging.
- .github/workflows/test.yml: CI validation and release artifact workflow.

CODING STANDARDS
- Keep changes modular and aligned with existing boundaries:
- Model metadata changes belong in model-registry.js.
- Settings schema/storage behavior belongs in settings/settings.js.
- Provider API transport logic belongs in providers/.
- Site-specific DOM heuristics belong in adapters/.
- Preserve Manifest V3 compatibility and least-privilege permission usage.
- Keep backward compatibility for legacy settings keys when modifying settings behavior.
- No repository-level lint or formatter configuration is currently configured in this repository.
- Recommendation: keep existing style and naming patterns in nearby files and avoid unrelated reformatting.

TESTING AND QUALITY CHECKS
- Syntax gate:
- npm run test:syntax
- Full test gate:
- npm run test
- Focused suites:
- npm run test:unit
- npm run test:integration
- npm run test:providers
- npm run test:dom
- npm run test:smoke
- Coverage (optional local insight):
- npm run test:coverage
- CI workflow (.github/workflows/test.yml) runs npm ci, npm run test, npm run test:syntax, and npm run build on pushes and pull requests.

COMMIT MESSAGES AND BRANCHING
- A strict commit format is not currently enforced by repository config.
- Recommended commit style for clarity:
- feat: for new features
- fix: for bug fixes
- docs: for documentation updates
- test: for test-only updates
- refactor: for internal restructuring without behavior change
- Branching policy is not explicitly documented in repository files.
- Recommended default workflow:
1. Branch from main using a descriptive branch name (for example, feat/model-picker-redesign).
2. Keep commits focused and scoped to one change area when possible.
3. Rebase or merge latest main before opening a pull request.

PULL REQUEST PROCESS
1. Ensure your branch is up to date with main.
2. Run required checks locally:
- npm run test
3. Open a pull request with:
- Clear summary of what changed and why.
- Testing evidence (commands run and results).
- Screenshots or recordings for popup/UI/content-script UX changes.
- Notes about permissions, host matching, or storage-schema impacts if applicable.
4. Address review feedback and keep the PR focused.
- Recommendation: prefer small, reviewable PRs over large mixed changes.

ISSUE REPORTING AND FEATURE REQUESTS
- When reporting issues, include:
- Expected behavior and actual behavior.
- Steps to reproduce.
- Provider and model used.
- Target site/URL pattern.
- Console errors or alert text.
- Extension version from manifest.json.
- For feature requests, describe user problem, proposed behavior, and affected modules.

SECURITY AND RESPONSIBLE DISCLOSURE
- This extension uses these core permissions: activeTab, scripting, storage, contextMenus.
- It also uses explicit host permissions listed in manifest.json, including LLM host sites and localhost:11434 for Ollama.
- API keys are handled through settings persistence in chrome.storage.sync (see settings/settings.js).
- Never commit API keys, local secrets, or environment files.
- A SECURITY policy file and dedicated disclosure contact are not currently configured in this repository.
- Recommended default until a dedicated channel is added:
- Do not post sensitive vulnerability details publicly.
- Open a private maintainer contact channel and add it to SECURITY.md.

RELEASES (IF APPLICABLE)
- Build release directory:
- npm run build
- Create upload zip:
- npm run zip
- Combined packaging command:
- npm run package
- CI uploads dist/extension.zip as an artifact for tag refs matching v*.
- Build output is created under dist/extension and packaged to dist/extension.zip.

LICENSE AND ATTRIBUTION (IF APPLICABLE)
- This repository is licensed under ISC (see LICENSE).
- By contributing, you agree your contributions are provided under the same license.
