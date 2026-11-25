import { build } from 'esbuild';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';

const platforms = {
  chatgpt: 'https://chatgpt.com/',
  gemini: 'https://gemini.google.com/app',
  claude: 'https://claude.ai/new',
  deepseek: 'https://chat.deepseek.com/',
  grok: 'https://grok.com/',
  openrouter: 'https://openrouter.ai/chat',
  kimi: 'https://www.kimi.com/',
  generic: 'https://deepseek.com/'
};
const extension = path.resolve('dist/extension');
const screenshots = path.resolve('dist/composer-evidence');
const enhanced = 'Plan a café visit ⚡\nInclude opening hours.';
const live = process.argv.includes('--live');
const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  headless: true,
  executablePath: process.env.ZEUS_CHROMIUM || undefined,
  args: ['--disable-extensions-except=' + extension, '--load-extension=' + extension]
});
const worker =
  context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker', { timeout: 10000 }));
const page = context.pages()[0];
const tabId = await worker.evaluate(
  async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0].id
);
async function inspect() {
  return worker.evaluate(
    async (tabId) =>
      (
        await chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            const site = globalThis.ZeusContentAdapters?.find((a) => a.matches(location.hostname));
            const editor = globalThis.ZeusContentRuntime?.getActiveEditor();
            const host = document.querySelector('zeus-composer-root');
            const shadow = host && chrome.dom.openOrClosedShadowRoot(host);
            const btn = shadow?.querySelector('.action');
            const r = btn?.getBoundingClientRect();
            const rect = (el) => el.getBoundingClientRect().toJSON();
            return {
              adapter: site?.id,
              editors: site?.findEditors().length,
              kind: editor && site.getCapabilities(editor).kind,
              visible: !!btn && getComputedStyle(btn).visibility === 'visible',
              svg:
                !!btn?.querySelector('svg path') &&
                getComputedStyle(btn.querySelector('svg')).display !== 'none',
              ghost: !!shadow?.querySelector('.zeus-ghost:not([hidden])'),
              paused: !!shadow?.querySelector('.zeus-copilot-paused:not([hidden])'),
              dialogOpen: shadow?.querySelector('dialog').open,
              preview: !!shadow && !shadow.querySelector('.notice button').hidden,
              reviews: shadow?.querySelector('dialog textarea').value.length,
              placement: btn?.dataset.placement,
              state: btn?.dataset.state,
              status: shadow?.querySelector('[role=status]').textContent,
              hit: !!r && document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === host,
              button: r?.toJSON(),
              editor: editor && rect(editor),
              root: editor && rect(site.getComposerRoot(editor)),
              controls:
                editor &&
                site
                  .getNativeControls(site.getComposerRoot(editor))
                  .filter((e) => e !== editor && !e.contains(editor))
                  .map(rect),
              viewport: {
                width: document.documentElement.clientWidth,
                height: document.documentElement.clientHeight
              },
              scrollWidth: document.documentElement.scrollWidth
            };
          }
        })
      )[0].result,
    tabId
  );
}
async function frames() {
  await page.evaluate(
    () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))))
  );
}
function geometry(s) {
  assert(s.visible && s.svg && s.hit, 'The visible bolt must have a reachable hit target');
  const b = s.button;
  assert(
    b.left >= 0 && b.top >= 0 && b.right <= s.viewport.width && b.bottom <= s.viewport.height,
    'viewport containment'
  );
  for (const r of [s.editor, ...s.controls].filter((r) => r?.width && r.height)) {
    assert(
      b.right <= r.left || b.left >= r.right || b.bottom <= r.top || b.top >= r.bottom,
      'editor/control overlap'
    );
  }
}

