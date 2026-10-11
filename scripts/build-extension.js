const fs = require('node:fs');
const path = require('node:path');

const rootDir = process.cwd();
const distDir = path.join(rootDir, 'dist');
const extensionDir = path.join(distDir, 'extension');

const runtimeFiles = [
  'manifest.json',
  'background.js',
  'content.js',
  'popup.html',
  'popup.js',
  'styles.css',
  'model-registry.js',
  'options.html',
  'options.js',
  'sidepanel.html',
  'sidepanel.js',
  'sidepanel.css'
];

const runtimeDirs = [
  'adapters',
  'core',
  'providers',
  'messaging',
  'settings'
];

const blockedDirectoryNames = new Set([
  'tests',
  'node_modules',
  '.github',
  'scripts',
  'coverage',
  'dist'
]);

const blockedFileSuffixes = [
  '.test.js',
  '.spec.js',
  '.test.mjs',
  '.spec.mjs',
  '.map'
];

// Relative (posix) paths actually written into dist/extension during this run.
const emittedFiles = new Set();

function toPosix(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function logInfo(message) {
  console.log('[build] ' + message);
}

function logSkip(message) {
  console.warn('[build:skip] ' + message);
}

function logError(message) {
  console.error('[build:error] ' + message);
}

function normalizeRelativePath(relativePath) {
  const normalized = path.normalize(relativePath);
  if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
    throw new Error('Unsafe relative path: ' + relativePath);
  }
  return normalized;
}

function isBlockedFile(relativePath) {
  const normalized = toPosix(relativePath);
  const baseName = path.basename(normalized).toLowerCase();

  if (baseName.startsWith('.env')) {
    return true;
  }

  if (baseName.endsWith('.local')) {
    return true;
  }

  if (baseName === '.ds_store' || baseName === 'thumbs.db') {
    return true;
  }

  for (const suffix of blockedFileSuffixes) {
    if (baseName.endsWith(suffix)) {
      return true;
    }
  }

  return false;
}

function isBlockedDirectory(relativePath) {
  const normalized = toPosix(relativePath);
  const parts = normalized.split('/').filter(Boolean);

  for (const part of parts) {
    if (blockedDirectoryNames.has(part)) {
      return true;
    }
  }

  return false;
}

function copyFile(relativePath) {
  const normalized = normalizeRelativePath(relativePath);

  if (isBlockedFile(normalized)) {
    logSkip('Blocked file pattern: ' + toPosix(normalized));
    return false;
  }

  const source = path.join(rootDir, normalized);
  if (!fs.existsSync(source)) {
    logSkip('Missing file: ' + toPosix(normalized));
    return false;
  }

  const destination = path.join(extensionDir, normalized);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
  emittedFiles.add(toPosix(normalized));
  logInfo('Copied file: ' + toPosix(normalized));
  return true;
}

function copyDirectoryRecursive(relativeDirPath) {
  const normalized = normalizeRelativePath(relativeDirPath);

  if (isBlockedDirectory(normalized)) {
    logSkip('Blocked directory: ' + toPosix(normalized));
    return;
  }

  const sourceDir = path.join(rootDir, normalized);
  if (!fs.existsSync(sourceDir)) {
    logSkip('Missing directory: ' + toPosix(normalized));
    return;
  }

  const entries = fs.readdirSync(sourceDir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const childRelativePath = path.join(normalized, entry.name);

    if (entry.isDirectory()) {
      if (isBlockedDirectory(childRelativePath)) {
        logSkip('Blocked nested directory: ' + toPosix(childRelativePath));
        continue;
      }
      copyDirectoryRecursive(childRelativePath);
      continue;
    }

    copyFile(childRelativePath);
  }
}

function readManifest() {
  const manifestPath = path.join(rootDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error('manifest.json is missing from the repository root.');
  }

  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    throw new Error('manifest.json is not valid JSON: ' + error.message);
  }
}

