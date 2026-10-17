import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { redact } from './check-secret-exposure.mjs';
import { childEnvironment } from './ci/environment.mjs';

const typebox = '@sinclair/typebox';
const packageModules = {
  '@browser-vr-engine/core': ['index'],
  '@browser-vr-engine/contracts': ['index', 'canonical', 'math', 'ports', 'qualification', 'schemas', 'validation'],
  '@browser-vr-engine/qualification-fixtures': ['index', 'generate', 'gltf', 'local-ports']
};
const fixtureFiles = [
  'catalog.json', 'comparison.json', 'devices.json', 'scenario.json', 'schema-set.json', 'thresholds.json', 'workloads.json', 'world.json',
  'audio/calibration.wav', 'audio/corner-0.wav', 'audio/corner-1.wav', 'audio/corner-2.wav', 'audio/corner-3.wav',
  'media/readability.svg', 'media/screen-marker.webm',
  'models/coordinates.gltf', 'models/courtyard.gltf', 'models/creature.gltf', 'models/prop.gltf'
];
const fixtureSupport = [...fixtureFiles.map(path => `fixtures/${path}`), 'scripts/generate.mjs', 'sources/README.md', 'sources/screen-marker.webm'];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function requiredPackFiles(name = '@browser-vr-engine/core') {
  if (!Object.hasOwn(packageModules, name)) throw new Error('Unknown consumer package');
  return ['package.json', 'README.md', ...packageModules[name].flatMap(module => [`dist/${module}.js`, `dist/${module}.d.ts`]), ...(name.endsWith('/qualification-fixtures') ? fixtureSupport : [])];
}

export function validatePackInventory(files, name = '@browser-vr-engine/core') {
  if (!Object.hasOwn(packageModules, name) || !Array.isArray(files) || files.some(file => !object(file) || typeof file.path !== 'string')) return ['Invalid package inventory'];
  const paths = files.map(file => file.path), required = requiredPackFiles(name);
  const allowed = new Set([...required, 'LICENSE', ...packageModules[name].flatMap(module => [`dist/${module}.js.map`, `dist/${module}.d.ts.map`])]);
  const errors = [];
  if (new Set(paths).size !== paths.length) errors.push('Duplicate packed file');
  for (const path of required) if (!paths.includes(path)) errors.push(`Packed package lacks ${path}`);
  for (const path of paths) if (!allowed.has(path)) errors.push(`Unexpected packed file ${path}`);
  return errors;
}

export function pinnedTypebox(rootLock) {
  const pin = rootLock?.packages?.[`node_modules/${typebox}`];
  const declaration = rootLock?.packages?.['packages/contracts']?.dependencies?.[typebox];
  if (!object(pin) || pin.link || !/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(pin.version ?? '') || declaration !== pin.version || pin.resolved !== `https://registry.npmjs.org/${typebox}/-/typebox-${pin.version}.tgz` || !/^sha512-[A-Za-z0-9+/]{86}==$/.test(pin.integrity ?? '')) throw new Error('Root lock must pin the exact public TypeBox version, URL and SHA-512 integrity used by contracts');
  return { name: typebox, version: pin.version, resolved: pin.resolved, integrity: pin.integrity };
}

/** Validate before npm ci can install or execute the external dependency. */
export function validateConsumerLock(lock, packages, dependency, directory) {
  if (!object(lock) || lock.lockfileVersion !== 3 || !object(lock.packages)) return ['Invalid external consumer lock'];
  const errors = [], expected = new Set(['', ...packages.map(item => `node_modules/${item.name}`), `node_modules/${dependency.name}`]);
  if (Object.keys(lock.packages).length !== expected.size || Object.keys(lock.packages).some(path => !expected.has(path))) errors.push('External consumer dependency set differs from the required packages');
  const declarations = lock.packages['']?.dependencies;
  if (!object(declarations) || Object.keys(declarations).length !== packages.length) errors.push('External consumer root dependencies differ');
  for (const item of packages) {
    const entry = lock.packages[`node_modules/${item.name}`];
    const localFile = value => typeof value === 'string' && value.startsWith('file:') && resolve(directory, value.slice(5)) === item.tarball;
    if (!object(entry) || entry.link || entry.version !== item.version || entry.integrity !== item.integrity || !localFile(entry.resolved) || !localFile(declarations?.[item.name])) errors.push(`Consumer must install the exact local tarball for ${item.name}`);
  }
  const external = lock.packages[`node_modules/${dependency.name}`];
  if (!object(external) || external.link || ['version', 'resolved', 'integrity'].some(key => external[key] !== dependency[key])) errors.push('Consumer TypeBox dependency differs from the root lock');
  return errors;
}

