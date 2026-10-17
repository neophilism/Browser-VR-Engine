// Failure-path tests use a synthetic fixture backend with real owned HTTP
// listeners. They do not stand in for the separately exercised VRSpace service.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
await mkdir(resolve(root, 'artifacts'), { recursive: true });
const output = await mkdtemp(resolve(root, 'artifacts/frontend-checks-'));
const results = [];

for (const kind of ['read-failure-after-base-listen', 'frontend-close-rejection']) {
  const directory = resolve(output, kind), service = resolve(directory, 'service'), f05 = resolve(directory, 'base');
  await mkdir(resolve(service, 'vendor/vrspace'), { recursive: true });
  await mkdir(f05, { recursive: true });
  for (const name of ['frontend.mjs', 'source-pins.json', 'vendor/vrspace/client.js']) await copyFile(resolve(root, name), resolve(service, name));
  if (kind === 'frontend-close-rejection') await writeFile(resolve(service, 'network.js'), '// synthetic cleanup fixture\n');
  await writeFile(resolve(f05, 'index.html'), '<html><head></head><body></body></html>');
  await writeFile(resolve(f05, 'server.mjs'), `
import { createServer } from 'node:http';
import { writeFile } from 'node:fs/promises';
export async function startEvaluationServer() {
  const server = createServer((_req, res) => res.end('synthetic cleanup fixture'));
  await new Promise((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept); });
  const port = server.address().port;
  await writeFile(new URL('./listening.json', import.meta.url), JSON.stringify({ port, listening: server.listening }));
  return { origin: 'http://127.0.0.1:' + port, resources: new Map(), manifest: {}, build: {}, close: async () => {
    await new Promise((accept, reject) => { server.close(error => error ? reject(error) : accept()); server.closeAllConnections(); });
    await writeFile(new URL('./closed.json', import.meta.url), JSON.stringify({ port, listening: server.listening }));
  } };
}
`);
  const entry = `
import assert from 'node:assert/strict';
import http from 'node:http';
import { syncBuiltinESMExports } from 'node:module';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const kind = process.argv[1], directory = process.argv[2];
if (kind === 'frontend-close-rejection') {
  const original = http.createServer; let count = 0;
  http.createServer = (...args) => {
    const server = original(...args);
    if (++count === 2) {
      const close = server.close.bind(server);
      server.close = callback => close(error => callback(error || new Error('synthetic frontend close failure')));
    }
    return server;
  };
  syncBuiltinESMExports();
}
const { startFrontend } = await import(pathToFileURL(directory + '/service/frontend.mjs'));
let failure;
try { const frontend = await startFrontend(); await frontend.close(); }
catch (error) { failure = error; }
assert(failure, 'The selected synthetic failure must occur');
if (kind === 'read-failure-after-base-listen') assert.match(failure.message, /ENOENT.*network\\.js/);
else assert.match(failure.message, /synthetic frontend close failure/);
const opened = JSON.parse(await readFile(directory + '/base/listening.json', 'utf8'));
const closed = JSON.parse(await readFile(directory + '/base/closed.json', 'utf8'));
assert.equal(opened.listening, true); assert.equal(closed.listening, false); assert.equal(closed.port, opened.port);
console.log(JSON.stringify({ id: kind, status: 'passed', realLoopbackBackendOpened: true, baseClosedAfterFailure: true, failure: failure.message }));
`;
  const environment = { PATH: process.env.PATH || '/usr/bin:/bin', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', TZ: 'UTC', F05_EVALUATION_ROOT: f05 };
  for (const key of ['TMPDIR', 'TMP', 'TEMP']) if (process.env[key]) environment[key] = process.env[key];
  const result = await run(process.execPath, ['--input-type=module', '-e', entry, kind, directory], { cwd: directory, env: environment, timeout: 10000, killSignal: 'SIGKILL' });
  const value = JSON.parse(result.stdout);
  assert.equal(value.status, 'passed'); results.push(value);
}
console.log(JSON.stringify({ scope: 'Synthetic fixture backend; real owned loopback HTTP listener cleanup', counts: { passed: results.length, failed: 0, checks: results.length }, checks: results }));
