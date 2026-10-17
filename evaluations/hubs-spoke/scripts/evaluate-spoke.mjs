import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bundleRoot, sources, browserExecutable, softwareRendering, origin, port } from './config.mjs';
import { isolatedEnvironment } from './environment.mjs';
import { newRun, startCommand, writeJson } from './lib.mjs';
import { verifySource } from './sources.mjs';
import { adaptationVersion, fixturePins, prepareFixture } from './fixtures.mjs';
import { assertFreePort, bounded, glbSummary, runnerFingerprints, waitForOwnedServer } from './browser-support.mjs';

const run = await newRun('spoke-browser');
const result = { runId: run.id, candidate: 'Spoke', status: 'running', F04: 'blocked',
  startedAt: new Date().toISOString(), node: process.version, adaptationVersion, fixturePins,
  observations: {}, passedChecks: [], errors: [], blockedHosts: [],
  limitations: [
    'A real desktop browser editor subset, not a completed F03 QualificationAdapter scenario.',
    'Selection uses the public editor API; numeric position fields are changed through real browser input.',
    'Export uses the unmodified native editor.exportScene API with combineMeshes/removeUnusedObjects disabled.',
    'The serialized native project is reloaded. The exported GLB is inspected, not reimported into Hubs.',
    'No Reticulum/Dialog, second participant, reconnect, shared media synchronization, authoritative dynamic physics, actual headset, mobile hardware, frame-time route, or capacity evidence.',
    'Native spatial-audio settings are preserved; this check is not an audible localization/mixing/occlusion/headset verification.',
  ] };
