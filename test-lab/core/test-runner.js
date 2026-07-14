'use strict';

const crypto = require('crypto');
const fs = require('fs');
const { prepareArtifact } = require('./artifact-validator');
const { validateProfile } = require('./profile-validator');
const { normalizeError } = require('./security');
const { Logger } = require('../logs/logger');

class TestRunner {
  constructor({ storage, providers, registry, reports, onEvent = () => {} }) {
    this.storage = storage;
    this.providers = providers;
    this.registry = registry;
    this.reports = reports;
    this.onEvent = onEvent;
    this.active = null;
  }

  async start(request) {
    if (this.active) throw new Error('A test is already running');
    const profile = validateProfile(request.profile);
    const provider = this.providers.get(profile.platform);
    const environment = await provider.environment();
    const testId = `test-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const startedAt = new Date().toISOString();
    const control = { testId, canceled: false };
    this.active = control;
    const logger = new Logger(this.storage.logPath(testId), line => this.emit('log', { testId, line }));
    await logger.init();
    let artifact = null;
    let steps = [];
    let status = 'Failed';
    let failureReason = null;
    const screenshots = [];
    const warnings = [];

    const setState = state => this.emit('state', { testId, state });
    const throwIfCanceled = () => {
      if (control.canceled) throw Object.assign(new Error('Test canceled by user'), { canceled: true });
    };

    try {
      setState('Preparing');
      await logger.write('info', `Starting ${profile.name}`);
      if (!provider.implemented) throw Object.assign(new Error(environment.detail), { blocked: true });
      artifact = await prepareArtifact(request.artifactPath, this.storage.tempDirectory(testId), request.expectedSha256);
      await logger.write('info', `Artifact validated: ${artifact.name}, ${artifact.size} bytes, SHA-256 ${artifact.sha256}`);
      throwIfCanceled();
      if (profile.artifactType === 'installer') warnings.push('Installer Phase 1 is a confirmed wizard smoke test; installed paths, shortcuts and uninstall behavior require configured expectations before they can be certified.');
      steps = await provider.run({
        testId,
        profile,
        artifact,
        screenshots,
        screenshotDirectory: this.storage.screenshotDirectory(testId),
        state: setState,
        throwIfCanceled,
        log: (level, message) => logger.write(level, message)
      });
      const failedRequired = steps.some(step => step.required && step.status !== 'Passed');
      if (failedRequired) throw new Error('One or more required checks did not pass');
      status = 'Passed';
    } catch (error) {
      if (Array.isArray(error.stepResults)) steps = error.stepResults;
      status = error.canceled ? 'Canceled' : error.blocked ? 'Blocked' : 'Failed';
      failureReason = normalizeError(error);
      await logger.write('error', failureReason);
    } finally {
      setState('Cleaning');
      await this.registry.close(testId).catch(() => {});
      const completedAt = new Date().toISOString();
      const report = {
        testId,
        application: profile.application,
        version: profile.version,
        platform: profile.platform,
        profile: profile.name,
        artifact: artifact ? { name: artifact.name, size: artifact.size, sha256: artifact.sha256, type: profile.artifactType } : { name: 'Not prepared', size: 0, sha256: '', type: profile.artifactType },
        environment,
        startedAt,
        completedAt,
        durationMs: Date.parse(completedAt) - Date.parse(startedAt),
        status,
        finalResult: status,
        steps,
        warnings,
        errors: failureReason ? [failureReason] : [],
        failureReason,
        logs: [this.storage.logPath(testId)],
        screenshots: screenshots.map(item => ({ name: item.name, windowTitle: item.windowTitle })),
        video: null
      };
      await this.reports.save(report);
      await fs.promises.rm(this.storage.tempDirectory(testId), { recursive: true, force: true }).catch(() => {});
      this.active = null;
      setState(status);
      this.emit('completed', report);
      return report;
    }
  }

  async cancel(testId) {
    if (!this.active || this.active.testId !== testId) return false;
    this.active.canceled = true;
    await this.registry.close(testId);
    return true;
  }

  emit(type, payload) {
    this.onEvent({ type, ...payload });
  }
}

module.exports = { TestRunner };
