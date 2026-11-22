import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import WebSocket from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const extPath = path.join(projectRoot, 'dist', 'extension');

// Candidate Chrome executable paths on Windows
const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe')
];

function findChromeExecutable() {
  for (const p of CHROME_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function sendCDPCommand(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1000000);
    const handler = (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.id === id) {
          ws.off('message', handler);
          if (msg.error) {
            reject(new Error(msg.error.message || JSON.stringify(msg.error)));
          } else {
            resolve(msg.result);
          }
        }
      } catch (_) {}
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function runBrowserVerification() {
  const chromePath = findChromeExecutable();
  if (!chromePath) {
    console.error('CONCRETE BLOCKER: Google Chrome executable not found on host.');
    process.exit(1);
  }

  // Ensure packaged build exists
  const manifestPath = path.join(extPath, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.error('CONCRETE BLOCKER: Packaged build missing in dist/extension. Run npm run build first.');
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const extensionCSP = manifest.content_security_policy?.extension_pages;

  // Spin up an isolated HTTP server delivering packaged extension assets with the exact extension CSP
  const port = 9876;
  const server = http.createServer((req, res) => {
    const cleanUrl = req.url.split('?')[0].replace(/^\//, '') || 'popup.html';
    const targetFile = path.join(extPath, cleanUrl);

    if (!fs.existsSync(targetFile)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }

    let contentType = 'text/plain';
    if (targetFile.endsWith('.html')) contentType = 'text/html';
    else if (targetFile.endsWith('.js')) contentType = 'application/javascript';
    else if (targetFile.endsWith('.css')) contentType = 'text/css';
    else if (targetFile.endsWith('.png')) contentType = 'image/png';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Security-Policy': extensionCSP
    });
    res.end(fs.readFileSync(targetFile));
  });

  await new Promise((resolve) => server.listen(port, resolve));

  // Use strictly isolated temporary profile directory
  const tempProfileDir = path.join(os.tmpdir(), `zeus-test-profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  fs.mkdirSync(tempProfileDir, { recursive: true });

  const cdpPort = 9444;
  console.log(`[Browser Harness] Launching isolated Chrome (CDP port: ${cdpPort}, profile: ${tempProfileDir})`);

  const chromeArgs = [
    '--headless=new',
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${tempProfileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-sync'
  ];

  const chromeProc = spawn(chromePath, chromeArgs, { stdio: 'ignore' });

  const cleanup = () => {
    try {
      if (chromeProc.pid) {
        spawnSync('taskkill', ['/pid', String(chromeProc.pid), '/t', '/f'], { stdio: 'ignore' });
      }
    } catch (_) {}
    try {
      chromeProc.kill();
    } catch (_) {}
    try {
      fs.rmSync(tempProfileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch (_) {}
    try {
      server.close();
    } catch (_) {}
  };

  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(1); });

  try {
    // Wait for Chrome remote debugging endpoint
    let versionInfo = null;
    let pageTarget = null;

    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 400));
      try {
        const vRes = await fetch(`http://127.0.0.1:${cdpPort}/json/version`);
        versionInfo = await vRes.json();
        const tRes = await fetch(`http://127.0.0.1:${cdpPort}/json`);
        const targets = await tRes.json();
        pageTarget = targets.find((t) => t.type === 'page');
        if (versionInfo && pageTarget) break;
      } catch (_) {}
    }

    if (!versionInfo || !pageTarget) {
      throw new Error('Failed to connect to isolated Chrome instance over CDP.');
    }

    console.log(`[Browser Harness] Connected to ${versionInfo.Browser}`);

    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });

    await sendCDPCommand(ws, 'Page.enable');
    await sendCDPCommand(ws, 'Runtime.enable');
    await sendCDPCommand(ws, 'Network.enable');

    // Register synthetic Chrome extension environment and CSP violation listener
    await sendCDPCommand(ws, 'Page.addScriptToEvaluateOnNewDocument', {
      source: `
        window.__ZEUS_CSP_VIOLATIONS__ = [];
        window.addEventListener('securitypolicyviolation', (e) => {
          window.__ZEUS_CSP_VIOLATIONS__.push({
            blockedURI: e.blockedURI,
            violatedDirective: e.violatedDirective,
            effectiveDirective: e.effectiveDirective
          });
        });

        window.chrome = {
          runtime: {
            id: 'zeus-synthetic-verified-id',
            getManifest: () => (${JSON.stringify(manifest)}),
            sendMessage: (msg, cb) => {
              if (cb) setTimeout(() => cb({ success: true, settings: {} }), 0);
              return Promise.resolve({ success: true, settings: {} });
            },
            onMessage: { addListener: () => {} }
          },
          storage: {
            sync: {
              get: (k, cb) => {
                const res = { zeus_settings: { provider: 'openai', model: 'gpt-4o' } };
                if (cb) cb(res);
                return Promise.resolve(res);
              },
              set: (v, cb) => { if (cb) cb(); return Promise.resolve(); }
            },
            local: {
              get: (k, cb) => {
                const res = { zeus_secure_api_keys: {} };
                if (cb) cb(res);
                return Promise.resolve(res);
              },
              set: (v, cb) => { if (cb) cb(); return Promise.resolve(); }
            }
          },
          tabs: {
            query: (q, cb) => {
              const res = [{ id: 1, url: 'https://chatgpt.com/' }];
              if (cb) cb(res);
              return Promise.resolve(res);
            },
            sendMessage: (id, msg, cb) => {
              if (cb) cb({ success: true });
              return Promise.resolve({ success: true });
            }
          },
          sidePanel: {
            open: () => Promise.resolve()
          }
        };
      `
    });

    const pagesToTest = [
      { name: 'Popup', file: 'popup.html', selector: '.zeus-popup' },
      { name: 'Options', file: 'options.html', selector: '.options-container' },
      { name: 'Side Panel', file: 'sidepanel.html', selector: '.sidepanel-container' }
    ];

    const results = [];

    for (const p of pagesToTest) {
      const pageUrl = `http://127.0.0.1:${port}/${p.file}`;
      console.log(`[Browser Harness] Testing ${p.name} (${pageUrl})...`);

      // Reset violations array
      await sendCDPCommand(ws, 'Runtime.evaluate', { expression: 'window.__ZEUS_CSP_VIOLATIONS__ = [];' });

      await sendCDPCommand(ws, 'Page.navigate', { url: pageUrl });
      await new Promise((r) => setTimeout(r, 2200));

      const evalRes = await sendCDPCommand(ws, 'Runtime.evaluate', {
        expression: `
          (async () => {
            try { await document.fonts.ready; } catch (_) {}

            const fonts = [];
            for (const f of document.fonts) {
              fonts.push({ family: f.family, status: f.status, weight: f.weight });
            }

            return {
              title: document.title,
              rendered: Boolean(document.querySelector('${p.selector}')),
              violations: window.__ZEUS_CSP_VIOLATIONS__ || [],
              fonts
            };
          })()
        `,
        awaitPromise: true,
        returnByValue: true
      });

      const val = evalRes?.result?.value || {};
      results.push({
        ...p,
        title: val.title || '',
        rendered: Boolean(val.rendered),
        cspViolations: val.violations || [],
        fonts: val.fonts || []
      });
    }

    ws.close();

    // Print Verification Summary
    console.log('\n============================================================');
    console.log('       ZEUS PACKAGED BROWSER VERIFICATION REPORT            ');
    console.log('============================================================\n');

    let allPassed = true;

    for (const r of results) {
      console.log(`--- [PAGE] ${r.name} (${r.file}) ---`);
      console.log(`  Title:            "${r.title}"`);
      console.log(`  DOM Render:       ${r.rendered ? 'PASS (Found ' + r.selector + ')' : 'FAIL'}`);
      console.log(`  CSP Violations:   ${r.cspViolations.length === 0 ? '0 (CLEAN)' : 'FAIL (' + JSON.stringify(r.cspViolations) + ')'}`);

      const loadedFamilies = [...new Set(r.fonts.filter((f) => f.status === 'loaded').map((f) => f.family))];
      console.log(`  Loaded Fonts:     ${loadedFamilies.join(', ') || 'none'}`);

      if (!r.rendered || r.cspViolations.length > 0 || loadedFamilies.length === 0) {
        allPassed = false;
      }
      console.log('');
    }

    console.log('============================================================');
    console.log(`BROWSER ENGINE: ${versionInfo.Browser}`);
    console.log('ENVIRONMENT NOTE ON UNPACKED EXTENSION CLI SIDELOADING:');
    console.log('Google Chrome >= 137 strictly blocks CLI flags --load-extension');
    console.log('and --disable-extensions-except on official builds for malware');
    console.log('sideload prevention. Packaged assets were therefore verified');
    console.log('in isolated headless Chrome under the exact declared Manifest CSP');
    console.log('with synthetic extension storage and messaging fixtures.');
    console.log('============================================================');
    if (allPassed) {
      console.log('STATUS: ALL BROWSER RENDER, FONT & CSP CHECKS PASSED.');
    } else {
      console.log('STATUS: VERIFICATION FAILED.');
    }
    console.log('============================================================\n');

    process.exit(allPassed ? 0 : 1);
  } finally {
    cleanup();
  }
}

runBrowserVerification().catch((err) => {
  console.error('Verification error:', err);
  process.exit(1);
});
