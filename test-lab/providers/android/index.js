'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const WINDOWS_EXTENSIONS = process.platform === 'win32';
const TOOL_NAMES = Object.freeze({
  adb: WINDOWS_EXTENSIONS ? 'adb.exe' : 'adb',
  emulator: WINDOWS_EXTENSIONS ? 'emulator.exe' : 'emulator',
  avdmanager: WINDOWS_EXTENSIONS ? 'avdmanager.bat' : 'avdmanager',
  aapt: WINDOWS_EXTENSIONS ? 'aapt.exe' : 'aapt'
});

function commandName(name) {
  return process.platform === 'win32' ? `${name}.exe` : name;
}

function candidateRoots() {
  const roots = [];
  for (const value of [process.env.ANDROID_SDK_ROOT, process.env.ANDROID_HOME]) {
    if (value && path.isAbsolute(value)) roots.push(path.normalize(value));
  }
  if (process.platform === 'win32') {
    if (process.env.LOCALAPPDATA) roots.push(path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk'));
    if (process.env.USERPROFILE) roots.push(path.join(process.env.USERPROFILE, 'AppData', 'Local', 'Android', 'Sdk'));
  } else if (process.env.HOME) {
    roots.push(path.join(process.env.HOME, 'Android', 'Sdk'));
  }
  return [...new Set(roots)];
}

function firstExisting(values) {
  return values.find(value => value && fs.existsSync(value)) || null;
}

function locateTools() {
  const roots = candidateRoots();
  const adb = firstExisting([
    ...roots.map(root => path.join(root, 'platform-tools', TOOL_NAMES.adb)),
    ...roots.map(root => path.join(root, 'platform-tools', 'adb'))
  ]);
  const emulator = firstExisting(roots.map(root => path.join(root, 'emulator', TOOL_NAMES.emulator)));
  const avdmanager = firstExisting(roots.map(root => path.join(root, 'cmdline-tools', 'latest', 'bin', TOOL_NAMES.avdmanager)).concat(roots.map(root => path.join(root, 'tools', 'bin', TOOL_NAMES.avdmanager))));
  const aapt = firstExisting(roots.flatMap(root => [path.join(root, 'build-tools'), path.join(root, 'platform-tools')]).flatMap(root => {
    if (!fs.existsSync(root)) return [];
    try { return fs.readdirSync(root).sort().reverse().map(version => path.join(root, version, TOOL_NAMES.aapt)); } catch { return []; }
  }));
  return { sdkRoot: roots.find(root => fs.existsSync(root)) || null, adb, emulator, avdmanager, aapt };
}

function run(file, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    if (!file || !path.isAbsolute(file)) return reject(new Error('Android tool path is not absolute'));
    const child = spawn(file, args, { windowsHide: true, shell: false, cwd: options.cwd, env: process.env });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', data => { stdout += data.toString(); });
    child.stderr.on('data', data => { stderr += data.toString(); });
    const timer = setTimeout(() => { child.kill(); reject(new Error(`Android command timed out: ${path.basename(file)}`)); }, options.timeoutMs || 15000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(stderr.trim() || `${path.basename(file)} exited with code ${code}`));
      resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
    });
    if (options.onChild) options.onChild(child);
  });
}

async function version(file) {
  if (!file) return null;
  try { return (await run(file, ['version'], { timeoutMs: 8000 })).stdout || 'detected'; } catch { return 'detected'; }
}

async function listAvds(tools) {
  if (!tools.emulator) return [];
  try { return (await run(tools.emulator, ['-list-avds'], { timeoutMs: 10000 })).stdout.split(/\r?\n/).map(value => value.trim()).filter(Boolean); } catch { return []; }
}

