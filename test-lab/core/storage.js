'use strict';

const fs = require('fs');
const path = require('path');
const { safeId } = require('./security');

class Storage {
  constructor(root) {
    this.root = path.resolve(root);
    this.paths = Object.freeze({
      settings: path.join(this.root, 'settings.json'),
      environments: path.join(this.root, 'environments.json'),
      history: path.join(this.root, 'test-history.json'),
      reports: path.join(this.root, 'reports'),
      logs: path.join(this.root, 'logs'),
      screenshots: path.join(this.root, 'screenshots'),
      downloads: path.join(this.root, 'downloads'),
      temp: path.join(this.root, 'temp')
    });
  }

  async init() {
    await fs.promises.mkdir(this.root, { recursive: true });
    for (const key of ['reports', 'logs', 'screenshots', 'downloads', 'temp']) {
      await fs.promises.mkdir(this.paths[key], { recursive: true });
    }
    await this.ensureJson(this.paths.settings, { version: 1 });
    await this.ensureJson(this.paths.environments, {});
    await this.ensureJson(this.paths.history, []);
  }

  async ensureJson(file, initial) {
    try {
      await fs.promises.access(file);
      JSON.parse(await fs.promises.readFile(file, 'utf8'));
    } catch {
      await this.atomicWriteJson(file, initial);
    }
  }

  async readJson(file, fallback) {
    try {
      return JSON.parse(await fs.promises.readFile(file, 'utf8'));
    } catch {
      return fallback;
    }
  }

  async atomicWriteJson(file, value) {
    const directory = path.dirname(file);
    await fs.promises.mkdir(directory, { recursive: true });
    const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
    const backup = `${file}.bak`;
    try {
      await fs.promises.copyFile(file, backup);
    } catch {}
    await fs.promises.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    JSON.parse(await fs.promises.readFile(temp, 'utf8'));
    await fs.promises.rename(temp, file);
  }

  async history() {
    const history = await this.readJson(this.paths.history, []);
    return Array.isArray(history) ? history : [];
  }

  async saveHistory(report) {
    const history = await this.history();
    const summary = {
      testId: report.testId,
      application: report.application,
      version: report.version,
      platform: report.platform,
      artifactName: report.artifact.name,
      status: report.status,
      startedAt: report.startedAt,
      completedAt: report.completedAt,
      durationMs: report.durationMs,
      failureReason: report.failureReason || null
    };
    const next = [summary, ...history.filter(item => item.testId !== report.testId)].slice(0, 500);
    await this.atomicWriteJson(this.paths.history, next);
    return next;
  }

  reportDirectory(testId) {
    return path.join(this.paths.reports, safeId(testId));
  }

  screenshotDirectory(testId) {
    return path.join(this.paths.screenshots, safeId(testId));
  }

  logPath(testId) {
    return path.join(this.paths.logs, `${safeId(testId)}.log`);
  }

  tempDirectory(testId) {
    return path.join(this.paths.temp, safeId(testId));
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

module.exports = { Storage };
