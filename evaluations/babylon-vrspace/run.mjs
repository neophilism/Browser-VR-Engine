import { spawn } from 'node:child_process';
import { packageRoot } from './config.mjs';
import { isolatedEnvironment } from './environment.mjs';

const env = await isolatedEnvironment();
const npmOptions=['--registry=https://registry.npmjs.org',`--userconfig=${env.npm_config_userconfig}`,`--globalconfig=${env.npm_config_globalconfig}`,'--fetch-timeout=15000','--fetch-retries=0','--update-notifier=false'];
const commands = {
  install: ['npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund', ...npmOptions]],
  'lock-update': ['npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund', ...npmOptions]],
  build: [process.execPath, ['build.mjs']],
  serve: [process.execPath, ['server.mjs']],
  test: [process.execPath, ['browser-checks.mjs']],
  'test-server': [process.execPath, ['--test','--test-isolation=none','test/local-server.test.mjs','test/import-policy.test.mjs','test/xr-session.test.mjs','test/portable-world.test.mjs']],
  'test-xr': [process.execPath, ['test/xr-browser-checks.mjs']],
  'test-world': [process.execPath, ['test/portable-browser-checks.mjs']],
  'browser-install': [process.execPath, ['node_modules/playwright/cli.js', 'install', 'chromium']],
  audit: ['npm', ['audit', '--json', '--audit-level=high', ...npmOptions]],
};
const command = commands[process.argv[2]];
if (!command || process.argv.length !== 3) throw new Error(`Usage: node run.mjs ${Object.keys(commands).join('|')}`);
const child = spawn(command[0], command[1], { cwd: packageRoot, env, shell: false, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.once('error', error => { console.error(error.message); process.exitCode = 1; });
child.once('exit', (code, signal) => { process.exitCode = signal ? 1 : (code ?? 1); });

