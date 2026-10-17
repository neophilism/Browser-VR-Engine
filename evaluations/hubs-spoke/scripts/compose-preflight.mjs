import { join, delimiter } from 'node:path';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { sources } from './config.mjs';
import { isolatedEnvironment } from './environment.mjs';
import { newRun, startCommand, writeJson } from './lib.mjs';
import { verifySource } from './sources.mjs';

const run = await newRun('compose-preflight');
const result = { runId: run.id, status: 'blocked', servicesStarted: false, observedAt: new Date().toISOString(),
  limitations: ['Compose bin/init clones additional unpinned services and uses development configuration; it is not an approved production deployment recipe.'] };
try {
  result.source = await verifySource('compose');
  const env = await isolatedEnvironment();
  result.tools = {};
  for (const tool of ['mutagen-compose', 'docker', 'docker-compose']) {
    result.tools[tool] = false;
    for (const dir of env.PATH.split(delimiter)) {
      try { await access(join(dir, tool), constants.X_OK); result.tools[tool] = true; break; } catch { /* check the next explicit PATH entry */ }
    }
  }
  if (!result.tools['mutagen-compose']) {
    // The exact pinned file was verified above. Its first executable command is
    // `hash mutagen-compose || exit 1`, so this path cannot reach service setup.
    const attempt = await startCommand('bash', ['bin/init'], { cwd: sources.compose, runDir: run.dir, label: 'compose-init-blocked', timeoutMs: 15000 });
    result.initAttempt = await attempt.done;
    if (result.initAttempt.success) throw new Error('Unexpected successful init despite missing mutagen-compose.');
    result.reason = 'Missing mutagen-compose; the pinned init exits before any service operation. Docker tooling is recorded separately.';
  } else {
    result.reason = 'Tools detected, but automatic init intentionally stops before unpinned service clones/development keys. Pin Reticulum/Dialog and supply reviewed local configuration first.';
  }
} catch (error) { result.status = 'failed'; result.error = error.message; process.exitCode = 1; }
await writeJson(join(run.dir, 'compose-preflight.json'), result);
console.log(JSON.stringify({ status: result.status, run: run.dir, reason: result.reason, error: result.error }));
