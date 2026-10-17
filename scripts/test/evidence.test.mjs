import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { artifactName, digest, foundationCommands, repository, requiredJobsPassed, validateEvidence, validateEvidenceFiles, validateScopes } from '../ci/evidence.mjs';
import { runCommand } from '../ci/run.mjs';
import { validateShards } from '../test-sharding.mjs';

const scopeRegistry = JSON.parse(await readFile(new URL('../../docs/ci/scopes.json', import.meta.url), 'utf8'));
function fixture() {
  const paths = [...foundationCommands.map(command => `logs/${command.id}.txt`), 'reports/dependency-audit.json'];
  return {
    schemaVersion: 1, repository, mode: 'github', eventName: 'pull_request', headSha: 'a'.repeat(40), baseSha: 'b'.repeat(40), testedSha: 'c'.repeat(40), treeSha: 'd'.repeat(40), dirty: false,
    runId: '123', runAttempt: 1, workflowSha: 'e'.repeat(40), workflowRef: `${repository}/.github/workflows/engine-ci.yml@refs/pull/2/merge`, lockfileSha256: 'f'.repeat(64), planSha256: '0'.repeat(64),
    toolchain: { node: 'v24.19.0', npm: '11.9.0', os: 'linux', arch: 'x64' }, scopeRegistry: structuredClone(scopeRegistry), complete: true,
    commands: foundationCommands.map(command => ({ ...structuredClone(command), outcome: 'passed', exitCode: 0, durationMs: 1 })),
    files: paths.map(path => ({ path, bytes: 7, sha256: digest('fixture') }))
  };
}

test('complete synthetic evidence validates its schema, without asserting actual execution', () => assert.deepEqual(validateEvidence(fixture()), []));

for (const [name, mutate, expected] of [
  ['local result promoted to hosted', record => { record.mode = 'local'; }, /Local evidence/],
  ['dirty checkout', record => { record.dirty = true; }, /Dirty source/],
  ['wrong repository', record => { record.repository = 'other/repo'; }, /Wrong repository/],
  ['missing command', record => record.commands.pop(), /command set/],
  ['duplicate command', record => record.commands.push(record.commands[0]), /duplicated/],
  ['substituted command under valid ID', record => { record.commands[0].argv = ['true']; }, /differs from the required command/],
  ['failed command with uploaded logs', record => { record.commands[1].outcome = 'failed'; record.commands[1].exitCode = 1; }, /did not pass/],
  ['missing dependency report', record => record.files.pop(), /Missing dependency audit/],
  ['duplicate report', record => record.files.push(record.files[0]), /Invalid report inventory/],
  ['failed completion', record => { record.complete = false; }, /incomplete/],
  ['wrong workflow', record => { record.workflowRef = 'other/workflow@main'; }, /Wrong workflow/],
  ['inactive suite promoted without runner', record => { record.scopeRegistry.scopes[1].status = 'required'; }, /real runner/]
]) {
  test(`evidence mutation rejects ${name}`, () => {
    const record = fixture();
    mutate(record);
    assert.match(validateEvidence(record).join('\n'), expected);
  });
}

test('a changed head/base/tested commit or run attempt invalidates the candidate evidence', () => {
  const record = fixture();
  for (const [key, value] of [['headSha', '1'.repeat(40)], ['baseSha', '2'.repeat(40)], ['testedSha', '3'.repeat(40)], ['runAttempt', 2], ['lockfileSha256', '4'.repeat(64)]]) assert.match(validateEvidence(record, { [key]: value }).join('\n'), new RegExp(`mismatched ${key}`));
});

test('artifact identities are deterministic and distinguish retries; unsafe names fail', () => {
  const record = fixture();
  assert.equal(artifactName(record), artifactName(structuredClone(record)));
  assert.notEqual(artifactName(record), artifactName({ ...record, runAttempt: 2 }));
  assert.throws(() => artifactName(record, '../other'));
  assert.throws(() => artifactName({ ...record, runId: 'untrusted/name' }));
});

test('the job aggregate requires the exact expected job set and successful outcomes', () => {
  assert.equal(requiredJobsPassed({ checks: 'success' }), true);
  for (const result of [{}, { unrelated: 'success' }, { checks: 'success', unrelated: 'success' }, { checks: 'skipped' }, { checks: 'neutral' }, { checks: 'failure' }, { checks: 'cancelled' }]) assert.equal(requiredJobsPassed(result), false);
  assert.equal(requiredJobsPassed({ checks: 'success' }, ['checks', 'browser']), false);
});

test('report bytes, omissions, and traversal are independently checked', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'engine-evidence-'));
  try {
    await mkdir(join(directory, 'logs'));
    await mkdir(join(directory, 'reports'));
    const record = fixture();
    for (const item of record.files) await writeFile(join(directory, item.path), 'fixture');
    assert.deepEqual(await validateEvidenceFiles(record, directory), []);
    await writeFile(join(directory, record.files[0].path), 'changed');
    assert.match((await validateEvidenceFiles(record, directory)).join('\n'), /integrity mismatch/);
    await rm(join(directory, record.files[1].path));
    assert.match((await validateEvidenceFiles(record, directory)).join('\n'), /Missing report/);
    record.files[0].path = '../../outside';
    assert.match((await validateEvidenceFiles(record, directory)).join('\n'), /Unsafe report path/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('real child-command exits propagate failure and redact synthetic credential markers', () => {
  const marker = 'gh' + 'p_' + 'x'.repeat(36);
  const failed = runCommand([process.execPath, '-e', `console.log(${JSON.stringify(marker)}); process.exit(23)`]);
  assert.equal(failed.outcome, 'failed');
  assert.equal(failed.exitCode, 23);
  assert.ok(!failed.log.includes(marker));
  assert.match(failed.log, /REDACTED/);
  assert.equal(runCommand([process.execPath, '-e', 'process.exit(0)']).outcome, 'passed');
  assert.equal(runCommand(['nonexistent-engine-test-command']).outcome, 'failed');
});

test('suite registry and shard evidence reject disabled, missing, duplicate or failed work', () => {
  const scopes = structuredClone(scopeRegistry);
  scopes.scopes[0].status = 'not_applicable';
  assert.match(validateScopes(scopes).join('\n'), /must be required/);
  const good = [{ id: '1/2', cases: ['a'], exitCode: 0 }, { id: '2/2', cases: ['b'], exitCode: 0 }];
  assert.deepEqual(validateShards(good, ['a', 'b']), []);
  assert.ok(validateShards(good.slice(0, 1), ['a', 'b']).length);
  assert.ok(validateShards([good[0], good[0]], ['a', 'b']).length);
  assert.ok(validateShards([good[0], { ...good[1], exitCode: 1 }], ['a', 'b']).length);
  assert.ok(validateShards([good[0], { ...good[1], cases: ['a'] }], ['a', 'b']).length);
});
