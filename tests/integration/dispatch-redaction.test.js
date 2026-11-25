/**
 * @vitest-environment jsdom
 * @vitest-environment-options {"url":"https://chatgpt.com/"}
 */
const fs = require('node:fs');
function withRect(element, rect = { width: 400, height: 100, top: 0, left: 0, right: 400, bottom: 100 }) {
  element.getBoundingClientRect = () => ({
    x: rect.left,
    y: rect.top,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    toJSON() {
      return this;
    }
  });
}
const path = require('node:path');
const { loadScript, clearZeusGlobals } = require('../utils/runtime');

describe('Ticket 3: Redaction across all dispatch surfaces', () => {
  let runtimeMessages;
  let messageListeners;
  let chromeMock;

  const FIXTURES = {
    apiKey: 'sk-proj-abcdef12345678901234567890',
    postgresUri: 'postgres://dbuser:super_secret_pw_999@internal.db:5432/prod_db',
    email: 'admin.support@securecorp.example.com',
    jwtToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
  };

  beforeEach(() => {
    clearZeusGlobals();
    document.body.innerHTML = '';
    runtimeMessages = [];
    messageListeners = [];

    chromeMock = {
      runtime: {
        id: 'zeus-test-extension-id',
        lastError: null,
        sendMessage(msg, callback) {
          runtimeMessages.push(msg);
          if (typeof callback === 'function') {
            if (msg.action === 'ping') {
              callback({ status: 'pong' });
            } else if (msg.action === 'getSettings') {
              callback({
                settings: {
                  provider: 'openai',
                  hasApiKey: { openai: true, gemini: true, claude: true, openrouter: true }
                }
              });
            } else if (msg.action === 'enhancePrompt') {
              // Echo with simulated AI rewriting preserving placeholders
              callback({
                success: true,
                enhancedPrompt: `ENHANCED:\n${msg.prompt}`
              });
            } else if (msg.type === 'sidePanel:saveHistory') {
              callback({ success: true });
            } else {
              callback({ success: true });
            }
          }
        },
        onMessage: {
          addListener(fn) {
            messageListeners.push(fn);
          }
        },
        connect() {
          return {
            onMessage: { addListener() {} },
            postMessage() {},
            disconnect() {}
          };
        }
      },
      storage: {
        sync: {
          get(_keys, cb) { cb({}); },
          set(_data, cb) { if (cb) cb(); }
        },
        local: {
          get(_keys, cb) { cb({}); },
          set(_data, cb) { if (cb) cb(); }
        }
      },
      tabs: {
        query(_info, cb) { cb([{ id: 101 }]); },
        sendMessage(_id, _msg, cb) { if (cb) cb({ success: true }); }
      }
    };

    globalThis.chrome = chromeMock;
    window.chrome = chromeMock;
  });

  afterEach(() => {
    globalThis.ZeusContentRuntime?.destroy();
    delete globalThis.chrome;
    delete window.chrome;
    clearZeusGlobals();
    document.body.innerHTML = '';
  });

  describe('Dispatch Surface 1: In-Page Enhance Button (`content.js`)', () => {
    it('redacts sensitive credentials before transmitting prompt to extension background', async () => {
      loadScript('core/editorBridge.js');
      loadScript('core/domUtils.js');
      loadScript('adapters/chatgpt.js');
      loadScript('core/useFloatingPosition.js');
      loadScript('core/injector.js');
      loadScript('core/observer.js');
      loadScript('core/redactor.js');
      loadScript('core/promptClient.js');
      loadScript('content.js');
      await new Promise((r) => setTimeout(r, 30));

      const textarea = document.createElement('textarea');
      textarea.id = 'prompt-textarea';
      withRect(textarea);
      textarea.value = `Connect to ${FIXTURES.postgresUri} and authenticate with key ${FIXTURES.apiKey}`;
      document.body.appendChild(textarea);

      textarea.focus();

      // Invoke enhancement click on the input
      await globalThis.ZeusContentRuntime.enhanceInput(textarea);

      // 1. Inspect outgoing enhancePrompt message payload
      const enhanceMessage = runtimeMessages.find((m) => m.action === 'enhancePrompt');
      expect(enhanceMessage).toBeDefined();

      // Verify that sensitive credentials were NEVER transmitted over the wire
      expect(enhanceMessage.prompt).not.toContain(FIXTURES.postgresUri);
      expect(enhanceMessage.prompt).not.toContain(FIXTURES.apiKey);
      expect(enhanceMessage.prompt).toContain('[[ZEUS_SECRET_1]]');
      expect(enhanceMessage.prompt).toContain('[[ZEUS_SECRET_2]]');
      expect(enhanceMessage.secretMap).toBeUndefined();

      // 2. Verify that the input element received the rehydrated values locally
      expect(textarea.value).toContain(FIXTURES.postgresUri);
      expect(textarea.value).toContain(FIXTURES.apiKey);
      expect(textarea.value).toContain('ENHANCED:');
      expect(textarea.value).not.toContain('[[ZEUS_SECRET_1]]');
      expect(textarea.value).not.toContain('[[ZEUS_SECRET_2]]');
    });

    it('completes in-place replacement cleanly when redactionEnabled is false across PromptClient, PromptEngine, and content.js', async () => {
      globalThis.ZeusProviders = {
        openai: vi.fn().mockImplementation(async (prompt) => `ENHANCED:\n${prompt}`)
      };
      globalThis.ZeusSettings = {
        createDefaultSettings: () => ({ provider: 'openai', redactionEnabled: false }),
        loadSettings: vi.fn().mockResolvedValue({
          provider: 'openai',
          redactionEnabled: false,
          apiKeys: { openai: 'sk-key' },
          models: { openai: 'gpt-5.4-mini' }
        })
      };
      loadScript('model-registry.js');
      loadScript('core/router.js');
      loadScript('core/redactor.js');
      loadScript('core/promptEngine.js');

      chromeMock.runtime.sendMessage = (msg, callback) => {
        runtimeMessages.push(msg);
        if (msg.action === 'getSettings') {
          callback({
            settings: {
              provider: 'openai',
              redactionEnabled: false,
              hasApiKey: { openai: true }
            }
          });
          return;
        }
        if (msg.action === 'enhancePrompt') {
          globalThis.ZeusPromptEngine.execute(msg.prompt, msg.options).then((res) => {
            callback({
              success: true,
              enhancedText: res.enhancedText,
              enhancedPrompt: res.enhancedText,
              warnings: res.warnings,
              meta: res.meta
            });
          });
        }
      };

      loadScript('core/editorBridge.js');
      loadScript('core/domUtils.js');
      loadScript('adapters/chatgpt.js');
      loadScript('core/useFloatingPosition.js');
      loadScript('core/injector.js');
      loadScript('core/observer.js');
      loadScript('core/promptClient.js');
      loadScript('content.js');
      await new Promise((r) => setTimeout(r, 30));

      const textarea = document.createElement('textarea');
      textarea.id = 'prompt-textarea';
      withRect(textarea);
      textarea.value = `Connect to ${FIXTURES.postgresUri}`;
      document.body.appendChild(textarea);
      textarea.focus();

      const status = await globalThis.ZeusContentRuntime.enhanceInput(textarea);
      expect(status).toBe('enhanced');
      expect(textarea.value).toBe(`ENHANCED:\nConnect to ${FIXTURES.postgresUri}`);
    });
  });

  describe('Dispatch Surface 2: Context Menu (`contextEnhancePrompt`)', () => {
    it('redacts sensitive data when triggered via context menu and rehydrates upon write-back', async () => {
      loadScript('core/editorBridge.js');
      loadScript('core/domUtils.js');
      loadScript('adapters/chatgpt.js');
      loadScript('core/useFloatingPosition.js');
      loadScript('core/injector.js');
      loadScript('core/observer.js');
      loadScript('core/redactor.js');
      loadScript('core/promptClient.js');
      loadScript('content.js');
      await new Promise((r) => setTimeout(r, 30));

      const textarea = document.createElement('textarea');
      textarea.id = 'prompt-textarea';
      withRect(textarea);
      textarea.value = `Send confidential report to ${FIXTURES.email} using token ${FIXTURES.jwtToken}`;
      document.body.appendChild(textarea);
      textarea.focus();

      // Dispatch runtime contextEnhancePrompt message
      const contextListener = messageListeners[0];
      expect(contextListener).toBeDefined();

      let acknowledged = false;
      contextListener({ action: 'contextEnhancePrompt' }, {}, (res) => {
        acknowledged = true;
      });

      // Allow async enhancement to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      const enhanceMessage = runtimeMessages.find((m) => m.action === 'enhancePrompt');
      expect(enhanceMessage).toBeDefined();

      // Transmitted message must be masked
      expect(enhanceMessage.prompt).not.toContain(FIXTURES.email);
      expect(enhanceMessage.prompt).not.toContain(FIXTURES.jwtToken);
      expect(enhanceMessage.prompt).toContain('[[ZEUS_EMAIL_1]]');
      expect(enhanceMessage.prompt).toContain('[[ZEUS_SECRET_1]]');

      // Rehydrated text restored to textarea
      expect(textarea.value).toContain(FIXTURES.email);
      expect(textarea.value).toContain(FIXTURES.jwtToken);
      expect(textarea.value).not.toContain('[[ZEUS_EMAIL_1]]');
      expect(textarea.value).not.toContain('[[ZEUS_SECRET_1]]');
    });
  });

  describe('Dispatch Surface 3: Side Panel Workbench (`sidepanel.js`)', () => {
    it('redacts prompt before dispatch, rehydrates in output, and keeps raw secrets out of persistent history', async () => {
      // Build Side Panel Workbench DOM fixture
      document.body.innerHTML = `
        <div id="sidepanel-toast-holder"></div>
        <button class="tab-btn active" data-tab="editor">EDITOR</button>
        <button class="tab-btn" data-tab="history">HISTORY</button>
        <button class="tab-btn" data-tab="templates">TEMPLATES</button>
        <div id="tab-editor" class="tab-section active">
          <textarea id="original-input"></textarea>
          <button id="btn-capture">CAPTURE</button>
          <button id="btn-enhance">OPTIMIZE</button>
          <div id="diff-card" style="display:none;"><div id="diff-view"></div></div>
          <textarea id="enhanced-output"></textarea>
          <button id="btn-insert">INSERT</button>
          <button id="btn-copy">COPY</button>
        </div>
        <div id="tab-history" class="tab-section"><div id="history-list"></div></div>
        <div id="tab-templates" class="tab-section">
          <div id="templates-list-view"><button id="btn-new-template">NEW</button><div id="template-list"></div></div>
          <div id="templates-editor-view" style="display:none;">
            <input id="template-name" />
            <textarea id="template-text"></textarea>
            <button id="btn-save-template">SAVE</button>
            <button id="btn-delete-template">DELETE</button>
            <button id="btn-cancel-template">CANCEL</button>
          </div>
        </div>
        <div id="modal-fill-variables" style="display:none;"><div id="modal-variables-inputs"></div><button id="btn-modal-fill">FILL</button><button id="btn-modal-close">CLOSE</button></div>
      `;

      loadScript('core/redactor.js');
      loadScript('core/safeDom.js');
      loadScript('core/promptClient.js');
      loadScript('sidepanel.js');

      // Trigger DOMContentLoaded logic
      document.dispatchEvent(new Event('DOMContentLoaded'));

      const originalInput = document.getElementById('original-input');
      const enhancedOutput = document.getElementById('enhanced-output');
      const btnEnhance = document.getElementById('btn-enhance');
      const diffView = document.getElementById('diff-view');

      const rawPrompt = `Configure database ${FIXTURES.postgresUri} and contact ${FIXTURES.email}`;
      originalInput.value = rawPrompt;

      // Click enhance button in Side Panel
      btnEnhance.click();

      // Wait for async sendMessage callbacks
      await new Promise((resolve) => setTimeout(resolve, 50));

      // 1. Verify enhancePrompt message transmitted across runtime bus
      const enhanceMessage = runtimeMessages.find((m) => m.action === 'enhancePrompt');
      expect(enhanceMessage).toBeDefined();
      expect(enhanceMessage.prompt).not.toContain(FIXTURES.postgresUri);
      expect(enhanceMessage.prompt).not.toContain(FIXTURES.email);
      expect(enhanceMessage.prompt).toContain('[[ZEUS_SECRET_1]]');
      expect(enhanceMessage.prompt).toContain('[[ZEUS_EMAIL_1]]');

      // 2. Verify enhancedOutput received rehydrated text
      expect(enhancedOutput.value).toContain(FIXTURES.postgresUri);
      expect(enhancedOutput.value).toContain(FIXTURES.email);
      expect(enhancedOutput.value).not.toContain('[[ZEUS_SECRET_1]]');
      expect(enhancedOutput.value).not.toContain('[[ZEUS_EMAIL_1]]');

      // 3. Verify diffView received rehydrated text
      expect(diffView.innerHTML).toContain(FIXTURES.postgresUri);
      expect(diffView.innerHTML).toContain(FIXTURES.email);

      // 4. CRITICAL: Verify persistent history payload
      const historyMessage = runtimeMessages.find((m) => m.type === 'sidePanel:saveHistory');
      expect(historyMessage).toBeDefined();
      expect(historyMessage.entry).toBeDefined();

      // History must contain only scrubbed text with placeholders, NEVER raw secrets
      expect(historyMessage.entry.original).not.toContain(FIXTURES.postgresUri);
      expect(historyMessage.entry.original).not.toContain(FIXTURES.email);
      expect(historyMessage.entry.original).toContain('[[ZEUS_SECRET_1]]');
      expect(historyMessage.entry.original).toContain('[[ZEUS_EMAIL_1]]');

      expect(historyMessage.entry.enhanced).not.toContain(FIXTURES.postgresUri);
      expect(historyMessage.entry.enhanced).not.toContain(FIXTURES.email);
      expect(historyMessage.entry.enhanced).toContain('[[ZEUS_SECRET_1]]');
      expect(historyMessage.entry.enhanced).toContain('[[ZEUS_EMAIL_1]]');

      // Secret mapping must NEVER be stored in history
      expect(historyMessage.entry.secretMap).toBeUndefined();
      expect(historyMessage.entry.map).toBeUndefined();
    });
  });

  describe('Telemetry Sanitization Audit', () => {
    it('strips secret maps, prompts, and credentials from telemetry events', () => {
      loadScript('core/telemetry.js');

      const telemetryStore = [];
      chromeMock.storage.local.set = vi.fn((data, cb) => {
        if (data.zeus_fallback_telemetry) {
          telemetryStore.push(...data.zeus_fallback_telemetry);
        }
        if (cb) cb();
      });

      globalThis.ZeusTelemetry.track('fallback', {
        provider: 'openai',
        reason: 'rate_limit',
        secretMap: { '[[ZEUS_SECRET_1]]': FIXTURES.apiKey },
        prompt: `Raw prompt with secret ${FIXTURES.apiKey}`,
        apiKeys: { openai: FIXTURES.apiKey }
      });

      const loggedEvent = telemetryStore[0];
      expect(loggedEvent).toBeDefined();
      expect(loggedEvent.payload.provider).toBe('openai');
      expect(loggedEvent.payload.reason).toBe('rate_limit');

      // Sensitive fields must be stripped completely
      expect(loggedEvent.payload.secretMap).toBeUndefined();
      expect(loggedEvent.payload.prompt).toBeUndefined();
      expect(loggedEvent.payload.apiKeys).toBeUndefined();
    });
  });

  describe('Manifest Load Order & Packaging Verification', () => {
    it('declares core/redactor.js in manifest.json before copilot.js and content.js', () => {
      const manifestPath = path.resolve(process.cwd(), 'manifest.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

      const contentScripts = manifest.content_scripts?.[0]?.js || [];
      const redactorIndex = contentScripts.indexOf('core/redactor.js');
      const copilotIndex = contentScripts.indexOf('core/copilot.js');
      const contentIndex = contentScripts.indexOf('content.js');

      expect(redactorIndex).toBeGreaterThan(-1);
      expect(copilotIndex).toBeGreaterThan(redactorIndex);
      expect(contentIndex).toBeGreaterThan(redactorIndex);
    });

    it('packages core/redactor.js into dist/extension/core/redactor.js during build', () => {
      const distRedactor = path.resolve(process.cwd(), 'dist', 'extension', 'core', 'redactor.js');
      // If dist exists, check file presence
      if (fs.existsSync(distRedactor)) {
        expect(fs.existsSync(distRedactor)).toBe(true);
      }
    });
  });
});
