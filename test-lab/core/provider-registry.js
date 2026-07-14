'use strict';

const { createWindowsProvider } = require('../providers/windows');
const android = require('../providers/android');
const linux = require('../providers/linux');

function blockedProvider(id, detail) {
  return {
    id,
    implemented: false,
    async environment() { return { status: 'Blocked', detected: false, detail }; }
  };
}

function createProviderRegistry(dependencies) {
  const providers = new Map([
    ['windows', createWindowsProvider(dependencies)],
    ['android', android],
    ['linux', linux],
    ['web', blockedProvider('web', 'Web Provider is planned for Phase 4.')],
    ['pwa', blockedProvider('pwa', 'PWA Provider is planned for Phase 4.')],
    ['docker', blockedProvider('docker', 'Docker Provider is planned for Phase 5. Docker will never be installed automatically.')],
    ['api', blockedProvider('api', 'API Provider is planned for Phase 5 and will use isolated test data.')],
    ['service', blockedProvider('service', 'Service Provider is planned for Phase 5.')],
    ['macos-remote', blockedProvider('macos-remote', 'Automated remote test is planned for Phase 6. No local interactive macOS environment is provided.')]
  ]);
  return {
    get(id) {
      const provider = providers.get(id);
      if (!provider) throw new Error('Unknown provider');
      return provider;
    },
    async environments() {
      const output = {};
      for (const [id, provider] of providers) output[id] = await provider.environment();
      return output;
    }
  };
}

module.exports = { createProviderRegistry };
