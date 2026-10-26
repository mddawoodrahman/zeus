const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function readManifest() {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'manifest.json'), 'utf8'));
}

function readSource(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

function fileExists(relativePath) {
  return fs.existsSync(path.join(REPO_ROOT, relativePath));
}

function extractQuotedStrings(block) {
  return Array.from(block.matchAll(/'([^']+)'/g)).map((entry) => entry[1]);
}

// Mirrors CONTENT_SCRIPT_FILES in messaging/messageHandler.js.
function extractContentScriptFiles() {
  const source = readSource(path.join('messaging', 'messageHandler.js'));
  const match = source.match(/CONTENT_SCRIPT_FILES\s*=\s*\[([\s\S]*?)\]/);
  if (!match) {
    throw new Error('Could not locate CONTENT_SCRIPT_FILES in messaging/messageHandler.js');
  }
  return extractQuotedStrings(match[1]);
}

// Mirrors the importScripts() call in background.js.
function extractImportScriptsFiles() {
  const source = readSource('background.js');
  const match = source.match(/importScripts\(([\s\S]*?)\);/);
  if (!match) {
    throw new Error('Could not locate importScripts() in background.js');
  }
  return extractQuotedStrings(match[1]);
}

function extractBuildArray(name) {
  const source = readSource(path.join('scripts', 'build-extension.js'));
  // The source just before `const <name> = [`. `runtimeFiles` is preceded by `const`
  // and `runtimeDirs` by a previous `];`, so anchor on the literal instead of \b
  // (the trailing "s" is a word character, which defeats a word boundary).
  const match = source.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\n\\];`));
  if (!match) {
    throw new Error(`Could not locate ${name} in scripts/build-extension.js`);
  }
  return extractQuotedStrings(match[1]);
}

function collectProviderApiHosts() {
  const providerFiles = [
    'providers/gemini.js',
    'providers/openai.js',
    'providers/claude.js',
    'providers/openrouter.js',
    'providers/ollama.js'
  ];

  const hosts = new Set();
  // Only follow real call sites: fetch('https://…'), fetch(CONST, …) and the
  // retry.fetchWithTimeout equivalents. Attribution headers such as HTTP-Referer
  // are deliberately not treated as endpoints.
  const fetchStringPattern = /fetch(?:WithTimeout)?\(\s*['"`]((?:https?):\/\/[^/'"`]+)/g;
  const fetchIdentifierPattern = /fetch(?:WithTimeout)?\(\s*([A-Za-z_$][\w$]*)/g;
  const endpointConstantPattern = /const\s+[A-Za-z_$][\w$]*\s*=\s*['"`]((?:https?):\/\/[^/'"`]+)/g;

  for (const relativePath of providerFiles) {
    if (!fileExists(relativePath)) {
      continue;
    }

    const source = readSource(relativePath);

    fetchStringPattern.lastIndex = 0;
    let match = fetchStringPattern.exec(source);
    while (match) {
      hosts.add(match[1]);
      match = fetchStringPattern.exec(source);
    }

    const declaredEndpoints = new Map();
    endpointConstantPattern.lastIndex = 0;
    let declaration = endpointConstantPattern.exec(source);
    while (declaration) {
      const identifier = declaration[0].match(/const\s+([A-Za-z_$][\w$]*)/)[1];
      declaredEndpoints.set(identifier, declaration[1]);
      declaration = endpointConstantPattern.exec(source);
    }

    fetchIdentifierPattern.lastIndex = 0;
    match = fetchIdentifierPattern.exec(source);
    while (match) {
      // Only promote an identifier that is an actual endpoint constant, so
      // header values and other string constants never leak into the check.
      if (declaredEndpoints.has(match[1])) {
        hosts.add(declaredEndpoints.get(match[1]));
      }
      match = fetchIdentifierPattern.exec(source);
    }
  }

  return hosts;
}

describe('manifest and runtime file wiring', () => {
  const manifest = readManifest();
  const contentScriptJs = manifest.content_scripts.flatMap((entry) => entry.js || []);

  it('declares a service worker, popup, options page and side panel that exist on disk', () => {
    const declared = [
      manifest.background.service_worker,
      manifest.action.default_popup,
      manifest.options_ui.page,
      manifest.side_panel.default_path
    ];

    expect(declared.filter(Boolean).length).toBe(declared.length);
    expect(declared.filter((relativePath) => !fileExists(relativePath))).toEqual([]);
  });

  it('only references content scripts and service worker modules that exist on disk', () => {
    const referenced = [
      manifest.background.service_worker,
      ...contentScriptJs,
      ...extractImportScriptsFiles()
    ];

    const missing = referenced.filter((relativePath) => !fileExists(relativePath));
    expect(missing).toEqual([]);
  });

  it('lists exactly the manifest content scripts in forceInject re-injection order', () => {
    const forced = extractContentScriptFiles();
    expect(forced).toEqual(contentScriptJs);
  });

  it('gives the service worker a host permission pattern for every external API it calls', () => {
    const hostPermissions = manifest.host_permissions || [];
    const apiHosts = collectProviderApiHosts();

    expect(apiHosts.size).toBeGreaterThan(0);

    for (const apiHost of apiHosts) {
      const covered = hostPermissions.some((pattern) => {
        const trimmed = String(pattern).replace(/\*+$/, '');
        return trimmed.startsWith(apiHost);
      });
      expect(covered, `manifest.host_permissions must cover ${apiHost}`).toBe(true);
    }
  });

  it('keeps the build whitelist aligned with every runtime module Chrome must load', () => {
    const runtimeFiles = new Set(extractBuildArray('runtimeFiles'));
    const runtimeDirs = extractBuildArray('runtimeDirs').map((dir) => dir.replace(/\/+$/, '') + '/');

    const isCopied = (file) => runtimeFiles.has(file) || runtimeDirs.some((dir) => file.startsWith(dir));

    for (const file of extractImportScriptsFiles()) {
      expect(isCopied(file), `${file} must be copied by the build`).toBe(true);
    }

    for (const file of contentScriptJs) {
      expect(isCopied(file), `${file} must be copied by the build`).toBe(true);
    }
  });

  it('keeps manifest.json and package.json versions identical and valid for Chrome Web Store', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
    const manifestData = readManifest();

    expect(manifestData.version).toBe(pkg.version);
    expect(manifestData.version).toBe('2.1.3');

    // Chrome Web Store version format: 1 to 4 dot-separated integers between 0 and 65535, no leading zeroes
    expect(manifestData.version).toMatch(/^(?:0|[1-9]\d{0,4})(?:\.(?:0|[1-9]\d{0,4})){0,3}$/);
    const parts = manifestData.version.split('.').map(Number);
    expect(parts.length).toBeGreaterThanOrEqual(1);
    expect(parts.length).toBeLessThanOrEqual(4);
    for (const num of parts) {
      expect(num).toBeGreaterThanOrEqual(0);
      expect(num).toBeLessThanOrEqual(65535);
    }
  });
});

