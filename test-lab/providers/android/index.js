'use strict';

const { spawnSync } = require('child_process');

module.exports = {
  id: 'android',
  implemented: false,
  async environment() {
    const adb = spawnSync('where.exe', ['adb.exe'], { windowsHide: true, encoding: 'utf8' });
    return {
      status: 'Blocked',
      detected: adb.status === 0,
      detail: adb.status === 0
        ? 'ADB detected. Android execution remains disabled until Phase 2 validation.'
        : 'Tool missing: Android SDK Platform Tools (adb). Install from the official Android developer site, then test again.'
    };
  }
};