// Every file Chrome must be able to load at runtime, derived from the manifest so
// the whitelist cannot silently drift away from what the extension actually declares.
function getManifestRequiredFiles(manifest) {
  const required = new Map();

  function require(relativePath, referencedBy) {
    const normalized = String(relativePath || '').trim();
    if (!normalized) {
      return;
    }

    const posixPath = toPosix(path.normalize(normalized));
    if (!required.has(posixPath)) {
      required.set(posixPath, referencedBy);
    }
  }

  require(manifest.background?.service_worker, 'background.service_worker');

  for (const entry of manifest.content_scripts || []) {
    for (const script of entry.js || []) {
      require(script, 'content_scripts.js');
    }
    for (const stylesheet of entry.css || []) {
      require(stylesheet, 'content_scripts.css');
    }
  }

  require(manifest.action?.default_popup, 'action.default_popup');
  require(manifest.options_ui?.page, 'options_ui.page');
  require(manifest.side_panel?.default_path, 'side_panel.default_path');

  for (const iconPath of getManifestAssetPaths()) {
    require(iconPath, 'icons');
  }

  return required;
}

function verifyBuildOutput(manifest) {
  const requiredFiles = getManifestRequiredFiles(manifest);
  const missing = [];

  for (const [relativePath, referencedBy] of requiredFiles.entries()) {
    const builtPath = path.join(extensionDir, relativePath);
    if (!fs.existsSync(builtPath)) {
      missing.push(`${relativePath} (referenced by ${referencedBy})`);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      'Build output is incomplete. Every file referenced by manifest.json must exist in ' +
      toPosix(path.relative(rootDir, extensionDir)) + ':\n  - ' + missing.join('\n  - ')
    );
  }

  for (const file of runtimeFiles) {
    const normalized = toPosix(path.normalize(file));
    if (!emittedFiles.has(normalized)) {
      throw new Error(
        `Declared runtime file was not emitted: ${normalized} ` +
        '(check the runtimeFiles list and the source tree).'
      );
    }
  }

  logInfo(`Verified ${requiredFiles.size} manifest-referenced runtime files`);
}

function getManifestAssetPaths() {
  const manifestPath = path.join(rootDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    return [];
  }

  try {
    const manifest = readManifest();
    const assets = new Set();

    function captureIconGroup(iconGroup) {
      if (!iconGroup || typeof iconGroup !== 'object') {
        return;
      }

      for (const value of Object.values(iconGroup)) {
        if (typeof value === 'string' && value.trim()) {
          assets.add(value.trim());
        }
      }
    }

    captureIconGroup(manifest.icons);
    captureIconGroup(manifest.action && manifest.action.default_icon);

    return Array.from(assets).sort((a, b) => a.localeCompare(b));
  } catch (error) {
    logSkip('Unable to parse manifest.json for static assets: ' + error.message);
    return [];
  }
}

function buildExtension() {
  fs.rmSync(extensionDir, { recursive: true, force: true });
  fs.mkdirSync(extensionDir, { recursive: true });
  emittedFiles.clear();
  logInfo('Cleaned dist/extension and starting build');

  const manifest = readManifest();

  const deterministicFiles = runtimeFiles.slice().sort((a, b) => a.localeCompare(b));
  for (const file of deterministicFiles) {
    copyFile(file);
  }

  const deterministicDirs = runtimeDirs.slice().sort((a, b) => a.localeCompare(b));
  for (const directory of deterministicDirs) {
    copyDirectoryRecursive(directory);
  }

  const manifestAssets = getManifestAssetPaths();
  for (const assetPath of manifestAssets) {
    copyFile(assetPath);
  }

  verifyBuildOutput(manifest);

  logInfo('Build complete: ' + toPosix(path.relative(rootDir, extensionDir)));
}

try {
  buildExtension();
} catch (error) {
  logError(error && error.message ? error.message : String(error));
  process.exitCode = 1;
}
