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
let mainWindow;
let storage;
let registry;
let providers;
let reports;
let runner;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 390,
    minHeight: 620,
    backgroundColor: '#07101f',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', event => event.preventDefault());
}

function sendEvent(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('lab:event', payload);
}

function registerIpc() {
  ipcMain.handle('lab:select-artifact', async (_event, platform) => {
    const filters = platform === 'windows' ? [{ name: 'Windows executable', extensions: ['exe'] }] : [{ name: 'Artifacts', extensions: ['exe', 'apk', 'AppImage', 'deb'] }];
    const selected = await dialog.showOpenDialog(mainWindow, { title: 'Select Artifact', properties: ['openFile'], filters });
    if (selected.canceled || !selected.filePaths[0]) return null;
    if (platform !== 'windows') return { path: selected.filePaths[0], name: path.basename(selected.filePaths[0]), pendingValidation: true };
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

  ipcMain.handle('lab:start', async (_event, request) => {
    assertPlainObject(request, 'request');
    if (request.profile?.artifactType === 'installer') {
      const artifact = await inspectArtifact(request.artifactPath, request.expectedSha256 || undefined);
      const confirmation = await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: 'Installer confirmation required',
        message: 'This installer will be executed in a Windows smoke test.',
        detail: `${artifact.name}\n${artifact.size} bytes\nSHA-256: ${artifact.sha256}\n\nUAC and antivirus will not be disabled. Phase 1 verifies the installer wizard launch, not unconfigured installation paths.`,
        buttons: ['Cancel', 'Run installer smoke test'],
        defaultId: 0,
        cancelId: 0,
        noLink: true
      });
      if (confirmation.response !== 1) throw new Error('Installer execution was not confirmed');
    }
    return runner.start(request);
  });

  ipcMain.handle('lab:cancel', (_event, testId) => runner.cancel(safeId(testId)));

  ipcMain.handle('lab:open-report', async (_event, testId) => {
    const file = path.join(storage.reportDirectory(safeId(testId)), 'report.html');
    if (!fs.existsSync(file)) throw new Error('Report does not exist');
    const result = await shell.openPath(file);
    if (result) throw new Error(result);
    return true;
  });

  ipcMain.handle('lab:export-report', async (_event, testId) => {
    safeId(testId);
    const selected = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Report',
      defaultPath: `Nexa-Test-Lab-${testId}.zip`,
      filters: [{ name: 'ZIP archive', extensions: ['zip'] }]
    });
    if (selected.canceled || !selected.filePath) return null;
    await reports.exportZip(testId, selected.filePath);
    return selected.filePath;
  });

  ipcMain.handle('lab:delete-report', async (_event, testId) => {
    safeId(testId);
    const confirmation = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      message: `Delete report ${testId}?`,
      detail: 'The report, its log and screenshots will be removed. This cannot be undone.',
      buttons: ['Cancel', 'Delete'],
      defaultId: 0,
      cancelId: 0,
      noLink: true
    });
    if (confirmation.response !== 1) return null;
    return storage.deleteReport(testId);
  });

  ipcMain.handle('lab:screenshot', async (_event, input) => {
    assertPlainObject(input, 'screenshot request');
    const testId = safeId(input.testId);
    if (typeof input.name !== 'string' || !/^capture-\d+\.png$/.test(input.name)) throw new Error('Invalid screenshot name');
    const file = path.join(storage.screenshotDirectory(testId), input.name);
    const data = await fs.promises.readFile(file);
    return `data:image/png;base64,${data.toString('base64')}`;
  });
}

app.whenReady().then(async () => {
  storage = new Storage(app.getPath('userData'));
  await storage.init();
  registry = new ProcessRegistry();
  providers = createProviderRegistry({ registry, capture: captureWindow });
  reports = new ReportService(storage);
  runner = new TestRunner({ storage, providers, registry, reports, onEvent: sendEvent });
  registerIpc();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('before-quit', event => {
  if (registry && [...registry.processes.keys()].length) {
    event.preventDefault();
    registry.closeAll().finally(() => {
      registry.processes.clear();
      app.quit();
    });
  }
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
