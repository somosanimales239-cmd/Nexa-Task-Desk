'use strict';

const { spawn } = require('child_process');
const path = require('path');
const { STABILITY_MS } = require('../../core/constants');

function createWindowsProvider({ registry, capture }) {
  return {
    id: 'windows',
    implemented: true,
    async environment() {
      return process.platform === 'win32'
        ? { status: 'Ready', detail: `Windows ${process.getSystemVersion ? process.getSystemVersion() : ''}`.trim() }
        : { status: 'Blocked', detail: 'Windows Provider requires a Windows host.' };
    },
    async run(context) {
      if (process.platform !== 'win32') throw blocked('Windows Provider requires a Windows host');
      let child = null;
      let processState = null;
      let titleContains = context.profile.application;
      const results = [];

      for (const step of context.profile.steps) {
        context.throwIfCanceled();
        const startedAt = new Date().toISOString();
        try {
          let detail = '';
          if (step.action === 'launch' || step.action === 'install') {
            if (child) throw new Error('Artifact has already been launched');
            context.state(step.action === 'install' ? 'Installing' : 'Launching');
            child = spawn(context.artifact.source, [], {
              cwd: path.dirname(context.artifact.source),
              windowsHide: false,
              shell: false,
              stdio: ['ignore', 'pipe', 'pipe']
            });
            registry.register(context.testId, child);
            child.stdout?.on('data', data => context.log('stdout', data.toString()));
            child.stderr?.on('data', data => context.log('stderr', data.toString()));
            await waitForSpawn(child, step.timeoutMs);
            detail = `Process started with PID ${child.pid}`;
          } else if (step.action === 'wait_for_window') {
            requireChild(child);
            context.state('Testing');
            titleContains = step.title_contains || context.profile.application;
            processState = await waitForWindow(child, titleContains, step.timeoutMs);
            detail = `Window detected: ${processState.windowTitle}`;
          } else if (step.action === 'assertProcessRunning') {
            requireChild(child);
            processState = await inspect(child.pid);
            if (!processState.responding) throw new Error('Application process is not responding');
            detail = `PID ${child.pid} is running and responding`;
          } else if (step.action === 'wait') {
            requireChild(child);
            await stableWait(child, step.durationMs || STABILITY_MS, context.throwIfCanceled);
            detail = `Process remained active for ${step.durationMs || STABILITY_MS} ms`;
          } else if (step.action === 'screenshot' || step.action === 'capture_screenshot') {
            context.state('Capturing');
            const shot = await capture(context.screenshotDirectory, titleContains);
            context.screenshots.push(shot);
            detail = `Screenshot captured: ${shot.name}`;
          } else if (step.action === 'assertNoCrash') {
            requireChild(child);
            if (context.profile.artifactType === 'portable' && child.exitCode !== null) throw new Error(`Application exited unexpectedly with code ${child.exitCode}`);
            if (context.profile.artifactType === 'installer' && child.exitCode !== null && child.exitCode !== 0) throw new Error(`Installer exited with code ${child.exitCode}`);
            detail = child.exitCode === null ? 'No unexpected process termination detected' : 'Installer exited successfully';
          } else if (step.action === 'close') {
            if (child && child.exitCode === null) await registry.close(context.testId, step.timeoutMs);
            detail = 'Registered process tree closed';
          } else if (step.action === 'cleanup') {
            context.state('Cleaning');
            await registry.close(context.testId, step.timeoutMs);
            detail = 'Process registry and temporary execution state cleaned';
          } else {
            throw new Error(`Action ${step.action} is not implemented by Windows Provider Phase 1`);
          }
          results.push(result(step, 'Passed', detail, startedAt));
        } catch (error) {
          const status = step.required ? 'Failed' : 'Blocked';
          results.push(result(step, status, error.message, startedAt));
          if (step.required) throw Object.assign(error, { stepResults: results });
        }
      }
      return results;
    }
  };
}

function result(step, status, detail, startedAt) {
  return { action: step.action, required: step.required, status, detail, startedAt, completedAt: new Date().toISOString() };
}

function requireChild(child) {
  if (!child) throw new Error('No artifact process has been launched');
}

function waitForSpawn(child, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Process did not start before timeout')), timeoutMs);
    child.once('spawn', () => { clearTimeout(timer); setTimeout(resolve, 700); });
    child.once('error', error => { clearTimeout(timer); reject(error); });
  }).then(() => {
    if (child.exitCode !== null && child.exitCode !== 0) throw new Error(`Process exited during launch with code ${child.exitCode}`);
  });
}

async function stableWait(child, durationMs, throwIfCanceled) {
  const end = Date.now() + durationMs;
  while (Date.now() < end) {
    throwIfCanceled();
    if (child.exitCode !== null) throw new Error(`Application exited unexpectedly with code ${child.exitCode}`);
    await delay(250);
  }
}

async function waitForWindow(child, titleContains, timeoutMs) {
  const end = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < end) {
    if (child.exitCode !== null) throw new Error(`Process exited before a window was detected with code ${child.exitCode}`);
    try {
      const state = await inspect(child.pid);
      if (state.hasWindow && state.windowTitle.toLowerCase().includes(String(titleContains).toLowerCase())) return state;
    } catch (error) {
      lastError = error;
    }
    await delay(350);
  }
  throw new Error(lastError ? `Window detection timed out: ${lastError.message}` : `No window title contained "${titleContains}"`);
}

function inspect(pid) {
  const script = path.join(__dirname, '..', '..', 'automation', 'windows', 'process-inspection.ps1');
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, String(pid)], { windowsHide: true, shell: false });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    child.once('error', reject);
    child.once('exit', code => {
      if (code !== 0) return reject(new Error(stderr.trim() || `Inspection exited with code ${code}`));
      try { resolve(JSON.parse(stdout.trim())); } catch { reject(new Error('Process inspection returned invalid data')); }
    });
  });
}

function blocked(message) {
  return Object.assign(new Error(message), { blocked: true });
}

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

module.exports = { createWindowsProvider };
