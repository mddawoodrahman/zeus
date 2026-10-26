const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

describe('Packaging and Build Tooling', () => {
  const rootDir = process.cwd();
  const distDir = path.join(rootDir, 'dist');
  const zipPath = path.join(distDir, 'extension.zip');
  const extensionDir = path.join(distDir, 'extension');

  beforeAll(() => {
    // Run build and zip to verify the pipeline
    execSync('npm run build', { cwd: rootDir, stdio: 'pipe' });
    execSync('npm run zip', { cwd: rootDir, stdio: 'pipe' });
  });

  it('generates dist/extension with manifest.json and core runtime files', () => {
    expect(fs.existsSync(extensionDir)).toBe(true);
    expect(fs.existsSync(path.join(extensionDir, 'manifest.json'))).toBe(true);
    expect(fs.existsSync(path.join(extensionDir, 'background.js'))).toBe(true);
    expect(fs.existsSync(path.join(extensionDir, 'content.js'))).toBe(true);
    expect(fs.existsSync(path.join(extensionDir, 'popup.html'))).toBe(true);
    expect(fs.existsSync(path.join(extensionDir, 'options.html'))).toBe(true);
    expect(fs.existsSync(path.join(extensionDir, 'sidepanel.html'))).toBe(true);
  });

  it('generates a valid zip file with manifest.json at the archive root', () => {
    expect(fs.existsSync(zipPath)).toBe(true);

    const stats = fs.statSync(zipPath);
    expect(stats.size).toBeGreaterThan(10000); // Greater than 10KB

    // Inspect entries using Node's standard zip header inspection or archiver/unzip
    const buffer = fs.readFileSync(zipPath);
    // Find "manifest.json" in the central directory / local file headers
    const manifestStr = 'manifest.json';
    const hasRootManifest = buffer.includes(Buffer.from(manifestStr));
    expect(hasRootManifest).toBe(true);

    // Assert that 'extension/manifest.json' is NOT present
    const nestedManifest = buffer.includes(Buffer.from('extension/manifest.json'));
    expect(nestedManifest).toBe(false);
  });

  it('clean script is cross-platform and does not fail when dist exists or is absent', () => {
    expect(() => {
      execSync('npm run clean', { cwd: rootDir, stdio: 'pipe' });
    }).not.toThrow();

    expect(fs.existsSync(distDir)).toBe(false);

    // Running clean again when dist does not exist must also be safe
    expect(() => {
      execSync('npm run clean', { cwd: rootDir, stdio: 'pipe' });
    }).not.toThrow();

    // Rebuild for subsequent checks
    execSync('npm run package', { cwd: rootDir, stdio: 'pipe' });
    expect(fs.existsSync(path.join(distDir, 'extension', 'manifest.json'))).toBe(true);
  });
});
