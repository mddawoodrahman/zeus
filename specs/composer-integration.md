# Zeus composer integration

Verified on Windows on November 23, 2026. The starting checkout was clean at `8fe3e10` on `main`, one commit ahead of its tracking branch. The implementation and test updates are in the working tree.

## Findings and corrections

| Severity | Baseline evidence and reproduction | Correction |
|---|---|---|
| Medium | Mount the old injector with its supplied SVG, set its button to the error state, and inspect it in Chromium. The button contained no SVG and the computed `::before` content was `✕`. | One locally constructed SVG stays mounted through idle, processing, success, retry and IME pause. Status text and a small indicator communicate state. |
| Medium | Mount the old control inside a static form. The browser reproduction changed the form’s inline position to `relative`. The button and page-level stylesheet shared the host’s styling context. A layout change on a particular live site was not established by this reproduction. | A closed shadow root under the document element owns all presentation nodes. The page keeps its original composer tree and styles. |
| High | The old positioner assumed a 28-pixel square. Its fixed strategy placed that square inside the editor, and its anchored strategy shifted left past selected trailing controls without testing the editor rectangle or final hit target. Reproduce with a full-width textarea and multiple trailing buttons. | Measure the button, editor, composer, viewport and interactive controls. Reject collisions, clipped or unreachable candidates, then try an outside placement or viewport edge. |
| High | Delay an enhancement, edit the original draft, then deliver the response. The old completion path called the setter without checking the editor identity, draft revision or route. A side-panel write also acknowledged success unconditionally. | Capture the target and revision before IPC. Recheck after the response and verify insertion before reporting success. A changed draft gets a local review action. A retired target discards its pending result. |
| High | The old rich setter assigned `innerText` and emitted an input event. That path bypassed the editor’s transaction handler. During development a real ProseMirror fixture also demonstrated that immediate paste after DOM selection could append to the old model selection. | Use plain-text paste through the host handler for supported paragraph documents. Allow selection reconciliation first, verify the draft again, and check post-render readback. The browser fixture independently checks the framework document model. |
| High | Create the old ghost overlay in a rich editor containing “Draft”, then set the suggestion to “ ghost”. Chromium read the editor’s text content as “Draft ghost”. Its rich Tab handler could also edit the current window selection without establishing that it belonged to the target. | Render the mirror, ghost and pause indicator inside the Zeus layer. Check focus, caret, draft, stream identity and geometry before accepting a completion. |
| Medium | The original visibility and discovery paths used multiple timers and Copilot discovery passes. Forced script execution re-registered modules and appended adapter entries before the content-runtime guard ran. The observer’s pending debounce could outlive disconnect. | Guard module registration, keep one binding and cancel listeners, timers, frames and streams on teardown. Test force injection, route changes, detached editors and replacement composers. |

**Reported red horizontal line.** The supplied attachment included the description, but no screenshot or saved page state. The old injector contained red button and toast error borders. The extension-page stylesheet was absent from the manifest’s content-script CSS. The X was reproduced independently. The line’s exact origin remains unverified.

## Runtime contract

Each site registration supplies exact host matching and optional signature selectors. The shared adapter returns eligible editors, the active editor, a composer root, native control elements, read/write operations and editor capabilities. With several eligible composers, focus selects the target. Known-site bindings can retain the last active eligible editor while the user operates the controls. The generic adapter requires a manifest-permitted HTTPS host and positive composer evidence. A provider-only permission does not authorize page discovery.

The content runtime discovers, binds, suspends on page hiding, rebinds after navigation, and destroys its resources on unload. The positioner tries toolbar gaps in reading order, positions outside the root and then an edge position. It checks the visible viewport, the draft rectangle, controls, sampled underlying elements and the final hit target. Resize, scroll, intersection, layout shifts, composer mutations and portal changes schedule new measurements. When the action cannot be placed, the composer context menu and side panel remain available.