async function liveCheck(id, url) {
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page
      .locator('zeus-composer-root')
      .waitFor({ state: 'attached', timeout: 6500 })
      .catch(() => {});
    await frames();
    await page.waitForTimeout(650); // Allow client-side hydration to replace the initial form.
    const info = await inspect();
    if (info.visible) geometry(info);
    const result = {
      id,
      http: response?.status(),
      url: page.url().split('?')[0],
      title: await page.title(),
      editors: info.editors,
      kind: info.kind,
      visible: info.visible,
      placement: info.placement,
      hit: info.hit
    };
    if (info.editors === 1 && response?.ok()) {
      let visible = 0,
        hidden = 0;
      for (const width of [375, 768, 1024, 1440, 1920]) {
        await page.setViewportSize({ width, height: 800 });
        for (const factor of [0.8, 1, 1.25, 1.5]) {
          await zoom(factor);
          const layout = await inspect();
          if (layout.visible) {
            geometry(layout);
            visible++;
          } else hidden++;
        }
      }
      Object.assign(result, { visibleLayouts: visible, hiddenLayouts: hidden });
      await zoom(1);
      await page.setViewportSize({ width: 1280, height: 800 });
      await frames();
      const target = page.locator('textarea:visible,[contenteditable=true]:visible');
      const draft = 'List two colors.';
      if (
        (await target.count()) === 1 &&
        !(await target.evaluate((el) => (el.value ?? el.innerText).trim()))
      ) {
        await target.focus();
        await page.keyboard.insertText(draft);
        const current = await inspect();
        if (current.visible && current.hit) {
          await clickBolt();
          const finished = await waitState(
            (s) => s.state === 'success' || s.preview || s.state === 'error',
            'Live draft result'
          );
          result.enhancement = finished.preview ? 'preview' : finished.state;
          result.readback = await target.evaluate(
            (el, expected) => (el.value ?? el.innerText).replace(/\n+/g, '\n').trim() === expected,
            enhanced
          );
        } else result.enhancement = 'inline hidden';
        const disposable = await target.evaluate((el) =>
          (el.value ?? el.innerText).trim().replace(/\n+/g, '\n')
        );
        if (disposable === draft || disposable === enhanced) {
          await target.focus();
          await page.keyboard.press('ControlOrMeta+a');
          await page.keyboard.press('Backspace');
        }
      }
    }
    console.log(JSON.stringify(result));
  } catch (err) {
    console.log(id, err.message.split('\n')[0]);
    if (err.code === 'ERR_ASSERTION') process.exitCode = 1;
  }
}

try {
  console.log('Chromium', context.browser()?.version() || (await page.evaluate(() => navigator.userAgent)));
  await setupProvider();
  if (!live) await setupFixtures();
  for (const [id, url] of Object.entries(platforms)) {
    if (process.env.ZEUS_SITE && id !== process.env.ZEUS_SITE) continue;
    if (live) await liveCheck(id, url);
    else await fixtureCheck(id, url);
  }
} finally {
  await context.close();
}

