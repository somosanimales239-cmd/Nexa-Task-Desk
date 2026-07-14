'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { assertLocalAbsolutePath, redact, safeId } = require('../core/security');
const { validateProfile } = require('../core/profile-validator');

test('artifact paths reject URLs, remote shares and invalid extensions', () => {
  assert.throws(() => assertLocalAbsolutePath('https://example.test/app.exe', ['.exe']));
  assert.throws(() => assertLocalAbsolutePath('\\\\server\\share\\app.exe', ['.exe']));
  assert.throws(() => assertLocalAbsolutePath(path.resolve('app.txt'), ['.exe']));
  assert.equal(assertLocalAbsolutePath(path.resolve('app.exe'), ['.exe']), path.resolve('app.exe'));
});

test('identifiers and secrets are sanitized', () => {
  assert.equal(safeId('test-123456'), 'test-123456');
  assert.throws(() => safeId('../report'));
  assert.match(redact('token=super-secret password=hunter2'), /\[REDACTED\]/);
  assert.doesNotMatch(redact('token=super-secret'), /super-secret/);
});

test('profiles reject arbitrary shell commands', () => {
  assert.throws(() => validateProfile({ name: 'Unsafe profile', platform: 'windows', steps: [{ action: 'launch', command: 'format c:' }] }));
  assert.throws(() => validateProfile({ name: 'Unsafe profile', platform: 'windows', steps: [{ action: 'exec' }] }));
});
