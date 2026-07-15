'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

const expectedFunctions = [
  'Dashboard', 'Select Artifact', 'Artifact Information', 'SHA-256', 'Environment Status',
  'Test Profile', 'Start Test', 'Stop Test', 'Timeline', 'Log Console', 'Screenshots',
  'Final Result', 'History', 'Reports', 'Settings'
];

function registerMocks() {
  ipcMain.handle('lab:load-profiles', () => [{
    id: 'smoke.json',
    profile: {
      name: 'UI Smoke Profile',
      application: 'Nexa Test Lab',
      version: '1.0.6',
      platform: 'windows',
      artifactType: 'portable',
      steps: [{ action: 'launch' }]
    }
  }]);
  ipcMain.handle('lab:environments', () => ({ windows: { status: 'Ready', detail: 'UI smoke environment' } }));
  ipcMain.handle('lab:history', () => []);
  ipcMain.handle('lab:settings', () => ({ version: 1, stabilityMs: 5000, expectedSha256: '', confirmInstaller: true }));
}

async function run() {
  registerMocks();
  const window = new BrowserWindow({
    width: 1000,
    height: 760,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  await window.loadFile(path.join(__dirname, '..', 'src', 'index.html'));
  await new Promise(resolve => setTimeout(resolve, 500));

  const result = await window.webContents.executeJavaScript(`(() => {
    const requiredIds = [
      'selectArtifact', 'artifactPath', 'artifactName', 'artifactSize', 'artifactSha',
      'artifactValidation', 'expectedSha', 'profile', 'environmentStatus', 'startTest',
      'stopTest', 'timeline', 'console', 'screenshots', 'finalResult', 'historyTable',
      'reportList', 'settingsForm'
    ];
    const missingIds = requiredIds.filter(id => !document.getElementById(id));
    const forbidden = ['Your Windows application is ready to evolve', 'Run local check'];
    const forbiddenFound = forbidden.filter(text => document.body.innerText.includes(text));
    const navigation = {};
    const activeViewText = {};
    for (const button of document.querySelectorAll('.nav button')) {
      button.click();
      const view = document.getElementById('view-' + button.dataset.view);
      navigation[button.dataset.view] = Boolean(view?.classList.contains('active'));
      activeViewText[button.dataset.view] = view?.innerText || '';
    }
    return {
      title: document.title,
      missingIds,
      forbiddenFound,
      navigation,
      startInitiallyDisabled: document.getElementById('startTest').disabled,
      stopInitiallyDisabled: document.getElementById('stopTest').disabled,
      activeViewText
    };
  })()`, true);

  if (result.title !== 'Nexa Test Lab') throw new Error(`Unexpected renderer title: ${result.title}`);
  if (result.missingIds.length) throw new Error(`Missing real UI controls: ${result.missingIds.join(', ')}`);
  if (result.forbiddenFound.length) throw new Error(`Template content displayed: ${result.forbiddenFound.join(', ')}`);
  if (Object.values(result.navigation).some(value => !value)) throw new Error('One or more application sections cannot be activated');
  if (!result.startInitiallyDisabled || !result.stopInitiallyDisabled) throw new Error('Initial test control state is unsafe');
  const visibleSectionText = Object.values(result.activeViewText).join('\n');
  for (const name of expectedFunctions) {
    if (!visibleSectionText.includes(name)) throw new Error(`Expected interface function is not visible: ${name}`);
  }

  console.log(JSON.stringify({
    renderer: 'test-lab/src/index.html',
    title: result.title,
    navigation: Object.keys(result.navigation),
    verifiedFunctions: expectedFunctions
  }, null, 2));
  window.destroy();
}

app.whenReady().then(run).then(() => app.exit(0)).catch(error => {
  console.error(error.stack || error.message);
  app.exit(1);
});
