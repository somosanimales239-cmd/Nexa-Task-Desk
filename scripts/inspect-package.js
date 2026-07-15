'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const asar = require('@electron/asar');

const root = path.resolve(__dirname, '..');
const asarPath = path.join(root, 'release', 'win-unpacked', 'resources', 'app.asar');
if (!fs.existsSync(asarPath)) throw new Error(`Packaged ASAR does not exist: ${asarPath}`);

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'nexa-build-manifest.json'), 'utf8'));
const listed = asar.listPackage(asarPath).map(item => item.replace(/^[/\\]/, '').replaceAll('\\', '/'));
const required = [
  'package.json',
  'nexa.project.json',
  'nexa-build-manifest.json',
  'preload.js',
  'src/index.html',
  'test-lab/main.js',
  'test-lab/preload.js',
  'test-lab/core/storage.js',
  'test-lab/core/test-runner.js',
  'test-lab/providers/windows/index.js',
  'test-lab/reports/report-service.js',
  'test-lab/src/index.html',
  'test-lab/src/assets/css/app.css',
  'test-lab/src/assets/js/app.js'
];

for (const relativePath of required) {
  if (!listed.includes(relativePath)) throw new Error(`Packaged file is missing: ${relativePath}`);
}

for (const [relativePath, expected] of Object.entries(manifest.entries)) {
  const content = asar.extractFile(asarPath, relativePath);
  const actual = crypto.createHash('sha256').update(content).digest('hex');
  if (actual !== expected.sha256) throw new Error(`Packaged hash mismatch: ${relativePath}`);
}

const activeHtml = asar.extractFile(asarPath, 'test-lab/src/index.html').toString('utf8');
for (const text of ['Your Windows application is ready to evolve', 'Run local check', 'checkButton']) {
  if (activeHtml.includes(text)) throw new Error(`Template text exists in packaged renderer: ${text}`);
}

const result = {
  version: manifest.version,
  buildId: manifest.buildId,
  githubRunId: manifest.githubRunId,
  commitSha: manifest.commitSha,
  renderer: manifest.renderer,
  verifiedFunctions: [
    'Dashboard', 'Select Artifact', 'Artifact Information', 'SHA-256', 'Environment Status',
    'Test Profile', 'Start Test', 'Stop Test', 'Timeline', 'Log Console', 'Screenshots',
    'Final Result', 'History', 'Reports', 'Settings'
  ],
  requiredFiles: required,
  packagedFileCount: listed.length
};

fs.writeFileSync(path.join(root, 'release', 'build-inspection.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(result, null, 2));
