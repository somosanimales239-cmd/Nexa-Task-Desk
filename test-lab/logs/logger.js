'use strict';

const fs = require('fs');
const path = require('path');
const { redact } = require('../core/security');

class Logger {
  constructor(file, onLine = () => {}) {
    this.file = file;
    this.onLine = onLine;
  }

  async init() {
    await fs.promises.mkdir(path.dirname(this.file), { recursive: true });
    await fs.promises.writeFile(this.file, '', { encoding: 'utf8', mode: 0o600 });
  }

  async write(level, message) {
    const line = `${new Date().toISOString()} [${String(level).toUpperCase()}] ${redact(message)}`;
    await fs.promises.appendFile(this.file, `${line}\n`, 'utf8');
    this.onLine(line);
    return line;
  }
}

module.exports = { Logger };
