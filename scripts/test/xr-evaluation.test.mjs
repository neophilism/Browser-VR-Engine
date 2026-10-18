import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, symlink, rm, truncate } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { digest, repository } from '../ci/evidence.mjs';
import { childEnvironment } from '../ci/environment.mjs';
import { evaluationCommands, requiredEvaluationReports, validateEvaluationFiles } from '../ci/evaluation-evidence.mjs';
import { validateXRBrowserEvidence, collectXREvidence, evaluationRunDirectories,
  requiredF05SourceFiles, requiredF05BuildInputs } from '../ci/evaluate.mjs';
import { verifyEvaluationEvidence } from '../ci/verify-evaluation-evidence.mjs';

const root = resolve(import.meta.dirname, '../..');
const candidate = 'evaluations/babylon-vrspace';
const history = resolve(root, candidate, 'evidence/xr-session-lifecycle');
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const pretty = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const fingerprints = async names => Object.fromEntries(await Promise.all(names.map(async name => {
  const bytes = await readFile(resolve(root, candidate, name));
  return [name, { bytes: bytes.length, sha256: digest(bytes) }];
})));

// Synthetic verifier inputs only. Historical bytes are never rewritten, and
// rebinding this in-memory fixture does not constitute new execution evidence.
async function fixture() {
  const report = await json(join(history, 'xr-browser-checks.json'));
  report.sourceDigests = await fingerprints(requiredF05SourceFiles);
  report.build.inputs = await fingerprints(requiredF05BuildInputs);
  report.finalizationErrors = []; report.counts.logOverflow = 0;
  report.environment.physicalHeadset = false; report.environment.physicalAudio = false;
  report.comparison = await json(resolve(root, 'packages/qualification-fixtures/fixtures/comparison.json'));
  const runDirectory = 'artifacts/xr-runs/run-Synthetic';
  const record = { files: [], xr: { runDirectory, startedAt: report.startedAt, finishedAt: report.timestamp } };
  const xrCommand = { ...structuredClone(evaluationCommands.find(command => command.id === 'f05-xr-browser')),
    outcome: 'passed', exitCode: 0, errorCode: null, signal: null, durationMs: 2000,
    startedAt: new Date(Date.parse(report.startedAt) - 1000).toISOString(), finishedAt: new Date(Date.parse(report.timestamp) + 1000).toISOString(),
    log: JSON.stringify({ runStatus: 'passed', ...report.counts, output: runDirectory }) };
  const screenshotBytes = await readFile(join(history, 'emulated-stereo.png'));
  return { report, record, xrCommand, root, screenshotBytes };
}
function bind(value) {
  const reportBytes = pretty(value.report), buildBytes = pretty(value.report.build);
  for (const [field, path, bytes] of [
    ['reportSha256', 'xr/xr-browser-checks.json', reportBytes],
    ['buildSha256', 'xr/build.json', buildBytes],
    ['screenshotSha256', 'xr/emulated-stereo.png', value.screenshotBytes],
  ]) {
    value.record.xr[field] = digest(bytes);
    value.record.files = value.record.files.filter(item => item.path !== path);
    value.record.files.push({ path, bytes: bytes.length, sha256: digest(bytes) });
  }
  return { ...value, reportBytes, buildBytes };
}
async function validate(value) { return validateXRBrowserEvidence(value.report, bind(value)); }