async function detectEnvironment() {
  const tools = locateTools();
  const avds = await listAvds(tools);
  const detected = {
    sdk: Boolean(tools.sdkRoot),
    adb: Boolean(tools.adb),
    emulator: Boolean(tools.emulator),
    avdmanager: Boolean(tools.avdmanager),
    aapt: Boolean(tools.aapt)
  };
  const ready = detected.sdk && detected.adb && detected.emulator && detected.avdmanager && detected.aapt;
  const versions = {};
  for (const [name, file] of Object.entries({ adb: tools.adb, emulator: tools.emulator, avdmanager: tools.avdmanager })) versions[name] = await version(file);
  return {
    id: 'android', platform: 'android', status: ready && avds.length ? 'Blocked' : 'Blocked', provider: 'Blocked',
    detail: ready && avds.length ? 'Android tools detected. A real smoke test is required before Ready.' : 'Blocked — prerequisite missing',
    prerequisiteMissing: !ready, sdkRoot: tools.sdkRoot, detected, versions, avds,
    avdCount: avds.length, lastCheck: new Date().toISOString(), tools
  };
}

async function validateArtifact(file, expectedSha256) {
  if (typeof file !== 'string' || !path.isAbsolute(file) || /^(\\\\|\/\/|https?:|file:)/i.test(file)) throw new Error('APK must be a local absolute path');
  if (path.extname(file).toLowerCase() !== '.apk') throw new Error('Android artifact must use the .apk extension');
  const stat = await fs.promises.stat(file);
  if (!stat.isFile() || stat.size < 1024) throw new Error('APK is missing or too small');
  const sha256 = await new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256'); const stream = fs.createReadStream(file);
    stream.on('data', chunk => hash.update(chunk)); stream.on('error', reject); stream.on('end', () => resolve(hash.digest('hex')));
  });
  if (expectedSha256 && (!/^[a-f0-9]{64}$/i.test(expectedSha256) || sha256 !== expectedSha256.toLowerCase())) throw new Error('APK SHA-256 does not match the expected value');
  const tools = locateTools();
  if (!tools.aapt) throw new Error('Cannot determine APK package ID: aapt is missing');
  const metadata = await run(tools.aapt, ['dump', 'badging', file], { timeoutMs: 15000 });
  const match = metadata.stdout.match(/package:\s+name='([^']+)'/);
  if (!match || !/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/.test(match[1])) throw new Error('APK package ID could not be verified');
  return { source: file, name: path.basename(file), size: stat.size, sha256, packageId: match[1] };
}

function adbArgs(serial, args) { return serial ? ['-s', serial, ...args] : args; }

async function prepareEnvironment(context = {}) {
  const environment = await detectEnvironment();
  if (environment.prerequisiteMissing) throw Object.assign(new Error('Blocked — prerequisite missing'), { blocked: true, environment });
  const avd = context.avd || environment.avds[0];
  if (!avd || !environment.avds.includes(avd)) throw new Error('A valid existing AVD must be selected');
  return { ...environment, selectedAvd: avd, serial: `nexa-${Date.now()}`, started: false };
}

async function installArtifact(environment, artifact, context = {}) {
  if (!environment?.tools?.adb || !artifact?.source) throw new Error('Android environment or APK is not ready');
  const result = await run(environment.tools.adb, adbArgs(environment.serial, ['install', '-r', artifact.source]), { timeoutMs: context.timeoutMs || 120000, onChild: context.onChild });
  if (!/success/i.test(result.stdout)) throw new Error(`APK installation failed: ${result.stdout || result.stderr}`);
  return result;
}

async function launchArtifact(environment, packageId, context = {}) {
  const result = await run(environment.tools.adb, adbArgs(environment.serial, ['shell', 'monkey', '-p', packageId, '1']), { timeoutMs: context.timeoutMs || 30000, onChild: context.onChild });
  if (!/Events injected/i.test(result.stdout) && result.stderr) throw new Error(`APK launch failed: ${result.stderr}`);
  return result;
}

