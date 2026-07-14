'use strict';

const elements = Object.fromEntries([
  'platform','artifactPath','artifactMeta','expectedSha','profile','environmentStatus','refreshEnvironment',
  'selectArtifact','startTest','stopTest','statusBadge','testId','progressBar','timeline','console',
  'screenshots','history','historySearch'
].map(id => [id, document.getElementById(id)]));

let profiles = [];
let artifact = null;
let environments = {};
let activeTestId = null;
let running = false;
let historyItems = [];
const progress = { Idle:0, Preparing:8, Downloading:15, Installing:28, Launching:35, Testing:58, Capturing:72, 'Collecting Logs':82, Cleaning:90, Passed:100, Failed:100, Blocked:100, Canceled:100 };

function setRunning(value) {
  running = value;
  elements.startTest.disabled = value || !artifact || !selectedProfile();
  elements.stopTest.disabled = !value;
  elements.selectArtifact.disabled = value;
  elements.profile.disabled = value;
  elements.platform.disabled = value;
}

function selectedProfile() {
  return profiles.find(item => item.id === elements.profile.value)?.profile || null;
}

function setState(state) {
  elements.statusBadge.textContent = state;
  elements.statusBadge.className = `badge ${state.toLowerCase().replaceAll(' ', '-')}`;
  elements.progressBar.style.width = `${progress[state] ?? 0}%`;
}

function appendLog(line) {
  elements.console.textContent += `\n${line}`;
  elements.console.scrollTop = elements.console.scrollHeight;
}

function addTimeline(text, status = '') {
  if (elements.timeline.querySelector('.muted')) elements.timeline.innerHTML = '';
  const item = document.createElement('li');
  item.textContent = text;
  item.className = status.toLowerCase();
  elements.timeline.append(item);
}

async function loadProfiles() {
  profiles = await window.testLab.loadProfiles();
  renderProfiles();
}

function renderProfiles() {
  const platform = elements.platform.value;
  const available = profiles.filter(item => item.profile.platform === platform);
  elements.profile.replaceChildren(...available.map(item => {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item.profile.name;
    return option;
  }));
  setRunning(running);
}

async function refreshEnvironment() {
  elements.refreshEnvironment.disabled = true;
  elements.environmentStatus.textContent = 'Detecting environment…';
  try {
    environments = await window.testLab.environments();
    const environment = environments[elements.platform.value];
    elements.environmentStatus.textContent = environment ? `${environment.status}: ${environment.detail}` : 'Environment status unavailable.';
  } catch (error) {
    elements.environmentStatus.textContent = `Detection failed: ${error.message}`;
  } finally {
    elements.refreshEnvironment.disabled = false;
  }
}

async function selectArtifact() {
  elements.selectArtifact.disabled = true;
  try {
    artifact = await window.testLab.selectArtifact(elements.platform.value);
    if (!artifact) return;
    elements.artifactPath.value = artifact.path;
    elements.artifactMeta.textContent = artifact.sha256
      ? `${artifact.name} · ${artifact.size.toLocaleString()} bytes · SHA-256 ${artifact.sha256}`
      : `${artifact.name} · validation is deferred because this provider is not active in Phase 1.`;
  } catch (error) {
    artifact = null;
    elements.artifactPath.value = '';
    elements.artifactMeta.textContent = `Invalid artifact: ${error.message}`;
  } finally {
    setRunning(running);
  }
}

async function startTest() {
  if (running || !artifact) return;
  const profile = selectedProfile();
  if (!profile) return;
  setRunning(true);
  setState('Preparing');
  activeTestId = null;
  elements.testId.textContent = 'Allocating Test ID…';
  elements.console.textContent = 'Preparing test…';
  elements.timeline.innerHTML = '<li>Preparing artifact and environment</li>';
  elements.screenshots.innerHTML = '<p class="muted">Captures will appear after completion.</p>';
  try {
    const report = await window.testLab.start({ artifactPath: artifact.path, expectedSha256: elements.expectedSha.value.trim() || null, profile });
    activeTestId = report.testId;
    await renderCompleted(report);
  } catch (error) {
    appendLog(`Start failed: ${error.message}`);
    setState('Failed');
  } finally {
    setRunning(false);
    await loadHistory();
  }
}

async function stopTest() {
  if (!running || !activeTestId) return;
  elements.stopTest.disabled = true;
  await window.testLab.cancel(activeTestId);
  appendLog('Cancellation requested. Waiting for process cleanup…');
}

async function renderCompleted(report) {
  setState(report.status);
  elements.testId.textContent = report.testId;
  elements.timeline.innerHTML = '';
  for (const step of report.steps) addTimeline(`${step.action}: ${step.detail}`, step.status);
  if (!report.steps.length) addTimeline(report.failureReason || report.status, report.status);
  elements.screenshots.innerHTML = '';
  for (const shot of report.screenshots) {
    try {
      const image = document.createElement('img');
      image.alt = shot.windowTitle || 'Test screenshot';
      image.src = await window.testLab.screenshot(report.testId, shot.name);
      elements.screenshots.append(image);
    } catch (error) { appendLog(`Screenshot unavailable: ${error.message}`); }
  }
  if (!report.screenshots.length) elements.screenshots.innerHTML = '<p class="muted">No captures were produced.</p>';
}

async function loadHistory() {
  historyItems = await window.testLab.history();
  renderHistory();
}

function renderHistory() {
  const query = elements.historySearch.value.trim().toLowerCase();
  const filtered = historyItems.filter(item => `${item.application} ${item.platform} ${item.status} ${item.artifactName}`.toLowerCase().includes(query));
  elements.history.innerHTML = '';
  for (const item of filtered) {
    const row = document.createElement('tr');
    for (const value of [item.application, item.platform, item.status, new Date(item.startedAt).toLocaleString(), `${item.durationMs} ms`]) {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.append(cell);
    }
    const actions = document.createElement('td');
    for (const [label, action] of [['Open', () => window.testLab.openReport(item.testId)], ['Export', () => window.testLab.exportReport(item.testId)], ['Delete', async () => { const next = await window.testLab.deleteReport(item.testId); if (next) { historyItems = next; renderHistory(); } }]]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.className = label === 'Delete' ? 'danger' : 'secondary';
      button.addEventListener('click', async () => { button.disabled = true; try { await action(); } catch (error) { appendLog(`${label} failed: ${error.message}`); } finally { button.disabled = false; } });
      actions.append(button);
    }
    row.append(actions);
    elements.history.append(row);
  }
  if (!filtered.length) elements.history.innerHTML = '<tr><td colspan="6" class="muted">No matching tests.</td></tr>';
}

window.testLab.onEvent(event => {
  if (event.testId) {
    activeTestId = event.testId;
    elements.testId.textContent = event.testId;
  }
  if (event.type === 'state') {
    setState(event.state);
    addTimeline(event.state);
  } else if (event.type === 'log') appendLog(event.line);
});

elements.selectArtifact.addEventListener('click', selectArtifact);
elements.startTest.addEventListener('click', startTest);
elements.stopTest.addEventListener('click', stopTest);
elements.refreshEnvironment.addEventListener('click', refreshEnvironment);
elements.platform.addEventListener('change', async () => { artifact = null; elements.artifactPath.value = ''; elements.artifactMeta.textContent = 'No artifact selected.'; renderProfiles(); await refreshEnvironment(); });
elements.profile.addEventListener('change', () => setRunning(running));
elements.historySearch.addEventListener('input', renderHistory);

Promise.all([loadProfiles(), refreshEnvironment(), loadHistory()]).then(() => setRunning(false)).catch(error => appendLog(`Initialization failed: ${error.message}`));
