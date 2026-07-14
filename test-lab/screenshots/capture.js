'use strict';

const fs = require('fs');
const path = require('path');
const { desktopCapturer } = require('electron');

async function captureWindow(outputDirectory, titleContains) {
  await fs.promises.mkdir(outputDirectory, { recursive: true });
  const sources = await desktopCapturer.getSources({
    types: ['window'],
    thumbnailSize: { width: 1440, height: 900 },
    fetchWindowIcons: false
  });
  const needle = String(titleContains || '').toLowerCase();
  const source = sources.find(item => needle && item.name.toLowerCase().includes(needle));
  if (!source || source.thumbnail.isEmpty()) throw new Error(`No capturable window matched "${titleContains}"`);
  const file = path.join(outputDirectory, `capture-${Date.now()}.png`);
  await fs.promises.writeFile(file, source.thumbnail.toPNG(), { mode: 0o600 });
  return { file, name: path.basename(file), windowTitle: source.name };
}

module.exports = { captureWindow };
