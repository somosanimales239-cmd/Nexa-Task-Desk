'use strict';

const { spawn } = require('child_process');
const path = require('path');
const { safeId } = require('./security');

class ProcessRegistry {
  constructor() {
    this.processes = new Map();
  }

  register(testId, child) {
    safeId(testId);
    if (!child || !Number.isInteger(child.pid)) throw new Error('Cannot register a process without a PID');
    if (!this.processes.has(testId)) this.processes.set(testId, new Set());
    this.processes.get(testId).add(child);
    child.once('exit', () => this.processes.get(testId)?.delete(child));
    return child;
  }

  active(testId) {
    return [...(this.processes.get(testId) || [])].filter(child => child.exitCode === null && !child.killed);
  }

  async close(testId, timeoutMs = 5000) {
    const children = this.active(testId);
    for (const child of children) await this.closePid(child.pid, timeoutMs);
    this.processes.delete(testId);
  }

  async closePid(pid, timeoutMs) {
    if (!Number.isInteger(pid) || pid < 1) return;
    if (process.platform === 'win32') {
      const script = path.join(__dirname, '..', 'automation', 'windows', 'window-control.ps1');
      await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, String(pid), String(timeoutMs)], timeoutMs + 3000).catch(() => {});
      return;
    }
    try { process.kill(pid, 'SIGTERM'); } catch {}
    await new Promise(resolve => setTimeout(resolve, Math.min(timeoutMs, 1000)));
    try { process.kill(pid, 'SIGKILL'); } catch {}
  }

  async closeAll() {
    for (const testId of [...this.processes.keys()]) await this.close(testId);
  }
}

function run(file, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { windowsHide: true, shell: false });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Process cleanup timed out'));
    }, timeoutMs);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`Cleanup exited with code ${code}`)); });
  });
}

module.exports = { ProcessRegistry };
