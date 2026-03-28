# Zeus - Prompt Enhancer

Zeus is a Manifest V3 Chrome extension that rewrites prompts using cloud and local LLM providers, and injects an **Enhance Prompt** button directly into supported chat inputs.

## Current Features

- Prompt rewriting with provider APIs: **Gemini**, **OpenAI**, **Claude**, **OpenRouter**, and **Ollama (Local)**.
- **Auto mode**: tries Ollama first, then falls back to OpenAI.
- Inline enhance button injection on supported chat sites.
- Context-menu action: **Enhance Prompt with Zeus** on editable fields.
- Provider selector + API key management in popup.
- Automatic dark mode support in popup.
- SPA-aware input detection with MutationObserver.
- Shared prompt-engineering pipeline across all providers.
- Unified server-driven error normalization in background service worker.
- OpenRouter support with recommended headers (`HTTP-Referer`, `X-Title`) and bounded retry/backoff on `429`.
- Ollama health checks + local model auto-detection.

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
- `ollama`
- `auto`

### Model Behavior

- Cloud providers use internal default model values managed by the extension.
- Ollama model is **auto-detected** from local Ollama:
	1. first running model (`/api/ps`)
	2. then first installed model (`/api/tags`)

## Installation

1. Clone/download this repository.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select this folder (`d:\zeus-main`).
5. Pin/open Zeus from the extensions toolbar.

## Usage

1. Open Zeus popup.
2. Choose a provider.
3. Enter API key for cloud providers (not needed for Ollama).
4. Click **Save Settings**.
5. Go to a supported site and click the Zeus lightning button near the input.

### Auto Mode

- Select `auto` in the popup.
- Zeus tries Ollama first.
- If Ollama fails, Zeus falls back to OpenAI (requires OpenAI API key).

### Ollama Setup (Required)

To allow Chrome extension requests, Ollama must allow your extension origin.

PowerShell example:

```powershell
$env:OLLAMA_ORIGINS="chrome-extension://<YOUR_EXTENSION_ID>,*"
ollama serve
```

Then run or pull at least one model locally, for example:

```powershell
ollama run qwen3:8b
```

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
- `http://localhost:11434/*`

### Optional host permissions

- `https://*/*`

## Architecture

- `content.js`: Input detection, button injection, messaging, context-menu action handling.
- `background.js`: Provider routing, API calls, OpenRouter retries/backoff, Ollama health/model detection, unified error normalization.
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
- **Ollama not running**: start Ollama with `ollama serve`.
- **Ollama blocked extension origin**: set `OLLAMA_ORIGINS` to include `chrome-extension://<YOUR_EXTENSION_ID>` and restart Ollama.
- **No local Ollama model detected**: run a local model at least once, e.g. `ollama run qwen3:8b`.
- **Provider/model errors**: verify provider selection and required API keys.

## License

MIT
