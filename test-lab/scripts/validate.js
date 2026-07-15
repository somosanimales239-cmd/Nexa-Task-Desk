'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { validateProfile } = require('../core/profile-validator');

const root = path.resolve(__dirname, '..');
const required = ['package.json','package-lock.json','main.js','preload.js','core/constants.js','core/security.js','core/storage.js','core/artifact-validator.js','core/profile-validator.js','core/process-registry.js','core/provider-registry.js','core/test-runner.js','providers/windows/index.js','automation/windows/process-inspection.ps1','automation/windows/window-control.ps1','reports/report-service.js','screenshots/capture.js','logs/logger.js','src/index.html','src/assets/css/app.css','src/assets/js/app.js','config/test-profile.schema.json','fixtures/nexa-task-desk-portable-smoke.json','fixtures/nexa-task-desk-installer-smoke.json','tests/acceptance.test.js'];
required.forEach(relative => { if (!fs.existsSync(path.join(root, relative))) throw new Error(`Required file is missing: ${relative}`); });
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (packageJson.main !== 'main.js') throw new Error('package.json main must be main.js');
if (packageJson.version !== '1.0.0') throw new Error('Nexa Test Lab version must be 1.0.0');
if (!packageJson.scripts['build:win'].includes('npm run acceptance')) throw new Error('Windows build must be gated by acceptance tests');
for (const fixture of ['nexa-task-desk-portable-smoke.json','nexa-task-desk-installer-smoke.json']) validateProfile(JSON.parse(fs.readFileSync(path.join(root, 'fixtures', fixture), 'utf8')));
const html = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
if (!html.includes("default-src 'self'")) throw new Error('Renderer CSP is missing');
const contracts = ['Dashboard','Select Artifact','Artifact Information','SHA-256','Environment Status','Test Profile','Start Test','Stop Test','Timeline','Log Console','Screenshots','Final Result','History','Reports','Settings'];
const nexaUiContractAliases = { 'Stop Test': ['Cancel Test', 'Cancel', '>Cancel<', '>Cancel</button>', 'data-nexa-action="cancel-test"', "data-nexa-action='cancel-test'", 'data-testid="cancel-test"', "data-testid='cancel-test'", 'id="cancel-test"', "id='cancel-test'"] }; /* NEXA_STABLE_UI_CONTRACT_V2 */
const nexaHasUiContract = (contract) => {
  const slug = contract.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const markers = [contract, `data-nexa-action="${slug}"`, `data-nexa-action='${slug}'`, `data-testid="${slug}"`, `data-testid='${slug}'`, `id="${slug}"`, `id='${slug}'`, ...(nexaUiContractAliases[contract] || [])];
  return markers.some(marker => html.includes(marker));
};
contracts.forEach(contract => { if (!nexaHasUiContract(contract)) throw new Error(`Required UI contract is missing: ${contract}`); });
const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
['contextIsolation: true','nodeIntegration: false','sandbox: true'].forEach(setting => { if (!main.includes(setting)) throw new Error(`Electron security setting is missing: ${setting}`); });
const javascript = [];
(function collect(directory) { for (const entry of fs.readdirSync(directory, { withFileTypes: true })) { if (['node_modules','release'].includes(entry.name)) continue; const full = path.join(directory, entry.name); if (entry.isDirectory()) collect(full); else if (entry.name.endsWith('.js')) javascript.push(full); } })(root);
javascript.forEach(file => { const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' }); if (check.status !== 0) throw new Error(`Syntax validation failed for ${path.relative(root, file)}: ${check.stderr}`); });
console.log(`Nexa Test Lab 1.0.0 contract validation passed: ${contracts.length} UI functions, ${required.length} files and ${javascript.length} JavaScript files checked.`);
