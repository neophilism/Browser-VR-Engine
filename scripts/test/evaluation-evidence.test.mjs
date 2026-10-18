import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { digest, repository } from '../ci/evidence.mjs';
import { evaluationCommands, requiredEvaluationReports, validateEvaluationEvidence, validateEvaluationFiles } from '../ci/evaluation-evidence.mjs';

function fixture() {
  return {
    schemaVersion: 1, kind: 'foundation-evaluations', repository, mode: 'github', eventName: 'pull_request',
    headSha: 'a'.repeat(40), baseSha: 'b'.repeat(40), testedSha: 'c'.repeat(40), treeSha: 'd'.repeat(40), workflowSha: 'e'.repeat(40),
    workflowRef: `${repository}/.github/workflows/engine-ci.yml@refs/pull/5/merge`, runId: '123', runAttempt: 1, dirty: false, complete: true, failures: [],
    toolchain: { node: 'v24.19.0', npm: '11.9.0', os: 'linux', arch: 'x64' },
    packageLocks: { f04: '0'.repeat(64), f05: '1'.repeat(64) }, comparisonSha256: '2'.repeat(64), planSha256: '3'.repeat(64),
    browser: { runDirectory: 'artifacts/runs/run-Abc123', startedAt: '2026-10-17T00:00:00Z', finishedAt: '2026-10-17T00:01:00Z', reportSha256: '4'.repeat(64), summarySha256: '5'.repeat(64), buildSha256: '6'.repeat(64) },
    xr: { runDirectory: 'artifacts/xr-runs/run-Xr123', startedAt: '2026-10-17T00:02:00Z', finishedAt: '2026-10-17T00:03:00Z', reportSha256: '7'.repeat(64), buildSha256: '8'.repeat(64), screenshotSha256: '9'.repeat(64) },
    commands: evaluationCommands.map(item => ({ ...structuredClone(item), outcome: 'passed', exitCode: 0, durationMs: 1 })),
    files: requiredEvaluationReports.map(path => ({ path, bytes: 7, sha256: digest('fixture') }))
  };
}
test('complete synthetic evaluation envelope validates without claiming actual browser execution', () => {
  assert.deepEqual(validateEvaluationEvidence(fixture()), []);
});
for (const [name, change] of [
  ['local evidence', r => { r.mode = 'local'; }],
  ['dirty source', r => { r.dirty = true; }],
  ['incomplete run', r => { r.complete = false; }],
  ['unresolved failure', r => { r.failures.push('Source changed during execution'); }],
  ['missing merge-group base', r => { r.eventName = 'merge_group'; r.baseSha = null; }],
  ['missing installation', r => { r.commands.shift(); }],
  ['reordered stages', r => { r.commands.reverse(); }],
  ['substituted command', r => { r.commands[0].argv = ['true']; }],
  ['wrong cwd', r => { r.commands[0].cwd = '/outside'; }],
  ['failed browser step', r => { r.commands.find(c => c.id === 'f05-browser').exitCode = 1; }],
  ['process error alongside zero exit', r => { r.commands[0].errorCode = 'EPERM'; }],
  ['process signal alongside zero exit', r => { r.commands[0].signal = 'SIGTERM'; }],
  ['skipped browser install', r => { r.commands.find(c => c.id === 'f05-browser-install').outcome = 'skipped'; }],
  ['missing nested lock', r => { delete r.packageLocks.f05; }],
  ['missing XR stage', r => { r.commands = r.commands.filter(command => command.id !== 'f05-xr-browser'); }],
  ['substituted XR stage', r => { r.commands.find(command => command.id === 'f05-xr-browser').argv = ['node', 'run.mjs', 'test']; }],
  ['missing XR run', r => { delete r.xr; }],
  ['historical XR run', r => { r.xr.runDirectory = 'evidence/xr-session-lifecycle'; }],
  ['missing XR screenshot', r => { r.files = r.files.filter(file => file.path !== 'xr/emulated-stereo.png'); }],
  ['invalid XR time bounds', r => { r.xr.finishedAt = '2025-01-01'; }],
  ['oversized XR evidence', r => { r.files.find(file => file.path === 'xr/xr-browser-checks.json').bytes = 16 * 1024 * 1024 + 1; }],
  ['arbitrary XR file', r => { r.files.push({ path: 'xr/unapproved.txt', bytes: 1, sha256: '0'.repeat(64) }); }],
  ['missing fresh browser run', r => { delete r.browser; }],
  ['historical browser path', r => { r.browser.runDirectory = 'evidence/previous'; }],
  ['invalid browser time bounds', r => { r.browser.finishedAt = '2025-01-01'; }],
  ['missing browser report', r => { r.files = r.files.filter(f => f.path !== 'browser/browser-checks.json'); }],
  ['missing build report', r => { r.files = r.files.filter(f => f.path !== 'browser/build.json'); }],
  ['missing toolkit audit', r => { r.files = r.files.filter(f => f.path !== 'reports/f04/dependency-audit.json'); }],
  ['traversal report', r => { r.files[0].path = '../../private'; }],
  ['duplicate report', r => { r.files.push(r.files[0]); }]
]) test(`evaluation evidence rejects ${name}`, () => {
  const value = fixture(); change(value);
  assert.ok(validateEvaluationEvidence(value).length);
});
test('changed evaluation head, tested source, base or attempt invalidates the receipt', () => {
  for (const [key, value] of [['headSha', '4'.repeat(40)], ['testedSha', '5'.repeat(40)], ['baseSha', '6'.repeat(40)], ['runAttempt', 2]]) {
    assert.match(validateEvaluationEvidence(fixture(), { [key]: value }).join('\n'), /mismatched/);
  }
});
test('downloaded evaluation report bytes and paths are independently verified', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'bve-evaluation-evidence-'));
  try {
    const record = fixture();
    for (const item of record.files) { await mkdir(dirname(join(directory, item.path)), { recursive: true }); await writeFile(join(directory, item.path), 'fixture'); }
    assert.deepEqual(await validateEvaluationFiles(record, directory), []);
    await writeFile(join(directory, 'browser/browser-checks.json'), 'changed');
    assert.match((await validateEvaluationFiles(record, directory)).join('\n'), /Changed report/);
    await rm(join(directory, 'browser/f05-summary.json'));
    assert.match((await validateEvaluationFiles(record, directory)).join('\n'), /Missing report/);
    record.files[0].path = '../../private';
    assert.match((await validateEvaluationFiles(record, directory)).join('\n'), /Unsafe report/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
