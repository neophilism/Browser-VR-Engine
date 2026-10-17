import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { bundleRoot, sources } from './config.mjs';
import { exists, newRun, runCommand, sha256, writeJson } from './lib.mjs';
import { pins, verifySource } from './sources.mjs';

const names = process.argv.slice(2);
if (!names.length) names.push('hubs', 'spoke', 'compose');
if (names.some(name => !Object.hasOwn(sources, name))) throw new Error('Use only source names hubs, spoke, compose.');
const run = await newRun('setup');
const status = { runId: run.id, status: 'running', sourcePins: {}, installs: [], limitations: [
  'No service deployment, browser installation, audit result, or hardware qualification is implied by setup.'
] };
try {
  for (const name of names) {
    const source = sources[name], pin = pins.sources[name];
    if (!await exists(source)) {
      await mkdir(dirname(source), { recursive: true });
      await runCommand('git', ['init', source], { cwd: dirname(source), runDir: run.dir, label: `${name}-git-init` });
      await runCommand('git', ['-C', source, 'fetch', '--depth=1', pin.repository, pin.commit], { cwd: dirname(source), runDir: run.dir, label: `${name}-git-fetch`, timeoutMs: 300000 });
      await runCommand('git', ['-C', source, 'checkout', '--detach', 'FETCH_HEAD'], { cwd: dirname(source), runDir: run.dir, label: `${name}-git-checkout` });
    }
    await verifySource(name, { allowOriginal: true });
    if (pin.patch && sha256(await readFile(join(source, 'package.json'))) === pin.files['package.json'].original) {
      await runCommand('git', ['apply', '--check', join(bundleRoot, pin.patch)], { cwd: source, runDir: run.dir, label: `${name}-patch-check` });
      await runCommand('git', ['apply', join(bundleRoot, pin.patch)], { cwd: source, runDir: run.dir, label: `${name}-patch` });
    }
    status.sourcePins[name] = await verifySource(name);
    if (name === 'hubs') status.installs.push(await runCommand('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], {
      cwd: source, runDir: run.dir, label: 'hubs-install', timeoutMs: 600000,
    }));
    if (name === 'spoke') status.installs.push(await runCommand(process.execPath,
      [join(bundleRoot, 'node_modules/yarn/bin/yarn.js'), 'install', '--frozen-lockfile', '--ignore-scripts', '--ignore-engines', '--non-interactive', '--no-default-rc', '--network-timeout', '15000'], {
        cwd: source, runDir: run.dir, label: 'spoke-install', timeoutMs: 600000,
      }));
  }
  status.status = 'setup-complete';
} catch (error) { status.status = 'failed'; status.error = error.message; process.exitCode = 1; }
await writeJson(join(run.dir, 'setup.json'), status);
console.log(JSON.stringify({ status: status.status, run: run.dir, error: status.error }));
