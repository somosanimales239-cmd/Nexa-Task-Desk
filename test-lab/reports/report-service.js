'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { escapeHtml, redact, safeId } = require('../core/security');

class ReportService {
  constructor(storage) {
    this.storage = storage;
  }

  async save(report) {
    safeId(report.testId);
    const directory = this.storage.reportDirectory(report.testId);
    await fs.promises.mkdir(directory, { recursive: true });
    const safe = sanitize(report);
    const jsonPath = path.join(directory, 'report.json');
    const htmlPath = path.join(directory, 'report.html');
    await this.storage.atomicWriteJson(jsonPath, safe);
    await fs.promises.writeFile(htmlPath, renderHtml(safe), { encoding: 'utf8', mode: 0o600 });
    await this.storage.saveHistory(safe);
    return { report: safe, jsonPath, htmlPath };
  }

  async exportZip(testId, destination) {
    const source = this.storage.reportDirectory(testId);
    const staging = path.join(this.storage.tempDirectory(testId), 'export');
    await fs.promises.rm(staging, { recursive: true, force: true });
    await fs.promises.mkdir(staging, { recursive: true });
    await fs.promises.cp(source, path.join(staging, 'report'), { recursive: true });
    const log = this.storage.logPath(testId);
    const shots = this.storage.screenshotDirectory(testId);
    if (fs.existsSync(log)) await fs.promises.copyFile(log, path.join(staging, 'test.log'));
    if (fs.existsSync(shots)) await fs.promises.cp(shots, path.join(staging, 'screenshots'), { recursive: true });
    await compress(staging, destination);
    return destination;
  }
}

function sanitize(report) {
  return JSON.parse(JSON.stringify(report, (key, value) => typeof value === 'string' ? redact(value) : value));
}

function renderHtml(report) {
  const rows = report.steps.map(step => `<tr><td>${escapeHtml(step.action)}</td><td>${escapeHtml(step.status)}</td><td>${escapeHtml(step.detail)}</td></tr>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Nexa Test Lab Report</title><style>body{font:14px system-ui;background:#08101f;color:#e8f0ff;margin:0;padding:32px}main{max-width:980px;margin:auto;background:#101a2d;padding:28px;border-radius:16px}h1{margin-top:0}.status{color:${report.status === 'Passed' ? '#5ee0a0' : '#ff7b89'}}table{width:100%;border-collapse:collapse}td,th{padding:10px;border-bottom:1px solid #26344e;text-align:left}code{word-break:break-all;color:#9fc5ff}</style></head><body><main><h1>Nexa Test Lab Report</h1><h2 class="status">${escapeHtml(report.status)}</h2><p><b>Test ID:</b> ${escapeHtml(report.testId)}</p><p><b>Application:</b> ${escapeHtml(report.application)} ${escapeHtml(report.version)}</p><p><b>Platform:</b> ${escapeHtml(report.platform)}</p><p><b>Artifact:</b> ${escapeHtml(report.artifact.name)}</p><p><b>SHA-256:</b> <code>${escapeHtml(report.artifact.sha256)}</code></p><p><b>Duration:</b> ${escapeHtml(report.durationMs)} ms</p><table><thead><tr><th>Step</th><th>Result</th><th>Detail</th></tr></thead><tbody>${rows}</tbody></table></main></body></html>`;
}

function compress(source, destination) {
  return new Promise((resolve, reject) => {
    const escapedSource = source.replace(/'/g, "''");
    const escapedDestination = destination.replace(/'/g, "''");
    const command = `Compress-Archive -Path '${escapedSource}\\*' -DestinationPath '${escapedDestination}' -CompressionLevel Optimal -Force`;
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, shell: false });
    let stderr = '';
    child.stderr.on('data', data => { stderr += data; });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(stderr.trim() || `Report archive exited with code ${code}`)));
  });
}

module.exports = { ReportService, renderHtml };
