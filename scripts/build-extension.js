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
  'model-registry.js'
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

function toPosix(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function logInfo(message) {
  console.log('[build] ' + message);
}

function logSkip(message) {
  console.warn('[build:skip] ' + message);
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
    return;
  }

  const source = path.join(rootDir, normalized);
  if (!fs.existsSync(source)) {
    logSkip('Missing file: ' + toPosix(normalized));
    return;
  }

  const destination = path.join(extensionDir, normalized);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
  logInfo('Copied file: ' + toPosix(normalized));
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

function getManifestAssetPaths() {
  const manifestPath = path.join(rootDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    return [];
  }

  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
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
  logInfo('Cleaned dist/extension and starting build');

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

  logInfo('Build complete: ' + toPosix(path.relative(rootDir, extensionDir)));
}

buildExtension();
