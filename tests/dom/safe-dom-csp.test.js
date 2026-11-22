/**
 * @vitest-environment jsdom
 */

const fs = require('node:fs');
const path = require('node:path');
const { loadScript, clearZeusGlobals } = require('../utils/runtime');

describe('Safe DOM Rendering & Strict CSP Hardening (Ticket 5)', () => {
  let diffView;

  beforeEach(() => {
    clearZeusGlobals();
    document.body.innerHTML = '';

    diffView = document.createElement('div');
    diffView.id = 'diff-view';
    document.body.appendChild(diffView);

    // Mock chrome APIs required by sidepanel.js
    globalThis.chrome = {
      runtime: {
        id: 'zeus-test-extension',
        connect: () => ({
          onDisconnect: { addListener: () => {} },
          postMessage: () => {}
        }),
        sendMessage: (msg, cb) => {
          if (msg.type === 'sidePanel:getHistory') {
            if (typeof cb === 'function') cb({ history: [] });
          } else if (msg.type === 'sidePanel:getTemplates') {
            if (typeof cb === 'function') cb({ templates: [] });
          }
        }
      },
      storage: {
        local: {
          get: (keys, cb) => { if (typeof cb === 'function') cb({}); },
          set: (obj, cb) => { if (typeof cb === 'function') cb(); }
        },
        sync: {
          get: (keys, cb) => { if (typeof cb === 'function') cb({}); },
          set: (obj, cb) => { if (typeof cb === 'function') cb(); }
        }
      }
    };

    // Load redactor and sidepanel
    loadScript('core/redactor.js');
    loadScript('sidepanel.js');
  });

  afterEach(() => {
    clearZeusGlobals();
    document.body.innerHTML = '';
  });

  describe('Word Diff Safe DOM Construction', () => {
    it('constructs pure DOM nodes with span.diff-add and span.diff-del without innerHTML parsing', () => {
      const original = 'Draft email to customer';
      const enhanced = 'Draft comprehensive email to prioritized customer';

      globalThis.ZeusSafeDOM.renderDiff(original, enhanced);

      expect(diffView.childNodes.length).toBeGreaterThan(0);
      const addedSpans = diffView.querySelectorAll('.diff-add');
      const deletedSpans = diffView.querySelectorAll('.diff-del');

      expect(addedSpans.length).toBeGreaterThan(0);
      expect(deletedSpans.length).toBe(0);

      const addedTexts = Array.from(addedSpans).map((s) => s.textContent);
      expect(addedTexts).toContain('comprehensive');
      expect(addedTexts).toContain('prioritized');
      expect(diffView.textContent).toContain('comprehensive');
      expect(diffView.textContent).toContain('prioritized');
    });

    it('neutralizes malicious HTML script and image payloads as inert text nodes in diffs', () => {
      const original = 'normal prompt';
      const maliciousEnhanced = 'normal prompt <script>alert(1)</script><img src=x onerror="alert(2)">';

      globalThis.ZeusSafeDOM.renderDiff(original, maliciousEnhanced);

      // Verify ZERO executable elements were created
      expect(diffView.querySelector('script')).toBeNull();
      expect(diffView.querySelector('img')).toBeNull();
      expect(diffView.getElementsByTagName('script').length).toBe(0);
      expect(diffView.getElementsByTagName('img').length).toBe(0);

      // Verify the attack string is treated purely as inert text
      expect(diffView.textContent).toContain('<script>alert(1)</script>');
      expect(diffView.textContent).toContain('<img src=x onerror="alert(2)">');
    });

    it('neutralizes SVG and iframe injection payloads in diff rendering', () => {
      const original = '<svg onload=alert(1)>test</svg>';
      const enhanced = '<iframe src="javascript:alert(1)">content</iframe>';

      globalThis.ZeusSafeDOM.renderDiff(original, enhanced);

      expect(diffView.querySelector('svg')).toBeNull();
      expect(diffView.querySelector('iframe')).toBeNull();
      const delText = Array.from(diffView.querySelectorAll('.diff-del')).map((s) => s.textContent).join('');
      const addText = Array.from(diffView.querySelectorAll('.diff-add')).map((s) => s.textContent).join('');
      expect(delText).toContain('<svg');
      expect(delText).toContain('onload=alert(1)>test</svg>');
      expect(addText).toContain('<iframe');
      expect(addText).toContain('src="javascript:alert(1)">content</iframe>');
    });
  });

  describe('Markdown Link Protocol Allowlist', () => {
    it('allows valid https:// and http:// links and creates safe anchor elements', () => {
      const container = document.createElement('div');
      const text = 'Here is the [Official Documentation](https://developer.chrome.com/docs) and [Local HTTP](http://localhost:3000/info).';

      globalThis.ZeusSafeDOM.renderSafeMarkdown(container, text);

      const links = container.querySelectorAll('a');
      expect(links.length).toBe(2);

      expect(links[0].href).toBe('https://developer.chrome.com/docs');
      expect(links[0].textContent).toBe('Official Documentation');
      expect(links[0].target).toBe('_blank');
      expect(links[0].rel).toBe('noopener noreferrer');

      expect(links[1].href).toBe('http://localhost:3000/info');
      expect(links[1].textContent).toBe('Local HTTP');
      expect(links[1].target).toBe('_blank');
      expect(links[1].rel).toBe('noopener noreferrer');
    });

    it('strictly neutralizes javascript: URIs into inert plain text without anchor elements', () => {
      const container = document.createElement('div');
      const maliciousText = 'Click this [Exploit Payload](javascript:alert(document.cookie)) to continue.';

      globalThis.ZeusSafeDOM.renderSafeMarkdown(container, maliciousText);

      // Must NOT create an anchor tag for javascript:
      expect(container.querySelector('a')).toBeNull();
      expect(container.querySelectorAll('a').length).toBe(0);

      // Must be rendered as inert text
      expect(container.textContent).toContain('[Exploit Payload](javascript:alert(document.cookie))');
    });

    it('neutralizes data: URIs and file: URIs into plain text', () => {
      const container = document.createElement('div');
      const text = 'Check [Data URI](data:text/html,<script>alert(1)</script>) and [File](file:///etc/passwd).';

      globalThis.ZeusSafeDOM.renderSafeMarkdown(container, text);

      expect(container.querySelector('a')).toBeNull();
      expect(container.textContent).toContain('[Data URI](data:text/html,<script>alert(1)</script>)');
      expect(container.textContent).toContain('[File](file:///etc/passwd)');
    });

    it('neutralizes relative URLs without protocol', () => {
      const container = document.createElement('div');
      const text = 'Visit [Relative Link](/dashboard/settings).';

      globalThis.ZeusSafeDOM.renderSafeMarkdown(container, text);

      expect(container.querySelector('a')).toBeNull();
      expect(container.textContent).toContain('[Relative Link](/dashboard/settings)');
    });

    it('correctly handles mixed safe and unsafe links in the same text payload', () => {
      const container = document.createElement('div');
      const mixedText = 'Read [Safe](https://example.com) but avoid [Unsafe](javascript:void(0))!';

      globalThis.ZeusSafeDOM.renderSafeMarkdown(container, mixedText);

      const links = container.querySelectorAll('a');
      expect(links.length).toBe(1);
      expect(links[0].textContent).toBe('Safe');
      expect(links[0].href).toBe('https://example.com/');
      expect(container.textContent).toContain('[Unsafe](javascript:void(0))');
    });
  });

  describe('Zero Dynamic HTML Sinks Audit in Source Files', () => {
    it('verifies zero occurrences of innerHTML, outerHTML, or insertAdjacentHTML in core, messaging, adapters, settings, and root scripts', () => {
      const projectRoot = path.resolve(__dirname, '../..');
      const targetDirs = ['core', 'messaging', 'adapters', 'settings', 'providers'];
      const rootJsFiles = [
        'sidepanel.js',
        'popup.js',
        'options.js',
        'content.js',
        'background.js',
        'model-registry.js'
      ];

      const sinkRegex = /\b(?:innerHTML|outerHTML|insertAdjacentHTML)\b/g;
      const violations = [];

      // Check root files
      for (const file of rootJsFiles) {
        const filePath = path.join(projectRoot, file);
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf8');
          const matches = content.match(sinkRegex);
          if (matches) {
            violations.push(`${file}: ${matches.length} matches`);
          }
        }
      }

      // Check target directories
      for (const dir of targetDirs) {
        const dirPath = path.join(projectRoot, dir);
        if (fs.existsSync(dirPath)) {
          const files = fs.readdirSync(dirPath).filter((f) => f.endsWith('.js'));
          for (const file of files) {
            const filePath = path.join(dirPath, file);
            const content = fs.readFileSync(filePath, 'utf8');
            const matches = content.match(sinkRegex);
            if (matches) {
              violations.push(`${dir}/${file}: ${matches.length} matches`);
            }
          }
        }
      }

      expect(violations).toEqual([]);
    });
  });

  describe('Content Security Policy & Font/Style Verification', () => {
    const projectRoot = path.resolve(__dirname, '../..');
    const manifestPath = path.join(projectRoot, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    it('manifest.json declares hardened extension_pages CSP', () => {
      expect(manifest.content_security_policy).toBeDefined();
      const csp = manifest.content_security_policy.extension_pages;
      expect(csp).toBeDefined();

      // Verify lockdown directives
      expect(csp).toContain("script-src 'self'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("base-uri 'none'");
      expect(csp).toContain("frame-ancestors 'none'");

      // Verify Google Fonts and local style allowances
      expect(csp).toContain("style-src 'self' 'unsafe-inline' https://fonts.googleapis.com");
      expect(csp).toContain("font-src 'self' https://fonts.gstatic.com");
    });

    it('confirms popup.html, options.html, and sidepanel.html declare fonts and styles allowed by CSP', () => {
      const htmlFiles = ['popup.html', 'options.html', 'sidepanel.html'];

      for (const fileName of htmlFiles) {
        const filePath = path.join(projectRoot, fileName);
        const html = fs.readFileSync(filePath, 'utf8');

        // Verify font stylesheet uses allowed Google Fonts domain
        const fontMatches = html.match(/href="([^"]*fonts\.googleapis\.com[^"]*)"/g);
        expect(fontMatches).not.toBeNull();
        for (const match of fontMatches) {
          expect(match).toContain('https://fonts.googleapis.com');
        }

        // Verify no unauthorized remote scripts are loaded
        const scriptMatches = Array.from(html.matchAll(/<script\s+[^>]*src="([^"]+)"/g));
        for (const match of scriptMatches) {
          const src = match[1];
          // All script sources must be local (allowed by 'self')
          expect(src.startsWith('http://') || src.startsWith('https://')).toBe(false);
        }

        // Verify no inline <script> blocks exist
        const inlineScriptRegex = /<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi;
        const inlineMatches = html.match(inlineScriptRegex);
        expect(inlineMatches).toBeNull();
      }
    });
  });
});
