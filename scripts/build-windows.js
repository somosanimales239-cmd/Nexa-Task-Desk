'use strict';

const { spawnSync } = require('child_process');

const environment = {
  ...process.env,
  NEXA_BUILD_ID: String(process.env.NEXA_BUILD_ID || process.env.GITHUB_RUN_NUMBER || 'local')
};
const cli = require.resolve('electron-builder/cli.js');
const result = spawnSync(process.execPath, [cli, '--win', 'nsis', 'portable', '--x64', '--publish', 'never'], {
  stdio: 'inherit',
  env: environment
});

if (result.error) throw result.error;
process.exit(result.status === null ? 1 : result.status);
