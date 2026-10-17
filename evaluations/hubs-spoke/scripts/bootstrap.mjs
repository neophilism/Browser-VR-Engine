// Builtins only: a sanitized entry point for installing this private toolkit.
import { bundleRoot } from './config.mjs';
import { exists, newRun, runCommand } from './lib.mjs';
import { join } from 'node:path';
const run = await newRun('toolkit-install');
const mode = process.argv.includes('--lockfile-only') ? ['install', '--package-lock-only'] : ['ci'];
try {
  for (const file of ['.npmrc', '.yarnrc', '.yarnrc.yml']) if (await exists(join(bundleRoot, file))) throw new Error(`Unexpected toolkit ${file}; use the explicit isolated configuration.`);
  await runCommand('npm', [...mode, '--ignore-scripts', '--no-audit', '--no-fund'], {
    cwd: bundleRoot, runDir: run.dir, label: 'toolkit-install', timeoutMs: 180000,
  });
  console.log(JSON.stringify({ status: 'installed', run: run.dir }));
} catch (error) { console.error(error.message); process.exitCode = 1; }