async function setupFixtures() {
  const { outputFiles } = await build({
    entryPoints: ['tests/harness/harness.mjs'],
    bundle: true,
    format: 'iife',
    write: false
  });
  const css = await fs.readFile('tests/harness/harness.css', 'utf8');
  const fixtures = new Map(
    await Promise.all(
      Object.entries(platforms).map(async ([id, url]) => [
        new URL(url).hostname,
        await fs.readFile('tests/harness/' + id + '.html', 'utf8')
      ])
    )
  );
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (!fixtures.has(url.hostname)) return route.abort();
    if (url.pathname === '/harness.js')
      return route.fulfill({ contentType: 'application/javascript', body: outputFiles[0].text });
    if (url.pathname === '/harness.css') return route.fulfill({ contentType: 'text/css', body: css });
    return route.fulfill({ contentType: 'text/html; charset=utf-8', body: fixtures.get(url.hostname) });
  });
  await fs.mkdir(screenshots, { recursive: true });
}
async function setupProvider() {
  // Only the provider's HTTP response is synthetic. The content script, IPC,
  // service worker, storage, redactor, router and provider transport are packaged code.
  await worker.evaluate(async (text) => {
    await ZeusSettingsStore.update({
      provider: 'ollama',
      ollama: { model: 'fixture' },
      copilotEnabled: false
    });
    globalThis.fetch = async (url, options) => {
      if (!String(url).startsWith('http://localhost:11434/'))
        throw Error('Unexpected fixture network request');
      if (globalThis.fixtureGate) await globalThis.fixtureGate;
      if (!options?.body) return Response.json({ version: 'fixture', models: [{ name: 'fixture' }] });
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (JSON.parse(options.body).stream)
        return new Response(
          JSON.stringify({ response: ' in detail', done: false }) +
            '\n' +
            JSON.stringify({ response: '', done: true }) +
            '\n',
          { headers: { 'Content-Type': 'application/x-ndjson' } }
        );
      return Response.json({ response: globalThis.fixtureResponse ?? text, done: true });
    };
  }, enhanced);
}
async function waitState(predicate, description) {
  const end = Date.now() + 5000;
  let info;
  do {
    await frames();
    info = await inspect();
    if (predicate(info)) return info;
  } while (Date.now() < end);
  if (!live)
    console.log(
      await page.evaluate(() => ({
        changes: window.transactions,
        model: window.readHostModel(),
        html: document.querySelector('form [contenteditable]')?.outerHTML
      }))
    );
  throw new Error(description + ': ' + JSON.stringify(info));
}
async function zoom(factor) {
  await worker.evaluate(([id, factor]) => chrome.tabs.setZoom(id, factor), [tabId, factor]);
  assert.equal(await worker.evaluate((id) => chrome.tabs.getZoom(id), tabId), factor);
  await frames();
}
async function clickBolt() {
  const info = await waitState((s) => s.visible && s.hit, 'Visible toolbar action');
  await page.mouse.click(info.button.x + info.button.width / 2, info.button.y + info.button.height / 2);
}
async function fixtureCheck(id, url) {
  const single = id === 'generic';
  const expected = single ? 'Plan a café visit ⚡' : enhanced;
  await worker.evaluate((text) => {
    globalThis.fixtureResponse = text;
  }, expected);
  await page.goto(url);
  if (id === 'generic') {
    // deepseek.com is matched by deepseek.js before generic.js; promote generic in this tab so generic.js itself is exercised.
    await worker.evaluate(async (id) => {
      await chrome.scripting.executeScript({
        target: { tabId: id },
        func: () => {
          const list = globalThis.ZeusContentAdapters;
          const idx = Array.isArray(list) ? list.findIndex((a) => a.id === 'generic') : -1;
          if (idx > 0) {
            const [genericAdapter] = list.splice(idx, 1);
            list.unshift(genericAdapter);
          }
          globalThis.ZeusContentRuntime?.destroy();
        }
      });
      await chrome.scripting.executeScript({
        target: { tabId: id },
        files: ['content.js']
      });
    }, tabId);
  }
  await zoom(1);
  let info = await waitState((s) => s.visible && s.hit, 'Fixture discovery ' + id);
  assert.equal(info.adapter, id);
  assert.equal(info.editors, 1);
  geometry(info);
  assert(
    await page.evaluate(() => {
      const form = document.querySelector('form');
      return (
        form.offsetHeight === initialGeometry.height &&
        form.offsetWidth === initialGeometry.width &&
        document.documentElement.scrollWidth === initialGeometry.scroll &&
        !form.querySelector('zeus-composer-root')
      );
    }),
    'Mount changed the host layout'
  );
  const input = page.locator('form textarea,form input,form [contenteditable=true]').first();
  await input.focus();
  await page.keyboard.insertText('Original fixture draft');
  await clickBolt();
  if (id === 'kimi') {
    await waitState((s) => s.preview && s.reviews > 0, 'Preview-only rich editor');
    assert.equal(await page.evaluate(() => readHostModel()), 'Original fixture draft');
  } else {
    await waitState((s) => s.state === 'success', 'Insertion and host reconciliation on ' + id);
    assert.equal(await page.evaluate(() => readHostModel()), expected, 'Host editor model');
  }
  assert.equal(await page.evaluate(() => submissions), 0);
  if (id === 'deepseek') await checkRecovery(input);
  if (['chatgpt', 'deepseek'].includes(id)) await checkCopilot(input);
  await page
    .locator('input[type=file]')
    .setInputFiles({
      name: 'fixture.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('attachment fixture')
    });
  for (const width of [375, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 800 });
    for (const factor of [0.8, 1, 1.25, 1.5]) {
      await zoom(factor);
      info = await waitState((s) => s.visible && s.hit, 'Resize ' + id + ' ' + width + '/' + factor);
      geometry(info);
      assert(info.scrollWidth <= info.viewport.width, 'Unexpected horizontal scroll');
    }
  }
  await zoom(1);
  await page.setViewportSize({ width: 768, height: 700 });
  await page.evaluate(() => {
    document.documentElement.style.colorScheme = 'dark';
    document.documentElement.dir = 'rtl';
    window.scrollTo(0, 100);
  });
  await frames();
  geometry(await inspect());
  await page.screenshot({ path: path.join(screenshots, id + '.png') });
  await page.getByRole('button', { name: 'Remove attachment' }).click();
  await frames();
  geometry(await inspect());
  if (id === 'grok') {
    await page.evaluate(() => {
      const old = document.querySelector('form textarea');
      const plain = document.createElement('div');
      plain.contentEditable = 'plaintext-only';
      plain.setAttribute('aria-label', 'Chat message');
      old.replaceWith(plain);
      plain.focus();
    });
    await page.keyboard.insertText('Plaintext rich editor');
    await clickBolt();
    await waitState((s) => s.kind === 'plaintext' && s.state === 'success', 'Plaintext browser edit');
    assert.equal(await page.evaluate(() => readHostModel()), enhanced);
  }
  await worker.evaluate(async (id) => {
    await chrome.scripting.executeScript({
      target: { tabId: id },
      files: chrome.runtime.getManifest().content_scripts[0].js
    });
    await chrome.tabs.sendMessage(id, { action: 'forceInjectButton' });
  }, tabId);
  assert.equal(await page.locator('zeus-composer-root').count(), 1);
  await page.evaluate(() => {
    history.pushState({}, '', '/fixture-next');
    document.querySelector('form').remove();
  });
  await page.locator('zeus-composer-root').waitFor({ state: 'detached' });
  console.log(
    id,
    'PASS – discovery, host model or preview, 20 viewport/zoom combinations, theme, RTL, reinjection and removal'
  );
}

