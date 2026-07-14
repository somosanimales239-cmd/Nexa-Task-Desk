'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Storage } = require('../core/storage');
const { ReportService } = require('../reports/report-service');
const { TestRunner, passedRequiredSteps } = require('../core/test-runner');

async function executableFixture(root) {
  const file = path.join(root, 'Nexa Task Desk Portable.exe');
  const data = Buffer.alloc(2048); data.write('MZ', 0, 'ascii'); data.writeUInt32LE(128, 0x3c); data.write('PE\0\0', 128, 'binary');
  await fs.promises.writeFile(file, data); return file;
}
async function runSimulation(root, shouldPass) {
  const storage = new Storage(path.join(root, shouldPass ? 'passed' : 'failed')); await storage.init();
  const reports = new ReportService(storage);
  const registry = { async close() {} };
  const provider = {
    implemented: true, async environment() { return { status: 'Ready', detail: 'Simulated acceptance environment' }; },
    async run() {
      const steps = [{ action: 'launch', required: true, status: 'Passed', detail: 'Simulated process started' }, { action: 'assertNoCrash', required: true, status: shouldPass ? 'Passed' : 'Failed', detail: shouldPass ? 'No crash' : 'Exact simulated crash' }];
      if (!shouldPass) throw Object.assign(new Error('Exact simulated crash'), { stepResults: steps });
      return steps;
    }
  };
  const runner = new TestRunner({ storage, reports, registry, providers: { get() { return provider; } } });
  return runner.start({ artifactPath: await executableFixture(root), profile: { name: 'Acceptance simulation', application: 'Nexa Task Desk', version: '1.0.0', platform: 'windows', artifactType: 'portable', steps: [{ action: 'launch' }, { action: 'assertNoCrash' }] } });
}

test('required UI contract exists in source', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8');
  ['Dashboard','Select Artifact','Artifact Information','SHA-256','Start Test','Stop Test','Timeline','Log Console','History','Reports','Settings'].forEach(value => assert.match(html, new RegExp(value)));
});
test('simulated execution can finish Passed only when every required check passes', async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'nexa-acceptance-'));
  try { const report = await runSimulation(root, true); assert.equal(report.status, 'Passed'); assert.equal(passedRequiredSteps(report.steps), true); }
  finally { await fs.promises.rm(root, { recursive: true, force: true }); }
});
test('simulated execution can finish Failed and persists the exact failure', async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'nexa-acceptance-'));
  try { const report = await runSimulation(root, false); assert.equal(report.status, 'Failed'); assert.equal(report.failureReason, 'Exact simulated crash'); const reopened = new Storage(path.join(root, 'failed')); await reopened.init(); const saved = await reopened.report(report.testId); assert.equal(saved.status, 'Failed'); assert.equal(saved.steps[1].detail, 'Exact simulated crash'); }
  finally { await fs.promises.rm(root, { recursive: true, force: true }); }
});
