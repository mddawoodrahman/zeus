const fs = require('node:fs');
const path = require('node:path');
const archiver = require('archiver');

const rootDir = process.cwd();
const distDir = path.join(rootDir, 'dist');
const extensionDir = path.join(distDir, 'extension');
const zipPath = path.join(distDir, 'extension.zip');

function toPosix(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function sizeInMb(bytes) {
  return (bytes / (1024 * 1024)).toFixed(2);
}

async function zipExtension() {
  if (!fs.existsSync(extensionDir) || !fs.statSync(extensionDir).isDirectory()) {
    throw new Error('Build folder is missing: ' + toPosix(path.relative(rootDir, extensionDir)));
  }

  fs.mkdirSync(distDir, { recursive: true });
  if (fs.existsSync(zipPath)) {
    fs.rmSync(zipPath, { force: true });
  }

  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', resolve);
    output.on('error', reject);

    archive.on('warning', (warning) => {
      if (warning.code === 'ENOENT') {
        console.warn('[zip:warning] ' + warning.message);
        return;
      }
      reject(warning);
    });

    archive.on('error', reject);

    archive.pipe(output);
    archive.directory(extensionDir, 'extension');
    archive.finalize();
  });

  const zipStat = fs.statSync(zipPath);
  console.log('[zip] Created ' + toPosix(path.relative(rootDir, zipPath)) + ' (' + sizeInMb(zipStat.size) + ' MB)');
}

zipExtension().catch((error) => {
  console.error('[zip:error] ' + error.message);
  process.exit(1);
});
