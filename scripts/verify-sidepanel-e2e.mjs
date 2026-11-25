import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const extensionPath = path.join(projectRoot, 'dist', 'extension');

function parseArgs(argv) {
  const opts = {};
  for (const arg of argv) {
    if (arg.startsWith('--screenshot-dir=')) {
      opts.screenshotDir = arg.slice('--screenshot-dir='.length);
    }
  }
  return opts;
}

function findChromiumExecutable() {
  const fromEnv = String(process.env.ZEUS_CHROMIUM || '').trim();
  if (fromEnv && fs.existsSync(fromEnv)) {
    return fromEnv;
  }

  const localAppData = process.env.LOCALAPPDATA || '';
  const candidates = [];
  if (localAppData) {
    const msPlaywrightDir = path.join(localAppData, 'ms-playwright');
    const preferred = path.join(msPlaywrightDir, 'chromium-1255', 'chrome-win64', 'chrome.exe');
    if (fs.existsSync(preferred)) {
      return preferred;
    }
    if (fs.existsSync(msPlaywrightDir)) {
      const dirs = fs.readdirSync(msPlaywrightDir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && /^chromium-\d+$/.test(d.name))
        .sort((a, b) => Number(b.name.split('-')[1]) - Number(a.name.split('-')[1]));
      for (const dir of dirs) {
        candidates.push(path.join(msPlaywrightDir, dir.name, 'chrome-win64', 'chrome.exe'));
      }
    }
  }

  const unixCache = path.join(os.homedir(), '.cache', 'ms-playwright');
  if (fs.existsSync(unixCache)) {
    const dirs = fs.readdirSync(unixCache, { withFileTypes: true })
      .filter((d) => d.isDirectory() && /^chromium-\d+$/.test(d.name))
      .sort((a, b) => Number(b.name.split('-')[1]) - Number(a.name.split('-')[1]));
    for (const dir of dirs) {
      candidates.push(path.join(unixCache, dir.name, 'chrome-linux', 'chrome'));
      candidates.push(path.join(unixCache, dir.name, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'));
    }
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

function buildSimulatedChatGptHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ChatGPT</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; height: 100%; background: #212121; color: #ececec; font-family: system-ui, -apple-system, sans-serif; }
    .layout { display: flex; flex-direction: column; height: 100vh; }
    header { height: 52px; border-bottom: 1px solid #303030; display: flex; align-items: center; justify-content: space-between; padding: 0 20px; font-weight: 600; font-size: 15px; }
    .badge { font-size: 12px; color: #9b9b9b; border: 1px solid #3f3f3f; padding: 3px 10px; border-radius: 999px; }
    main { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; padding: 24px 20px 28px; gap: 20px; }
    .thread { width: min(100%, 720px); flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; gap: 10px; }
    .thread h1 { margin: 0; font-size: 26px; font-weight: 600; color: #f5f5f5; }
    .thread p { margin: 0; color: #a1a1aa; font-size: 14px; }
    form.composer { width: min(100%, 720px); background: #2f2f2f; border: 1px solid #444; border-radius: 22px; padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; }
    #prompt-textarea { width: 100%; min-height: 54px; max-height: 200px; overflow-y: auto; outline: none; color: #f5f5f5; font-size: 15px; line-height: 1.5; }
    #prompt-textarea p { margin: 0 0 4px 0; }
    #prompt-textarea p:last-child { margin-bottom: 0; }
    [role="toolbar"] { display: flex; align-items: center; gap: 8px; }
    [role="toolbar"] button { background: #3b3b3b; color: #e5e5e5; border: 1px solid #525252; border-radius: 999px; height: 32px; padding: 0 12px; font-size: 12px; cursor: pointer; }
    button[aria-label="Microphone"] { margin-left: auto; }
    button[data-testid="send-button"] { background: #ffffff; color: #111111; border-color: #ffffff; font-weight: 600; }
  </style>
</head>
<body>
  <div class="layout">
    <header>
      <span>ChatGPT</span>
      <span class="badge">Simulated Composer Surface</span>
    </header>
    <main>
      <div class="thread">
        <h1>What can I help with?</h1>
        <p>Simulated ChatGPT composer for real MV3 content script &amp; side panel E2E verification.</p>
      </div>
      <form class="composer" aria-label="Compose message">
        <div id="prompt-textarea" class="ProseMirror" contenteditable="true" role="textbox" aria-label="Message ChatGPT"><p><br></p></div>
        <div role="toolbar" aria-label="Message actions">
          <button type="button" aria-label="Attach file">+</button>
          <button type="button" aria-label="Model selector">GPT-5</button>
          <button type="button" aria-label="Microphone">Mic</button>
          <button type="submit" data-testid="send-button" aria-label="Send message">Send</button>
        </div>
      </form>
    </main>
  </div>
  <script>
    window.__chatGptSubmissions = 0;
    const form = document.querySelector('form.composer');
    const editor = document.getElementById('prompt-textarea');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      window.__chatGptSubmissions += 1;
    });
    editor.addEventListener('paste', (e) => {
      const text = e.clipboardData ? e.clipboardData.getData('text/plain') : '';
      e.preventDefault();
      const lines = text.split('\\n');
      editor.replaceChildren(...lines.map((line) => {
        const p = document.createElement('p');
        if (line.length > 0) p.textContent = line;
        else p.appendChild(document.createElement('br'));
        return p;
      }));
      editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste', data: text }));
    });
  </script>
</body>
</html>`;
}

async function saveSideBySideScreenshot(context, leftPage, rightPage, outPath, leftWidth = 900, rightWidth = 380, height = 800) {
  await leftPage.setViewportSize({ width: leftWidth, height });
  await rightPage.setViewportSize({ width: rightWidth, height });
  await leftPage.waitForTimeout(180);
  await rightPage.waitForTimeout(180);

  const [leftBuf, rightBuf] = await Promise.all([
    leftPage.screenshot({ type: 'png' }),
    rightPage.screenshot({ type: 'png' })
  ]);

  const compositePage = await context.newPage();
  try {
    await compositePage.setViewportSize({ width: leftWidth + rightWidth, height });
    const leftDataUrl = `data:image/png;base64,${leftBuf.toString('base64')}`;
    const rightDataUrl = `data:image/png;base64,${rightBuf.toString('base64')}`;
    await compositePage.setContent(`<!doctype html>
<html>
<body style="margin:0;padding:0;overflow:hidden;background:#080508;display:flex;width:${leftWidth + rightWidth}px;height:${height}px;">
  <img src="${leftDataUrl}" style="width:${leftWidth}px;height:${height}px;display:block;flex:0 0 ${leftWidth}px;" />
  <div style="width:2px;height:${height}px;background:#00F0FF;flex:0 0 2px;margin-left:-2px;z-index:2;opacity:0.75;"></div>
  <img src="${rightDataUrl}" style="width:${rightWidth}px;height:${height}px;display:block;flex:0 0 ${rightWidth}px;" />
</body>
</html>`, { waitUntil: 'load' });
    await compositePage.screenshot({ path: outPath, type: 'png' });
  } finally {
    await compositePage.close();
  }
}

async function readWorkerStorage(worker) {
  return worker.evaluate(async () => {
    const [syncData, localData] = await Promise.all([
      chrome.storage.sync.get(null),
      chrome.storage.local.get(null)
    ]);
    return { sync: syncData, local: localData };
  });
}

function attachErrorCollector(page, label) {
  const errors = [];
  page.on('pageerror', (err) => {
    errors.push(`[${label}:pageerror] ${err?.message || err}`);
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(`[${label}:console.error] ${msg.text()}`);
    }
  });
  return errors;
}

async function assertNoHorizontalOverflow(page, label) {
  const metrics = await page.evaluate(() => {
    const doc = document.documentElement;
    const content = document.querySelector('.sidepanel-content');
    return {
      docSW: doc.scrollWidth,
      docCW: doc.clientWidth,
      contentSW: content ? content.scrollWidth : 0,
      contentCW: content ? content.clientWidth : 0
    };
  });
  assert(
    metrics.docSW <= metrics.docCW,
    `${label} document horizontal overflow: scrollWidth=${metrics.docSW} > clientWidth=${metrics.docCW}`
  );
  if (metrics.contentCW > 0) {
    assert(
      metrics.contentSW <= metrics.contentCW,
      `${label} .sidepanel-content horizontal overflow: scrollWidth=${metrics.contentSW} > clientWidth=${metrics.contentCW}`
    );
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const screenshotDir = path.resolve(
    args.screenshotDir ||
    process.env.ZEUS_SCREENSHOT_DIR ||
    path.join(os.tmpdir(), `zeus-sidepanel-e2e-shots-${Date.now()}`)
  );
  fs.mkdirSync(screenshotDir, { recursive: true });

  if (!fs.existsSync(path.join(extensionPath, 'manifest.json'))) {
    throw new Error('Packaged build missing in dist/extension. Run npm run build first.');
  }

  const executablePath = findChromiumExecutable();
  const tempProfileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-sidepanel-e2e-'));

  console.log(`[E2E] Launching unpacked extension from ${extensionPath}`);
  console.log(`[E2E] Chromium binary: ${executablePath || 'Playwright default'}`);
  console.log(`[E2E] Screenshot output dir: ${screenshotDir}`);

  const context = await chromium.launchPersistentContext(tempProfileDir, {
    executablePath,
    headless: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--window-size=1280,800'
    ]
  });

  const routeState = {
    geminiProbeMode: 'ok',
    geminiEnhanceMode: 'ok',
    openaiMode: 'ok',
    ollamaMode: 'ok',
    requests: [],
    enhancedOutput:
      'Act as a senior distributed systems engineer.\n' +
      'Design a resilient webhook retry queue with exponential backoff, idempotency keys, and a dead-letter queue.'
  };

  try {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    const worker =
      context.serviceWorkers()[0] ||
      (await context.waitForEvent('serviceworker', { timeout: 10000 }));
    const extensionId = new URL(worker.url()).hostname;
    console.log(`[E2E] Real MV3 service worker active: chrome-extension://${extensionId}`);

    await context.route('**/*', async (route) => {
      const req = route.request();
      const urlStr = req.url();
      const url = new URL(urlStr);

      if (url.protocol === 'chrome-extension:' || url.protocol === 'data:' || url.protocol === 'about:') {
        return route.continue();
      }

      if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
        return route.continue();
      }

      if (url.hostname === 'chatgpt.com') {
        return route.fulfill({
          status: 200,
          contentType: 'text/html; charset=utf-8',
          body: buildSimulatedChatGptHtml()
        });
      }

      const headers = req.headers();
      routeState.requests.push({
        method: req.method(),
        url: urlStr,
        headers
      });

      // Gemini endpoints
      if (url.hostname === 'generativelanguage.googleapis.com') {
        const isEnhance = url.pathname.endsWith(':generateContent');
        const mode = isEnhance ? routeState.geminiEnhanceMode : routeState.geminiProbeMode;
        if (mode === 'auth_failed') {
          return route.fulfill({
            status: 401,
            contentType: 'application/json',
            body: JSON.stringify({
              error: { code: 401, status: 'UNAUTHENTICATED', message: 'API key not valid. Please pass a valid API key.' }
            })
          });
        }
        if (mode === 'rate_limited') {
          return route.fulfill({
            status: 429,
            contentType: 'application/json',
            body: JSON.stringify({
              error: { code: 429, status: 'TOO_MANY_REQUESTS', message: 'Rate limit exceeded. Too many requests.' }
            })
          });
        }
        if (mode === 'quota_exceeded') {
          return route.fulfill({
            status: 429,
            contentType: 'application/json',
            body: JSON.stringify({
              error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Insufficient quota for this billing project.' }
            })
          });
        }
        if (isEnhance) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              candidates: [{ content: { parts: [{ text: routeState.enhancedOutput }] } }]
            })
          });
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ name: 'models/gemini-flash-latest' })
        });
      }

      // OpenAI endpoints
      if (url.hostname === 'api.openai.com') {
        if (routeState.openaiMode === 'auth_failed') {
          return route.fulfill({
            status: 401,
            contentType: 'application/json',
            body: JSON.stringify({ error: { code: 'invalid_api_key', message: 'Incorrect API key provided.' } })
          });
        }
        if (url.pathname.includes('/chat/completions')) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              choices: [{ message: { content: routeState.enhancedOutput } }]
            })
          });
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'gpt-5.4' })
        });
      }

      // Claude endpoints
      if (url.hostname === 'api.anthropic.com') {
        if (url.pathname.endsWith('/messages')) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ content: [{ text: routeState.enhancedOutput }] })
          });
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: [{ id: 'claude-sonnet-4.6' }] })
        });
      }

      // OpenRouter endpoints
      if (url.hostname === 'openrouter.ai') {
        if (url.pathname.includes('/chat/completions')) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ choices: [{ message: { content: routeState.enhancedOutput } }] })
          });
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { label: 'mock-openrouter' } })
        });
      }

      // Ollama local endpoints
      if ((url.hostname === 'localhost' || url.hostname === '127.0.0.1') && url.port === '11434') {
        if (routeState.ollamaMode === 'unreachable') {
          return route.abort('connectionrefused');
        }
        if (routeState.ollamaMode === 'origin_blocked') {
          return route.fulfill({ status: 403, contentType: 'text/plain', body: 'Forbidden' });
        }
        if (url.pathname === '/api/version') {
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version: '0.6.0' }) });
        }
        if (url.pathname === '/api/ps') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ models: [{ name: 'qwen3:8b', model: 'qwen3:8b' }] })
          });
        }
        if (url.pathname === '/api/tags') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              models: [
                { name: 'qwen3:8b', model: 'qwen3:8b' },
                { name: 'llama4', model: 'llama4' }
              ]
            })
          });
        }
        if (url.pathname === '/api/generate') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ response: routeState.enhancedOutput, done: true })
          });
        }
      }

      return route.abort();
    });

    const sidepanelUrl = `chrome-extension://${extensionId}/sidepanel.html`;
    const optionsUrl = `chrome-extension://${extensionId}/options.html`;
    const popupUrl = `chrome-extension://${extensionId}/popup.html`;

    const sidepanelPage = context.pages()[0] || (await context.newPage());
    const sidepanelErrors = attachErrorCollector(sidepanelPage, 'sidepanel');
    await sidepanelPage.setViewportSize({ width: 360, height: 760 });
    await sidepanelPage.goto(sidepanelUrl, { waitUntil: 'networkidle' });
    await sidepanelPage.evaluate(() => document.fonts.ready);

    // ------------------------------------------------------------------------
    // 1. First-Run State & Gating
    // ------------------------------------------------------------------------
    await sidepanelPage.locator('#setup-required-card').waitFor({ state: 'visible', timeout: 5000 });
    await sidepanelPage.waitForFunction(
      () => document.getElementById('sidepanel-readiness-text')?.textContent?.includes('Not configured')
    );
    assert.equal(await sidepanelPage.locator('#strip-status').innerText(), 'Not configured');
    await assertNoHorizontalOverflow(sidepanelPage, 'SidePanel First-Run 360px');

    const shot1 = path.join(screenshotDir, 'qa-1-sidepanel-setup-required.png');
    await sidepanelPage.screenshot({ path: shot1, type: 'png' });

    // Clicking Enhance while unconfigured must gate locally without calling any upstream API
    await sidepanelPage.locator('#original-input').fill('help me write a webhook queue');
    await sidepanelPage.locator('#btn-enhance').click();
    await sidepanelPage.waitForTimeout(200);
    assert.equal(routeState.requests.length, 0, 'Unconfigured #btn-enhance must gate before hitting network');
    assert.equal(await sidepanelPage.locator('#setup-required-card').isVisible(), true);
    assert.equal(await sidepanelPage.locator('#enhanced-output').inputValue(), '');

    console.log('[E2E] 1. First-run setup-required & unconfigured gating PASS');

    // ------------------------------------------------------------------------
    // 2. Configure Gemini, Storage Separation, Write-Only Masking & Test Probes
    // ------------------------------------------------------------------------
    await sidepanelPage.locator('#btn-setup-configure').click();
    await sidepanelPage.locator('#tab-settings.active').waitFor({ state: 'visible' });

    await sidepanelPage.locator('#sp-provider').selectOption('gemini');
    await sidepanelPage.waitForTimeout(150);
    await sidepanelPage.locator('#sp-model').selectOption('gemini-3.1-pro-preview');
    await sidepanelPage.waitForTimeout(150);

    const keyInput = sidepanelPage.locator('#sp-api-key');
    assert.equal(await keyInput.getAttribute('type'), 'password');
    const mockGeminiKey = 'AIzaMockGeminiSecretKey1234567890';
    await keyInput.fill(mockGeminiKey);
    await sidepanelPage.locator('#sp-btn-toggle-key').click();
    assert.equal(await keyInput.getAttribute('type'), 'text');
    await sidepanelPage.locator('#sp-btn-toggle-key').click();
    assert.equal(await keyInput.getAttribute('type'), 'password');

    await sidepanelPage.locator('#sp-btn-save-key').click();
    await sidepanelPage.waitForFunction(
      () => document.getElementById('sp-key-status')?.textContent?.trim() === 'API key configured'
    );
    assert.equal(await keyInput.inputValue(), '', 'Password input must clear/stay blank after saving key');
    assert.equal(await sidepanelPage.locator('#sp-readiness-label').innerText(), 'Configured, not tested');

    const storedAfterGeminiSave = await readWorkerStorage(worker);
    assert.equal(storedAfterGeminiSave.local?.apiKeys?.gemini, mockGeminiKey);
    assert.equal(storedAfterGeminiSave.sync?.schemaVersion, 3);
    assert.equal(storedAfterGeminiSave.sync?.provider, 'gemini');
    assert.equal(storedAfterGeminiSave.sync?.models?.gemini, 'gemini-3.1-pro-preview');
    assert.equal('apiKeys' in (storedAfterGeminiSave.sync || {}), false, 'chrome.storage.sync must NEVER hold apiKeys');
    for (const k of Object.keys(storedAfterGeminiSave.sync || {})) {
      assert(!/api[_-]?key/i.test(k), `Unexpected key-like field in sync storage: ${k}`);
    }

    // Mocked testConnection -> Connection verified
    routeState.requests.length = 0;
    routeState.geminiProbeMode = 'ok';
    await sidepanelPage.locator('#sp-btn-test').click();
    await sidepanelPage.waitForFunction(
      () => document.getElementById('sp-readiness-label')?.textContent?.trim() === 'Connection verified'
    );
    const geminiProbeReq = routeState.requests.find((r) => r.url.includes('generativelanguage.googleapis.com'));
    assert(geminiProbeReq, 'Expected real background probe to generativelanguage.googleapis.com');
    assert.equal(geminiProbeReq.headers['x-goog-api-key'], mockGeminiKey);
    assert(!geminiProbeReq.url.includes(mockGeminiKey), 'Gemini API key must never appear in URL query');

    await assertNoHorizontalOverflow(sidepanelPage, 'SidePanel Settings Verified 360px');
    await sidepanelPage.waitForFunction(
      () => document.querySelectorAll('#sidepanel-toast-holder .zeus-toast').length === 0,
      null,
      { timeout: 6000 }
    );
    const shot2 = path.join(screenshotDir, 'qa-2-sidepanel-settings-verified.png');
    await sidepanelPage.screenshot({ path: shot2, type: 'png' });

    // Error mocks: Authentication failed, Rate limited & Quota exceeded
    routeState.geminiProbeMode = 'auth_failed';
    await sidepanelPage.locator('#sp-btn-test').click();
    await sidepanelPage.waitForFunction(
      () => document.getElementById('sp-readiness-label')?.textContent?.trim() === 'Authentication failed'
    );

    routeState.geminiProbeMode = 'rate_limited';
    await sidepanelPage.locator('#sp-btn-test').click();
    await sidepanelPage.waitForFunction(
      () => document.getElementById('sp-readiness-label')?.textContent?.trim() === 'Rate limited'
    );

    routeState.geminiProbeMode = 'quota_exceeded';
    await sidepanelPage.locator('#sp-btn-test').click();
    await sidepanelPage.waitForFunction(
      () => document.getElementById('sp-readiness-label')?.textContent?.trim() === 'Quota exceeded'
    );

    routeState.geminiProbeMode = 'ok';
    await sidepanelPage.locator('#sp-btn-test').click();
    await sidepanelPage.waitForFunction(
      () => document.getElementById('sp-readiness-label')?.textContent?.trim() === 'Connection verified'
    );

    console.log('[E2E] 2. Gemini key storage isolation, write-only UI, and Connection/Auth/RateLimit diagnostics PASS');

    // ------------------------------------------------------------------------
    // 3. Reload Persistence, Provider Switching, Remove Key, Keyboard & Widths
    // ------------------------------------------------------------------------
    await sidepanelPage.reload({ waitUntil: 'networkidle' });
    await sidepanelPage.waitForFunction(
      () => document.getElementById('strip-provider')?.textContent?.trim() === 'Gemini'
    );
    assert.equal(await sidepanelPage.locator('#setup-required-card').isVisible(), false);
    assert.equal(await sidepanelPage.locator('#strip-model').innerText(), 'Gemini 3.1 Pro Preview');

    await sidepanelPage.locator('#btn-open-settings').click();
    await sidepanelPage.locator('#tab-settings.active').waitFor({ state: 'visible' });
    assert.equal(await sidepanelPage.locator('#sp-key-status').innerText(), 'API key configured');
    assert.equal(await keyInput.inputValue(), '');

    // Switch gemini -> openai
    const mockOpenAiKey = 'sk-mock-openai-secret-1234567890';
    await sidepanelPage.locator('#sp-provider').selectOption('openai');
    await sidepanelPage.waitForTimeout(150);
    await sidepanelPage.locator('#sp-model').selectOption('gpt-5.4');
    await keyInput.fill(mockOpenAiKey);
    await sidepanelPage.locator('#sp-btn-save-key').click();
    await sidepanelPage.waitForFunction(
      () => document.getElementById('sp-key-status')?.textContent?.trim() === 'API key configured'
    );
    await sidepanelPage.locator('#sp-btn-test').click();
    await sidepanelPage.waitForFunction(
      () => document.getElementById('sp-readiness-label')?.textContent?.trim() === 'Connection verified'
    );

    // Switch openai -> ollama
    await sidepanelPage.locator('#sp-provider').selectOption('ollama');
    await sidepanelPage.locator('#sp-ollama-card').waitFor({ state: 'visible' });
    await sidepanelPage.locator('#sp-btn-detect-ollama').click();
    await sidepanelPage.waitForFunction(
      () => document.querySelectorAll('#sp-ollama-discovered .ollama-chip').length >= 2
    );
    assert.equal(await sidepanelPage.locator('#sp-ollama-model').inputValue(), 'qwen3:8b');
    await sidepanelPage.locator('#sp-btn-test').click();
    await sidepanelPage.waitForFunction(
      () => document.getElementById('sp-readiness-label')?.textContent?.trim() === 'Connection verified'
    );

    // Switch ollama -> auto
    await sidepanelPage.locator('#sp-provider').selectOption('auto');
    await sidepanelPage.locator('#sp-auto-card').waitFor({ state: 'visible' });
    const autoText = await sidepanelPage.locator('#sp-auto-providers').textContent();
    assert(
      autoText &&
      autoText.includes('Gemini') &&
      autoText.includes('OpenAI') &&
      autoText.includes('Ollama'),
      `Unexpected #sp-auto-providers text: ${autoText}`
    );

    const storedAfterSwitching = await readWorkerStorage(worker);
    assert.equal(storedAfterSwitching.local?.apiKeys?.gemini, mockGeminiKey);
    assert.equal(storedAfterSwitching.local?.apiKeys?.openai, mockOpenAiKey);
    assert.equal(storedAfterSwitching.sync?.models?.gemini, 'gemini-3.1-pro-preview');
    assert.equal(storedAfterSwitching.sync?.models?.openai, 'gpt-5.4');
    assert.equal(storedAfterSwitching.sync?.ollama?.model, 'qwen3:8b');

    // Switch back to openai and exercise Remove Key (cancel then confirm)
    await sidepanelPage.locator('#sp-provider').selectOption('openai');
    await sidepanelPage.waitForTimeout(150);
    assert.equal(await sidepanelPage.locator('#sp-model').inputValue(), 'gpt-5.4');
    assert.equal(await sidepanelPage.locator('#sp-key-status').innerText(), 'API key configured');

    await sidepanelPage.locator('#sp-btn-remove-key').click();
    await sidepanelPage.locator('#sp-remove-key-confirm').waitFor({ state: 'visible' });
    await sidepanelPage.locator('#sp-btn-cancel-remove').click();
    assert.equal((await readWorkerStorage(worker)).local?.apiKeys?.openai, mockOpenAiKey);

    await sidepanelPage.locator('#sp-btn-remove-key').click();
    await sidepanelPage.locator('#sp-btn-confirm-remove').click();
    await sidepanelPage.waitForFunction(
      () => document.getElementById('sp-key-status')?.textContent?.trim() === 'Not configured'
    );
    const storedAfterRemove = await readWorkerStorage(worker);
    assert.equal(storedAfterRemove.local?.apiKeys?.openai, '');
    assert.equal(storedAfterRemove.local?.apiKeys?.gemini, mockGeminiKey, 'Removing OpenAI key must keep Gemini key intact');

    // Keyboard Tab navigation + Escape back to Enhance
    await sidepanelPage.locator('#btn-back-to-enhance').focus();
    const tabbedIds = [];
    for (let i = 0; i < 6; i++) {
      await sidepanelPage.keyboard.press('Tab');
      tabbedIds.push(await sidepanelPage.evaluate(() => document.activeElement?.id || document.activeElement?.tagName));
    }
    assert(tabbedIds.includes('sp-btn-test') && tabbedIds.includes('sp-provider'), `Unexpected Tab order: ${JSON.stringify(tabbedIds)}`);

    // Check narrow (320px, 360px) and wider (480px) widths in both Settings & Editor views
    for (const width of [320, 360, 480]) {
      await sidepanelPage.setViewportSize({ width, height: 760 });
      await sidepanelPage.waitForTimeout(100);
      await assertNoHorizontalOverflow(sidepanelPage, `SidePanel Settings ${width}px`);
    }
    await sidepanelPage.keyboard.press('Escape');
    await sidepanelPage.locator('#tab-editor.active').waitFor({ state: 'visible' });
    for (const width of [320, 360, 480]) {
      await sidepanelPage.setViewportSize({ width, height: 760 });
      await sidepanelPage.waitForTimeout(100);
      await assertNoHorizontalOverflow(sidepanelPage, `SidePanel Editor ${width}px`);
    }

    console.log('[E2E] 3. Reload persistence, provider switching, key removal, keyboard nav & 320/360/480px widths PASS');

    // ------------------------------------------------------------------------
    // 4. Live Cross-Interface Sync (sidepanel <-> options <-> popup)
    // ------------------------------------------------------------------------
    const optionsPage = await context.newPage();
    const optionsErrors = attachErrorCollector(optionsPage, 'options');
    await optionsPage.setViewportSize({ width: 900, height: 800 });
    await optionsPage.goto(optionsUrl, { waitUntil: 'networkidle' });

    const popupPage = await context.newPage();
    const popupErrors = attachErrorCollector(popupPage, 'popup');
    await popupPage.setViewportSize({ width: 360, height: 760 });
    await popupPage.goto(popupUrl, { waitUntil: 'networkidle' });

    // Edit in Side Panel -> verify Options & Popup update live
    await sidepanelPage.setViewportSize({ width: 380, height: 800 });
    await sidepanelPage.locator('#btn-open-settings').click();
    await sidepanelPage.locator('#tab-settings.active').waitFor({ state: 'visible' });
    await sidepanelPage.locator('#sp-provider').selectOption('openai');
    await sidepanelPage.waitForTimeout(150);
    await sidepanelPage.locator('#sp-model').selectOption('gpt-5.4');
    await sidepanelPage.locator('#sp-api-key').fill('sk-live-sync-openai-9999');
    await sidepanelPage.locator('#sp-btn-save-key').click();
    await sidepanelPage.waitForFunction(
      () => document.getElementById('sp-key-status')?.textContent?.trim() === 'API key configured'
    );
    await sidepanelPage.locator('#sp-btn-test').click();
    await sidepanelPage.waitForFunction(
      () => document.getElementById('sp-readiness-label')?.textContent?.trim() === 'Connection verified'
    );

    await optionsPage.waitForFunction(
      () =>
        document.getElementById('aiProvider')?.value === 'openai' &&
        document.getElementById('providerModel')?.value === 'gpt-5.4' &&
        document.getElementById('openaiKeyStatus')?.textContent?.trim() === 'API key configured' &&
        document.getElementById('optionsHeaderReadiness')?.textContent?.trim() === 'Connection verified'
    );
    assert.equal(await optionsPage.locator('#openaiApiKey').inputValue(), '');

    await popupPage.waitForFunction(
      () =>
        document.getElementById('aiProvider')?.value === 'openai' &&
        document.getElementById('providerModel')?.value === 'gpt-5.4' &&
        document.getElementById('openaiKeyStatus')?.textContent?.trim() === 'API key configured' &&
        document.getElementById('popupStatusText')?.textContent?.trim() === 'Connection verified'
    );
    assert.equal(await popupPage.locator('#openaiApiKey').inputValue(), '');

    // Edit in Options -> verify Side Panel updates live
    await optionsPage.locator('#aiProvider').selectOption('gemini');
    await optionsPage.waitForTimeout(150);
    await optionsPage.locator('#modelPickerTrigger').click();
    await optionsPage.locator('#modelOptionGroups .model-option[data-value="gemini-flash-latest"]').click();
    await optionsPage.locator('#saveBtn').click();
    await optionsPage.waitForFunction(() => document.getElementById('status')?.textContent?.includes('Saved'));

    await sidepanelPage.waitForFunction(
      () =>
        document.getElementById('sp-provider')?.value === 'gemini' &&
        document.getElementById('sp-model')?.value === 'gemini-flash-latest' &&
        document.getElementById('strip-provider')?.textContent?.trim() === 'Gemini' &&
        document.getElementById('strip-model')?.textContent?.trim() === 'Gemini Flash'
    );

    await sidepanelPage.waitForFunction(
      () => document.querySelectorAll('#sidepanel-toast-holder .zeus-toast').length === 0,
      null,
      { timeout: 6000 }
    );
    const shot3 = path.join(screenshotDir, 'qa-3-cross-ui-live-sync.png');
    await saveSideBySideScreenshot(context, optionsPage, sidepanelPage, shot3, 900, 380, 800);

    assert.equal(optionsErrors.length, 0, `Options errors: ${optionsErrors.join('; ')}`);
    assert.equal(popupErrors.length, 0, `Popup errors: ${popupErrors.join('; ')}`);
    await popupPage.close();
    await optionsPage.close();

    console.log('[E2E] 4. Live cross-interface sync (Side Panel <-> Options <-> Popup) PASS');

    // ------------------------------------------------------------------------
    // 5. End-to-End Enhance & Insert alongside Simulated ChatGPT + Copy/History/Templates
    // ------------------------------------------------------------------------
    await sidepanelPage.locator('#btn-back-to-enhance').click();
    await sidepanelPage.locator('#tab-editor.active').waitFor({ state: 'visible' });

    const chatPage = await context.newPage();
    const chatErrors = attachErrorCollector(chatPage, 'chatgpt');
    await chatPage.setViewportSize({ width: 900, height: 800 });
    await chatPage.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded' });
    await chatPage.locator('zeus-composer-root').waitFor({ state: 'attached', timeout: 6000 });
    await chatPage.waitForTimeout(450);

    const injectedCheck = await worker.evaluate(async () => {
      const tabs = await chrome.tabs.query({ url: 'https://chatgpt.com/*' });
      const res = await chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: () => ({
          adapter: globalThis.ZeusContentAdapters?.find((a) => a.matches(location.hostname))?.id,
          hasRoot: Boolean(document.querySelector('zeus-composer-root'))
        })
      });
      return res[0].result;
    });
    assert.equal(injectedCheck.adapter, 'chatgpt');
    assert.equal(injectedCheck.hasRoot, true);

    const chatEditor = chatPage.locator('#prompt-textarea');
    await chatEditor.focus();
    const originalDraft = 'write a node webhook queue';
    await chatPage.keyboard.insertText(originalDraft);
    await chatPage.waitForTimeout(150);

    // Keep chatPage active in currentWindow when triggering capture (matching docked Chrome side panel behavior)
    await chatPage.bringToFront();
    await chatPage.waitForTimeout(150);
    await sidepanelPage.evaluate(() => document.getElementById('btn-capture').click());
    await sidepanelPage.waitForFunction(
      (expected) => document.getElementById('original-input')?.value === expected,
      originalDraft
    );

    // Enhance via mocked Gemini API
    await sidepanelPage.locator('#btn-enhance').click();
    await sidepanelPage.waitForFunction(
      (expected) => document.getElementById('enhanced-output')?.value === expected,
      routeState.enhancedOutput
    );
    assert.equal(await sidepanelPage.locator('#diff-card').isVisible(), true);
    assert((await sidepanelPage.locator('#diff-view').innerText()).length > 0);
    assert.equal(await sidepanelPage.locator('#editor-empty-guidance').isVisible(), false);

    // Copy to clipboard
    await sidepanelPage.locator('#btn-copy').click();
    await sidepanelPage.waitForTimeout(150);
    const copiedText = await sidepanelPage.evaluate(() => navigator.clipboard.readText());
    assert.equal(copiedText.replace(/\r\n/g, '\n'), routeState.enhancedOutput);

    // Insert into simulated ChatGPT composer & verify no auto-submit
    await chatPage.bringToFront();
    await chatPage.waitForTimeout(150);
    await sidepanelPage.evaluate(() => document.getElementById('btn-insert').click());
    await chatPage.waitForFunction(
      (expected) => {
        const el = document.getElementById('prompt-textarea');
        if (!el) return false;
        const text = [...el.children].map((p) => p.innerText.replace(/\n$/, '')).join('\n');
        return text === expected;
      },
      routeState.enhancedOutput
    );
    assert.equal(await chatPage.evaluate(() => window.__chatGptSubmissions), 0, 'Insert must NOT auto-submit ChatGPT form');

    await sidepanelPage.waitForFunction(
      () => document.querySelectorAll('#sidepanel-toast-holder .zeus-toast').length === 0,
      null,
      { timeout: 6000 }
    );
    const shot4 = path.join(screenshotDir, 'qa-4-sidepanel-chatgpt-e2e.png');
    await saveSideBySideScreenshot(context, chatPage, sidepanelPage, shot4, 900, 380, 800);

    // History tab check & restore
    await sidepanelPage.locator('.tab-btn[data-tab="history"]').click();
    await sidepanelPage.locator('#history-list .history-item').first().waitFor({ state: 'visible' });
    const historyMeta = await sidepanelPage.locator('#history-list .history-item .history-meta').first().innerText();
    assert(historyMeta.includes('chatgpt.com'), `Expected chatgpt.com in history meta, got: ${historyMeta}`);

    await sidepanelPage.locator('#original-input').evaluate((el) => { el.value = ''; });
    await sidepanelPage.locator('#history-list .history-item button', { hasText: 'RESTORE' }).first().click();
    await sidepanelPage.locator('#tab-editor.active').waitFor({ state: 'visible' });
    assert.equal(await sidepanelPage.locator('#original-input').inputValue(), originalDraft);
    assert.equal(await sidepanelPage.locator('#enhanced-output').inputValue(), routeState.enhancedOutput);

    // Templates tab check (create -> fill modal -> inject)
    await sidepanelPage.locator('.tab-btn[data-tab="templates"]').click();
    await sidepanelPage.locator('#btn-new-template').click();
    await sidepanelPage.locator('#template-name').fill('API Design');
    await sidepanelPage.locator('#template-text').fill('Design a {{style}} API for {{service}}');
    await sidepanelPage.locator('#btn-save-template').click();
    await sidepanelPage.locator('#template-list .template-item').first().waitFor({ state: 'visible' });
    await sidepanelPage.locator('#template-list .template-item').first().click();

    await sidepanelPage.locator('#modal-fill-variables').waitFor({ state: 'visible' });
    await sidepanelPage.locator('#modal-variables-inputs input[data-variable="style"]').fill('REST');
    await sidepanelPage.locator('#modal-variables-inputs input[data-variable="service"]').fill('webhooks');
    await sidepanelPage.locator('#btn-modal-fill').click();
    await sidepanelPage.locator('#tab-editor.active').waitFor({ state: 'visible' });
    assert.equal(await sidepanelPage.locator('#original-input').inputValue(), 'Design a REST API for webhooks');

    assert.equal(sidepanelErrors.length, 0, `SidePanel errors: ${sidepanelErrors.join('; ')}`);
    assert.equal(chatErrors.length, 0, `ChatGPT errors: ${chatErrors.join('; ')}`);

    await chatPage.close();
    console.log('[E2E] 5. ChatGPT capture -> enhance -> diff -> insert (0 submit) -> copy -> history -> templates PASS');
    console.log('\nALL SIDEPANEL UNPACKED-EXTENSION E2E WORKFLOWS PASSED.');
    console.log(`SCREENSHOTS: ${shot1}, ${shot2}, ${shot3}, ${shot4}`);
  } finally {
    await context.close().catch(() => {});
    fs.rmSync(tempProfileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

main().catch((err) => {
  console.error('[E2E] FAILED:', err);
  process.exit(1);
});
