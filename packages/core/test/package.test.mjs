import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('the public ESM export loads in a Node host without browser or conference services', async () => {
  const { enginePackage } = await import('@browser-vr-engine/core');
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(enginePackage.name, manifest.name);
  assert.equal(enginePackage.version, manifest.version);
  assert.ok(Object.isFrozen(enginePackage));
});
