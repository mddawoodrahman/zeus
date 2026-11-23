# 05: Build Packaging, Manifest Verification & End-to-End Security Regression Sign-off

**What to build:**
Perform final dead-code verification, execute packaged browser CDP testing via `scripts/verify-browser-packaged.mjs`, execute full Issue #4 + Issue #5 security regression sign-off, and update `README.md` to document the new deepened architecture. Confirm zero dead or redundant code remains in `providers/utils.js`, `sidepanel.js`, or `content.js`. Run the full end-to-end verification suite across all layers to ensure zero security regressions before closing the epic.

**Blocked by:** 01: Extract SafeDOM Module, replaceChildren Clearing & Obfuscated Protocol Defense, 02: Deepen SettingsStore with Section-Level Nested Merge & Dual-Area Cache Invalidation, 03A: ProviderTransport Foundation (Unary & Streaming, SSE & NDJSON) & Initial Provider Migration, 03B: Complete Provider Migration to ProviderTransport & Streaming Copilot Consolidation, 04: MV3 Process-Split Prompt Architecture (PromptClient & PromptEngine) with Structured Return

**Status:** completed

- [x] Audit codebase for any orphaned or duplicate helpers in `providers/utils.js`, `sidepanel.js`, and `content.js`.
- [x] Update `README.md` architecture diagrams and documentation to reflect `SafeDOM`, `SettingsStore`, `ProviderTransport`, and `PromptClient`/`PromptEngine`.
- [x] Run `npm run test:syntax` verifying clean syntax across all files.
- [x] Run `npm test` across all unit, DOM, integration, and smoke test suites.
- [x] Run `npm run package` and ensure build artifacts pass manifest validation and size checks.
- [x] Execute `node scripts/verify-browser-packaged.mjs` verifying CSP compliance, font loading, and page rendering under synthetic fixtures.
- [x] Verify all Issue #4 and Issue #5 invariants (zero secrets across IPC, dual-area storage isolation, strict DOM nodes, scoped Ollama origin) remain green.
