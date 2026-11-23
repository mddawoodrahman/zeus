# 03A: ProviderTransport Foundation (Unary & Streaming, SSE & NDJSON) & Initial Provider Migration

**What to build:**
Implement the authoritative `core/providerTransport.js` module providing unified unary `execute(requestSpec)` and streaming `stream(requestSpec, { onChunk, signal })` interfaces. Include robust built-in frame decoders for Server-Sent Events (SSE) and Newline-Delimited JSON (NDJSON). Enforce retry safety: retries with exponential backoff trigger ONLY on pre-first-byte transient errors, NEVER after the first chunk has been emitted, and NEVER on `AbortSignal` cancellation. Migrate `providers/openai.js` (SSE) and `providers/ollama.js` (NDJSON) to use `ProviderTransport`. Wire `core/providerTransport.js` into `manifest.json`, background worker scripts, and `scripts/build-extension.js`, and verify that `npm test && npm run package` passes cleanly.

**Blocked by:** None (can start immediately)

**Status:** closed

- [x] Implement `core/providerTransport.js` exposing `execute(requestSpec)` and `stream(requestSpec, { onChunk, signal })`.
- [x] Implement robust SSE stream decoder (handling `data: [JSON]` and `data: [DONE]`) and NDJSON stream decoder (handling line-delimited JSON chunks).
- [x] Enforce retry invariant: retries occur only on pre-first-byte transient failures (429, 5xx, network drops), never after first chunk emission, and never after `signal.aborted`.
- [x] Migrate `providers/openai.js` to declarative schema adapter over `ProviderTransport.execute()` and `ProviderTransport.stream()`.
- [x] Migrate `providers/ollama.js` to declarative schema adapter over `ProviderTransport.execute()` and `ProviderTransport.stream()`.
- [x] Wire `core/providerTransport.js` into `manifest.json` (background worker), `sidepanel.html`, and `scripts/build-extension.js`.
- [x] Add unit tests in `tests/providers/provider-transport.test.js` validating SSE/NDJSON stream decoding, timeout handling, and pre-first-byte retry safety.
- [x] Verify `npm test` and `npm run package` pass cleanly before closing.
