'use strict';

const { spawnSync } = require('child_process');

module.exports = {
  id: 'linux',
  implemented: false,
  async environment() {
    const wsl = process.platform === 'win32' ? spawnSync('wsl.exe', ['--status'], { windowsHide: true, encoding: 'utf8' }) : { status: 1 };
    return {
      status: 'Blocked',
      detected: wsl.status === 0,
      detail: wsl.status === 0
        ? 'WSL detected. AppImage and DEB execution remains disabled until Phase 3 validation.'
        : 'Tool missing: WSL2. It is required for the planned Linux provider; no installation was attempted.'
    };
  }
};
