'use strict';

const fs = require('fs');
const path = require('path');
const { safeId, assertPlainObject } = require('./security');

const DEFAULT_SETTINGS = Object.freeze({ version: 1, stabilityMs: 5000, expectedSha256: '', confirmInstaller: true });

function validateSettings(input) {
  const value = assertPlainObject(input, 'settings');
  const stabilityMs = Number(value.stabilityMs);
  const expectedSha256 = typeof value.expectedSha256 === 'string' ? value.expectedSha256.trim().toLowerCase() : '';
  if (!Number.isInteger(stabilityMs) || stabilityMs < 1000 || stabilityMs > 60000) throw new Error('Stability duration must be between 1000 and 60000 ms');
  if (expectedSha256 && !/^[a-f0-9]{64}$/.test(expectedSha256)) throw new Error('Default SHA-256 is invalid');
  if (typeof value.confirmInstaller !== 'boolean') throw new Error('Installer confirmation setting is invalid');
  return { version: 1, stabilityMs, expectedSha256, confirmInstaller: value.confirmInstaller };
}

class Storage {
  constructor(root) {
    this.root = path.resolve(root);
    this.paths = Object.freeze({
      settings: path.join(this.root, 'settings.json'), environments: path.join(this.root, 'environments.json'),
      history: path.join(this.root, 'test-history.json'), reports: path.join(this.root, 'reports'),
      logs: path.join(this.root, 'logs'), screenshots: path.join(this.root, 'screenshots'),
      downloads: path.join(this.root, 'downloads'), temp: path.join(this.root, 'temp')
    });
  }

  async init() {
    await fs.promises.mkdir(this.root, { recursive: true });
    for (const key of ['reports', 'logs', 'screenshots', 'downloads', 'temp']) await fs.promises.mkdir(this.paths[key], { recursive: true });
    await this.ensureJson(this.paths.settings, DEFAULT_SETTINGS);
    await this.ensureJson(this.paths.environments, {});
    await this.ensureJson(this.paths.history, []);
  }

  async ensureJson(file, initial) {
    try { JSON.parse(await fs.promises.readFile(file, 'utf8')); } catch { await this.atomicWriteJson(file, initial); }
  }

  async readJson(file, fallback) {
    try { return JSON.parse(await fs.promises.readFile(file, 'utf8')); } catch { return fallback; }
  }

  async atomicWriteJson(file, value) {
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
    try { await fs.promises.copyFile(file, `${file}.bak`); } catch {}
    await fs.promises.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    JSON.parse(await fs.promises.readFile(temporary, 'utf8'));
    await fs.promises.rename(temporary, file);
  }

  async settings() {
    const current = await this.readJson(this.paths.settings, DEFAULT_SETTINGS);
    return validateSettings({ ...DEFAULT_SETTINGS, ...current });
  }

  async saveSettings(input) {
    const settings = validateSettings(input);
    await this.atomicWriteJson(this.paths.settings, settings);
    return settings;
  }

  async history() {
    const value = await this.readJson(this.paths.history, []);
    return Array.isArray(value) ? value : [];
  }

  async saveHistory(report) {
    const history = await this.history();
    const summary = {
      testId: report.testId, application: report.application, version: report.version,
      platform: report.platform, artifactName: report.artifact.name, status: report.status,
      startedAt: report.startedAt, completedAt: report.completedAt, durationMs: report.durationMs,
      failureReason: report.failureReason || null
    };
    const next = [summary, ...history.filter(item => item.testId !== report.testId)].slice(0, 500);
    await this.atomicWriteJson(this.paths.history, next);
    return next;
  }

  reportDirectory(testId) { return path.join(this.paths.reports, safeId(testId)); }
  screenshotDirectory(testId) { return path.join(this.paths.screenshots, safeId(testId)); }
  logPath(testId) { return path.join(this.paths.logs, `${safeId(testId)}.log`); }
  tempDirectory(testId) { return path.join(this.paths.temp, safeId(testId)); }

  async report(testId) {
    return this.readJson(path.join(this.reportDirectory(testId), 'report.json'), null);
  }

  async deleteReport(testId) {
    safeId(testId);
    await fs.promises.rm(this.reportDirectory(testId), { recursive: true, force: true });
    await fs.promises.rm(this.screenshotDirectory(testId), { recursive: true, force: true });
    await fs.promises.rm(this.logPath(testId), { force: true });
    const history = (await this.history()).filter(item => item.testId !== testId);
    await this.atomicWriteJson(this.paths.history, history);
    return history;
  }
}

module.exports = { Storage, DEFAULT_SETTINGS, validateSettings };
