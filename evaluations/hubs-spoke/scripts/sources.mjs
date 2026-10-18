import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { bundleRoot, sources } from './config.mjs';
import { gitText, readJson, sha256 } from './lib.mjs';

export const pins = await readJson(join(bundleRoot, 'source-pins.json'));
export async function verifyLocalConfiguration(source) {
  for (const file of await readdir(source)) {
    const dotenv = file === '.env' || file.startsWith('.env.');
    const packageConfig = ['.npmrc', '.yarnrc', '.yarnrc.yml'].includes(file);
    if (!dotenv && !packageConfig) continue;
    let tracked;
    try { tracked = await gitText(source, ['show', `HEAD:${file}`]); }
    catch { throw new Error(`Unexpected local configuration ${file}; use a clean evaluation checkout.`); }
    if (sha256(await readFile(join(source, file))) !== sha256(tracked)) throw new Error(`Modified local configuration ${file}; use a clean evaluation checkout.`);
  }
}
export async function verifySource(name, { allowOriginal = false } = {}) {
  const source = sources[name], pin = pins.sources[name];
  const head = (await gitText(source, ['rev-parse', 'HEAD'])).trim();
  if (head !== pin.commit) throw new Error(`${name} source pin mismatch: expected ${pin.commit}.`);
  const changed = (await gitText(source, ['diff', '--name-only', 'HEAD'])).trim().split('\n').filter(Boolean);
  if (changed.some(file => !pin.files[file]?.patched)) throw new Error(`${name} contains unexpected tracked source changes.`);
  const fileHashes = {};
  for (const [file, digests] of Object.entries(pin.files)) {
    const digest = sha256(await readFile(join(source, file)));
    const expected = digests.patched || digests.original;
    if (digest !== expected && !(allowOriginal && digest === digests.original)) throw new Error(`${name}/${file} does not match the frozen source or allowed patch.`);
    fileHashes[file] = digest;
  }
  // Local dotenv/registry files can inject settings or credentials into webpack
  // and package managers. Only unchanged files in the pinned commit may exist.
  await verifyLocalConfiguration(source);
  return { repository: pin.repository, commit: head, files: fileHashes, changedFiles: changed };
}
