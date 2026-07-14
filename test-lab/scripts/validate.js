'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { validateProfile } = require('../core/profile-validator');

const root = path.resolve(__dirname, '..');
const required = [
  'package.json', 'package-lock.json', 'main.js', 'preload.js',
  'core/constants.js', 'core/security.js', 'core/storage.js', 'core/artifact-validator.js',
  'core/profile-validator.js', 'core/process-registry.js', 'core/provider-registry.js', 'core/test-runner.js',
  'providers/windows/index.js', 'providers/android/index.js', 'providers/linux/index.js',
  'automation/windows/process-inspection.ps1', 'automation/windows/window-control.ps1',
  'reports/report-service.js', 'screenshots/capture.js', 'logs/logger.js',
  'src/index.html', 'src/assets/css/app.css', 'src/assets/js/app.js',
  'config/test-profile.schema.json', 'fixtures/nexa-task-desk-portable-smoke.json',
  'fixtures/nexa-task-desk-installer-smoke.json'
];

for (const relative of required) {
  if (!fs.existsSync(path.join(root, relative))) throw new Error(`Required file is missing: ${relative}`);
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (packageJson.main !== 'main.js') throw new Error('package.json main must be main.js');
if (packageJson.version !== '1.1.0') throw new Error('Nexa Test Lab version must be 1.1.0');

const schema = JSON.parse(fs.readFileSync(path.join(root, 'config', 'test-profile.schema.json'), 'utf8'));
if (!schema.properties?.steps) throw new Error('Profile schema is invalid');

for (const fixture of ['nexa-task-desk-portable-smoke.json', 'nexa-task-desk-installer-smoke.json']) {
  validateProfile(JSON.parse(fs.readFileSync(path.join(root, 'fixtures', fixture), 'utf8')));
}

const html = fs.readFileSync(path.join(root, 'src', 'index.html'), 'utf8');
if (!html.includes("default-src 'self'")) throw new Error('Renderer CSP is missing');
const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
for (const setting of ['contextIsolation: true', 'nodeIntegration: false', 'sandbox: true']) {
  if (!main.includes(setting)) throw new Error(`Electron security setting is missing: ${setting}`);
}

const javascript = [];
function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['node_modules', 'release'].includes(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(full);
    else if (entry.name.endsWith('.js')) javascript.push(full);
  }
}
collect(root);
for (const file of javascript) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) throw new Error(`Syntax validation failed for ${path.relative(root, file)}: ${check.stderr}`);
}

console.log(`Nexa Test Lab validation passed: ${required.length} required files and ${javascript.length} JavaScript files checked.`);
