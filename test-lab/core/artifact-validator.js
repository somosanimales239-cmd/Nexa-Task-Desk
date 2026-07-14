'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { MAX_ARTIFACT_BYTES } = require('./constants');
const { assertLocalAbsolutePath } = require('./security');

async function hashFile(file) {
  const hash = crypto.createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(file);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return hash.digest('hex');
}

async function assertPortableExecutable(file, size) {
  const handle = await fs.promises.open(file, 'r');
  try {
    const dos = Buffer.alloc(64);
    if ((await handle.read(dos, 0, dos.length, 0)).bytesRead !== dos.length || dos.toString('ascii', 0, 2) !== 'MZ') throw new Error('Artifact does not contain a valid Windows MZ header');
    const offset = dos.readUInt32LE(0x3c);
    if (offset < 64 || offset + 4 > size) throw new Error('Artifact contains an invalid PE header offset');
    const signature = Buffer.alloc(4);
    if ((await handle.read(signature, 0, 4, offset)).bytesRead !== 4 || !signature.equals(Buffer.from([0x50, 0x45, 0, 0]))) throw new Error('Artifact does not contain a valid Windows PE signature');
  } finally { await handle.close(); }
}

async function inspectArtifact(file, expectedSha256) {
  const source = assertLocalAbsolutePath(file, ['.exe']);
  const stat = await fs.promises.stat(source);
  if (!stat.isFile()) throw new Error('Artifact is not a regular file');
  if (stat.size < 1024) throw new Error('Artifact is too small to be a valid executable');
  if (stat.size > MAX_ARTIFACT_BYTES) throw new Error('Artifact exceeds the 2 GB safety limit');
  await assertPortableExecutable(source, stat.size);
  const sha256 = await hashFile(source);
  if (expectedSha256 && !/^[a-f0-9]{64}$/i.test(expectedSha256)) throw new Error('Expected SHA-256 is invalid');
  if (expectedSha256 && sha256 !== expectedSha256.toLowerCase()) throw new Error('Artifact SHA-256 does not match the expected value');
  return { source, name: path.basename(source), size: stat.size, sha256 };
}

async function prepareArtifact(file, destinationDirectory, expectedSha256) {
  const inspected = await inspectArtifact(file, expectedSha256);
  await fs.promises.mkdir(destinationDirectory, { recursive: true });
  const destination = path.join(destinationDirectory, inspected.name);
  await fs.promises.copyFile(inspected.source, destination, fs.constants.COPYFILE_EXCL);
  return { ...(await inspectArtifact(destination, inspected.sha256)), originalName: inspected.name };
}

module.exports = { hashFile, assertPortableExecutable, inspectArtifact, prepareArtifact };
