'use strict';

const { ACTIONS, PLATFORMS, DEFAULT_TIMEOUT_MS } = require('./constants');
const { assertPlainObject, clampTimeout } = require('./security');

function validateProfile(input) {
  const profile = assertPlainObject(input, 'profile');
  if (typeof profile.name !== 'string' || profile.name.trim().length < 3 || profile.name.length > 120) throw new Error('Profile name is invalid');
  if (!PLATFORMS.includes(profile.platform)) throw new Error('Profile platform is not allowed');
  if (!Array.isArray(profile.steps) || profile.steps.length < 1 || profile.steps.length > 50) throw new Error('Profile must contain 1 to 50 steps');
  const steps = profile.steps.map((step, index) => {
    assertPlainObject(step, `step ${index + 1}`);
    if (!ACTIONS.includes(step.action)) throw new Error(`Action is not allowed: ${step.action}`);
    if ('command' in step || 'shell' in step || 'args' in step) throw new Error('Arbitrary commands and shell arguments are not allowed');
    const normalized = {
      action: step.action,
      required: step.required !== false,
      timeoutMs: clampTimeout(step.timeoutMs, DEFAULT_TIMEOUT_MS)
    };
    if (typeof step.title_contains === 'string') normalized.title_contains = step.title_contains.slice(0, 120);
    if (typeof step.durationMs === 'number') normalized.durationMs = clampTimeout(step.durationMs, 1000);
    return normalized;
  });
  return Object.freeze({
    name: profile.name.trim(),
    platform: profile.platform,
    application: typeof profile.application === 'string' ? profile.application.slice(0, 120) : 'Unknown application',
    version: typeof profile.version === 'string' ? profile.version.slice(0, 40) : 'unknown',
    artifactType: profile.artifactType === 'installer' ? 'installer' : 'portable',
    steps
  });
}

module.exports = { validateProfile };