test('separate XR validator accepts internally consistent synthetic input without claiming a headset run', async () => {
  assert.deepEqual(await validate(await fixture()), []);
});
for (const [name, change, pattern] of [
  ['desktop command substituted for XR', value => { value.xrCommand.argv = ['node', 'run.mjs', 'test']; }, /command did not complete/],
  ['wrong working directory', value => { value.xrCommand.cwd = '.'; }, /command did not complete/],
  ['missing XR check', value => { value.report.checks.pop(); }, /10 emulated XR checks/],
  ['reordered XR checks', value => { value.report.checks.reverse(); }, /10 emulated XR checks/],
  ['failed check hidden by counts', value => { value.report.checks[0].status = 'failed'; }, /10 emulated XR checks/],
  ['malformed nested check', value => { value.report.checks[0] = null; }, /10 emulated XR checks/],
  ['native-headset check relabel', value => { value.report.checks[0].method = 'headset'; }, /10 emulated XR checks/],
  ['physical headset claim', value => { value.report.physicalHeadset = true; }, /explicitly emulated/],
  ['physical audio claim', value => { value.report.environment.physicalAudio = true; }, /software-rendering identity/],
  ['complete qualification claim', value => { value.report.qualificationStatus = 'passed'; }, /explicitly emulated/],
  ['missing physical limitations', value => { value.report.missingEvidence = []; }, /limitations/],
  ['missing finalizer hash', value => { delete value.report.sourceDigests['test/browser-finalize.mjs']; }, /source.*coverage/],
  ['missing XR harness hash', value => { delete value.report.sourceDigests['test/xr-browser-checks.mjs']; }, /source.*coverage/],
  ['changed XR runtime source', value => { value.report.sourceDigests['src/xr-session.js'].sha256 = '0'.repeat(64); }, /Changed source/],
  ['missing XR build input', value => { delete value.report.build.inputs['src/xr-session.js']; }, /build input.*coverage/],
  ['wrong frozen fixture', value => { value.report.fixtureDigests.world = '0'.repeat(64); }, /fixture\/comparison/],
  ['wrong comparison', value => { value.report.comparison.fixtureSetId = 'synthetic-other'; }, /fixture\/comparison/],
  ['wrong emulator pin', value => { value.report.candidate.iwer = '0.0.0'; }, /candidate differs/],
  ['unrecorded emulator adapter', value => { delete value.report.candidate.testOnlyAdapter; }, /candidate differs/],
  ['old run outside command bounds', value => { value.xrCommand.startedAt = new Date(Date.parse(value.report.timestamp) + 1).toISOString(); }, /time bounds/],
  ['historical directory', value => { value.record.xr.runDirectory = 'evidence/xr-session-lifecycle'; }, /run directory|command output/],
  ['different stdout run', value => { value.xrCommand.log = value.xrCommand.log.replace('run-Synthetic', 'run-Old'); }, /command output/],
  ['multiple passing stdout receipts', value => { value.xrCommand.log += `\n${value.xrCommand.log}`; }, /command output/],
  ['failed command', value => { value.xrCommand.exitCode = 1; }, /command did not complete/],
  ['process error despite zero exit', value => { value.xrCommand.errorCode = 'EPERM'; }, /command did not complete/],
  ['process signal despite zero exit', value => { value.xrCommand.signal = 'SIGTERM'; }, /command did not complete/],
  ['late page error', value => { value.report.logs.push({ type: 'pageerror', text: 'Synthetic late event' }); }, /page errors/],
  ['late failed request', value => { value.report.failedRequests.push({ url: 'https://synthetic.invalid/' }); }, /failed requests/],
  ['browser cleanup failure', value => { value.report.finalizationErrors.push({ stage: 'browser-close', message: 'Synthetic failure' }); }, /finalization/],
  ['log overflow', value => { value.report.counts.logOverflow = 1; }, /counts/],
  ['truncated PNG with a recomputed hash', value => { value.screenshotBytes = value.screenshotBytes.subarray(0, 24); }, /complete 1280x720 PNG/],
  ['failed-run screenshot alongside a pass', value => { value.record.files.push({ path: 'xr/emulated-failed.png', bytes: 1, sha256: '0'.repeat(64) }); }, /failed-run artifact/],
]) test(`XR verifier rejects ${name} even with recalculated retained hashes`, async () => {
  const value = await fixture(); change(value);
  assert.match((await validate(value)).join('\n'), pattern);
});

test('XR report, build and screenshot raw bytes must match the collected inventory', async () => {
  for (const field of ['reportBytes', 'buildBytes', 'screenshotBytes']) {
    const value = bind(await fixture()); value[field] = Buffer.from('synthetic changed bytes');
    assert.match((await validateXRBrowserEvidence(value.report, value)).join('\n'), /not bound/);
  }
});