export async function testConsumer(root) {
  const temp = await mkdtemp(join(tmpdir(), 'browser-vr-consumer-'));
  const env = childEnvironment(process.env, { npm_config_cache: join(temp, 'npm-cache') });
  function run(argv, cwd) {
    const result = spawnSync(argv[0], argv.slice(1), { cwd, env, encoding: 'utf8', timeout: 60_000, maxBuffer: 4 * 1024 * 1024, shell: false });
    if (result.status !== 0 || result.error) throw new Error(redact(`Consumer command failed: ${argv.join(' ')}\n${result.stdout ?? ''}${result.stderr ?? ''}${result.error ? `\nCommand error: ${result.error.code ?? 'unknown'}` : ''}`));
    return result.stdout;
  }
  try {
    const packDirectory = join(temp, 'packed'), consumer = join(temp, 'consumer');
    await mkdir(packDirectory);
    await mkdir(consumer);
    const userConfig = join(temp, 'npm-user.conf'), globalConfig = join(temp, 'npm-global.conf');
    await writeFile(userConfig, ''); await writeFile(globalConfig, '');
    const npmConfig = ['--userconfig', userConfig, '--globalconfig', globalConfig];
    const dependency = pinnedTypebox(JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8')));
    const packages = [];
    for (const name of Object.keys(packageModules)) {
      const records = JSON.parse(run(['npm', 'pack', '--workspace', name, '--ignore-scripts', '--json', '--pack-destination', packDirectory, ...npmConfig], root));
      assert.equal(records.length, 1);
      const packed = records[0];
      assert.equal(packed.name, name);
      assert.deepEqual(validatePackInventory(packed.files, name), []);
      assert.match(packed.filename, /^[A-Za-z0-9_.-]+\.tgz$/);
      const tarball = join(packDirectory, packed.filename);
      const integrity = `sha512-${createHash('sha512').update(await readFile(tarball)).digest('base64')}`;
      assert.equal(packed.integrity, integrity);
      packages.push({ name, version: packed.version, tarball, integrity });
    }
    await writeFile(join(consumer, 'package.json'), JSON.stringify({ name: 'isolated-engine-consumer', private: true, type: 'module', dependencies: Object.fromEntries(packages.map(item => [item.name, `file:${item.tarball}`])) }));
    const npmOptions = ['--ignore-scripts', '--no-audit', '--no-fund', '--registry=https://registry.npmjs.org', '--fetch-timeout=10000', '--fetch-retries=0', ...npmConfig];
    run(['npm', 'install', '--package-lock-only', ...npmOptions], consumer);
    const lockPath = join(consumer, 'package-lock.json'), lockBytes = await readFile(lockPath);
    assert.deepEqual(validateConsumerLock(JSON.parse(lockBytes), packages, dependency, consumer), []);
    await rm(join(consumer, 'node_modules'), { recursive: true, force: true });
    run(['npm', 'ci', ...npmOptions], consumer);
    assert.deepEqual(await readFile(lockPath), lockBytes, 'Clean install must retain the verified lock');
    await writeFile(join(consumer, 'runtime.mjs'), `import assert from 'node:assert/strict';
import { realpathSync, readFileSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { enginePackage } from '@browser-vr-engine/core';
import { CONTRACT_VERSION, validateDocument } from '@browser-vr-engine/contracts';
import { generateToneWav } from '@browser-vr-engine/qualification-fixtures';
const contained = (parent, child) => { const path = relative(parent, child); assert.ok(!path.startsWith('..') && !isAbsolute(path), 'Package resolved outside its independent installation'); };
for (const item of ${JSON.stringify([...packages.map(({ name, version }) => ({ name, version })), { name: dependency.name, version: dependency.version }])}) {
  const installed = realpathSync(resolve('node_modules', item.name));
  contained(realpathSync('.'), installed);
  contained(installed, realpathSync(fileURLToPath(import.meta.resolve(item.name))));
  assert.equal(JSON.parse(readFileSync(resolve(installed, 'package.json'), 'utf8')).version, item.version);
}
const requireFromContracts = createRequire(import.meta.resolve('@browser-vr-engine/contracts'));
contained(realpathSync('node_modules/@sinclair/typebox'), realpathSync(requireFromContracts.resolve('@sinclair/typebox/value')));
assert.equal(enginePackage.name, '@browser-vr-engine/core');
assert.equal(CONTRACT_VERSION, '0.1.0');
assert.equal(validateDocument('world', {}).ok, false);
assert.equal(generateToneWav(440).byteLength, 96044);
`);
    run([process.execPath, 'runtime.mjs'], consumer);
    await writeFile(join(consumer, 'fixture-smoke.mjs'), await readFile(join(root, 'examples/fixture-smoke/index.mjs')));
    const smoke = JSON.parse(run([process.execPath, 'fixture-smoke.mjs'], consumer));
    assert.equal(smoke.resourceIntegrity, 'verified');
    assert.equal(smoke.qualificationStatus, 'incomplete', 'Logical replay must not qualify physical or browser capabilities');
    run([process.execPath, 'node_modules/@browser-vr-engine/qualification-fixtures/scripts/generate.mjs', '--check'], consumer);
    await writeFile(join(consumer, 'index.ts'), `import { enginePackage } from '@browser-vr-engine/core';
import { COORDINATES, validateDocument, type AssetRef, type EvidenceMethod, type ScenarioStep, type WorldFixture } from '@browser-vr-engine/contracts';
import { generateFixtureSet, generateToneWav, createFixtureAssetPort, type GeneratedFixtureSet } from '@browser-vr-engine/qualification-fixtures';
const name: string = enginePackage.name;
const units: 'meters' = COORDINATES.units;
const method: EvidenceMethod = 'physical-headset';
const step: ScenarioStep = { id: 'grab', action: 'grab', tick: 0, assertions: ['held'], targetId: 'object' };
const tone: Uint8Array = generateToneWav(440);
declare const originalVideo: Uint8Array;
const generated: Promise<GeneratedFixtureSet> = generateFixtureSet(originalVideo);
generated.then(set => createFixtureAssetPort(set.catalog, set.files));
const checked = validateDocument('world', {});
if (checked.ok) { const world: WorldFixture = checked.value; void world; }
// @ts-expect-error Core declarations must reject unknown properties.
enginePackage.propertyThatDoesNotExist;
// @ts-expect-error Asset kinds are a closed union.
const badKind: AssetRef['kind'] = 'plugin-code';
// @ts-expect-error Qualification evidence cannot use an arbitrary label.
const badMethod: EvidenceMethod = 'pretend-hardware';
// @ts-expect-error Grab actions require a target.
const badStep: ScenarioStep = { id: 'grab', action: 'grab', tick: 0, assertions: ['held'] };
// @ts-expect-error Fixture input must be bytes.
generateFixtureSet('not bytes');
void [name, units, method, step, tone, badKind, badMethod, badStep];
`);
    await writeFile(join(consumer, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, noEmit: true, types: [] }, files: ['index.ts'] }));
    run([process.execPath, resolve(root, 'node_modules/typescript/bin/tsc'), '-p', join(consumer, 'tsconfig.json')], consumer);
    console.log(`Independent tarball consumer passed: all three packages, root-lock TypeBox ${dependency.version}, public fixture replay, shipped fixture regeneration check and positive/negative declarations.`);
  } finally { await rm(temp, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await testConsumer(resolve(import.meta.dirname, '..'));
