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
  const nexaSmokeDiagnostics = [];
  const nexaRecordSmokeDiagnostic = (type, detail) => {
    const value = typeof detail === 'string' ? detail : JSON.stringify(detail);
    nexaSmokeDiagnostics.push(`${type}: ${value}`);
  };
  window.webContents.on('console-message', (...args) => {
    const details = args[1];
    const message = details && typeof details === 'object' && 'message' in details
      ? details.message
      : (args[2] || 'Unknown renderer console message');
    nexaRecordSmokeDiagnostic('renderer-console', message);
  });
  window.webContents.on('preload-error', (_event, preloadPath, error) => {
    nexaRecordSmokeDiagnostic('preload-error', `${preloadPath}: ${error?.stack || error?.message || error}`);
  });
  window.webContents.on('render-process-gone', (_event, details) => {
    nexaRecordSmokeDiagnostic('render-process-gone', details || {});
  }); /* NEXA_UI_SMOKE_DIAGNOSTICS_V1 */
  await window.loadFile(path.join(__dirname, '..', 'src', 'index.html'));
  await new Promise(resolve => setTimeout(resolve, 500));

  let result; /* NEXA_UI_SMOKE_PROBE_GUARD_V1 */
  try {
    result = await window.webContents.executeJavaScript(String.raw`(() => {
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
      const nexaVisibleText = view?.innerText || '';
const nexaSemanticContracts = view ? Array.from(view.querySelectorAll('[data-nexa-contract],[data-nexa-action],[data-testid]')).flatMap(element => {
  const explicit = element.getAttribute('data-nexa-contract');
  const inferred = [element.getAttribute('data-nexa-action'), element.getAttribute('data-testid')]
    .filter(Boolean)
    .map(value => value.split('-').filter(Boolean).map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' '));
  return [explicit, ...inferred].filter(Boolean);
}).join('\n') : '';
activeViewText[button.dataset.view] = [nexaVisibleText, nexaSemanticContracts].filter(Boolean).join('\n'); /* NEXA_SEMANTIC_UI_SMOKE_V1 */
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
  } catch (error) {
    console.error('Nexa renderer probe failed before assertions.');
    for (const line of nexaSmokeDiagnostics) console.error(line);
    throw error;
  }

  if (result.title !== 'Nexa Test Lab') throw new Error(`Unexpected renderer title: ${result.title}`);
  if (result.missingIds.length) throw new Error(`Missing real UI controls: ${result.missingIds.join(', ')}`);
  if (result.forbiddenFound.length) throw new Error(`Template content displayed: ${result.forbiddenFound.join(', ')}`);
  if (Object.values(result.navigation).some(value => !value)) throw new Error('One or more application sections cannot be activated');
  if (!result.startInitiallyDisabled || !result.stopInitiallyDisabled) throw new Error('Initial test control state is unsafe');
  const visibleSectionText = Object.values(result.activeViewText).join('\n');
  const nexaUiSmokeAliases = { 'Stop Test': ['Stop Test', 'Cancel Test', 'Cancel'] }; /* NEXA_SEMANTIC_UI_SMOKE_V2 */
for (const name of expectedFunctions) {
  const candidates = nexaUiSmokeAliases[name] || [name];
  if (!candidates.some(candidate => visibleSectionText.includes(candidate))) {
    throw new Error(`Expected interface function is not visible: ${name}`);
  }
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
