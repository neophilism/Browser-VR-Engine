// Fetch only the pinned Spoke source needed by toolkit mapping/patch tests.
// This does not install upstream dependencies or run a Hubs/Spoke service.
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { bundleRoot, sources } from './config.mjs';
import { exists, newRun, runCommand, sha256, writeJson } from './lib.mjs';
import { pins, verifySource } from './sources.mjs';

if (process.argv.length !== 2) throw new Error('Usage: checkout-test-source.mjs');
const run = await newRun('test-source');
const source = sources.spoke, pin = pins.sources.spoke;
if (!await exists(source)) {
  await mkdir(dirname(source), { recursive: true });
  await runCommand('git', ['init', source], { cwd: dirname(source), runDir: run.dir, label: 'init' });
  await runCommand('git', ['-C', source, 'fetch', '--depth=1', pin.repository, pin.commit], { cwd: dirname(source), runDir: run.dir, label: 'fetch', timeoutMs: 300000 });
  await runCommand('git', ['-C', source, 'checkout', '--detach', 'FETCH_HEAD'], { cwd: dirname(source), runDir: run.dir, label: 'checkout' });
}
await verifySource('spoke', { allowOriginal: true });
if (sha256(await readFile(join(source, 'package.json'))) === pin.files['package.json'].original) {
  await runCommand('git', ['apply', '--check', join(bundleRoot, pin.patch)], { cwd: source, runDir: run.dir, label: 'patch-check' });
  await runCommand('git', ['apply', join(bundleRoot, pin.patch)], { cwd: source, runDir: run.dir, label: 'patch' });
}
const result = await verifySource('spoke');
await writeJson(join(run.dir, 'source.json'), result);
console.log(JSON.stringify({ status: 'pinned-test-source-ready', commit: result.commit, upstreamDependenciesInstalled: false }));