let browser, server;
const blockedHosts = new Set();
const check = (name, condition) => { assert.ok(condition, name); result.passedChecks.push(name); };
try {
  result.source = await verifySource('spoke');
  result.runnerFingerprints = await runnerFingerprints();
  const prepared = await prepareFixture(run);
  result.adaptation = prepared.adaptation;
  await assertFreePort(port);
  server = await startCommand(process.execPath, [join(sources.spoke, 'node_modules/webpack-dev-server/bin/webpack-dev-server.js'), '--mode', 'development', '--content-base', prepared.servedRoot], {
    cwd: sources.spoke, runDir: run.dir, label: 'spoke-server', timeoutMs: 480000,
    extraEnv: { NODE_ENV: 'development', HOST_IP: '127.0.0.1', HOST_PORT: String(port), INTERNAL_HOSTNAME: '127.0.0.1' },
  });
  const projectUrl = `${origin}/${prepared.projectName}`;
  await waitForOwnedServer(server, projectUrl, await readFile(join(prepared.servedRoot, prepared.projectName)));
  const env = await isolatedEnvironment();
  process.env.PLAYWRIGHT_BROWSERS_PATH = env.PLAYWRIGHT_BROWSERS_PATH;
  const { chromium } = await import('playwright');
  const args = softwareRendering ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [];
  browser = await chromium.launch({ executablePath: browserExecutable, headless: true, env, args });
  result.browser = browser.version(); result.softwareRenderingRequested = softwareRendering;
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true, serviceWorkers: 'block' });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === origin || ['blob:', 'data:'].includes(url.protocol)) return route.continue();
    blockedHosts.add(url.hostname);
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', error => result.errors.push(error.message));
  await page.goto(`${origin}/projects/new?template=${encodeURIComponent(projectUrl)}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => {
    const editor = window.editor, courtyard = editor?.scene?.getObjectByName('courtyard');
    const bird = editor?.scene?.getObjectByName('bird'), screen = editor?.scene?.getObjectByName('wall-screen');
    let meshes = 0, skins = 0;
    courtyard?.traverse(node => { if (node.isMesh) meshes++; });
    bird?.traverse(node => { if (node.isSkinnedMesh) skins++; });
    return meshes > 0 && skins > 0 && screen?.el?.videoWidth === 1280 && screen?._mesh?.visible;
  }, undefined, { timeout: 60000 });
  result.observations.loaded = await page.evaluate(() => {
    const editor = window.editor, renderer = editor.renderer.renderer, gl = renderer.getContext();
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    const sources = editor.nodes.filter(node => node.audioType).map(node => ({ name: node.name, audioType: node.audioType, gain: node.gain }));
    let skinnedMeshes = 0;
    editor.scene.getObjectByName('bird').traverse(node => { if (node.isSkinnedMesh) skinnedMeshes++; });
    return { renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      webglVersion: gl.getParameter(gl.VERSION), canvas: { width: renderer.domElement.width, height: renderer.domElement.height },
      video: { width: editor.scene.getObjectByName('wall-screen').el.videoWidth, height: editor.scene.getObjectByName('wall-screen').el.videoHeight },
      skinnedMeshes, sources, sourceCount: sources.length, projectNodes: editor.nodes.length };
  });
  check('Actual courtyard glTF and skinned creature loaded in the editor', result.observations.loaded.skinnedMeshes > 0);
  check('Fixture video decoded at 1280 by 720', result.observations.loaded.video.width === 1280 && result.observations.loaded.video.height === 720);
  check('Six mapped spatial emitters exist', result.observations.loaded.sources.length === 6 && result.observations.loaded.sources.every(source => source.audioType === 'pannernode'));

  const inspectMappedFields = async () => page.evaluate(() => {
    const scene = window.editor.scene;
    scene.updateMatrixWorld(true);
    const prop = scene.getObjectByName('prop-0'), proxy = scene.getObjectByName('prop-0-collision');
    const screen = scene.getObjectByName('wall-screen');
    return { prop: prop.position.toArray(), colliderParent: proxy.parent.name,
      colliderWorldPosition: proxy.getWorldPosition(proxy.position.clone()).toArray(),
      screenSize: screen._mesh.getWorldScale(screen.scale.clone()).toArray().slice(0, 2),
      screenAudioType: screen.audioType, screenSource: screen.src };
  });
  result.observations.beforeEdit = await inspectMappedFields();
  check('Initial movable prop uses the frozen transform', JSON.stringify(result.observations.beforeEdit.prop) === '[-4,0.6,2]');
  await page.evaluate(() => window.editor.setSelection([window.editor.scene.getObjectByName('prop-0')]));
  // NumericInput removes trailing zeroes on focus. Locate the three controls by
  // their actual Position group, not a value that changes when Tab focuses it.
  const positionInputs = page.locator('[class*="InputGroup__InputGroupContainer"]')
    .filter({ has: page.getByText('Position:', { exact: true }) }).locator('input');
  await positionInputs.first().waitFor({ state: 'visible' });
  assert.equal(await positionInputs.count(), 3, 'The selected node must expose three Position inputs.');
  await positionInputs.nth(0).fill('2');
  await page.keyboard.press('Tab');
  await positionInputs.nth(1).fill('1');
  await page.keyboard.press('Tab');
  result.observations.uiEdit = await inspectMappedFields();
  check('Numeric field edits move prop to [2,1,2]', JSON.stringify(result.observations.uiEdit.prop) === '[2,1,2]');
  check('Collision proxy follows its edited prop', result.observations.uiEdit.colliderParent === 'prop-0' && JSON.stringify(result.observations.uiEdit.colliderWorldPosition) === '[2,1,2]');
  const matchesScreen = values => Math.abs(values[0] - 16 / 3) < 1e-6 && Math.abs(values[1] - 3) < 1e-6;
  check('Screen retains the F03 physical size of 5.333 by 3 meters', matchesScreen(result.observations.uiEdit.screenSize));
  const exported = await bounded(page.evaluate(async () => {
    const editor = window.editor, project = editor.scene.serialize();
    const { glbBlob } = await editor.exportScene(new AbortController().signal, { combineMeshes: false, removeUnusedObjects: false });
    return { project, bytes: [...new Uint8Array(await glbBlob.arrayBuffer())] };
  }), 'Native GLB export');
  const glb = Buffer.from(exported.bytes);
  result.observations.glbExport = glbSummary(glb);
  check('Native GLB export includes a skin and both source animation clips', result.observations.glbExport.skins === 1 && result.observations.glbExport.animations === 2);
  await writeFile(join(run.dir, 'spoke-courtyard-export.glb'), glb, { flag: 'wx' });
  await writeJson(join(run.dir, 'spoke-courtyard-export.spoke'), exported.project);
  await bounded(page.evaluate(async project => { await window.editor.loadProject(project); }, exported.project), 'Native project reload');
  await page.waitForFunction(() => window.editor?.scene?.getObjectByName('wall-screen')?._mesh?.visible);
  result.observations.projectReload = await inspectMappedFields();
  check('Native project reload preserves the edited prop', JSON.stringify(result.observations.projectReload.prop) === '[2,1,2]');
  check('Native project reload preserves the collider relationship', result.observations.projectReload.colliderParent === 'prop-0' && JSON.stringify(result.observations.projectReload.colliderWorldPosition) === '[2,1,2]');
  check('Native project reload preserves screen physical size', matchesScreen(result.observations.projectReload.screenSize));
  check('Native project reload preserves the positional video setting', result.observations.projectReload.screenAudioType === 'pannernode');
  check('No uncaught browser page exceptions', result.errors.length === 0);
  await page.screenshot({ path: join(run.dir, 'spoke-selected.png'), fullPage: true });
  result.sourceAfterRun = await verifySource('spoke');
  result.status = 'passed-editor-subset';
} catch (error) {
  result.status = 'failed'; result.error = error.stack || error.message; process.exitCode = 1;
} finally {
  try { if (browser) await bounded(browser.close(), 'Browser shutdown', 15000); }
  catch (error) { result.cleanupError = error.message; result.status = 'failed'; process.exitCode = 1; }
  try { if (server) result.serverExit = await server.stop(); }
  catch (error) { result.cleanupError = error.message; result.status = 'failed'; process.exitCode = 1; }
  result.blockedHosts = [...blockedHosts].sort(); result.finishedAt = new Date().toISOString();
  await writeJson(join(run.dir, 'spoke-interactions.json'), result);
}
console.log(JSON.stringify({ status: result.status, checks: result.passedChecks.length, F04: result.F04, run: run.dir, error: result.error }));
