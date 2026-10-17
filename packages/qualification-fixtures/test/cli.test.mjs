import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

async function withPackage(run) {
  const root = await mkdtemp(join(tmpdir(), 'bve-f03-cli-'));
  try {
    for (const directory of ['dist', 'scripts', 'sources']) await mkdir(join(root, directory));
    await writeFile(join(root, 'package.json'), '{"type":"module"}');
    await writeFile(join(root, 'dist/index.js'), `export { generateFixtureSet } from ${JSON.stringify(import.meta.resolve('../dist/index.js'))};\n`);
    await copyFile(new URL('../sources/screen-marker.webm', import.meta.url), join(root, 'sources/screen-marker.webm'));
    await copyFile(new URL('../scripts/generate.mjs', import.meta.url), join(root, 'scripts/generate.mjs'));
    const generate = (...args) => {
      const result = spawnSync(process.execPath, ['scripts/generate.mjs', ...args], { cwd: root, env: { PATH: process.env.PATH ?? '' }, encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024 });
      if (result.error) throw result.error;
      assert.equal(result.signal, null, 'CLI process was terminated');
      return result;
    };
    await run(root, generate);
  } finally { await rm(root, { recursive: true, force: true }); }
}

test('the executable generator detects changed, missing and untracked fixture files', async () => {
  await withPackage(async (root, generate) => {
    const initial = generate(); assert.equal(initial.status, 0, initial.stderr); assert.match(initial.stdout, /Generated 19 reproducible fixture files/);
    assert.equal(generate('--check').status, 0);
    await writeFile(join(root, 'fixtures/scenario.json'), '{}');
    const changed = generate('--check'); assert.equal(changed.status, 1); assert.match(changed.stderr, /Changed fixture: scenario.json/);
    assert.equal(generate().status, 0);
    await writeFile(join(root, 'fixtures/extra.json'), '{}');
    const extra = generate('--check'); assert.equal(extra.status, 1); assert.match(extra.stderr, /Untracked fixture: extra.json/);
    await unlink(join(root, 'fixtures/extra.json')); await unlink(join(root, 'fixtures/scenario.json'));
    assert.equal(generate('--check').status, 1);
  });
});

test('generation refuses symlink destinations and cannot overwrite their target', async () => {
  await withPackage(async (root, generate) => {
    assert.equal(generate().status, 0);
    const target = join(root, 'outside.txt'), link = join(root, 'fixtures/models/prop.gltf');
    await writeFile(target, 'untouched'); await unlink(link); await symlink(target, link);
    const blocked = generate(); assert.equal(blocked.status, 1); assert.match(blocked.stderr, /without symlinks/);
    assert.equal(await readFile(target, 'utf8'), 'untouched');
  });
});
