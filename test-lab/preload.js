'use strict';

const { contextBridge, ipcRenderer } = require('electron');
const allowedEvents = new Set(['state', 'log', 'completed']);

contextBridge.exposeInMainWorld('testLab', Object.freeze({
  selectArtifact: platform => ipcRenderer.invoke('lab:select-artifact', platform),
  loadProfiles: () => ipcRenderer.invoke('lab:load-profiles'),
  environments: () => ipcRenderer.invoke('lab:environments'),
  history: () => ipcRenderer.invoke('lab:history'),
  settings: () => ipcRenderer.invoke('lab:settings'),
  saveSettings: value => ipcRenderer.invoke('lab:save-settings', value),
  report: testId => ipcRenderer.invoke('lab:report', testId),
  start: request => ipcRenderer.invoke('lab:start', request),
  cancel: testId => ipcRenderer.invoke('lab:cancel', testId),
  openReport: testId => ipcRenderer.invoke('lab:open-report', testId),
  exportReport: testId => ipcRenderer.invoke('lab:export-report', testId),
  deleteReport: testId => ipcRenderer.invoke('lab:delete-report', testId),
  screenshot: (testId, name) => ipcRenderer.invoke('lab:screenshot', { testId, name }),
  onEvent: callback => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => { if (payload && allowedEvents.has(payload.type)) callback(payload); };
    ipcRenderer.on('lab:event', listener);
    return () => ipcRenderer.removeListener('lab:event', listener);
  },
  runtime: Object.freeze({ platform: process.platform, electron: process.versions.electron })
}));