async function checkCopilot(input) {
  const enable = (enabled) =>
    worker.evaluate(
      async ([id, copilotEnabled]) => {
        await ZeusSettingsStore.update({
          copilotEnabled,
          copilotProvider: 'ollama',
          copilotMode: 'aggressive'
        });
        await chrome.tabs.sendMessage(id, {
          action: 'settingsUpdated',
          settings: await ZeusSettingsStore.getPublic()
        });
      },
      [tabId, enabled]
    );
  await enable(true);
  await input.focus();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText('Explain caret placement');
  await waitState((s) => s.ghost, 'Caret-aligned ghost');
  assert.equal(await page.evaluate(() => readHostModel()), 'Explain caret placement');
  assert.equal(await input.locator('.zeus-ghost').count(), 0);
  await page.keyboard.press('Escape');
  await waitState((s) => !s.ghost, 'Dismissed ghost');
  await page.keyboard.insertText(' please');
  await waitState((s) => s.ghost, 'New suggestion');
  await page.keyboard.press('Tab');
  await page.waitForFunction(() => readHostModel() === 'Explain caret placement please in detail');
  await frames();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText(' sk-proj-fixture12345678901234567890');
  await waitState((s) => s.paused && !s.ghost, 'Sensitive-data pause');
  await enable(false);
  await input.focus();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText('Restored fixture draft');
}

async function checkRecovery(input) {
  await worker.evaluate(() => {
    globalThis.fixtureGate = new Promise((resolve) => {
      globalThis.releaseFixture = resolve;
    });
  });
  await input.focus();
  await page.keyboard.press('ControlOrMeta+End');
  await clickBolt();
  await waitState((s) => s.state === 'processing' && s.svg, 'Busy identity');
  await page.keyboard.insertText(' user edit');
  await worker.evaluate(() => {
    globalThis.releaseFixture();
    delete globalThis.fixtureGate;
  });
  await waitState((s) => s.preview && s.svg, 'Stale response preview');
  assert((await page.evaluate(() => readHostModel())).endsWith(' user edit'));
  await clickBolt();
  await waitState((s) => s.dialogOpen, 'Review opens without changing the host draft');
  await page.keyboard.press('Escape');
  await waitState((s) => !s.preview, 'Preview dismissed');
  await input.focus();
  await input.fill('');
  await clickBolt();
  await waitState((s) => s.state === 'error' && s.svg, 'Empty draft keeps the bolt');
  const dialog = await page.evaluateHandle(() => {
    const d = document.createElement('dialog');
    d.textContent = 'Native model picker';
    document.body.append(d);
    d.showModal();
    return d;
  });
  await waitState((s) => !s.visible, 'Native modal suspends the overlay');
  await dialog.evaluate((d) => {
    d.close();
    d.remove();
  });
  await waitState((s) => s.visible && s.hit, 'Overlay recovers from modal');
}