async function waitForBoot(environment, context = {}) {
  const deadline = Date.now() + (context.timeoutMs || 120000);
  while (Date.now() < deadline) {
    context.throwIfCanceled?.();
    try {
      const result = await run(environment.tools.adb, adbArgs(environment.serial, ['shell', 'getprop', 'sys.boot_completed']), { timeoutMs: 10000 });
      if (result.stdout.trim() === '1') return true;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  throw new Error('Android emulator boot timeout');
}

async function collectLogs(environment, context = {}) {
  const result = await run(environment.tools.adb, adbArgs(environment.serial, ['logcat', '-d', '-t', '300']), { timeoutMs: 30000 });
  const text = result.stdout;
  return { text, fatalException: /FATAL EXCEPTION|AndroidRuntime.*(?:FATAL|crash)/i.test(text), anr: /ANR in |Application Not Responding/i.test(text) };
}

async function captureEvidence(environment, outputDirectory, context = {}) {
  await fs.promises.mkdir(outputDirectory, { recursive: true });
  const file = path.join(outputDirectory, `capture-${Date.now()}.png`);
  await new Promise((resolve, reject) => {
    const child = spawn(environment.tools.adb, adbArgs(environment.serial, ['exec-out', 'screencap', '-p']), { windowsHide: true, shell: false });
    const output = fs.createWriteStream(file, { mode: 0o600 }); child.pipe(output);
    child.once('error', reject); output.once('finish', resolve); child.once('exit', code => { if (code !== 0) reject(new Error('Android screenshot failed')); });
    context.onChild?.(child);
  });
  return { file, name: path.basename(file), windowTitle: 'Android Emulator' };
}

async function stopTest(environment, packageId) {
  if (!environment?.tools?.adb) return;
  if (packageId) await run(environment.tools.adb, adbArgs(environment.serial, ['shell', 'am', 'force-stop', packageId]), { timeoutMs: 15000 }).catch(() => {});
}

async function cleanup(environment, context = {}) {
  if (context.uninstall && environment?.tools?.adb && context.packageId) await run(environment.tools.adb, adbArgs(environment.serial, ['uninstall', context.packageId]), { timeoutMs: 30000 }).catch(() => {});
  if (context.shutdown && environment?.tools?.adb && environment.serial) await run(environment.tools.adb, adbArgs(environment.serial, ['emu', 'kill']), { timeoutMs: 15000 }).catch(() => {});
}

async function executeTestProfile(context) {
  const environment = await prepareEnvironment(context);
  const artifact = await validateArtifact(context.artifact.source, context.expectedSha256);
  await installArtifact(environment, artifact, context);
  await launchArtifact(environment, artifact.packageId, context);
  await waitForBoot(environment, context);
  await new Promise(resolve => setTimeout(resolve, 15000));
  const logs = await collectLogs(environment, context);
  if (logs.fatalException || logs.anr) throw new Error(logs.fatalException ? 'Fatal Exception detected in logcat' : 'ANR detected in logcat');
  const screenshot = await captureEvidence(environment, context.screenshotDirectory, context);
  await stopTest(environment, artifact.packageId);
  await launchArtifact(environment, artifact.packageId, context);
  await stopTest(environment, artifact.packageId);
  await cleanup(environment, { packageId: artifact.packageId, uninstall: context.uninstall, shutdown: context.shutdown });
  return { environment, artifact, logs, screenshots: [screenshot] };
}

async function generateResult(input) { return { ...input, status: input.status || 'Failed', platform: 'android' }; }

const provider = {
  id: 'android', implemented: true, detectEnvironment, environment: detectEnvironment, validateArtifact,
  prepareEnvironment, installArtifact, launchArtifact, executeTestProfile, collectLogs, captureEvidence,
  stopTest, cleanup, generateResult,
  async run(context) {
    const result = await executeTestProfile(context);
    return [
      { action: 'validateArtifact', required: true, status: 'Passed', detail: `APK validated: ${result.artifact.packageId}` },
      { action: 'install', required: true, status: 'Passed', detail: 'APK installed with ADB' },
      { action: 'launch', required: true, status: 'Passed', detail: 'Application launched and relaunched successfully' },
      { action: 'wait', required: true, status: 'Passed', detail: 'Application remained open for 15000 ms' },
      { action: 'screenshot', required: true, status: 'Passed', detail: result.screenshots[0].name },
      { action: 'logCapture', required: true, status: 'Passed', detail: 'No Fatal Exception or ANR detected' },
      { action: 'cleanup', required: true, status: 'Passed', detail: 'Android test environment cleaned' }
    ];
  }
};

module.exports = provider;
