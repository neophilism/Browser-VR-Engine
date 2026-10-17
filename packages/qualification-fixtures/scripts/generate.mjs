import { mkdir, readFile, writeFile, readdir, lstat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative, sep } from 'node:path';
import { generateFixtureSet } from '../dist/index.js';

const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(packageRoot, 'fixtures');
const check = process.argv.slice(2).includes('--check');
if (process.argv.slice(2).some(value => value !== '--check')) throw new Error('Usage: generate.mjs [--check]');
async function regularFile(path, missingAllowed = false) {
  let info;
  try { info = await lstat(path); }
  catch (error) { if (missingAllowed && error.code === 'ENOENT') return; throw error; }
  if (info.isSymbolicLink() || !info.isFile()) throw new Error('Fixture paths must be regular files, without symlinks');
}
async function directory(path, create = false) {
  if (create) await mkdir(path, { recursive: false }).catch(error => { if (error.code !== 'EEXIST') throw error; });
  const info = await lstat(path);
  if (info.isSymbolicLink() || !info.isDirectory()) throw new Error('Fixture directories must not be symlinks');
}
await directory(resolve(packageRoot, 'sources'));
const videoPath = resolve(packageRoot, 'sources/screen-marker.webm');
await regularFile(videoPath);
const video = new Uint8Array(await readFile(videoPath));
const set = await generateFixtureSet(video);
const errors = [];
await directory(output, !check);
for (const [path, bytes] of set.files) {
  const destination = resolve(output, path);
  if (!destination.startsWith(output + sep)) throw new Error('Fixture output escaped its root');
  let parent = output;
  for (const segment of relative(output, dirname(destination)).split(sep).filter(Boolean)) {
    parent = resolve(parent, segment);
    await directory(parent, !check);
  }
  await regularFile(destination, !check);
  if (check) {
    try { if (!Buffer.from(bytes).equals(await readFile(destination))) errors.push(`Changed fixture: ${path}`); }
    catch { errors.push(`Missing fixture: ${path}`); }
  } else {
    await writeFile(destination, bytes);
  }
}
if (check) {
  async function inspect(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isSymbolicLink()) { errors.push(`Unexpected symlink: ${relative(output, path)}`); continue; }
      if (entry.isDirectory()) await inspect(path);
      else if (!set.files.has(relative(output, path).split(sep).join('/'))) errors.push(`Untracked fixture: ${relative(output, path)}`);
    }
  }
  await inspect(output);
}
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log(`${check ? 'Verified' : 'Generated'} ${set.files.size} reproducible fixture files (${set.world.entities.length} entities).`);
