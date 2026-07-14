'use strict';

const byId = id => document.getElementById(id);
const elements = Object.fromEntries(['platform','artifactPath','artifactName','artifactSize','artifactSha','artifactValidation','expectedSha','profile','environmentStatus','refreshEnvironment','selectArtifact','startTest','stopTest','statusBadge','testId','finalResult','progressBar','timeline','console','screenshots','historyTable','historySearch','reportList','reportDetail','metricTotal','metricPassed','metricFailed','settingsForm','stabilityMs','defaultSha','confirmInstaller','settingsStatus'].map(id => [id, byId(id)]));
let profiles = [], artifact = null, activeTestId = null, running = false, historyItems = [];
const progress = { Idle:0, Preparing:8, Installing:28, Launching:35, Testing:58, Capturing:72, Cleaning:90, Passed:100, Failed:100, Blocked:100, Canceled:100 };

function navigate(name) {
  document.querySelectorAll('.view').forEach(view => view.classList.toggle('active', view.id === `view-${name}`));
  document.querySelectorAll('.nav button').forEach(button => button.classList.toggle('active', button.dataset.view === name));
}
function selectedProfile() { return profiles.find(item => item.id === elements.profile.value)?.profile || null; }
function setRunning(value) {
  running = value; elements.startTest.disabled = value || !artifact || !selectedProfile(); elements.stopTest.disabled = !value;
  elements.selectArtifact.disabled = value; elements.profile.disabled = value;
}
function setState(state) {
  elements.statusBadge.textContent = state; elements.statusBadge.className = `badge ${state.toLowerCase().replaceAll(' ', '-')}`;
  elements.finalResult.textContent = state; elements.progressBar.style.width = `${progress[state] ?? 0}%`;
}
function appendLog(line) { elements.console.textContent += `\n${line}`; elements.console.scrollTop = elements.console.scrollHeight; }
function addTimeline(text, status = '') {
  if (elements.timeline.children.length === 1 && elements.timeline.textContent.includes('Waiting')) elements.timeline.innerHTML = '';
  const item = document.createElement('li'); item.textContent = text; item.className = status.toLowerCase(); elements.timeline.append(item);
}
async function loadProfiles() {
  profiles = await window.testLab.loadProfiles(); elements.profile.replaceChildren(...profiles.filter(item => item.profile.platform === 'windows').map(item => { const option = document.createElement('option'); option.value = item.id; option.textContent = item.profile.name; return option; })); setRunning(running);
}
async function refreshEnvironment() {
  elements.refreshEnvironment.disabled = true;
  try { const environment = (await window.testLab.environments()).windows; elements.environmentStatus.textContent = `${environment.status}: ${environment.detail}`; }
  catch (error) { elements.environmentStatus.textContent = `Detection failed: ${error.message}`; }
  finally { elements.refreshEnvironment.disabled = false; }
}
async function selectArtifact() {
  try {
    const selected = await window.testLab.selectArtifact('windows'); if (!selected) return; artifact = selected;
    elements.artifactPath.value = selected.path; elements.artifactName.textContent = selected.name;
    elements.artifactSize.textContent = `${selected.size.toLocaleString()} bytes`; elements.artifactSha.textContent = selected.sha256;
    elements.artifactValidation.textContent = 'Valid Windows PE executable'; setRunning(false);
  } catch (error) { artifact = null; elements.artifactValidation.textContent = `Invalid: ${error.message}`; setRunning(false); }
}
async function startTest() {
  if (running || !artifact || !selectedProfile()) return;
  setRunning(true); navigate('execution'); setState('Preparing'); activeTestId = null;
  elements.testId.textContent = 'Allocating Test ID…'; elements.console.textContent = 'Preparing test…'; elements.timeline.innerHTML = '<li>Preparing artifact and environment</li>'; elements.screenshots.innerHTML = '<p class="muted">Captures will appear after completion.</p>';
  try { await renderCompleted(await window.testLab.start({ artifactPath: artifact.path, expectedSha256: elements.expectedSha.value.trim() || null, profile: selectedProfile() })); }
  catch (error) { appendLog(`Start failed: ${error.message}`); setState('Failed'); }
  finally { setRunning(false); await loadHistory(); }
}
async function stopTest() {
  if (!running || !activeTestId) return; elements.stopTest.disabled = true;
  await window.testLab.cancel(activeTestId); appendLog('Cancellation requested. Waiting for verified process cleanup…');
}
async function renderCompleted(report) {
  activeTestId = report.testId; setState(report.status); elements.testId.textContent = report.testId; elements.timeline.innerHTML = '';
  report.steps.forEach(step => addTimeline(`${step.action}: ${step.detail}`, step.status));
  if (!report.steps.length) addTimeline(report.failureReason || report.status, report.status);
  elements.screenshots.innerHTML = '';
  for (const shot of report.screenshots) { try { const image = document.createElement('img'); image.alt = shot.windowTitle || 'Test screenshot'; image.src = await window.testLab.screenshot(report.testId, shot.name); elements.screenshots.append(image); } catch (error) { appendLog(error.message); } }
  if (!report.screenshots.length) elements.screenshots.innerHTML = '<p class="muted">No captures were produced.</p>';
}
async function loadHistory() { historyItems = await window.testLab.history(); renderHistory(); renderReports(); renderMetrics(); }
function renderMetrics() {
  elements.metricTotal.textContent = historyItems.length; elements.metricPassed.textContent = historyItems.filter(item => item.status === 'Passed').length; elements.metricFailed.textContent = historyItems.filter(item => item.status === 'Failed').length;
}
function actionButton(label, action, danger = false) {
  const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.className = danger ? 'danger' : 'secondary';
  button.addEventListener('click', async () => { button.disabled = true; try { await action(); } catch (error) { appendLog(`${label} failed: ${error.message}`); } finally { button.disabled = false; } }); return button;
}
function renderHistory() {
  const query = elements.historySearch.value.trim().toLowerCase(); elements.historyTable.innerHTML = '';
  const filtered = historyItems.filter(item => `${item.application} ${item.platform} ${item.status} ${item.artifactName}`.toLowerCase().includes(query));
  filtered.forEach(item => {
    const row = document.createElement('tr'); [item.application, item.platform, item.status, new Date(item.startedAt).toLocaleString(), `${item.durationMs} ms`].forEach(value => { const cell = document.createElement('td'); cell.textContent = value; row.append(cell); });
    const actions = document.createElement('td'); actions.append(actionButton('View', async () => { navigate('reports'); await showReport(item.testId); }), actionButton('Export', () => window.testLab.exportReport(item.testId)), actionButton('Delete', async () => { const next = await window.testLab.deleteReport(item.testId); if (next) { historyItems = next; renderHistory(); renderReports(); renderMetrics(); } }, true)); row.append(actions); elements.historyTable.append(row);
  });
  if (!filtered.length) elements.historyTable.innerHTML = '<tr><td colspan="6" class="muted">No matching tests.</td></tr>';
}
function renderReports() {
  elements.reportList.innerHTML = '';
  historyItems.forEach(item => { const button = document.createElement('button'); button.type = 'button'; button.textContent = `${item.status} · ${item.application} · ${new Date(item.startedAt).toLocaleString()}`; button.addEventListener('click', () => showReport(item.testId)); elements.reportList.append(button); });
  if (!historyItems.length) elements.reportList.innerHTML = '<p class="muted">No reports available.</p>';
}
async function showReport(testId) {
  const report = await window.testLab.report(testId); elements.reportDetail.replaceChildren();
  const title = document.createElement('h2'); title.textContent = `${report.status} — ${report.application}`;
  const summary = document.createElement('p'); summary.textContent = `Test ${report.testId} · ${report.platform} · ${report.durationMs} ms`;
  const hash = document.createElement('p'); hash.className = 'hash'; hash.textContent = `SHA-256 ${report.artifact.sha256 || 'unavailable'}`;
  const list = document.createElement('ol'); report.steps.forEach(step => { const item = document.createElement('li'); item.textContent = `${step.status}: ${step.action} — ${step.detail}`; list.append(item); });
  elements.reportDetail.append(title, summary, hash, list, actionButton('Open HTML', () => window.testLab.openReport(testId)), actionButton('Export ZIP', () => window.testLab.exportReport(testId)));
}
async function loadSettings() { const settings = await window.testLab.settings(); elements.stabilityMs.value = settings.stabilityMs; elements.defaultSha.value = settings.expectedSha256; elements.confirmInstaller.checked = settings.confirmInstaller; if (!elements.expectedSha.value) elements.expectedSha.value = settings.expectedSha256; }
async function saveSettings(event) {
  event.preventDefault(); try { const settings = await window.testLab.saveSettings({ stabilityMs: Number(elements.stabilityMs.value), expectedSha256: elements.defaultSha.value.trim(), confirmInstaller: elements.confirmInstaller.checked }); elements.settingsStatus.textContent = 'Settings saved persistently.'; elements.expectedSha.value = settings.expectedSha256; } catch (error) { elements.settingsStatus.textContent = error.message; }
}

window.testLab.onEvent(event => { if (event.testId) { activeTestId = event.testId; elements.testId.textContent = event.testId; } if (event.type === 'state') { setState(event.state); addTimeline(event.state); } else if (event.type === 'log') appendLog(event.line); });
document.querySelectorAll('.nav button').forEach(button => button.addEventListener('click', () => navigate(button.dataset.view)));
elements.selectArtifact.addEventListener('click', selectArtifact); elements.startTest.addEventListener('click', startTest); elements.stopTest.addEventListener('click', stopTest); elements.refreshEnvironment.addEventListener('click', refreshEnvironment); elements.profile.addEventListener('change', () => setRunning(running)); elements.historySearch.addEventListener('input', renderHistory); elements.settingsForm.addEventListener('submit', saveSettings);
Promise.all([loadProfiles(), refreshEnvironment(), loadHistory(), loadSettings()]).then(() => setRunning(false)).catch(error => appendLog(`Initialization failed: ${error.message}`));
