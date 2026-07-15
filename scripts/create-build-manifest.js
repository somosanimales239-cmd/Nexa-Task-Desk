'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const entries = [
  'test-lab/main.js',
  'test-lab/preload.js',
  'test-lab/src/index.html',
  'test-lab/src/assets/js/app.js'
];

function sha256(relativePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(path.join(root, relativePath))).digest('hex');
}

function currentCommit() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
  return result.status === 0 && result.stdout.trim() ? result.stdout.trim() : 'uncommitted';
}

const manifest = {
  productName: packageJson.build.productName,
  version: packageJson.version,
  buildId: String(process.env.NEXA_BUILD_ID || process.env.GITHUB_RUN_NUMBER || 'local'),
  githubRunId: String(process.env.GITHUB_RUN_ID || 'local'),
  commitSha: currentCommit(),
  renderer: 'resources/app.asar/test-lab/src/index.html',
  generatedAt: new Date().toISOString(),
  entries: Object.fromEntries(entries.map(relativePath => [relativePath, { sha256: sha256(relativePath) }]))
};

fs.writeFileSync(path.join(root, 'nexa-build-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`Build manifest generated for ${manifest.productName} ${manifest.version}, Build ${manifest.buildId}, commit ${manifest.commitSha}.`);