test('XR collector rejects historical runs, multiple new directories and symlink entries before reading reports', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'bve-xr-collector-'));
  try {
    const runs = join(directory, candidate, 'artifacts/xr-runs');
    await mkdir(join(runs, 'run-Old'), { recursive: true });
    const before = await evaluationRunDirectories(directory, 'xr');
    await assert.rejects(collectXREvidence({ files: [] }, directory, directory, before, {}), /exactly one new/);
    await mkdir(join(runs, 'run-New1')); await mkdir(join(runs, 'run-New2'));
    await assert.rejects(collectXREvidence({ files: [] }, directory, directory, before, {}), /exactly one new/);
    await symlink(join(runs, 'run-Old'), join(runs, 'run-Link'));
    await assert.rejects(evaluationRunDirectories(directory, 'xr'), /real directory/);
    await assert.rejects(evaluationRunDirectories(directory, '../outside'), /Unknown/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('downloaded XR file size limits are checked before reading the contents', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'bve-xr-size-'));
  try {
    await mkdir(join(directory, 'xr'));
    const path = join(directory, 'xr/xr-browser-checks.json'); await writeFile(path, '');
    await truncate(path, 16 * 1024 * 1024 + 1);
    const record = { files: [{ path: 'xr/xr-browser-checks.json', bytes: 16 * 1024 * 1024 + 1, sha256: '0'.repeat(64) }] };
    assert.match((await validateEvaluationFiles(record, directory)).join('\n'), /oversized/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('download verification actually requires the separate XR report and complete PNG', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'bve-xr-download-'));
  try {
    const value = bind(await fixture());
    const git = (...args) => execFileSync('git', args, { cwd: root, env: childEnvironment(), encoding: 'utf8' }).trim();
    const head = git('rev-parse', 'HEAD'), tree = git('rev-parse', 'HEAD^{tree}');
    const record = { ...value.record, schemaVersion: 1, kind: 'foundation-evaluations', repository, mode: 'github', eventName: 'push',
      headSha: head, testedSha: head, treeSha: tree, baseSha: null, workflowSha: head,
      workflowRef: `${repository}/.github/workflows/engine-ci.yml@refs/heads/main`, runId: '123', runAttempt: 1, dirty: false, complete: true, failures: [],
      toolchain: { node: process.version, npm: '11.9.0', os: 'linux', arch: 'x64' }, packageLocks: {},
      commands: evaluationCommands.map(command => ({ ...structuredClone(command), outcome: 'passed', exitCode: 0, errorCode: null, signal: null, durationMs: 1 })) };
    for (const [field, path] of [['planSha256', 'docs/plan/pr-plan.json'], ['comparisonSha256', 'packages/qualification-fixtures/fixtures/comparison.json']]) record[field] = digest(await readFile(resolve(root, path)));
    for (const [id, name] of [['f04', 'hubs-spoke'], ['f05', 'babylon-vrspace']]) record.packageLocks[id] = digest(await readFile(resolve(root, `evaluations/${name}/package-lock.json`)));
    const contents = new Map(requiredEvaluationReports.map(path => [path, Buffer.from('Synthetic unit fixture\n')]));
    const desktop = await json(join(history, 'browser-checks.json')), summary = await json(join(history, 'f05-summary.json'));
    desktop.sourceDigests = await fingerprints(requiredF05SourceFiles); desktop.build.inputs = await fingerprints(requiredF05BuildInputs);
    desktop.counts.logOverflow = 0; summary.counts.logOverflow = 0; desktop.finalizationErrors = []; summary.finalizationErrors = [];
    record.browser = { runDirectory: 'artifacts/runs/run-Synthetic', startedAt: desktop.startedAt, finishedAt: desktop.timestamp };
    for (const [field, path, bytes] of [
      ['reportSha256', 'browser/browser-checks.json', pretty(desktop)], ['summarySha256', 'browser/f05-summary.json', pretty(summary)], ['buildSha256', 'browser/build.json', pretty(desktop.build)],
    ]) { record.browser[field] = digest(bytes); contents.set(path, bytes); }
    contents.set('browser/courtyard-verified.png', await readFile(join(history, 'courtyard-verified.png')));
    const desktopCommand = record.commands.find(command => command.id === 'f05-browser');
    desktopCommand.startedAt = new Date(Date.parse(desktop.startedAt) - 1000).toISOString(); desktopCommand.finishedAt = new Date(Date.parse(desktop.timestamp) + 1000).toISOString();
    contents.set('logs/f05-browser.txt', pretty({ runStatus: 'passed', ...desktop.counts, output: record.browser.runDirectory }));
    const { log, ...xrCommand } = value.xrCommand;
    record.commands[record.commands.findIndex(command => command.id === xrCommand.id)] = xrCommand;
    contents.set('logs/f05-xr-browser.txt', Buffer.from(log));
    contents.set('xr/xr-browser-checks.json', value.reportBytes); contents.set('xr/build.json', value.buildBytes); contents.set('xr/emulated-stereo.png', value.screenshotBytes);
    const audit = await json(join(history, 'dependency-audit.json'));
    for (const id of ['f04', 'f05']) contents.set(`reports/${id}/dependency-audit.json`, pretty({ report: audit, exitCode: 0, commandError: null, assessment: { status: 'passed', reason: 'No reported dependency advisories' } }));
    record.files = [];
    for (const [path, bytes] of contents) { await mkdir(dirname(join(directory, path)), { recursive: true }); await writeFile(join(directory, path), bytes); record.files.push({ path, bytes: bytes.length, sha256: digest(bytes) }); }
    const manifest = join(directory, 'manifest.json'); await writeFile(manifest, pretty(record));
    const verify = () => verifyEvaluationEvidence(manifest, { headSha: head, testedSha: head, root });
    const baseline = await verify();
    assert.deepEqual(baseline, git('status', '--porcelain') ? ['Current checkout is dirty'] : [], 'Only the real dirty-checkout limitation may remain in this synthetic fixture');
    await rm(join(directory, 'xr/xr-browser-checks.json'));
    assert.match((await verify()).join('\n'), /Fresh bound emulated XR report|Missing report xr/);
    await writeFile(join(directory, 'xr/xr-browser-checks.json'), value.reportBytes);
    const partialPNG = value.screenshotBytes.subarray(0, 24); await writeFile(join(directory, 'xr/emulated-stereo.png'), partialPNG);
    record.xr.screenshotSha256 = digest(partialPNG);
    Object.assign(record.files.find(item => item.path === 'xr/emulated-stereo.png'), { bytes: partialPNG.length, sha256: digest(partialPNG) });
    await writeFile(manifest, pretty(record));
    assert.match((await verify()).join('\n'), /complete 1280x720 PNG/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
