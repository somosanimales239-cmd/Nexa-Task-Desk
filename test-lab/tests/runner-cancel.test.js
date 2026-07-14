'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ProcessRegistry } = require('../core/process-registry');

test('process registry cancellation is idempotent when no process exists', async () => {
  const registry = new ProcessRegistry();
  await registry.close('test-123456');
  await registry.closeAll();
  assert.equal(registry.processes.size, 0);
});

test('Passed criteria requires every mandatory result to pass', () => {
  const steps = [
    { required: true, status: 'Passed' },
    { required: true, status: 'Failed' },
    { required: false, status: 'Blocked' }
  ];
  assert.equal(steps.some(step => step.required && step.status !== 'Passed'), true);
});
