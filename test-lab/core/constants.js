'use strict';

const STATES = Object.freeze([
  'Idle', 'Detecting Android tools', 'Preparing', 'Starting emulator', 'Waiting for Android boot',
  'Installing APK', 'Installing', 'Launching application', 'Launching', 'Running checks', 'Testing',
  'Capturing screenshot', 'Capturing', 'Reading logcat', 'Collecting Logs', 'Cleaning environment',
  'Cleaning', 'Passed', 'Failed', 'Blocked', 'Canceled'
]);
const TERMINAL_STATES = Object.freeze(['Passed', 'Failed', 'Blocked', 'Canceled']);
const PLATFORMS = Object.freeze(['windows', 'android', 'linux', 'web', 'pwa', 'docker', 'api', 'service', 'macos-remote']);
const ARTIFACT_TYPES = Object.freeze(['portable', 'installer', 'apk']);
const ACTIONS = Object.freeze([
  'launch', 'install', 'uninstall', 'click', 'type', 'wait', 'wait_for_window', 'assertVisible', 'assertText',
  'assertProcessRunning', 'assertFileExists', 'assertNoCrash', 'screenshot', 'capture_screenshot', 'videoStart',
  'videoStop', 'logCapture', 'close', 'cleanup', 'validateArtifact', 'confirmEnvironment', 'startEmulator',
  'waitForBoot', 'launchApplication', 'assertNoAnr', 'stopApplication', 'relaunch'
]);
module.exports = Object.freeze({ STATES, TERMINAL_STATES, PLATFORMS, ARTIFACT_TYPES, ACTIONS, MAX_ARTIFACT_BYTES: 2 * 1024 * 1024 * 1024, DEFAULT_TIMEOUT_MS: 30000, MAX_TIMEOUT_MS: 10 * 60 * 1000, STABILITY_MS: 5000 });
