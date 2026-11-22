/**
 * @vitest-environment jsdom
 */

const fs = require('fs');
const path = require('path');
const { loadScript, clearZeusGlobals } = require('../utils/runtime');

describe('Ollama Origin & Command Scoping (Ticket 6)', () => {
  beforeEach(() => {
    clearZeusGlobals();
    delete globalThis.chrome;

    loadScript('core/retry.js');
    loadScript('core/prompts.js');
    loadScript('core/errors.js');
    loadScript('providers/utils.js');
    loadScript('providers/ollama.js');
    loadScript('options.js');
  });

  afterEach(() => {
    clearZeusGlobals();
    delete globalThis.chrome;
  });

  describe('1. Command Formatting', () => {
    it('formats cross-platform startup commands correctly for an explicit extension ID', () => {
      const extId = 'admccjkmockfdflocgggjfgdacdodkdf';
      const meta = globalThis.ZeusOllamaMeta;
      const commands = meta.buildOllamaCommands(extId);

      expect(commands.origin).toBe(`chrome-extension://${extId}`);
      expect(commands.macLinux).toBe(`OLLAMA_ORIGINS="chrome-extension://${extId}" ollama serve`);
      expect(commands.macDesktop).toBe(`launchctl setenv OLLAMA_ORIGINS "chrome-extension://${extId}"`);
      expect(commands.windowsPowerShell).toBe(`$env:OLLAMA_ORIGINS="chrome-extension://${extId}"; ollama serve`);
      expect(commands.windowsCmd).toBe(`set OLLAMA_ORIGINS=chrome-extension://${extId} && ollama serve`);
    });

    it('matches options.js global ZeusOllamaCommands output', () => {
      const extId = 'test-ext-1234';
      const metaCmds = globalThis.ZeusOllamaMeta.buildOllamaCommands(extId);
      const optCmds = globalThis.ZeusOllamaCommands.buildOllamaCommands(extId);

      expect(optCmds).toEqual(metaCmds);
    });
  });

  describe('2. Fallback Behavior', () => {
    it('falls back to <YOUR_EXTENSION_ID> when chrome.runtime.id is missing', () => {
      globalThis.chrome = {}; // no runtime or runtime.id

      const meta = globalThis.ZeusOllamaMeta;
      const origin = meta.getOllamaOrigin();
      const commands = meta.buildOllamaCommands();
      const blockedMsg = meta.buildOllamaOriginBlockedMessage();

      expect(origin).toBe('chrome-extension://<YOUR_EXTENSION_ID>');
      expect(commands.origin).toBe('chrome-extension://<YOUR_EXTENSION_ID>');
      expect(commands.macLinux).toBe('OLLAMA_ORIGINS="chrome-extension://<YOUR_EXTENSION_ID>" ollama serve');
      expect(commands.macDesktop).toBe('launchctl setenv OLLAMA_ORIGINS "chrome-extension://<YOUR_EXTENSION_ID>"');
      expect(commands.windowsPowerShell).toBe('$env:OLLAMA_ORIGINS="chrome-extension://<YOUR_EXTENSION_ID>"; ollama serve');
      expect(commands.windowsCmd).toBe('set OLLAMA_ORIGINS=chrome-extension://<YOUR_EXTENSION_ID> && ollama serve');
      expect(blockedMsg).toContain('chrome-extension://<YOUR_EXTENSION_ID>');
      expect(blockedMsg).not.toContain('*');
    });

    it('uses chrome.runtime.id automatically when available', () => {
      globalThis.chrome = {
        runtime: {
          id: 'live-chrome-runtime-id'
        }
      };

      const meta = globalThis.ZeusOllamaMeta;
      const origin = meta.getOllamaOrigin();
      const commands = meta.buildOllamaCommands();
      const blockedMsg = meta.buildOllamaOriginBlockedMessage();

      expect(origin).toBe('chrome-extension://live-chrome-runtime-id');
      expect(commands.origin).toBe('chrome-extension://live-chrome-runtime-id');
      expect(commands.macLinux).toBe('OLLAMA_ORIGINS="chrome-extension://live-chrome-runtime-id" ollama serve');
      expect(commands.macDesktop).toBe('launchctl setenv OLLAMA_ORIGINS "chrome-extension://live-chrome-runtime-id"');
      expect(commands.windowsPowerShell).toBe('$env:OLLAMA_ORIGINS="chrome-extension://live-chrome-runtime-id"; ollama serve');
      expect(commands.windowsCmd).toBe('set OLLAMA_ORIGINS=chrome-extension://live-chrome-runtime-id && ollama serve');
      expect(blockedMsg).toContain('chrome-extension://live-chrome-runtime-id');
      expect(blockedMsg).not.toContain('*');
    });
  });

  describe('3. Blocked Origin Message Guidance', () => {
    it('includes macOS Ollama Desktop launchctl guidance in buildOllamaOriginBlockedMessage', () => {
      const msg = globalThis.ZeusOllamaMeta.buildOllamaOriginBlockedMessage('scoped-id');
      expect(msg).toContain('launchctl setenv OLLAMA_ORIGINS "chrome-extension://scoped-id"');
      expect(msg).toContain('OLLAMA_ORIGINS="chrome-extension://scoped-id"');
      expect(msg).not.toContain('*');
    });

    it('throws error with scoped origin and desktop guidance on HTTP 403', async () => {
      globalThis.chrome = { runtime: { id: 'test-403-id' } };
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ error: 'origin not allowed' })
      });

      await expect(globalThis.ZeusProviders.ollama('test prompt', { ollama: { model: 'llama3' } }))
        .rejects
        .toThrow(/Ollama blocked extension origin 'chrome-extension:\/\/test-403-id'/);

      delete globalThis.fetch;
    });
  });

  describe('4. Options UI Platform Tabs & Copy Behavior', () => {
    beforeEach(() => {
      const htmlPath = path.resolve(__dirname, '..', '..', 'options.html');
      const html = fs.readFileSync(htmlPath, 'utf8');
      const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      document.body.innerHTML = bodyMatch ? bodyMatch[1] : '';
    });

    it('initializes origin and default command snippet in Options DOM', () => {
      globalThis.chrome = { runtime: { id: 'opt-test-id' } };

      // Dispatch DOMContentLoaded to trigger options.js initialization
      document.dispatchEvent(new Event('DOMContentLoaded'));

      const originInput = document.getElementById('ollamaExtensionOrigin');
      const commandInput = document.getElementById('ollamaCommandInput');

      expect(originInput.value).toBe('chrome-extension://opt-test-id');
      expect(commandInput.value).toBe('OLLAMA_ORIGINS="chrome-extension://opt-test-id" ollama serve');
    });

    it('updates command input when platform tabs are clicked', () => {
      globalThis.chrome = { runtime: { id: 'opt-test-id' } };
      document.dispatchEvent(new Event('DOMContentLoaded'));

      const commandInput = document.getElementById('ollamaCommandInput');
      const tabs = document.querySelectorAll('.ollama-tab-btn');

      const macDesktopTab = Array.from(tabs).find(t => t.dataset.platform === 'macDesktop');
      const pwshTab = Array.from(tabs).find(t => t.dataset.platform === 'windowsPowerShell');
      const cmdTab = Array.from(tabs).find(t => t.dataset.platform === 'windowsCmd');
      const macLinuxTab = Array.from(tabs).find(t => t.dataset.platform === 'macLinux');

      // Click macOS Desktop
      macDesktopTab.click();
      expect(macDesktopTab.classList.contains('active')).toBe(true);
      expect(commandInput.value).toBe('launchctl setenv OLLAMA_ORIGINS "chrome-extension://opt-test-id"');

      // Click PowerShell
      pwshTab.click();
      expect(pwshTab.classList.contains('active')).toBe(true);
      expect(commandInput.value).toBe('$env:OLLAMA_ORIGINS="chrome-extension://opt-test-id"; ollama serve');

      // Click CMD
      cmdTab.click();
      expect(cmdTab.classList.contains('active')).toBe(true);
      expect(commandInput.value).toBe('set OLLAMA_ORIGINS=chrome-extension://opt-test-id && ollama serve');

      // Click back to macOS / Linux
      macLinuxTab.click();
      expect(macLinuxTab.classList.contains('active')).toBe(true);
      expect(commandInput.value).toBe('OLLAMA_ORIGINS="chrome-extension://opt-test-id" ollama serve');
    });

    it('copies origin and active command to clipboard with user feedback', async () => {
      globalThis.chrome = { runtime: { id: 'copy-test-id' } };
      document.dispatchEvent(new Event('DOMContentLoaded'));

      let clipboardText = '';
      navigator.clipboard = {
        writeText: vi.fn().mockImplementation((text) => {
          clipboardText = text;
          return Promise.resolve();
        })
      };

      const copyOriginBtn = document.getElementById('copyOllamaOriginBtn');
      const copyCommandBtn = document.getElementById('copyOllamaCommandBtn');
      const feedback = document.getElementById('ollamaCopyFeedback');

      // Copy origin
      copyOriginBtn.click();
      await Promise.resolve();
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('chrome-extension://copy-test-id');
      expect(clipboardText).toBe('chrome-extension://copy-test-id');

      // Copy command
      copyCommandBtn.click();
      await Promise.resolve();
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('OLLAMA_ORIGINS="chrome-extension://copy-test-id" ollama serve');
      expect(clipboardText).toBe('OLLAMA_ORIGINS="chrome-extension://copy-test-id" ollama serve');
      expect(feedback.style.display).toBe('block');
    });
  });

  describe('5. Zero-Wildcard Security Audit', () => {
    it('verifies zero occurrences of OLLAMA_ORIGINS=* across all source code and documentation', () => {
      const projectRoot = path.resolve(__dirname, '..', '..');
      const dirsToScan = ['core', 'providers', 'adapters', 'settings', 'messaging'];
      const individualFiles = ['README.md', 'options.html', 'options.js', 'popup.html', 'popup.js', 'sidepanel.html', 'sidepanel.js', 'background.js', 'content.js', 'manifest.json'];

      const filesToCheck = [];

      for (const d of dirsToScan) {
        const fullDir = path.join(projectRoot, d);
        if (fs.existsSync(fullDir)) {
          for (const f of fs.readdirSync(fullDir)) {
            if (f.endsWith('.js') || f.endsWith('.html') || f.endsWith('.json')) {
              filesToCheck.push(path.join(fullDir, f));
            }
          }
        }
      }

      for (const f of individualFiles) {
        const fullPath = path.join(projectRoot, f);
        if (fs.existsSync(fullPath)) {
          filesToCheck.push(fullPath);
        }
      }

      const wildcardMatches = [];

      for (const filePath of filesToCheck) {
        const content = fs.readFileSync(filePath, 'utf8');
        // Check for wildcard OLLAMA_ORIGINS patterns
        if (/OLLAMA_ORIGINS\s*=\s*['"]?\*['"]?/i.test(content)) {
          wildcardMatches.push(path.relative(projectRoot, filePath));
        }
      }

      expect(wildcardMatches).toEqual([]);
    });
  });
});
