import { join } from 'node:path';
import { sources } from './config.mjs';
import { newRun, runCommand, writeJson } from './lib.mjs';
import { verifySource } from './sources.mjs';
const run = await newRun('hubs-build');
const result = { runId: run.id, status: 'running', node: process.version, commands: [],
  dependencyInstallation: 'Uses the installed tree at the configured pinned source; this command does not claim to reinstall dependencies.',
  limitations: ['Client build and the upstream unit test only. No lint suite, service deployment, multiplayer, WebXR, frame-time, capacity, or dependency-audit pass is claimed.'] };
try {
  result.source = await verifySource('hubs');
  for (const script of ['check', 'test:unit', 'build']) result.commands.push(await runCommand('npm', ['run', script], {
    cwd: sources.hubs, runDir: run.dir, label: script.replace(':', '-'), timeoutMs: 600000,
  }));
  result.sourceAfterBuild = await verifySource('hubs');
  result.status = 'passed-scoped-build';
} catch (error) { result.status = 'failed'; result.error = error.message; process.exitCode = 1; }
await writeJson(join(run.dir, 'hubs-build.json'), result);
console.log(JSON.stringify({ status: result.status, run: run.dir, error: result.error }));
