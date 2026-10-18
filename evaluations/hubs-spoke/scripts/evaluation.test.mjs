import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { artifactRoot, bundleRoot, sources } from './config.mjs';
import { isolatedEnvironment } from './environment.mjs';
import { canonicalJson, gitText, newRun, readJson, runCommand, sha256, startCommand } from './lib.mjs';
import { verifyFixtures, makeSpokeProject, xyzEuler } from './fixtures.mjs';
import { glbSummary } from './browser-support.mjs';
import { pins, verifySource, verifyLocalConfiguration } from './sources.mjs';

async function fixtureCopy() {
  const fixture = await verifyFixtures();
  await mkdir(join(artifactRoot, 'test-temp'), { recursive: true });
  const root = await mkdtemp(join(artifactRoot, 'test-temp', 'fixture-'));
  for (const [file, bytes] of fixture.files) {
    await mkdir(dirname(join(root, file)), { recursive: true });
    await writeFile(join(root, file), bytes);
  }
  return root;
}
test('all frozen comparison inputs and actual resources have the expected identity', async () => {
  const fixture = await verifyFixtures();
  assert.equal(fixture.world.entities.length, 55);
  assert.equal(fixture.files.size, 19);
  assert.equal(fixture.catalog.resources.length, 11);
  assert.equal(fixture.comparison.fixtureSetId, 'bve-foundation-0.1.0');
});
test('changed world content cannot be reported against the frozen comparison', async () => {
  const root = await fixtureCopy();
  const world = await readJson(join(root, 'world.json'));
  world.entities[0].transform.translation[0] = 1;
  await writeFile(join(root, 'world.json'), canonicalJson(world));
  await assert.rejects(verifyFixtures(root), /world.json content digest mismatch/);
});
test('changed asset bytes cannot reuse the frozen resource hashes', async () => {
  const root = await fixtureCopy();
  const bytes = await readFile(join(root, 'models/prop.gltf'));
  bytes[bytes.length - 2] ^= 1;
  await writeFile(join(root, 'models/prop.gltf'), bytes);
  await assert.rejects(verifyFixtures(root), /Fixture bytes changed/);
});
test('Spoke fixture mapping preserves collider parent and real video dimensions', async () => {
  const fixture = await verifyFixtures();
  const template = await readJson(join(sources.spoke, 'src/assets/templates/crater.spoke'));
  const snapshot = canonicalJson(fixture.world);
  const project = makeSpokeProject(fixture.world, fixture.catalog, template, 'https://127.0.0.1:9090');
  const proxy = project.entities['prop-0-collision'];
  assert.equal(proxy.parent, 'prop-0');
  const transform = proxy.components.find(c => c.name === 'transform').props;
  assert.deepEqual(transform.position, { x: 0, y: 0, z: 0 });
  assert.deepEqual(transform.scale, { x: 1.2, y: 1, z: 0.6 });
  const screen = project.entities['wall-screen'].components.find(c => c.name === 'transform').props;
  assert.equal(screen.scale.x, 16 / 3);
  assert.equal(screen.scale.y * (9 / 16), 3);
  assert.equal(Object.values(project.entities).filter(e => e.components?.some(c => c.name === 'audio-params')).length, 6);
  assert.equal(canonicalJson(fixture.world), snapshot, 'The candidate may not mutate frozen F03 inputs.');
  assert.throws(() => makeSpokeProject(fixture.world, fixture.catalog, template, 'https://external.invalid'), /loopback/);
});
test('nontrivial quaternion is converted in the declared XYZ convention', () => {
  const rotation = xyzEuler([0, Math.SQRT1_2, 0, Math.SQRT1_2]);
  assert.ok(Math.abs(rotation[0]) < 1e-7 && Math.abs(rotation[1] - Math.PI / 2) < 1e-7 && Math.abs(rotation[2]) < 1e-7);
  assert.throws(() => xyzEuler([0, 0, 0, 2]), /normalized/);
});
test('only transport and OS settings survive the child environment allowlist', async () => {
  const env = await isolatedEnvironment({ PATH: '/usr/bin:/bin', HOME: '/unchanged/user/home', USERPROFILE: '/unchanged/user/profile', HTTPS_PROXY: 'http://transport.invalid:8080',
    NODE_OPTIONS: '--example-inherited-flag', EXAMPLE_PROVIDER_SECRET: 'synthetic-test-value', GITHUB_TOKEN: 'synthetic-test-value', npm_config_userconfig: '/outside/npmrc' });
  assert.equal(env.HTTPS_PROXY, 'http://transport.invalid:8080');
  assert.equal(env.NODE_OPTIONS, undefined);
  assert.equal(env.EXAMPLE_PROVIDER_SECRET, undefined);
  assert.equal(env.GITHUB_TOKEN, undefined);
  assert.equal(env.HOME, undefined);
  assert.equal(env.USERPROFILE, undefined);
  assert.ok(env.npm_config_userconfig.startsWith(artifactRoot));
  assert.equal(env.NODE_USE_SYSTEM_CA, '1');
  assert.equal(env.NODE_TLS_REJECT_UNAUTHORIZED, undefined);
});
test('process errors and failed commands are never reported as success', async () => {
  const run = await newRun('process-failure-test');
  const missing = await startCommand('bve-evaluation-command-that-does-not-exist', [], { cwd: bundleRoot, runDir: run.dir, label: 'missing' });
  const missingResult = await missing.done;
  assert.equal(missingResult.success, false);
  assert.ok(missingResult.processError);
  await assert.rejects(runCommand(process.execPath, ['-e', 'process.exit(7)'], { cwd: bundleRoot, runDir: run.dir, label: 'exit-seven' }), /failed/);
  const failed = await readJson(join(run.dir, 'exit-seven.json'));
  assert.equal(failed.exitCode, 7); assert.equal(failed.success, false);
});
test('exact Spoke patch reproduces pinned bytes and unexpected registry configuration is rejected', async () => {
  await verifySource('spoke');
  const run = await newRun('patch-test');
  const temp = join(run.dir, 'source'); await mkdir(temp);
  for (const file of ['package.json', 'yarn.lock']) await writeFile(join(temp, file), await gitText(sources.spoke, ['show', `HEAD:${file}`]));
  await runCommand('git', ['init', temp], { cwd: run.dir, runDir: run.dir, label: 'git-init' });
  await runCommand('git', ['apply', join(bundleRoot, pins.sources.spoke.patch)], { cwd: temp, runDir: run.dir, label: 'apply' });
  for (const file of ['package.json', 'yarn.lock']) assert.equal(sha256(await readFile(join(temp, file))), pins.sources.spoke.files[file].patched);
  await writeFile(join(temp, '.npmrc'), 'example-setting=synthetic-private-sentinel\n');
  await assert.rejects(verifyLocalConfiguration(temp), error => /Unexpected local configuration .npmrc/.test(error.message) && !error.message.includes('synthetic-private-sentinel'));
});
test('captured GLB has the expected envelope, skin and clips; truncation is rejected', async () => {
  const bytes = await readFile(join(bundleRoot, 'evidence/2026-10-17-initial/spoke-courtyard-export.glb'));
  const stats = glbSummary(bytes);
  assert.equal(stats.bytes, 45500); assert.equal(stats.skins, 1); assert.equal(stats.animations, 2);
  assert.throws(() => glbSummary(bytes.subarray(0, bytes.length - 1)), /Invalid GLB envelope/);
});
