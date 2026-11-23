# 03B: Complete Provider Migration to ProviderTransport & Streaming Copilot Consolidation

**What to build:**
Complete the migration of remaining providers (`providers/claude.js`, `providers/gemini.js`, and `providers/openrouter.js`) to consume `core/providerTransport.js`. Connect the background service worker's `'copilot-stream'` handler directly to `ProviderTransport.stream()`, unifying streaming mechanics between Copilot and Side Panel enhancement. Retire deprecated fetch and stream helpers in `providers/utils.js`. Ensure all provider tests, integration tests, and `npm run package` pass cleanly.

**Blocked by:** 03A: ProviderTransport Foundation (Unary & Streaming, SSE & NDJSON) & Initial Provider Migration

**Status:** completed

- [x] Migrate `providers/claude.js` (including typed SSE handling: `content_block_delta`, `message_delta`) to `ProviderTransport`.
- [x] Migrate `providers/gemini.js` to `ProviderTransport`.
- [x] Migrate `providers/openrouter.js` to `ProviderTransport`.
- [x] Wire the background `'copilot-stream'` message handler in `background.js` / `messaging/messageHandler.js` to use `ProviderTransport.stream()`.
- [x] Retire redundant fetch, timeout, and stream parsing helpers in `providers/utils.js`.
- [x] Verify manifest and script registrations are updated in `scripts/build-extension.js`.
- [x] Update provider test suites to verify migrated implementations across all five providers.
- [x] Verify `npm test` and `npm run package` pass cleanly before closing.
