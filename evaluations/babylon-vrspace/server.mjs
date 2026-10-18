import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { packageRoot, fixtureRoot, serverPort } from './config.mjs';
import { loadFixtureSet, verifyVendor, fingerprintFiles, buildInputPaths } from './fixtures.mjs';

const csp = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self' blob: data:; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";

export async function startEvaluationServer({ port = 0, fixtures = fixtureRoot } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid loopback port');
  const root = await realpath(packageRoot);
  const { manifest, resources } = await loadFixtureSet(fixtures);
  const build = JSON.parse(await readFile(resolve(root, 'dist/build.json'), 'utf8'));
  if (!isDeepStrictEqual(build.inputs, await fingerprintFiles(buildInputPaths)) ||
      !isDeepStrictEqual(build.outputs, await fingerprintFiles(['dist/main.js', 'dist/main.js.map', 'dist/audio-meter.js'])) ||
      !isDeepStrictEqual(build.fixtureDigests, manifest.sourceFileDigests)) throw new Error('Evaluation build is stale; run node run.mjs build');
  const files = new Map([
    ['/fixtures/evaluation.json', { bytes: Buffer.from(JSON.stringify(manifest)), mediaType: 'application/json' }],
    ['/vendor/vrspace/asset-loader.js', { bytes: await verifyVendor(), mediaType: 'text/javascript; charset=utf-8' }],
  ]);
  for (const [path, resource] of resources) files.set('/fixtures/' + path, resource);
  for (const [url, path, mediaType] of [
    ['/', 'index.html', 'text/html; charset=utf-8'],
    ['/dist/main.js', 'dist/main.js', 'text/javascript; charset=utf-8'],
    ['/dist/main.js.map', 'dist/main.js.map', 'application/json'],
    ['/dist/audio-meter.js', 'dist/audio-meter.js', 'text/javascript; charset=utf-8'],
  ]) {
    const file = await realpath(resolve(root, path));
    if (!file.startsWith(root + sep)) throw new Error('Evaluation asset symlink escapes package');
    files.set(url, { bytes: await readFile(file), mediaType });
  }
  let origin;
  const server = createServer((req, res) => {
    const reject = status => { res.writeHead(status, { 'Cache-Control': 'no-store' }); res.end(); };
    if (req.headers.host !== new URL(origin).host || (req.headers.origin && req.headers.origin !== origin)) return reject(403);
    if (req.method !== 'GET' && req.method !== 'HEAD') return reject(405);
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, origin).pathname); } catch { return reject(400); }
    const file = files.get(pathname);
    if (!file) return reject(404);
    const headers = {
      'Content-Type': file.mediaType, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store',
      'Content-Security-Policy': csp, 'Accept-Ranges': 'bytes', 'Referrer-Policy': 'no-referrer',
    };
    const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
    if (req.headers.range && !range) return reject(416);
    if (range) {
      const start = Number(range[1]), requestedEnd = range[2] ? Number(range[2]) : file.bytes.length - 1;
      const end = Math.min(requestedEnd, file.bytes.length - 1);
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start > end || start >= file.bytes.length) {
        res.writeHead(416, { ...headers, 'Content-Range': `bytes */${file.bytes.length}` }); res.end(); return;
      }
      res.writeHead(206, { ...headers, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${file.bytes.length}` });
      res.end(req.method === 'HEAD' ? undefined : file.bytes.subarray(start, end + 1));
    } else {
      res.writeHead(200, { ...headers, 'Content-Length': file.bytes.length });
      res.end(req.method === 'HEAD' ? undefined : file.bytes);
    }
  });
  await new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      origin = `http://127.0.0.1:${server.address().port}`;
      accept();
    });
  });
  return {
    origin, manifest, resources, build,
    close: () => new Promise((accept, reject) => { server.close(error => error ? reject(error) : accept()); server.closeAllConnections(); }),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const server = await startEvaluationServer({ port: serverPort });
  console.log(`Isolated F05 evaluation: ${server.origin}`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await server.close(); process.exit(); });
}
