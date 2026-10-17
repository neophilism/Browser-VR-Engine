import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { childEnvironment } from './ci/environment.mjs';

export function validateShards(shards, expectedCases, expectedIds = ['1/2', '2/2']) {
  const errors = [];
  if (!Array.isArray(shards) || shards.length !== expectedIds.length || new Set(shards.map(shard => shard.id)).size !== expectedIds.length || expectedIds.some(id => !shards.some(shard => shard.id === id))) return ['Missing or duplicated shard'];
  const actual = shards.flatMap(shard => shard.cases);
  if (shards.some(shard => shard.exitCode !== 0 || !shard.cases.length)) errors.push('Failed or empty shard');
  if (new Set(actual).size !== actual.length || actual.length !== expectedCases.length || expectedCases.some(id => !actual.includes(id))) errors.push('Shards omit or duplicate discovered cases');
  return errors;
}

export async function testSharding() {
  const directory = await mkdtemp(join(tmpdir(), 'engine-sharding-'));
  try {
    const expected = ['a', 'b', 'c', 'd'].map(id => `fixture-${id}`);
    const files = [];
    for (const name of expected) {
      const file = join(directory, `${name}.test.mjs`);
      await writeFile(file, `import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('${name}', () => assert.equal(1 + 1, 2));\n`);
      files.push(file);
    }
    const run = id => {
      const args = ['--test', '--test-reporter=tap', ...(id ? [`--test-shard=${id}`] : []), ...files];
      const result = spawnSync(process.execPath, args, { env: childEnvironment(), encoding: 'utf8', timeout: 30_000 });
      const cases = [...String(result.stdout).matchAll(/^# Subtest: (fixture-[a-d])$/gm)].map(match => match[1]);
      const failures = [...String(result.stdout).matchAll(/^not ok \d+ - (fixture-[a-d])$/gm)].map(match => match[1]);
      return { id, cases, failures, exitCode: result.error ? null : result.status };
    };
    const unsharded = run(null);
    assert.equal(unsharded.exitCode, 0);
    assert.deepEqual(unsharded.cases.sort(), expected);
    assert.deepEqual(validateShards(['1/2', '2/2'].map(run), unsharded.cases), []);
    await writeFile(files[0], `import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('${expected[0]}', () => assert.fail('Intentional runner negative control'));\n`);
    const negative = run(null);
    assert.equal(negative.exitCode, 1, 'The same runner mode must fail an actual test assertion');
    assert.deepEqual(negative.failures, [expected[0]]);
    const negativeShards = ['1/2', '2/2'].map(run);
    assert.deepEqual(negativeShards.map(shard => shard.exitCode).sort(), [0, 1]);
    assert.deepEqual(negativeShards.flatMap(shard => shard.failures), [expected[0]]);
    assert.ok(validateShards(negativeShards, expected).includes('Failed or empty shard'));
    console.log('Real Node test sharding passed: named cases cover both shards; an intentional assertion fails the unsharded runner and its shard.');
  } finally { await rm(directory, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await testSharding();
