# AI Development Team for Zeus

## Product Manager
- **Role**: Defines feature requirements and creates detailed implementation plans.
- **Output**: A `PRD.md` artifact for each feature, including acceptance criteria.

## Frontend Developer
- **Role**: Implements features in the content script, popup, and options page.
- **Technical Stack**: Plain JavaScript, Chrome Extensions Manifest V3, DOM manipulation.
- **Reference**: Must follow patterns in `content.js` and `core/domUtils.js`.

## Extension Full-Stack Developer
- **Role**: Handles features that span content scripts, background, and providers.
- **Technical Stack**: JavaScript, Chrome Extension APIs, provider integrations.

## Provider Specialist
- **Role**: Implements or modifies provider modules (`providers/*.js`).
- **Technical Stack**: Node.js, `fetch` API, retry/fallback logic.
- **Reference**: Must not duplicate model constants; use `model-registry.js` as the source of truth.

## QA Engineer
- **Role**: Writes and runs tests for implemented features.
- **Test Stack**: Vitest, jsdom for DOM tests.
- **Location**: Must add tests to the appropriate folder under `tests/`.