'use strict';

const { spawn } = require('child_process');
const path = require('path');
const { safeId } = require('./security');

class ProcessRegistry {
  constructor() { this.processes = new Map(); }

  register(testId, child) {
    safeId(testId);
    if (!child || !Number.isInteger(child.pid)) throw new Error('Cannot register a process without a PID');
    if (!this.processes.has(testId)) this.processes.set(testId, new Set());
    this.processes.get(testId).add(child);
    child.once('exit', () => this.processes.get(testId)?.delete(child));
    return child;
  }

  active(testId) { return [...(this.processes.get(testId) || [])].filter(child => child.exitCode === null); }

  async close(testId, timeoutMs = 5000) {
    const errors = [];
    for (const child of this.active(testId)) {
      try { await this.closePid(child.pid, timeoutMs); } catch (error) { errors.push(error.message); }
    }
    this.processes.delete(testId);
    if (errors.length) throw new Error(errors.join('; '));
  }

  async closePid(pid, timeoutMs) {
    if (!Number.isInteger(pid) || pid < 1) return;
    if (process.platform === 'win32') {
      const script = path.join(__dirname, '..', 'automation', 'windows', 'window-control.ps1');
      await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, String(pid), String(timeoutMs)], timeoutMs + 4000);
      return;
    }
    try { process.kill(pid, 'SIGTERM'); } catch { return; }
    await new Promise(resolve => setTimeout(resolve, Math.min(timeoutMs, 1000)));
    try { process.kill(pid, 0); process.kill(pid, 'SIGKILL'); } catch {}
  }

  async closeAll() {
    const errors = [];
    for (const testId of [...this.processes.keys()]) try { await this.close(testId); } catch (error) { errors.push(error.message); }
    if (errors.length) throw new Error(errors.join('; '));
  }
}

function run(file, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { windowsHide: true, shell: false });
    let stderr = '';
    child.stderr.on('data', data => { stderr += data; });
    const timer = setTimeout(() => { child.kill(); reject(new Error('Process cleanup timed out')); }, timeoutMs);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(stderr.trim() || `Cleanup exited with code ${code}`)); });
  });
}

module.exports = { ProcessRegistry };
