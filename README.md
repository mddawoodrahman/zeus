# Zeus - Prompt Enhancer

Zeus is a browser extension that enhances prompts for Large Language Model (LLM) websites using Gemini, OpenAI, or Claude APIs. It injects an "Enhance Prompt" button into chat input areas, allowing users to optimize their prompts for clarity, detail, and effectiveness with a single click.

## Features

- **Prompt Enhancement**: Automatically rewrites your prompt to be clearer and more effective for AI models.
- **Multi-Provider Support**: Works with Gemini, OpenAI, and Claude APIs. Choose your provider and model in the extension popup.
- **Easy API Key Management**: Securely store and manage API keys for each provider via the popup interface.
- **Model Selection**: Select from multiple models for each provider (e.g., Gemini 2.5 Pro, GPT-4.1 Mini, Claude 3 Opus).
- **Context Menu Integration**: Right-click in any editable field to enhance your prompt using the context menu.
- **Floating & Inline Button**: Smartly injects an "Enhance Prompt" button into chat/text areas on supported sites.
- **Automatic Site Detection**: Supports popular LLM chat sites including ChatGPT, Claude, Gemini, DeepSeek, Grok, and more.
- **SPA & Dynamic Page Support**: Robust input detection and mutation observers ensure the button appears even on single-page apps and dynamic sites.
- **Error Handling**: Intelligent error messages for invalid API keys, permission issues, and model availability.

## Supported Sites

- chatgpt.com
- chat.openai.com
- claude.ai
- chat.deepseek.com
- grok.com

## Installation

1. **Clone or Download** this repository.
2. Go to `chrome://extensions` (or your browser's extensions page).
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the `Zeus(Prompt Enhancer)` folder.
5. The Zeus extension icon will appear in your browser.

## Usage

1. **Configure API Keys**:
   - Click the Zeus extension icon.
   - Select your preferred AI provider (Gemini, OpenAI, Claude).
   - Enter your API key and choose a model.
   - Click "Save API Keys".

2. **Enhance Prompts**:
   - Visit a supported LLM chat site.
   - Type your prompt in the chat input area.
   - Click the Zeus "Enhance Prompt" button (lightning icon) next to the input.
   - Your prompt will be rewritten and replaced with an optimized version.

3. **Context Menu**:
   - Right-click in any editable field and select "Enhance Prompt with Zeus" to optimize your prompt.

## Permissions

- `activeTab`, `scripting`, `storage`, `declarativeContent`, `tabs`, `contextMenus`
- Host permissions for supported LLM sites.

## How It Works

- **Content Script** (`content.js`): Injects the enhance button, detects input areas, and handles user interaction.
- **Background Service Worker** (`background.js`): Handles API requests to Gemini, OpenAI, and Claude, manages context menu actions, and synchronizes settings.
- **Popup UI** (`popup.html`, `popup.js`): Lets users select provider, enter API keys, and choose models.
- **Styles** (`styles.css`): Modern, clean UI for popup and injected buttons.

## Security

- API keys are stored using Chrome's `storage.sync` and are never sent to third parties except the selected AI provider.
- Error messages are parsed and displayed to help users troubleshoot issues.

## Icons

- Custom icons for extension and button, including a lightning flash SVG.

## Troubleshooting

- If the button does not appear, reload the page or re-open the extension popup.
- For API errors, check your key and model selection.
- For extension context errors, try reloading the site or the extension.

## License

MIT
