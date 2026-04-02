const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { globSync } = require('glob');

const rootDir = process.cwd();
const ignorePatterns = [
  'node_modules/**',
  'dist/**',
  'coverage/**',
  '.git/**'
];

const files = globSync('**/*.{js,mjs}', {
  cwd: rootDir,
  nodir: true,
  ignore: ignorePatterns
}).sort();

if (files.length === 0) {
  console.log('No JavaScript files found for syntax validation.');
  process.exit(0);
}

const failures = [];

for (const relativePath of files) {
  const absolutePath = path.resolve(rootDir, relativePath);
  const result = spawnSync(process.execPath, ['--check', absolutePath], {
    encoding: 'utf8'
  });

  if (result.status !== 0) {
    failures.push({
      file: relativePath,
      output: result.stderr || result.stdout || 'Unknown syntax error'
    });
  }
}

if (failures.length > 0) {
  console.error('Syntax check failed for the following files:\n');
  for (const failure of failures) {
    console.error('- ' + failure.file);
    console.error(String(failure.output).trim());
    console.error('');
  }
  process.exit(1);
}

console.log('Syntax check passed for ' + files.length + ' files.');
