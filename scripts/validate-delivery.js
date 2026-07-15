'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const packageJson = JSON.parse(read('package.json'));
const manifest = JSON.parse(read('nexa-build-manifest.json'));
const files = packageJson.build?.files || [];

function fail(message) {
  throw new Error(message);
}

function included(relativePath) {
  const normalized = relativePath.replaceAll('\\', '/');
  return files.some(pattern => {
    const clean = pattern.replaceAll('\\', '/');
    if (clean === normalized) return true;
    if (clean.endsWith('/**/*')) return normalized.startsWith(clean.slice(0, -4));
    return false;
  });
}

const requiredRuntimeFiles = [
  'package.json',
  'nexa.project.json',
  'nexa-build-manifest.json',
  'preload.js',
  'src/index.html',
  'test-lab/main.js',
  'test-lab/preload.js',
  'test-lab/core/constants.js',
  'test-lab/core/security.js',
  'test-lab/core/storage.js',
  'test-lab/core/artifact-validator.js',
  'test-lab/core/profile-validator.js',
  'test-lab/core/process-registry.js',
  'test-lab/core/provider-registry.js',
  'test-lab/core/test-runner.js',
  'test-lab/providers/windows/index.js',
  'test-lab/providers/android/index.js',
  'test-lab/providers/linux/index.js',
  'test-lab/automation/windows/process-inspection.ps1',
  'test-lab/automation/windows/window-control.ps1',
  'test-lab/reports/report-service.js',
  'test-lab/screenshots/capture.js',
  'test-lab/logs/logger.js',
  'test-lab/recordings/index.js',
  'test-lab/config/test-profile.schema.json',
  'test-lab/fixtures/nexa-task-desk-portable-smoke.json',
  'test-lab/fixtures/nexa-task-desk-installer-smoke.json',
  'test-lab/src/index.html',
  'test-lab/src/assets/css/app.css',
  'test-lab/src/assets/js/app.js'
];

if (packageJson.main !== 'test-lab/main.js') fail('package.json main must be test-lab/main.js');
if (packageJson.name !== 'nexa-test-lab' || packageJson.build?.productName !== 'Nexa Test Lab') fail('Packaged product identity is invalid');
if (packageJson.build?.appId !== 'com.nexa.testlab') fail('Packaged appId is invalid');

for (const relativePath of requiredRuntimeFiles) {
  if (!fs.existsSync(path.join(root, relativePath))) fail(`Required runtime file is missing: ${relativePath}`);
  if (!included(relativePath)) fail(`Required runtime file is excluded by build.files: ${relativePath}`);
}

for (const forbidden of ['node_modules', 'release', 'artifacts', 'coverage', 'test-lab/tests', 'test-lab/scripts']) {
  if (files.some(pattern => pattern === forbidden || pattern.startsWith(`${forbidden}/`))) fail(`Unnecessary path is packaged: ${forbidden}`);
}

const main = read('test-lab/main.js');
for (const contract of [
  "preload: path.join(__dirname, 'preload.js')",
  "mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'))",
  'contextIsolation: true',
  'nodeIntegration: false',
  'sandbox: true'
]) {
  if (!main.includes(contract)) fail(`Active Electron contract is missing: ${contract}`);
}

const activeHtml = read('test-lab/src/index.html');
const compatibilityHtml = read('src/index.html');
const forbiddenTemplateText = ['Your Windows application is ready to evolve', 'Run local check', 'checkButton'];
for (const text of forbiddenTemplateText) {
  if (activeHtml.includes(text) || compatibilityHtml.includes(text)) fail(`Template content remains packaged: ${text}`);
}

const functions = [
  'Dashboard', 'Select Artifact', 'Artifact Information', 'SHA-256', 'Environment Status',
  'Test Profile', 'Start Test', 'Stop Test', 'Timeline', 'Log Console', 'Screenshots',
  'Final Result', 'History', 'Reports', 'Settings'
];
for (const value of functions) if (!activeHtml.includes(value)) fail(`Required interface function is missing: ${value}`);

if (manifest.version !== packageJson.version) fail('Manifest version does not match package.json');
if (manifest.renderer !== 'resources/app.asar/test-lab/src/index.html') fail('Manifest renderer path is invalid');
for (const [relativePath, entry] of Object.entries(manifest.entries || {})) {
  const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, relativePath))).digest('hex');
  if (entry.sha256 !== actual) fail(`Manifest hash mismatch: ${relativePath}`);
}

const javascript = requiredRuntimeFiles.filter(file => file.endsWith('.js'));
for (const relativePath of javascript) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, relativePath)], { encoding: 'utf8' });
  if (result.status !== 0) fail(`Syntax check failed for ${relativePath}: ${result.stderr}`);
}

console.log(`Delivery validation passed for ${packageJson.build.productName} ${packageJson.version}.`);
console.log('Active main: test-lab/main.js');
console.log('Active preload: test-lab/preload.js');
console.log('Packaged renderer: resources/app.asar/test-lab/src/index.html');
console.log(`Verified interface functions: ${functions.join(', ')}.`);
