'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Storage } = require('../core/storage');
const { ReportService } = require('../reports/report-service');

test('storage writes atomically and persists report history', async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'nexa-test-lab-'));
  try {
    const storage = new Storage(root);
    await storage.init();
    const service = new ReportService(storage);
    const report = {
      testId: 'test-123456', application: 'Nexa Task Desk', version: '1.0.1', platform: 'windows',
      artifact: { name: 'Portable.exe', size: 2048, sha256: 'a'.repeat(64), type: 'portable' },
      status: 'Passed', startedAt: new Date().toISOString(), completedAt: new Date().toISOString(),
      durationMs: 10, steps: [{ action: 'launch', status: 'Passed', detail: 'Started' }], warnings: [],
      errors: [], logs: [], screenshots: [], finalResult: 'Passed', failureReason: null
    };
    const saved = await service.save(report);
    assert.equal(JSON.parse(await fs.promises.readFile(saved.jsonPath, 'utf8')).status, 'Passed');
    assert.match(await fs.promises.readFile(saved.htmlPath, 'utf8'), /Nexa Test Lab Report/);
    assert.equal((await storage.history()).length, 1);
    await storage.deleteReport(report.testId);
    assert.equal((await storage.history()).length, 0);
  } finally {
    await fs.promises.rm(root, { recursive: true, force: true });
  }
});
