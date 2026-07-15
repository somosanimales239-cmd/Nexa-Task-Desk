'use strict';

const { createWindowsProvider } = require('../providers/windows');
const android = require('../providers/android');
const linux = require('../providers/linux');

function blockedProvider(id, detail) {
  return { id, implemented: false, async environment() { return { status: 'Blocked', provider: 'Blocked', detected: false, detail }; } };
}

function createProviderRegistry(dependencies) {
  const providers = new Map([
    ['windows', createWindowsProvider(dependencies)],
    ['android', android],
    ['linux', linux],
    ['web', blockedProvider('web', 'Web Provider is planned for a later phase.')],
    ['pwa', blockedProvider('pwa', 'PWA Provider is planned for a later phase.')],
    ['docker', blockedProvider('docker', 'Docker Provider is planned for a later phase.')],
    ['api', blockedProvider('api', 'API Provider is planned for a later phase.')],
    ['service', blockedProvider('service', 'Service Provider is planned for a later phase.')],
    ['macos-remote', blockedProvider('macos-remote', 'Remote macOS Provider is planned for a later phase.')]
  ]);
  return {
    get(id) { const provider = providers.get(id); if (!provider) throw new Error('Unknown provider'); return provider; },
    async environments() { const output = {}; for (const [id, provider] of providers) output[id] = await provider.environment(); return output; }
  };
}

module.exports = { createProviderRegistry };
