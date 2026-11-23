# 02: Deepen SettingsStore with Section-Level Nested Merge & Dual-Area Cache Invalidation

**What to build:**
Deepen the settings architecture into a cohesive `SettingsStore` module that encapsulates the split-storage model (`chrome.storage.sync` for preferences, `chrome.storage.local` for API keys). Implement section-level nested merge semantics for `update(diff)` so updating an individual provider key preserves unmentioned sibling keys, while setting `""` explicitly deletes an individual key. Invalidate in-memory caches upon `chrome.storage.onChanged` events across BOTH `'sync'` and `'local'` storage areas. Preserve all Schema v3 invariants (write-before-delete migration, in-flight concurrency lock, zero API keys in `getPublic()`). Ensure all existing callers (`options.js`, `popup.js`, `sidepanel.js`, `messaging/messageHandler.js`) and `tests/smoke/settings-and-messaging.smoke.mjs` stay green immediately without shallow wrapper debt. Wire into `manifest.json`, `options.html`, `popup.html`, `sidepanel.html`, and `scripts/build-extension.js`, verifying `npm test && npm run package` passes cleanly.

**Blocked by:** None (can start immediately)

**Status:** closed

- [x] Implement section-level nested merge in `update(diff)`: updating `apiKeys.openai` preserves sibling keys (`claude`, `gemini`, `openrouter`), and `""` explicitly deletes an individual key.
- [x] Add dual-area storage listener on `chrome.storage.onChanged` invalidating in-memory caches for both `'sync'` and `'local'` areas.
- [x] Preserve Schema v3 write-before-delete migration ordering and in-flight concurrency lock (`migrationPromise`).
- [x] Guarantee `getPublic()` returns zero API keys and exposes boolean `hasApiKey` indicators for content scripts.
- [x] Update `options.js`, `popup.js`, `sidepanel.js`, and `messaging/messageHandler.js` to consume the deepened `SettingsStore`, keeping all callers functional.
- [x] Wire `settings/settingsStore.js` into `manifest.json`, `options.html`, `popup.html`, `sidepanel.html`, and `scripts/build-extension.js`.
- [x] Add unit tests in `tests/unit/settings.test.js` validating nested merge semantics, sibling key retention, and dual-area invalidation.
- [x] Verify `npm test`, `tests/smoke/settings-and-messaging.smoke.mjs`, and `npm run package` pass cleanly before closing.
