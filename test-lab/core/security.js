'use strict';

const path = require('path');
const { MAX_TIMEOUT_MS } = require('./constants');

function assertPlainObject(value, name = 'value') {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error(`${name} must be a plain object`);
  }
  return value;
}

function assertLocalAbsolutePath(value, extensions = []) {
  if (typeof value !== 'string' || !value.trim() || !path.isAbsolute(value)) {
    throw new Error('A local absolute path is required');
  }
  if (/^(\\\\|\/\/|https?:|file:)/i.test(value.trim())) {
    throw new Error('Remote and URL paths are not allowed');
  }
  const normalized = path.normalize(value.trim());
  if (extensions.length && !extensions.includes(path.extname(normalized).toLowerCase())) {
    throw new Error(`Allowed extensions: ${extensions.join(', ')}`);
  }
  return normalized;
}

function safeId(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{6,80}$/.test(value)) throw new Error('Invalid identifier');
  return value;
}

function clampTimeout(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 250) return fallback;
  return Math.min(Math.floor(parsed), MAX_TIMEOUT_MS);
}

function redact(value) {
  let text = String(value ?? '');
  text = text.replace(/([?&](?:token|key|secret|password|authorization)=)[^&\s]+/gi, '$1[REDACTED]');
  text = text.replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+\/-]+=*/gi, '$1 [REDACTED]');
  text = text.replace(/((?:token|secret|password|api[_-]?key)\s*[:=]\s*)[^\s,;]+/gi, '$1[REDACTED]');
  if (process.env.USERPROFILE) text = text.split(process.env.USERPROFILE).join('%USERPROFILE%');
  if (process.env.HOME) text = text.split(process.env.HOME).join('$HOME');
  return text;
}

function normalizeError(error) {
  return redact(error instanceof Error ? error.message : error);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

module.exports = { assertPlainObject, assertLocalAbsolutePath, safeId, clampTimeout, redact, normalizeError, escapeHtml };
