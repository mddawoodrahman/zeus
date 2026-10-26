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

    const buffer = fs.readFileSync(zipPath);

    // Parse ZIP central directory entries
    let eocdOffset = -1;
    for (let i = buffer.length - 22; i >= 0; i--) {
      if (buffer.readUInt32LE(i) === 0x06054b50) {
        eocdOffset = i;
        break;
      }
    }
    expect(eocdOffset).toBeGreaterThan(0);

    const cdEntriesCount = buffer.readUInt16LE(eocdOffset + 10);
    const cdOffset = buffer.readUInt32LE(eocdOffset + 16);
    expect(cdEntriesCount).toBeGreaterThan(20);

    const zipEntries = [];
    let offset = cdOffset;
    for (let i = 0; i < cdEntriesCount; i++) {
      const sig = buffer.readUInt32LE(offset);
      if (sig !== 0x02014b50) break;
      const fileNameLen = buffer.readUInt16LE(offset + 28);
      const extraLen = buffer.readUInt16LE(offset + 30);
      const commentLen = buffer.readUInt16LE(offset + 32);
      const fileName = buffer.toString('utf8', offset + 46, offset + 46 + fileNameLen);
      zipEntries.push(fileName);
      offset += 46 + fileNameLen + extraLen + commentLen;
    }

    // Root-level manifest assertions
    expect(zipEntries).toContain('manifest.json');
    expect(zipEntries).not.toContain('extension/manifest.json');
    expect(zipEntries).toContain('background.js');
    expect(zipEntries).toContain('content.js');
    expect(zipEntries).toContain('options.html');
    expect(zipEntries).toContain('popup.html');
    expect(zipEntries).toContain('sidepanel.html');

    // Forbidden files assertion
    const forbidden = zipEntries.filter((name) =>
      name.startsWith('tests/') ||
      name.startsWith('scripts/') ||
      name.startsWith('.git') ||
      name.startsWith('node_modules/') ||
      name.includes('.env') ||
      name.endsWith('.map') ||
      name.endsWith('.test.js')
    );
    expect(forbidden).toEqual([]);

    // Check built manifest version
    const builtManifest = JSON.parse(fs.readFileSync(path.join(extensionDir, 'manifest.json'), 'utf8'));
    expect(builtManifest.version).toBe('2.1.3');
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
