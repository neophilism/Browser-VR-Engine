import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { artifactRoot } from './config.mjs';
import { isolatedEnvironment } from './environment.mjs';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
export const writeJson = async (path, value) => writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
export const exists = async path => { try { await access(path); return true; } catch { return false; } };
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export async function newRun(purpose) {
  const id = `run-${new Date().toISOString().replaceAll(/[:.]/g, '-')}-${purpose}-${randomUUID().slice(0, 8)}`;
  const dir = join(artifactRoot, 'runs', id);
  await mkdir(dir, { recursive: true });
  return { id, dir };
}
function killChild(child, signal) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  try {
    if (process.platform === 'win32') child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch (error) { if (error.code !== 'ESRCH') throw error; }
}
export async function startCommand(command, args, { cwd, runDir, label, timeoutMs = 300000, extraEnv = {} }) {
  const logPath = join(runDir, `${label}.log`);
  const log = createWriteStream(logPath, { flags: 'wx', mode: 0o600 });
  const startedAt = new Date().toISOString();
  const env = { ...await isolatedEnvironment(), ...extraEnv };
  const child = spawn(command, args, { cwd, env, shell: false, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
  let processError = null, timedOut = false, tail = '', killTimer;
  for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => {
    log.write(bytes);
    tail = (tail + bytes.toString()).slice(-6000);
  });
  child.on('error', error => { processError = error.code || error.message; });
  const timer = setTimeout(() => {
    timedOut = true;
    killChild(child, 'SIGTERM');
    killTimer = setTimeout(() => killChild(child, 'SIGKILL'), 2500);
  }, timeoutMs);
  const done = new Promise(resolve => child.on('close', async (exitCode, signal) => {
    clearTimeout(timer); clearTimeout(killTimer);
    await new Promise(end => log.end(end));
    const result = { command, args, startedAt, finishedAt: new Date().toISOString(), exitCode, signal, processError, timedOut,
      success: exitCode === 0 && !signal && !processError && !timedOut, log: `${label}.log` };
    await writeJson(join(runDir, `${label}.json`), result);
    resolve(result);
  }));
  return { child, done, getTail: () => tail, stop: async () => {
    killChild(child, 'SIGTERM');
    const forced = setTimeout(() => killChild(child, 'SIGKILL'), 2500);
    const result = await done;
    clearTimeout(forced);
    return result;
  }};
}
export async function runCommand(command, args, options) {
  const process = await startCommand(command, args, options);
  const result = await process.done;
  if (!result.success) throw new Error(`${options.label} failed: ${JSON.stringify(result)}\n${process.getTail()}`);
  return result;
}
export async function gitText(source, args) {
  const env = await isolatedEnvironment();
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['-C', source, ...args], { env, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', diagnostic = '', error = null;
    child.stdout.on('data', bytes => { output += bytes.toString(); });
    child.stderr.on('data', bytes => { diagnostic += bytes.toString(); });
    child.on('error', failure => { error = failure; });
    child.on('close', (code, signal) => error || code !== 0 || signal
      ? reject(error || new Error(`git ${args[0]} failed (${code || signal}): ${diagnostic.trim()}`))
      : resolve(output));
  });
}