Floating UI offers clipping-boundary detection. Zeus still needs to reject the full editor and an arbitrary collection of native controls. A native candidate evaluator kept that policy directly testable and added zero runtime dependencies to the classic-script manifest. The browser harness uses a persistent Chromium context with the packaged extension loaded. [Floating UI overflow API](https://floating-ui.com/docs/detectOverflow) · [Playwright extension testing](https://playwright.dev/docs/chrome-extensions)

| Editor | Insertion evidence and fallback |
|---|---|
| Textarea and eligible text input | Native prototype setter, cancellable before-input notification, one input notification and readback after reconciliation. Single-line fields decline multiline results. |
| ProseMirror and Quill | Plain paragraph documents use the editor’s paste handler. Acceptance requires a handled paste and matching readback. Tests inspect the actual ProseMirror state and Quill document text. |
| Browser plaintext-only editor | Uses Chromium’s text editing command and readback. A packaged fixture exercises multiline replacement. |
| Lexical, Draft.js, unknown rich structure or formatted content outside the supported subset | Readable eligible drafts can be enhanced into a review dialog. The user can copy the result. Nested editable inputs are excluded from discovery. |

The bridge tracks composition and revisions. It attempts rollback of an owned failed write, preserves intervening edits, and includes the original in the local review if the editor diverged during an unsuccessful insertion. Application state beyond published editing behavior is observable only to the extent that the host exposes it. Live native-editor checks establish readback, while the controlled browser fixtures can also assert the host model.

Copilot offers suffixes at a collapsed end caret in writable editors. It measures native inputs with a mirror and rich inputs with a selection range. Failed geometry suppresses Tab interception. Stream replacement, blur, editing, navigation, composition and sensitive-data pausing invalidate suggestions. An early click waits for public settings, including custom redaction patterns, before dispatch. Prompt enhancement continues through PromptClient, local scrubbing and hydration, and background provider routing. Host permissions and extension CSP are identical to the baseline.

## Verification

| Check | Recorded result |
|---|---|
| Baseline `npm test` | 188 tests and smoke checks passed before modification. |
| Final `npm test` | 208 tests across 19 suites passed, plus syntax and smoke checks. Includes provider transport, routing, storage partitioning, redaction and fallback. |
| `npm run test:dom` / `npm run test:integration` | 42 DOM and 35 integration tests passed when run separately. These are subsets of the 208. |
| `npm run test:syntax` | All 69 JavaScript and module files passed. |
| Build and ZIP | `npm run package` built the allowlisted extension and created `dist/extension.zip`. |
| `node scripts/verify-composer.mjs` | Packaged MV3 worker and content scripts loaded in Chromium 159.0.8154.6. Eight locally served fixtures passed at widths 375, 768, 1024, 1440 and 1920, each at actual tab zoom 80%, 100%, 125% and 150%. All 160 visible actions passed viewport, hit-target and editor/control overlap assertions. |
| `node scripts/verify-browser-packaged.mjs` | Popup, options and side panel rendered with loaded fonts and zero CSP violations in Chrome 157.0.8103.80. This existing test uses packaged assets and synthetic extension messaging. |

The composer fixtures also exercise native file selection/removal, dark styling, RTL, scrolling, reinjection, SPA teardown and zero form submissions. Targeted scenarios cover a stale-result review, empty-draft error, modal recovery, Copilot Tab and Escape, and sensitive-data pausing. Fixture screenshots are regenerated in `dist/composer-evidence/`. The stored images are from synthetic pages.

## Platform compatibility

Live runs used an isolated signed-out profile, a disposable test draft, the real extension messaging path and a synthetic Ollama HTTP response. The extension was tested on the public site itself. These checks do not establish external provider availability or authenticated conversation behavior.

| Platform | Packaged browser fixture | Public live site |
|---|---|---|
| ChatGPT | ProseMirror multiline model replacement and Copilot passed | HTTP 403 challenge before composer discovery |
| Gemini | Quill multiline model replacement passed | Discovered Quill, inserted the result and verified multiline readback |
| Claude | ProseMirror multiline model replacement passed | HTTP 403 challenge before composer discovery |
| DeepSeek Chat | Textarea, stale-response review, modal recovery and Copilot passed | HTTP 403 before composer discovery |
| Grok | Textarea and a replacement plaintext-only composer passed | Native insertion and multiline readback passed |
| OpenRouter | Textarea replacement passed | Native insertion and multiline readback passed |
| Kimi | Managed-rich preview passed and the host model retained the original | Discovered the editor and offered the enhanced result for review |
| Generic | Explicitly permitted host and single-line input passed | DeepSeek’s public landing page supplied insufficient generic composer evidence. The adapter declined it. |

Visible actions on Gemini, Grok, OpenRouter and Kimi were also checked across the 20 width/zoom combinations. In one pass the counts with visible controls were 9, 11, 13 and 20 respectively. Visibility varies as these pages hydrate and reflow. Each visible, measured action cleared the editor and measured controls. ChatGPT’s and Gemini’s legacy host aliases have matcher coverage.

## Changed files

| Files | Responsibility |
|---|---|
| `content.js` | Single runtime, settings and navigation handling, draft ownership, context-menu and side-panel entry points |
| `core/injector.js`, `core/useFloatingPosition.js` | Isolated SVG action, status and review UI, measured positioning and teardown |
| `core/domUtils.js`, new `core/editorBridge.js`, `core/observer.js` | Discovery contract, safe text operations and targeted lifecycle observation |
| `core/copilot.js`, `core/ghostText.js` | Stream ownership, sensitive-data pause, keyboard handling and isolated caret overlays |
| `adapters/{chatgpt,claude,gemini,deepseek,grok,openrouter,generic}.js`, new `adapters/kimi.js` | Site signatures and exact host registration |
| `manifest.json`, `messaging/messageHandler.js` | Script load order, manifest-driven reinjection and context-menu host scope |
| `styles.css` | Removed obsolete in-page wrapper and processing selectors |
| `tests/dom/{content-dom,copilot-redaction}.test.js`, `tests/integration/{composer-lifecycle,dispatch-redaction}.test.js`, `tests/utils/runtime.js` | UI/geometry, stale-response, cleanup, privacy and capability regression tests |
| `tests/mocks/chrome.js`, `tests/smoke/settings-and-messaging.smoke.mjs` | Mock the manifest used by the normal reinjection path |
| `tests/harness/*.html`, `harness.css`, `harness.mjs` | Eight site fixtures, real editor models and attachment controls. The module replaces the old selector-only `harness.js`. |
| `scripts/verify-composer.mjs`, `package.json`, `package-lock.json`, `.github/workflows/test.yml` | Browser fixtures, live probes, test-only dependencies and CI verification |
| `README.md`, this report | User behavior, test commands, implementation evidence and coverage limits |

The existing build allowlist already includes runtime files under `core/` and `adapters/`. Playwright, the editor libraries, the bundler and fixtures stay in development and test code.

## Remaining limits

Authenticated existing conversations, account-specific experiments, real provider outages, real site file uploads, and minimum-version Chrome 114 were not exercised. Provider failure and timeout handling were exercised with synthetic responses. Live validation of ChatGPT, Claude and DeepSeek Chat remains blocked by the responses above. Web components with inaccessible editing surfaces and future editor implementations require fresh evidence before enabling automatic replacement.
