// Every declared suite is mandatory. This is also the existing f04-tests CI stage.
import { spawnSync } from 'node:child_process';
import { bundleRoot } from './config.mjs';
import { isolatedEnvironment } from './environment.mjs';

export const suites = [
  ['editor', process.execPath, ['--test', '--test-isolation=none', 'scripts/evaluation.test.mjs']],
  ['runtime-pure', 'python3', ['-B', '-O', 'runtime/test/runtime-checks.py']],
  ['browser-policy', process.execPath, ['--test', '--test-isolation=none', 'runtime/test/browser-policy.test.mjs']],
  ['historical-integrity', process.execPath, ['--test', '--test-isolation=none', 'scripts/historical-integrity.test.mjs']]
];

for (const [name, command, args] of suites) {
  const result = spawnSync(command, args, { cwd: bundleRoot, env: await isolatedEnvironment(),
    encoding: 'utf8', timeout: 90000, maxBuffer: 4 * 1024 * 1024 });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error || result.signal || result.status !== 0) {
    throw new Error(`Required F04 ${name} suite failed: exit=${result.status} signal=${result.signal ?? 'none'} error=${result.error?.code ?? 'none'}`);
  }
}
