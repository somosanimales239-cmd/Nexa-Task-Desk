'use strict';

const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('nexaDelivery', Object.freeze({
  product: 'Nexa Test Lab',
  platform: process.platform,
  runtime: Object.freeze({
    electron: process.versions.electron,
    chrome: process.versions.chrome
  })
}));
