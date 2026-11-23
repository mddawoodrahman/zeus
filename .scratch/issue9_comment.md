Completed Zeus Issue #9 (03B) - ProviderTransport Migration & Streaming Copilot Consolidation:

1. Provider Migrations:
   - providers/claude.js: Migrated unary enhance to transport.execute() and suggest() to transport.stream() with typed SSE event handling (content_block_delta / text_delta).
   - providers/gemini.js: Migrated unary generateContent to transport.execute() and suggest() to transport.stream() with streamGenerateContent SSE decoding.
   - providers/openrouter.js: Migrated catalog fetch and unary chat completion to transport.execute(), and suggest() to transport.stream() with SSE decoding.
   - providers/ollama.js: Migrated suggest() to transport.stream() with ndjson decoder.

2. Copilot Streaming & Router Consolidation:
   - Unified background 'copilot-stream' handler in messaging/messageHandler.js and core/router.js streamSuggest() to dispatch to provider suggest() methods, all backed by ProviderTransport.stream().
   - Preserved sensitive data pre-check guard in copilot-stream (pauses and disconnects immediately if credentials detected).

3. Helper Retirement in providers/utils.js:
   - readJsonSafe and parseSseStream now delegate cleanly to ZeusProviderTransport methods while preserving backward compatibility.

4. Test Suites & Verification:
   - All 5 providers verified with mocked responses: openai-provider.test.js, gemini-provider.test.js, openrouter-provider.test.js, claude-provider.test.js, ollama-provider.test.js.
   - All 17 test suites (170 tests) passed cleanly in vitest.
   - Smoke tests (tests/smoke/settings-and-messaging.smoke.mjs) passed.
   - Packaged build (npm run package) and isolated browser verification (scripts/verify-browser-packaged.mjs) passed with 0 CSP violations.
