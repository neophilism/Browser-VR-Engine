// Real native Hubs UI, Phoenix presence, Dialog transports and browser canvases.
// Never synthesize server state, avatars, physics steps or network receipts.
import { chromium } from 'playwright';
import { readFile, realpath, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { allowedRequest, checkIds, finalStatus } from './browser-policy.mjs';

const directory = await realpath(process.argv[2] || '');
const input = JSON.parse(await readFile(join(directory, 'input.json'), 'utf8'));
if (!/^f04-[0-9a-f]{16}$/.test(input.runId) || input.modelUrl !== `https://hubs.local:8080/evaluation/${input.runId}/courtyard.glb`) {
  throw new Error('Unexpected owned browser input');
}
const report = { schemaVersion: 1, runId: input.runId, input, startedAt: new Date().toISOString(),
  runStatus: 'failed', fatal: null, errors: [], failedRequests: [], blockedRequests: [], expectedCloseAborts: [],
  cleanupErrors: [], cleanupSettled: false, checks: [], observations: {}, screenshots: {} };
let browser;
const contexts = [], pages = [], closing = new WeakSet();
const boundedPush = (target, value) => { if (target.length < 100) target.push(value); else report.fatal ||= 'Evidence event budget exceeded'; };
const safeUrl = value => { try { const url = new URL(value); return url.origin + url.pathname; } catch { return '<malformed>'; } };
const errorText = error => String(error?.message || error).replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '<ephemeral-token-redacted>').slice(0,1500);
const ensure = (condition, message) => { if (!condition) throw new Error(message); };
async function check(id, action) {
  try { const observed = await action(); report.checks.push({ id, status: 'passed', observed }); return observed; }
  catch (error) { report.checks.push({ id, status: 'failed', error: errorText(error) }); throw error; }
}
async function newPage(context, label) {
  const page = await context.newPage();
  pages.push(page);
  page.setDefaultTimeout(45000);
  page.on('pageerror', error => boundedPush(report.errors, { label, type: 'pageerror', error: errorText(error) }));
  page.on('console', message => {
    if (message.type() === 'error') boundedPush(report.errors, { label, type: 'console', error: errorText(message.text()) });
  });
  page.on('requestfailed', request => {
    const item = { label, url: safeUrl(request.url()), error: request.failure()?.errorText || 'unknown' };
    if (closing.has(page) && item.error === 'net::ERR_ABORTED') boundedPush(report.expectedCloseAborts, item);
    else boundedPush(report.failedRequests, item);
  });
  return page;
}
async function nativeJoin(page, url, name) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.getByRole('button', { name: 'Join Room', exact: true }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => /^(Accept|Enter Room)$/.test(b.textContent.trim())), null, { timeout: 45000 });
  const displayName = page.getByLabel('Display Name', { exact: true });
  if (await displayName.isVisible()) {
    await displayName.fill(name);
    await page.getByRole('button', { name: 'Accept', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Enter Room', exact: true }).click();
  await page.waitForFunction(() => window.APP?.entryManager?.hasEntered?.() && window.NAF?.connection?.isConnected?.(), null, { timeout: 60000 });
  // The native media manager uses Chromium's explicitly simulated microphone.
  // This does not test physical capture, acoustic quality or actual speech.
  await page.evaluate(async () => { await APP.mediaDevicesManager.startMicShare({ unmute: true }); });
}
async function snapshot(page) {
  return page.evaluate(async () => {
    const scene = document.querySelector('a-scene');
    const position = object => object ? object.getWorldPosition(new THREE.Vector3()).toArray() : null;
    const remote = [...document.querySelectorAll('[networked-avatar]')].map(el => ({
      creator: el.components.networked?.data.creator, owner: el.components.networked?.data.owner,
      networkId: el.components.networked?.data.networkId, position: position(el.object3D),
    })).filter(item => item.creator !== NAF.clientId);
    const stats = APP.dialog?._recvTransport ? [...(await APP.dialog._recvTransport.getStats()).values()]
      .filter(item => item.type === 'inbound-rtp' && (item.kind === 'audio' || item.mediaType === 'audio'))
      .map(item => ({ type: item.type, kind: item.kind || item.mediaType, packetsReceived: item.packetsReceived || 0,
        bytesReceived: item.bytesReceived || 0 })) : [];
    const renderer = scene?.renderer;
    const names = new Set();
    scene?.object3D.traverse(object => { if (object.name) names.add(object.name); });
    return { clientId: NAF.clientId, presence: Object.keys(APP.hubChannel.presence.state),
      phoenixJoined: APP.hubChannel.channel.state === 'joined', dialogConnected: APP.dialog?._protoo?.connected === true,
      sendState: APP.dialog?._sendTransport?.connectionState, receiveState: APP.dialog?._recvTransport?.connectionState,
      local: position(document.querySelector('#avatar-rig')?.object3D), remote, stats,
      canvas: !!renderer?.domElement && !renderer.getContext().isContextLost(), frame: renderer?.info.render.frame,
      retainedSceneNames: ['floor', 'wall-west', 'coordinate-markers', 'prop-0'].filter(name => names.has(name)),
      viewport: { width: innerWidth, height: innerHeight }, fakeMicrophoneTrack: APP.mediaDevicesManager.audioTrack?.readyState || null,
      userAgent: navigator.userAgent };
  });
}
async function waitSnapshot(page, predicate, description, timeoutMs = 15000) {
  const end = Date.now() + timeoutMs;
  let last;
  while (Date.now() < end) {
    last = await snapshot(page);
    if (predicate(last)) return last;
    await page.waitForTimeout(100);
  }
  throw new Error(description + ': ' + JSON.stringify(last));
}
const distance = (a,b) => a && b ? Math.hypot(...a.map((value, i) => value - b[i])) : 0;
async function moveAcrossNetwork(source, observer) {
  const before = await snapshot(source);
  await source.bringToFront();
  await source.locator('canvas').first().click({ position: { x: 640, y: 400 } });
  await source.keyboard.down('KeyD');
  let moved;
  try { moved = await waitSnapshot(source, row => distance(row.local, before.local) > .15, 'Native keyboard movement did not advance', 10000); }
  finally { await source.keyboard.up('KeyD'); }
  const seen = await waitSnapshot(observer, row => row.remote.some(remote =>
    remote.creator === before.clientId && distance(remote.position, before.local) > .10 && distance(remote.position, moved.local) < 1),
  'Other native client did not observe the moved avatar', 15000);
  return { before, moved, observed: seen };
}
async function disposePage(page) {
  if (page.isClosed()) return;
  closing.add(page);
  const failures = await page.evaluate(async () => {
    const outcomes = [];
    for (const [name, action] of [
      ['microphone', () => window.APP?.mediaDevicesManager?.stopMicShare?.()],
      ['room', () => window.APP?.entryManager?.exitScene?.()],
      ['dialog', () => window.APP?.dialog?.disconnect?.()],
    ]) {
      try { await action(); } catch (error) { outcomes.push({ name, error: String(error) }); }
    }
    return outcomes;
  });
  for (const failure of failures) boundedPush(report.cleanupErrors, failure);
  await page.close();
}
try {
  const args = ['--no-proxy-server', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
    '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
    '--host-resolver-rules=MAP hubs.local 127.0.0.1, MAP hubs-assets.local 127.0.0.1, MAP hubs-proxy.local 127.0.0.1'];
  browser = await chromium.launch({ headless: true, ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}), args });
  report.observations.browserVersion = browser.version();
  for (let i = 0; i < 2; i++) {
    const context = await browser.newContext({ viewport: { width:1280, height:800 }, ignoreHTTPSErrors:true,
      locale:'en-US', permissions:['microphone'], serviceWorkers:'block' });
    contexts.push(context);
    await context.route('**/*', async route => {
      if (allowedRequest(route.request().url())) return route.continue();
      boundedPush(report.blockedRequests, { type:'http', url:safeUrl(route.request().url()) });
      await route.abort('blockedbyclient');
    });
    await context.routeWebSocket('**/*', socket => {
      if (allowedRequest(socket.url(), true)) return socket.connectToServer();
      boundedPush(report.blockedRequests, { type:'websocket', url:safeUrl(socket.url()) });
      socket.close();
    });
  }
  let alpha = await newPage(contexts[0], 'alpha');
  const beta = await newPage(contexts[1], 'beta');
  const room = await check(checkIds[0], async () => {
    await alpha.goto('https://hubs.local:4000/?skipadmin', { waitUntil:'domcontentloaded', timeout:60000 });
    const value = await alpha.evaluate(async modelUrl => {
      const response = await fetch('/api/v1/hubs', { method:'POST', headers:{'content-type':'application/json'},
        body:JSON.stringify({ hub:{ name:'F04 synthetic courtyard', default_environment_gltf_bundle_url:modelUrl } }) });
      const value = await response.json();
      // Creator/embed grants are deliberately excluded from the evidence.
      return { status:response.status, apiStatus:value.status, hubId:value.hub_id, url:value.url };
    }, input.modelUrl);
    ensure(value.status === 200 && value.apiStatus === 'ok' && /^[A-Za-z0-9_-]+$/.test(value.hubId) && allowedRequest(value.url), 'Native room creation failed');
    return value;
  });
  await nativeJoin(alpha, room.url, 'F04Alpha');
  await nativeJoin(beta, room.url, 'F04Beta');
  const initial = await check(checkIds[1], async () => {
    const observed = await Promise.all([alpha,beta].map(page => waitSnapshot(page, row =>
      row.canvas && row.frame > 0 && row.retainedSceneNames.length === 4, 'Native scene did not render the exported geometry', 30000)));
    return observed;
  });
  await check(checkIds[2], async () => {
    const [a,b] = initial;
    ensure(a.clientId && b.clientId && a.clientId !== b.clientId, 'Expected distinct real sessions');
    return Promise.all([waitSnapshot(alpha, row => row.phoenixJoined && row.presence.includes(b.clientId), 'Alpha lacks beta presence'),
      waitSnapshot(beta, row => row.phoenixJoined && row.presence.includes(a.clientId), 'Beta lacks alpha presence')]);
  });
  await check(checkIds[3], async () => Promise.all([alpha,beta].map(page => waitSnapshot(page, row =>
    row.dialogConnected && row.sendState === 'connected' && row.receiveState === 'connected' &&
    row.fakeMicrophoneTrack === 'live' && row.stats.some(stat => stat.packetsReceived > 0 && stat.bytesReceived > 0),
    'Real Dialog audio transport/packets were not observed', 30000))));
  await check(checkIds[4], () => moveAcrossNetwork(alpha, beta));
  await check(checkIds[5], () => moveAcrossNetwork(beta, alpha));
  for (const [name,page] of [['alpha.png',alpha],['beta.png',beta]]) {
    const bytes = await page.screenshot({ path:join(directory,name) });
    report.screenshots[name] = { bytes:bytes.length, sha256:createHash('sha256').update(bytes).digest('hex') };
  }
  const priorAlpha = (await snapshot(alpha)).clientId;
  await check(checkIds[6], async () => {
    await disposePage(alpha);
    return waitSnapshot(beta, row => !row.presence.includes(priorAlpha) && !row.remote.some(remote => remote.creator === priorAlpha),
      'Closed native client remained in presence/avatar state', 20000);
  });
  await check(checkIds[7], async () => {
    alpha = await newPage(contexts[0], 'alpha-rejoin');
    await nativeJoin(alpha, room.url, 'F04Alpha');
    const rejoined = await snapshot(alpha);
    ensure(rejoined.clientId && rejoined.clientId !== priorAlpha && rejoined.phoenixJoined && rejoined.dialogConnected,
      'Same browser did not establish a new native session');
    const motion = await moveAcrossNetwork(alpha,beta);
    return { priorClientId:priorAlpha, rejoined, motion };
  });
} catch (error) {
  report.fatal = errorText(error);
} finally {
  const disposal = await Promise.allSettled(pages.filter(page => !page.isClosed()).map(page => disposePage(page)));
  for (const item of disposal) if (item.status === 'rejected') boundedPush(report.cleanupErrors, { resource:'page', error:errorText(item.reason) });
  const closure = await Promise.allSettled(contexts.map(context => context.close()));
  for (const item of closure) if (item.status === 'rejected') boundedPush(report.cleanupErrors, { resource:'context', error:errorText(item.reason) });
  try { await browser?.close(); } catch (error) { boundedPush(report.cleanupErrors, { resource:'browser', error:errorText(error) }); }
  report.cleanupSettled = true;
  for (const id of checkIds.slice(0,-1)) if (!report.checks.some(check => check.id === id)) report.checks.push({ id, status:'failed', error:'Not reached after an earlier failure' });
  report.checks.sort((a,b) => checkIds.indexOf(a.id) - checkIds.indexOf(b.id));
  const clean = report.fatal === null && ['errors','failedRequests','blockedRequests','cleanupErrors'].every(key => report[key].length === 0);
  report.checks.push({ id:checkIds.at(-1), status:clean ? 'passed' : 'failed', observed:{ evaluatedAfterCleanupSettled:true } });
  report.runStatus = finalStatus(report);
  report.counts = { passed:report.checks.filter(check => check.status === 'passed').length, failed:report.checks.filter(check => check.status === 'failed').length };
  report.finishedAt = new Date().toISOString();
  process.exitCode = report.runStatus === 'passed' ? 0 : 1;
  await writeFile(join(directory,'browser-checks.json'), JSON.stringify(report,null,2)+'\n', { flag:'wx' });
  console.log(JSON.stringify({ runId:input.runId, runStatus:report.runStatus, counts:report.counts }));
}
