'use strict';

const STATES = Object.freeze([
  'Idle', 'Preparing', 'Downloading', 'Installing', 'Launching', 'Testing',
  'Capturing', 'Collecting Logs', 'Cleaning', 'Passed', 'Failed', 'Blocked', 'Canceled'
]);

const TERMINAL_STATES = Object.freeze(['Passed', 'Failed', 'Blocked', 'Canceled']);
const PLATFORMS = Object.freeze(['windows', 'android', 'linux', 'web', 'pwa', 'docker', 'api', 'service', 'macos-remote']);
const ARTIFACT_TYPES = Object.freeze(['portable', 'installer']);
const ACTIONS = Object.freeze([
  'launch', 'install', 'uninstall', 'click', 'type', 'wait', 'wait_for_window',
  'assertVisible', 'assertText', 'assertProcessRunning', 'assertFileExists',
  'assertNoCrash', 'screenshot', 'capture_screenshot', 'videoStart', 'videoStop',
  'logCapture', 'close', 'cleanup'
]);

module.exports = Object.freeze({
  STATES,
  TERMINAL_STATES,
  PLATFORMS,
  ARTIFACT_TYPES,
  ACTIONS,
  MAX_ARTIFACT_BYTES: 2 * 1024 * 1024 * 1024,
  DEFAULT_TIMEOUT_MS: 30000,
  MAX_TIMEOUT_MS: 10 * 60 * 1000,
  STABILITY_MS: 5000
});
