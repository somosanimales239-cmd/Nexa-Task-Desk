'use strict';

const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { Storage } = require('./core/storage');
const { ProcessRegistry } = require('./core/process-registry');
const { createProviderRegistry } = require('./core/provider-registry');
const { TestRunner } = require('./core/test-runner');
const { ReportService } = require('./reports/report-service');
const { captureWindow } = require('./screenshots/capture');
const { inspectArtifact } = require('./core/artifact-validator');
const { assertPlainObject, safeId } = require('./core/security');

app.setName('Nexa Test Lab');
let mainWindow, storage, registry, providers, reports, runner;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 840, minWidth: 390, minHeight: 620, backgroundColor: '#07101f', show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', event => event.preventDefault());
}
function sendEvent(payload) { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('lab:event', payload); }

function registerIpc() {
  ipcMain.handle('lab:select-artifact', async (_event, platform) => {
    if (platform !== 'windows') throw new Error('Only Windows artifacts are enabled in version 1.0.0');
    const selected = await dialog.showOpenDialog(mainWindow, { title: 'Select Artifact', properties: ['openFile'], filters: [{ name: 'Windows executable', extensions: ['exe'] }] });
    if (selected.canceled || !selected.filePaths[0]) return null;
    const artifact = await inspectArtifact(selected.filePaths[0]);
    return { path: artifact.source, name: artifact.name, size: artifact.size, sha256: artifact.sha256 };
  });
  ipcMain.handle('lab:load-profiles', async () => {
    const directory = path.join(__dirname, 'fixtures');
    const files = (await fs.promises.readdir(directory)).filter(file => file.endsWith('.json'));
    return Promise.all(files.map(async file => ({ id: file, profile: JSON.parse(await fs.promises.readFile(path.join(directory, file), 'utf8')) })));
  });
  ipcMain.handle('lab:environments', () => providers.environments());
  ipcMain.handle('lab:history', () => storage.history());
  ipcMain.handle('lab:settings', () => storage.settings());
  ipcMain.handle('lab:save-settings', (_event, value) => storage.saveSettings(value));
  ipcMain.handle('lab:report', (_event, testId) => reports.load(safeId(testId)));
  ipcMain.handle('lab:start', async (_event, request) => {
    assertPlainObject(request, 'request');
    if (request.profile?.artifactType === 'installer') {
      const artifact = await inspectArtifact(request.artifactPath, request.expectedSha256 || undefined);
      const confirmation = await dialog.showMessageBox(mainWindow, {
        type: 'warning', title: 'Installer confirmation required',
        message: 'This trusted installer will be executed in a controlled smoke test.',
        detail: `${artifact.name}\n${artifact.size} bytes\nSHA-256: ${artifact.sha256}\n\nUAC and antivirus remain enabled.`,
        buttons: ['Cancel', 'Run installer smoke test'], defaultId: 0, cancelId: 0, noLink: true
      });
      if (confirmation.response !== 1) throw new Error('Installer execution was not confirmed');
    }
    return runner.start(request);
  });
  ipcMain.handle('lab:cancel', (_event, testId) => runner.cancel(safeId(testId)));
  ipcMain.handle('lab:open-report', async (_event, testId) => {
    const file = path.join(storage.reportDirectory(safeId(testId)), 'report.html');
    if (!fs.existsSync(file)) throw new Error('Report does not exist');
    const result = await shell.openPath(file); if (result) throw new Error(result); return true;
  });
  ipcMain.handle('lab:export-report', async (_event, testId) => {
    safeId(testId);
    const selected = await dialog.showSaveDialog(mainWindow, { title: 'Export Report', defaultPath: `Nexa-Test-Lab-${testId}.zip`, filters: [{ name: 'ZIP archive', extensions: ['zip'] }] });
    if (selected.canceled || !selected.filePath) return null;
    return reports.exportZip(testId, selected.filePath);
  });
  ipcMain.handle('lab:delete-report', async (_event, testId) => {
    safeId(testId);
    const confirmation = await dialog.showMessageBox(mainWindow, { type: 'warning', message: `Delete report ${testId}?`, detail: 'Report, log and screenshots will be removed.', buttons: ['Cancel', 'Delete'], defaultId: 0, cancelId: 0, noLink: true });
    return confirmation.response === 1 ? storage.deleteReport(testId) : null;
  });
  ipcMain.handle('lab:screenshot', async (_event, input) => {
    assertPlainObject(input, 'screenshot request');
    const testId = safeId(input.testId);
    if (typeof input.name !== 'string' || !/^capture-\d+\.png$/.test(input.name)) throw new Error('Invalid screenshot name');
    return `data:image/png;base64,${(await fs.promises.readFile(path.join(storage.screenshotDirectory(testId), input.name))).toString('base64')}`;
  });
}

app.whenReady().then(async () => {
  storage = new Storage(app.getPath('userData')); await storage.init();
  registry = new ProcessRegistry(); providers = createProviderRegistry({ registry, capture: captureWindow });
  reports = new ReportService(storage); runner = new TestRunner({ storage, providers, registry, reports, onEvent: sendEvent });
  registerIpc(); createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('before-quit', event => {
  if (registry && registry.processes.size) {
    event.preventDefault(); registry.closeAll().catch(() => {}).finally(() => { registry.processes.clear(); app.quit(); });
  }
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
