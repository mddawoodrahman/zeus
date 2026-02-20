# Zeus - Prompt Enhancer

Zeus is a Manifest V3 Chrome extension that rewrites prompts using multiple LLM providers and injects an **Enhance Prompt** button directly into supported chat inputs.

## Current Features

- Prompt rewriting with provider APIs: **Gemini**, **OpenAI**, **Claude**, and **OpenRouter**.
- Inline enhance button injection on supported chat sites.
- Context-menu action: **Enhance Prompt with Zeus** on editable fields.
- Provider selector + API key management in popup.
- Automatic dark mode support in popup.
- SPA-aware input detection with MutationObserver.
- Unified server-driven error classification in background service worker.
- OpenRouter support with recommended headers (`HTTP-Referer`, `X-Title`) and bounded retry/backoff on `429`.

## Supported Sites (content script injection)

- `chatgpt.com`
- `chat.openai.com`
- `claude.ai`
- `chat.deepseek.com`
- `grok.com`

## Providers

- `gemini`
- `openai`
- `claude`
- `openrouter`

### Model Behavior

The popup currently does **not** expose model selectors.
Zeus stores and uses internal default model values per provider when saving settings.

## Installation

1. Clone/download this repository.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select this folder (`d:\zeus-main`).
5. Pin/open Zeus from the extensions toolbar.

## Usage

1. Open Zeus popup.
2. Choose a provider.
3. Enter API key for that provider.
4. Click **Save API Keys**.
5. Go to a supported site and click the Zeus lightning button near the input.

### Context Menu

- Right-click inside an editable input.
- Choose **Enhance Prompt with Zeus**.

## Permissions

### Extension permissions

- `activeTab`
- `scripting`
- `storage`
- `contextMenus`

### Host permissions

- `https://chatgpt.com/*`
- `https://chat.openai.com/*`
- `https://claude.ai/*`
- `https://chat.deepseek.com/*`
- `https://grok.com/*`
- `https://openrouter.ai/*`

### Optional host permissions

- `https://*/*`

## Architecture

- `content.js`: Input detection, button injection, messaging, context-menu action handling.
- `background.js`: Provider routing, API calls, retries/backoff, unified error normalization/classification.
- `popup.html` + `popup.js`: Provider selection, API key save/load, dark mode UI.
- `styles.css`: Popup and injected button styling.
- `manifest.json`: MV3 configuration, permissions, content script registration.

## Security Notes

- API keys are stored in `chrome.storage.sync`.
- Keys are only sent to selected provider endpoints.
- User-facing server errors are sanitized to reduce leakage of sensitive details.

## Troubleshooting

- **Enhance button not showing**: reload the tab, then reopen popup.
- **Extension context invalidated**: reload the page after extension updates/reloads.
- **Provider/model errors**: verify API key, provider selection, and account access/quota.

## License

MIT
