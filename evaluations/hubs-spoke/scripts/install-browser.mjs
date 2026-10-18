import { join } from 'node:path';
import { bundleRoot } from './config.mjs';
import { newRun, runCommand } from './lib.mjs';
const run = await newRun('browser-install');
try {
  await runCommand(process.execPath, [join(bundleRoot, 'node_modules/playwright/cli.js'), 'install', 'chromium'], {
    cwd: bundleRoot, runDir: run.dir, label: 'browser-install', timeoutMs: 600000,
    extraEnv: { PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '0' },
  });
  console.log(JSON.stringify({ status: 'installed', run: run.dir }));
} catch (error) { console.error(error.message); process.exitCode = 1; }
