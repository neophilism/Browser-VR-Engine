// A supervised, credential-filtered child records npm's two actual streams.
// It never installs dependencies, changes the lock, or converts exit 1 to success.
import { spawnSync } from 'node:child_process';
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';

const [directory, output, name] = process.argv.slice(2);
if (!directory || !output || !/^(toolkit|hubs|dialog)$/.test(name || '')) throw new Error('Expected audit source, output directory and declared graph name');
const cwd = realpathSync(directory), out = realpathSync(output);
const digest = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const inputs = Object.fromEntries(['package.json', 'package-lock.json'].map(path => [path, digest(join(cwd, path))]));
const startedAt = new Date().toISOString();
const command = ['audit', '--package-lock-only', '--ignore-scripts', '--json', '--audit-level=high',
  '--registry=https://registry.npmjs.org', '--fetch-timeout=15000', '--fetch-retries=0'];
const result = spawnSync('npm', command, { cwd, env: process.env, encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
writeFileSync(resolve(out, `${name}.stdout.json`), result.stdout || '', { flag: 'wx' });
writeFileSync(resolve(out, `${name}.stderr.txt`), result.stderr || '', { flag: 'wx' });
const unchanged = Object.entries(inputs).every(([path, hash]) => digest(join(cwd, path)) === hash);
const receipt = { schemaVersion: 1, name, startedAt, finishedAt: new Date().toISOString(), cwd, argv: ['npm', ...command],
  inputs, exitCode: result.status, signal: result.signal, errorCode: result.error?.code || null, sourceUnchanged: unchanged };
writeFileSync(resolve(out, `${name}.receipt.json`), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ name, exitCode: receipt.exitCode, signal: receipt.signal, errorCode: receipt.errorCode, sourceUnchanged: unchanged }));
process.exitCode = !unchanged || result.error || result.signal ? 1 : result.status ?? 1;
