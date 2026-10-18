import https from 'node:https';
import net from 'node:net';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { bundleRoot } from './config.mjs';
import { sha256 } from './lib.mjs';

export async function assertFreePort(port) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
}
function readLocal(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.hostname !== '127.0.0.1') throw new Error('Only the local self-signed evaluation server may bypass TLS trust.');
  return new Promise((resolve, reject) => {
    const request = https.get(parsed, { rejectUnauthorized: false, timeout: 1500 }, response => {
      const chunks = []; let size = 0;
      response.on('data', bytes => {
        size += bytes.length;
        if (size > 2 * 1024 * 1024) request.destroy(new Error('Unexpected local readiness response size.'));
        else chunks.push(bytes);
      });
      response.on('end', () => response.statusCode === 200 ? resolve(Buffer.concat(chunks)) : reject(new Error(`HTTP ${response.statusCode}`)));
    });
    request.on('timeout', () => request.destroy(new Error('Readiness timeout.')));
    request.on('error', reject);
  });
}
export async function waitForOwnedServer(server, projectUrl, expectedBytes) {
  const deadline = Date.now() + 180000;
  let lastError = null;
  while (Date.now() < deadline) {
    if (server.child.exitCode !== null || server.child.signalCode !== null) throw new Error(`Spoke server exited before readiness.\n${server.getTail()}`);
    try {
      const bytes = await readLocal(projectUrl);
      if (sha256(bytes) === sha256(expectedBytes)) return;
      lastError = new Error('The local server returned a different run project.');
    } catch (error) { lastError = error; }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw new Error(`Spoke server did not serve this unique run: ${lastError?.message}`);
}
export function glbSummary(bytes) {
  if (bytes.length < 20 || bytes.subarray(0, 4).toString() !== 'glTF' || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) throw new Error('Invalid GLB envelope.');
  const jsonLength = bytes.readUInt32LE(12);
  if (jsonLength % 4 || jsonLength + 20 > bytes.length || bytes.readUInt32LE(16) !== 0x4e4f534a) throw new Error('Invalid GLB JSON chunk.');
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString().trim());
  return { bytes: bytes.length, sha256: sha256(bytes), nodes: json.nodes?.length || 0,
    meshes: json.meshes?.length || 0, skins: json.skins?.length || 0,
    animations: json.animations?.length || 0, extensions: json.extensionsUsed || [] };
}
export async function runnerFingerprints() {
  const scripts = (await readdir(join(bundleRoot, 'scripts'))).filter(file => file.endsWith('.mjs')).map(file => `scripts/${file}`);
  const files = ['package.json', 'package-lock.json', 'source-pins.json', 'fixture-pins.json', 'patches/spoke-node24-and-downloads.patch', ...scripts].sort();
  return Object.fromEntries(await Promise.all(files.map(async file => [file, sha256(await readFile(join(bundleRoot, file)))])));
}
export async function bounded(promise, description, timeoutMs = 60000) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${description} exceeded ${timeoutMs} ms.`)), timeoutMs); })]); }
  finally { clearTimeout(timer); }
}
