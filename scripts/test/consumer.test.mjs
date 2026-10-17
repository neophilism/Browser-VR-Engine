import test from 'node:test';
import assert from 'node:assert/strict';
import { requiredPackFiles, validatePackInventory, pinnedTypebox, validateConsumerLock } from '../test-consumer.mjs';

const names = ['@browser-vr-engine/core', '@browser-vr-engine/contracts', '@browser-vr-engine/qualification-fixtures'];
const integrity = `sha512-${Buffer.alloc(64).toString('base64')}`;
const dependency = { name: '@sinclair/typebox', version: '1.2.3', resolved: 'https://registry.npmjs.org/@sinclair/typebox/-/typebox-1.2.3.tgz', integrity };
const rootLock = () => ({ packages: { 'node_modules/@sinclair/typebox': { ...dependency }, 'packages/contracts': { dependencies: { '@sinclair/typebox': '1.2.3' } } } });

test('explicit package inventories require public declarations, fixture data and regeneration sources', () => {
  for (const name of names) assert.deepEqual(validatePackInventory(requiredPackFiles(name).map(path => ({ path })), name), []);
  for (const [name, required] of [[names[1], 'dist/validation.d.ts'], [names[2], 'fixtures/scenario.json'], [names[2], 'sources/screen-marker.webm'], [names[2], 'sources/README.md'], [names[2], 'scripts/generate.mjs']]) {
    const files = requiredPackFiles(name).filter(path => path !== required).map(path => ({ path }));
    assert.ok(validatePackInventory(files, name).some(error => error.includes(required)));
  }
  assert.deepEqual(validatePackInventory(requiredPackFiles().map(path => ({ path }))), []);
});

test('packed files cannot include undeclared private files, traversal or duplicate entries', () => {
  const files = requiredPackFiles(names[2]).map(path => ({ path }));
  for (const path of ['.env', 'fixtures/private-recording.webm', 'dist/../private.glb', 'dist/private.txt', '../outside', '/absolute']) assert.ok(validatePackInventory([...files, { path }], names[2]).length);
  assert.ok(validatePackInventory([...files, files[0]], names[2]).length);
  assert.ok(validatePackInventory([null], names[2]).length);
  assert.ok(validatePackInventory(files, 'unknown/package').length);
});

test('the root TypeBox declaration must match an exact public URL and complete SHA-512 pin', () => {
  assert.deepEqual(pinnedTypebox(rootLock()), dependency);
  for (const change of [{ version: '^1.2.3' }, { resolved: 'https://untrusted.invalid/typebox.tgz' }, { integrity: 'sha512-missing' }, { link: true }]) {
    const lock = rootLock(); Object.assign(lock.packages['node_modules/@sinclair/typebox'], change);
    assert.throws(() => pinnedTypebox(lock), /Root lock/);
  }
  const lock = rootLock(); lock.packages['packages/contracts'].dependencies['@sinclair/typebox'] = '1.2.4';
  assert.throws(() => pinnedTypebox(lock), /Root lock/);
});

function consumerFixture() {
  const directory = '/synthetic/consumer';
  const packages = names.map((name, index) => ({ name, version: '0.1.0', tarball: `/synthetic/packed/${index}.tgz`, integrity }));
  const lock = { lockfileVersion: 3, packages: {
    '': { dependencies: Object.fromEntries(packages.map(item => [item.name, `file:${item.tarball}`])) },
    ...Object.fromEntries(packages.map((item, index) => [`node_modules/${item.name}`, { version: item.version, resolved: `file:../packed/${index}.tgz`, integrity }])),
    'node_modules/@sinclair/typebox': { ...dependency }
  } };
  return { directory, packages, lock };
}

test('external installation accepts only the verified local archives and pinned TypeBox', () => {
  const { directory, packages, lock } = consumerFixture();
  assert.deepEqual(validateConsumerLock(lock, packages, dependency, directory), []);
});

for (const [name, mutate] of [
  ['missing TypeBox', lock => { delete lock.packages['node_modules/@sinclair/typebox']; }],
  ['changed dependency version', lock => { lock.packages['node_modules/@sinclair/typebox'].version = '9.9.9'; }],
  ['changed dependency integrity', lock => { lock.packages['node_modules/@sinclair/typebox'].integrity = 'wrong'; }],
  ['changed dependency URL', lock => { lock.packages['node_modules/@sinclair/typebox'].resolved = 'https://other.invalid/archive'; }],
  ['workspace link', lock => { lock.packages[`node_modules/${names[1]}`].link = true; }],
  ['workspace path', lock => { lock.packages[`node_modules/${names[1]}`].resolved = 'file:../../workspace/contracts'; }],
  ['changed local archive', lock => { lock.packages[`node_modules/${names[2]}`].integrity = 'wrong'; }],
  ['unexpected dependency', lock => { lock.packages['node_modules/extra'] = { version: '1.0.0' }; }],
  ['substituted root dependency', lock => { lock.packages[''].dependencies[names[1]] = '0.1.0'; }]
]) test(`external lock rejects ${name}`, () => {
  const { directory, packages, lock } = consumerFixture();
  mutate(lock);
  assert.ok(validateConsumerLock(lock, packages, dependency, directory).length);
});
