import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const root = dirname(fileURLToPath(import.meta.url));
export const f05Root = resolve(process.env.F05_EVALUATION_ROOT || resolve(root, '../babylon-vrspace'));
export const fixtureRoot = resolve(process.env.F03_FIXTURE_ROOT || resolve(root, '../../packages/qualification-fixtures/fixtures'));
export const serviceOrigin = 'http://127.0.0.1:18180';
export const websocketURL = 'ws://127.0.0.1:18180/vrspace/client';
export const frontendOrigin = 'http://127.0.0.1:4176';

export async function startFrontend() {
  const pins = JSON.parse(await readFile(resolve(root, 'source-pins.json'), 'utf8'));
  const client = await readFile(resolve(root, 'vendor/vrspace/client.js'));
  if (createHash('sha256').update(client).digest('hex') !== pins.client.sha256) throw new Error('Released client digest mismatch');
  const { startEvaluationServer } = await import(pathToFileURL(resolve(f05Root, 'server.mjs')));
  // The existing server verifies its build and fixture hashes before serving.
  const base = await startEvaluationServer({ fixtures: fixtureRoot });
  let server;
  const closeServer = async () => {
    if (server?.listening) await new Promise((accept, reject) => { server.close(error => error ? reject(error) : accept()); server.closeAllConnections(); });
  };
  const close = async () => {
    try { await closeServer(); }
    finally { await base.close(); }
  };
  try {
    const original = await readFile(resolve(f05Root, 'index.html'), 'utf8');
    const html = original.replace('</head>', `<style>
      #network-panel { position:absolute;left:24px;top:154px;max-width:400px;padding:12px 16px;background:#0c1926ed;border:1px solid #89c7cd88;border-radius:10px;font-size:13px; }
      #network-panel strong { color:#9fe4d5; } #network-panel p { margin:3px 0; } #network-panel code { font-size:11px; } #network-panel button { margin-top:7px;padding:5px 10px;font-size:12px; }
    </style></head>`).replace('</body>', `<section id="network-panel" aria-label="Real service presence"><strong>VRSpace v0.8.7 · local service</strong><p id="participant-label">Preparing independent session</p><p id="network-state">Connecting…</p><p id="network-peers">Remote participants: 0</p><p><code id="network-realm"></code></p><button id="network-leave">Disconnect</button> <button id="network-rejoin">Reconnect</button><p class="muted">Guest presence and poses. Voice and shared physics are not exercised here.</p></section><script type="module" src="/network.js"></script></body>`);
    const local = new Map([
      ['/', { bytes: Buffer.from(html), type: 'text/html; charset=utf-8' }],
      ['/network.js', { bytes: await readFile(resolve(root, 'network.js')), type: 'text/javascript; charset=utf-8' }],
      ['/vrspace/client.js', { bytes: client, type: 'text/javascript; charset=utf-8' }],
    ]);
    const csp = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self' blob: data: ws://127.0.0.1:18180; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";
    const requests = [];
    const forwardedPaths = new Set(['/dist/main.js','/dist/main.js.map','/dist/audio-meter.js','/fixtures/evaluation.json','/vendor/vrspace/asset-loader.js',...[...base.resources.keys()].map(path=>'/fixtures/'+path)]);
    server = createServer(async (req, res) => {
      const reject = status => { res.writeHead(status, { 'Cache-Control': 'no-store' }); res.end(); };
      if (req.headers.host !== new URL(frontendOrigin).host || (req.headers.origin && req.headers.origin !== frontendOrigin)) return reject(403);
      if (!['GET', 'HEAD'].includes(req.method)) return reject(405);
      let pathname;
      try { pathname = decodeURIComponent(new URL(req.url, frontendOrigin).pathname); } catch { return reject(400); }
      requests.push({ path: pathname, method: req.method });
      const file = local.get(pathname);
      const common = { 'Content-Security-Policy': csp, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
      if (file) { res.writeHead(200, { ...common, 'Content-Type': file.type, 'Content-Length': file.bytes.length }); res.end(req.method === 'HEAD' ? undefined : file.bytes); return; }
      if (!forwardedPaths.has(pathname)) return reject(404);
      try {
        const response = await fetch(new URL(pathname, base.origin), { method: req.method, headers: req.headers.range ? { Range: req.headers.range } : {} });
        const headers = { ...Object.fromEntries(response.headers), ...common };
        delete headers['transfer-encoding']; delete headers.connection;
        const bytes = req.method === 'HEAD' ? undefined : Buffer.from(await response.arrayBuffer());
        res.writeHead(response.status, headers); res.end(bytes);
      } catch (error) { console.error('Fixture relay failed: ' + error.message); reject(502); }
    });
    await new Promise((accept, reject) => { server.once('error', reject); server.listen(4176, '127.0.0.1', accept); });
    return {
      origin: frontendOrigin, baseOrigin: base.origin, manifest: base.manifest, build: base.build, pins, requests,
      close,
    };
  } catch (error) {
    try { await close(); }
    catch (cleanupError) { throw new AggregateError([error, cleanupError], 'Frontend setup and cleanup failed'); }
    throw error;
  }
}
