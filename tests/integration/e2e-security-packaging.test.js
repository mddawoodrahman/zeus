const fs = require('fs');
const path = require('path');
const { loadScript, clearZeusGlobals } = require('../utils/runtime');

describe('Ticket 7: End-to-End Security & Packaging Verification', () => {
  const projectRoot = path.resolve(__dirname, '..', '..');
  const distExtensionDir = path.join(projectRoot, 'dist', 'extension');

  describe('1. Packaged Manifest & Dependency Integrity', () => {
    it('verifies that dist/extension contains an up-to-date manifest.json matching project manifest', () => {
      const srcManifestPath = path.join(projectRoot, 'manifest.json');
      const distManifestPath = path.join(distExtensionDir, 'manifest.json');

      expect(fs.existsSync(distManifestPath)).toBe(true);

      const srcManifest = JSON.parse(fs.readFileSync(srcManifestPath, 'utf8'));
      const distManifest = JSON.parse(fs.readFileSync(distManifestPath, 'utf8'));

      expect(distManifest.version).toBe(srcManifest.version);
      expect(distManifest.manifest_version).toBe(3);
      expect(distManifest.content_security_policy).toEqual(srcManifest.content_security_policy);
    });

    it('verifies all files declared in manifest exist inside dist/extension', () => {
      const distManifest = JSON.parse(fs.readFileSync(path.join(distExtensionDir, 'manifest.json'), 'utf8'));

      // Background service worker
      expect(fs.existsSync(path.join(distExtensionDir, distManifest.background.service_worker))).toBe(true);

      // Content scripts
      for (const cs of distManifest.content_scripts) {
        for (const file of cs.js) {
          expect(fs.existsSync(path.join(distExtensionDir, file))).toBe(true);
        }
      }

      // Action popup
      expect(fs.existsSync(path.join(distExtensionDir, distManifest.action.default_popup))).toBe(true);

      // Options page
      expect(fs.existsSync(path.join(distExtensionDir, distManifest.options_ui.page))).toBe(true);

      // Side panel
      expect(fs.existsSync(path.join(distExtensionDir, distManifest.side_panel.default_path))).toBe(true);

      // Icons
      for (const iconPath of Object.values(distManifest.icons)) {
        expect(fs.existsSync(path.join(distExtensionDir, iconPath))).toBe(true);
      }
    });

    it('verifies content script load order: core/redactor.js loads before copilot and content.js', () => {
      const distManifest = JSON.parse(fs.readFileSync(path.join(distExtensionDir, 'manifest.json'), 'utf8'));
      const contentScripts = distManifest.content_scripts[0].js;

      const redactorIndex = contentScripts.indexOf('core/redactor.js');
      const copilotIndex = contentScripts.indexOf('core/copilot.js');
      const contentIndex = contentScripts.indexOf('content.js');

      expect(redactorIndex).toBeGreaterThan(-1);
      expect(copilotIndex).toBeGreaterThan(redactorIndex);
      expect(contentIndex).toBeGreaterThan(redactorIndex);
    });

    it('verifies strict content security policy is enforced in extension pages', () => {
      const distManifest = JSON.parse(fs.readFileSync(path.join(distExtensionDir, 'manifest.json'), 'utf8'));
      const csp = distManifest.content_security_policy?.extension_pages || '';

      expect(csp).toContain("script-src 'self'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("style-src 'self' 'unsafe-inline' https://fonts.googleapis.com");
      expect(csp).toContain("font-src 'self' https://fonts.gstatic.com");
      expect(csp).toContain("base-uri 'none'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).not.toContain("'unsafe-eval'");
    });
  });

  describe('2. Safe DOM & Zero-Sink Code Hygiene Audit', () => {
    it('verifies zero dynamic HTML sinks (.innerHTML = or .insertAdjacentHTML) in packaged JS files', () => {
      const criticalFiles = [
        path.join(distExtensionDir, 'sidepanel.js'),
        path.join(distExtensionDir, 'popup.js'),
        path.join(distExtensionDir, 'options.js'),
        path.join(distExtensionDir, 'content.js'),
        path.join(distExtensionDir, 'core', 'injector.js')
      ];

      const sinkPattern = /\.(innerHTML\s*=|insertAdjacentHTML\s*\()/;

      for (const file of criticalFiles) {
        expect(fs.existsSync(file)).toBe(true);
        const code = fs.readFileSync(file, 'utf8');
        const match = code.match(sinkPattern);
        expect(match, `Dynamic HTML sink detected in ${path.basename(file)}: ${match ? match[0] : ''}`).toBeNull();
      }
    });
  });

  describe('3. Zero-Wildcard Security Audit', () => {
    it('asserts zero occurrences of OLLAMA_ORIGINS=* across source code, build dist, and documentation', () => {
      const dirs = [
        path.join(projectRoot, 'core'),
        path.join(projectRoot, 'providers'),
        path.join(projectRoot, 'adapters'),
        path.join(projectRoot, 'settings'),
        path.join(distExtensionDir, 'core'),
        path.join(distExtensionDir, 'providers')
      ];

      const singleFiles = [
        path.join(projectRoot, 'README.md'),
        path.join(projectRoot, 'options.html'),
        path.join(projectRoot, 'options.js'),
        path.join(distExtensionDir, 'options.html'),
        path.join(distExtensionDir, 'options.js')
      ];

      const filesToAudit = [...singleFiles];

      for (const d of dirs) {
        if (fs.existsSync(d)) {
          for (const f of fs.readdirSync(d)) {
            if (f.endsWith('.js') || f.endsWith('.html') || f.endsWith('.json')) {
              filesToAudit.push(path.join(d, f));
            }
          }
        }
      }

      const wildcardViolations = [];
      for (const file of filesToAudit) {
        if (fs.existsSync(file)) {
          const content = fs.readFileSync(file, 'utf8');
          if (/OLLAMA_ORIGINS\s*=\s*['"]?\*['"]?/i.test(content)) {
            wildcardViolations.push(path.relative(projectRoot, file));
          }
        }
      }

      expect(wildcardViolations).toEqual([]);
    });
  });

  describe('4. Cross-Seam Integration & Contract Verification', () => {
    beforeEach(() => {
      clearZeusGlobals();
    });

    afterEach(() => {
      clearZeusGlobals();
    });

    it('Seam 1 & 2: settings partitioning protects API keys while redactor scrubs sensitive tokens', () => {
      loadScript('core/redactor.js');
      loadScript('settings/settings.js');

      const redactor = globalThis.ZeusRedactor;
      const settingsModule = globalThis.ZeusSettings;

      // Ensure public settings mask apiKeys
      const rawSettings = {
        schemaVersion: 3,
        provider: 'openai',
        apiKeys: {
          openai: 'sk-proj-supersecretkey12345678901234567890',
          claude: 'sk-ant-admin01-secretkey12345678901234567890'
        }
      };

      const publicSettings = settingsModule.getPublicSettings(rawSettings);
      expect(publicSettings.apiKeys).toBeUndefined();
      expect(publicSettings.hasApiKey.openai).toBe(true);
      expect(publicSettings.hasApiKey.claude).toBe(true);
      expect(publicSettings.hasApiKey.gemini).toBe(false);
      expect(publicSettings.provider).toBe('openai');
      expect(publicSettings.schemaVersion).toBe(3);

      // Redact prompt containing the secret key and email
      const prompt = `Deploy service with key sk-proj-supersecretkey12345678901234567890 and contact admin@zeus-net.internal`;
      const scrubResult = redactor.scrub(prompt);

      expect(scrubResult.text).not.toContain('sk-proj-');
      expect(scrubResult.text).not.toContain('admin@zeus-net.internal');
      expect(scrubResult.text).toContain('[[ZEUS_SECRET_1]]');
      expect(scrubResult.text).toContain('[[ZEUS_EMAIL_1]]');

      // Rehydrate safely with special characters preserved
      const modelOutput = `Enhanced prompt: Deploy service with key [[ZEUS_SECRET_1]] and contact [[ZEUS_EMAIL_1]] with $100 budget`;
      const hydrated = redactor.hydrate(modelOutput, scrubResult.secretMap);

      expect(hydrated).toContain('sk-proj-supersecretkey12345678901234567890');
      expect(hydrated).toContain('admin@zeus-net.internal');
      expect(hydrated).toContain('$100 budget');
    });

    it('Seam 4: safe Markdown link renderer enforces strict http/https protocols and rejects javascript: URIs', () => {
      loadScript('sidepanel.js');

      const safeDom = globalThis.ZeusSafeDOM;
      expect(safeDom).toBeDefined();

      expect(safeDom.isSafeUrl('https://example.com')).toBe(true);
      expect(safeDom.isSafeUrl('http://example.com/api')).toBe(true);
      expect(safeDom.isSafeUrl('javascript:alert(1)')).toBe(false);
      expect(safeDom.isSafeUrl('data:text/html;base64,PHNjcmlwdD4=')).toBe(false);
      expect(safeDom.isSafeUrl('vbscript:msgbox')).toBe(false);
    });

    it('Seam 5: Ollama command generator produces scoped origin and cross-platform snippets', () => {
      loadScript('providers/utils.js');
      loadScript('providers/ollama.js');

      const meta = globalThis.ZeusOllamaMeta;
      const cmds = meta.buildOllamaCommands('prod-extension-id');

      expect(cmds.origin).toBe('chrome-extension://prod-extension-id');
      expect(cmds.macLinux).toBe('OLLAMA_ORIGINS="chrome-extension://prod-extension-id" ollama serve');
      expect(cmds.macDesktop).toBe('launchctl setenv OLLAMA_ORIGINS "chrome-extension://prod-extension-id"');
      expect(cmds.windowsPowerShell).toBe('$env:OLLAMA_ORIGINS="chrome-extension://prod-extension-id"; ollama serve');
      expect(cmds.windowsCmd).toBe('set OLLAMA_ORIGINS=chrome-extension://prod-extension-id && ollama serve');
    });
  });
});
