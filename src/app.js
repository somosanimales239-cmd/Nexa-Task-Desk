const button = document.querySelector('#checkButton');
const result = document.querySelector('#result');
const runtime = document.querySelector('#runtime');

const versions = window.nexa?.versions;
runtime.textContent = versions
  ? `Electron ${versions.electron} · Chromium ${versions.chrome}`
  : 'Secure browser context';

button.addEventListener('click', () => {
  result.textContent = 'Local UI check passed.';
  window.setTimeout(() => { result.textContent = ''; }, 3500);
});
