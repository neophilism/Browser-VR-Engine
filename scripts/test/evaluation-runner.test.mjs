import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { digest } from '../ci/evidence.mjs';
import { childEnvironment } from '../ci/environment.mjs';
import { runEvaluationCommand, validateBrowserEvidence, validateCheckedEvaluationInputs,
  validateEvaluationAudits, readContainedEvaluationFile, validateEvaluationScreenshot,
  requiredF05SourceFiles, requiredF05BuildInputs } from '../ci/evaluate.mjs';

const root = resolve(import.meta.dirname, '../..');
const historical = resolve(root, 'evaluations/babylon-vrspace/evidence/audio-measurement-fix');
const historicalAudit = resolve(root, 'evaluations/babylon-vrspace/evidence/review-fix/dependency-audit.json');
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const pretty = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);

// These are synthetic verifier inputs assembled from a retained capture. They
// exercise tamper rejection and never constitute fresh execution/CI evidence.
async function fixture() {
  const report = await json(join(historical, 'browser-checks.json'));
  const summary = await json(join(historical, 'f05-summary.json'));
  // Only this in-memory synthetic fixture is rebound to the checked source.
  // Never rewrite a historical report or use this as execution evidence.
  const fingerprints = async names => Object.fromEntries(await Promise.all(names.map(async name => {
    const bytes = await readFile(resolve(root, 'evaluations/babylon-vrspace', name));
    return [name, { bytes: bytes.length, sha256: digest(bytes) }];
  })));
  report.sourceDigests = await fingerprints(requiredF05SourceFiles);
  report.build.inputs = await fingerprints(requiredF05BuildInputs);
  const start = new Date(Date.parse(report.startedAt) - 1000).toISOString();
  const end = new Date(Date.parse(report.timestamp) + 1000).toISOString();
  const runDirectory = 'artifacts/runs/run-Synthetic';
  const record = { files: [], browser: { runDirectory, startedAt: report.startedAt, finishedAt: report.timestamp } };
  const browserCommand = { id: 'f05-browser', outcome: 'passed', exitCode: 0, errorCode: null, signal: null,
    startedAt: start, finishedAt: end, log: JSON.stringify({ runStatus: 'passed', ...report.counts, output: runDirectory }) };
  return { report, summary, record, browserCommand, root };
}
function bind(value) {
  const reportBytes = pretty(value.report), summaryBytes = pretty(value.summary), buildBytes = pretty(value.report.build);
  for (const [field, path, bytes] of [
    ['reportSha256', 'browser/browser-checks.json', reportBytes],
    ['summarySha256', 'browser/f05-summary.json', summaryBytes],
    ['buildSha256', 'browser/build.json', buildBytes],
  ]) {
    value.record.browser[field] = digest(bytes);
    value.record.files = value.record.files.filter(item => item.path !== path);
    value.record.files.push({ path, bytes: bytes.length, sha256: digest(bytes) });
  }
  return { ...value, reportBytes, summaryBytes, buildBytes };
}
async function validate(value) { return validateBrowserEvidence(value.report, value.summary, bind(value)); }

test('browser binding validator accepts internally consistent synthetic input without establishing execution', async () => {
  assert.deepEqual(await validate(await fixture()), []);
});

for (const [name, change, pattern] of [
  ['old 17-check suite', value => { value.report.checks.splice(14, 2); }, /19 browser checks|check list/],
  ['missing source fingerprint', value => { delete value.report.sourceDigests['src/import-policy.js']; }, /source.*coverage/],
  ['changed source bytes', value => { value.report.sourceDigests['src/main.js'].sha256 = '0'.repeat(64); }, /Changed source/],
  ['changed build input', value => { value.report.build.inputs['src/import-resources.js'].sha256 = '0'.repeat(64); }, /Changed build input/],
  ['changed frozen comparison', value => { value.report.comparison.fixtureSetId = 'other'; }, /fixture\/comparison|summary differs/],
  ['stale run before its command', value => { value.browserCommand.startedAt = new Date(Date.parse(value.report.timestamp) + 500).toISOString(); }, /stale|time bounds/],
  ['different stdout run directory', value => { value.browserCommand.log = value.browserCommand.log.replace('run-Synthetic', 'run-Older'); }, /command output/],
  ['duplicate success line', value => { value.browserCommand.log += `\n${value.browserCommand.log}`; }, /command output/],
  ['nonzero browser exit', value => { value.browserCommand.exitCode = 1; }, /command did not complete/],
  ['browser spawn error with zero exit', value => { value.browserCommand.errorCode = 'EPERM'; }, /command did not complete/],
  ['failure hidden by passing counts', value => { value.report.failedRequests.push({ url: 'https://example.invalid/' }); }, /failed requests/],
  ['unsupported full qualification claim', value => { value.report.qualificationStatus = 'passed'; value.summary.qualificationStatus = 'passed'; }, /honest incomplete/],
  ['physical-device claim in software run', value => { value.report.environment.physicalHeadset = true; value.summary.environment.physicalHeadset = true; }, /software-rendering identity/],
  ['malformed nested check', value => { value.report.checks[0] = null; }, /browser checks|check list/],
]) test(`browser verifier rejects ${name} even after recalculating report hashes`, async () => {
  const value = await fixture(); change(value);
  assert.match((await validate(value)).join('\n'), pattern);
});

test('browser verifier checks raw retained bytes against manifest digests', async () => {
  const value = bind(await fixture());
  value.reportBytes = Buffer.from('changed bytes');
  assert.match((await validateBrowserEvidence(value.report, value.summary, value)).join('\n'), /not bound/);
});

test('evaluation runner preserves real child failure and excludes unrelated credentials', () => {
  const env = { ...childEnvironment(), MESHY_API_KEY: 'synthetic-do-not-copy', OPENAI_API_KEY: 'synthetic-do-not-copy',
    NODE_OPTIONS: '--invalid-inherited-option', npm_config_auth: 'synthetic-do-not-copy', CHROME_EXECUTABLE: '/synthetic/browser' };
  const probe = 'process.stdout.write(JSON.stringify({provider:process.env.MESHY_API_KEY===undefined&&process.env.OPENAI_API_KEY===undefined,node:process.env.NODE_OPTIONS===undefined,registry:process.env.npm_config_auth===undefined,chrome:process.env.CHROME_EXECUTABLE===undefined}));';
  const ok = runEvaluationCommand([process.execPath, '-e', probe], { cwd: root, environment: env });
  assert.equal(ok.outcome, 'passed', ok.log);
  assert.deepEqual(JSON.parse(ok.log), { provider: true, node: true, registry: true, chrome: true });
  const failed = runEvaluationCommand([process.execPath, '-e', 'process.exit(7)'], { cwd: root, environment: env });
  assert.equal(failed.outcome, 'failed'); assert.equal(failed.exitCode, 7);
  const missing = runEvaluationCommand(['/__bve_synthetic_missing_executable__'], { cwd: root, environment: env });
  assert.equal(missing.outcome, 'failed'); assert.ok(missing.errorCode);
  const timedOut = runEvaluationCommand([process.execPath, '-e', 'setInterval(()=>{},1000)'], { cwd: root, environment: env, timeout: 100 });
  assert.equal(timedOut.outcome, 'failed'); assert.equal(timedOut.errorCode, 'ETIMEDOUT');
});

test('downloaded evidence is checked against current nested locks and immutable shared inputs', async () => {
  const value = { packageLocks: {} };
  for (const [field, path] of [['planSha256', 'docs/plan/pr-plan.json'], ['comparisonSha256', 'packages/qualification-fixtures/fixtures/comparison.json']]) value[field] = digest(await readFile(resolve(root, path)));
  for (const [id, name] of [['f04', 'hubs-spoke'], ['f05', 'babylon-vrspace']]) value.packageLocks[id] = digest(await readFile(resolve(root, `evaluations/${name}/package-lock.json`)));
  assert.deepEqual(await validateCheckedEvaluationInputs(value, root), []);
  value.packageLocks.f05 = '0'.repeat(64);
  assert.match((await validateCheckedEvaluationInputs(value, root)).join('\n'), /Changed f05 lockfile/);
  value.comparisonSha256 = '0'.repeat(64);
  assert.match((await validateCheckedEvaluationInputs(value, root)).join('\n'), /Changed checked comparison/);
});

test('audit validation rejects blocked or inconsistent registry evidence and failed audit commands', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'bve-evaluation-audits-'));
  try {
    const clean = await json(historicalAudit);
    // Historical package audit is raw registry JSON; root retained audits add
    // the actual exit/error assessment around that data.
    const report = clean.report ?? clean;
    const item = { exitCode: 0, commandError: null, report, assessment: { status: 'passed', reason: 'No reported dependency advisories' } };
    const record = { commands: ['f04', 'f05'].map(id => ({ id: `${id}-audit`, outcome: 'passed' })) };
    for (const id of ['f04', 'f05']) { await mkdir(join(directory, `reports/${id}`), { recursive: true }); await writeFile(join(directory, `reports/${id}/dependency-audit.json`), pretty(item)); }
    assert.deepEqual(await validateEvaluationAudits(record, directory), []);
    await writeFile(join(directory, 'reports/f05/dependency-audit.json'), pretty({ ...item, commandError: 'ETIMEDOUT' }));
    assert.match((await validateEvaluationAudits(record, directory)).join('\n'), /f05 audit is blocked/);
    record.commands[0].outcome = 'failed';
    assert.match((await validateEvaluationAudits(record, directory)).join('\n'), /f04 audit command did not pass/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('evaluation file reader rejects traversal and symlink escapes before reading', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'bve-evaluation-files-'));
  try {
    await mkdir(join(directory, 'inside')); await writeFile(join(directory, 'outside.txt'), 'synthetic');
    await symlink(join(directory, 'outside.txt'), join(directory, 'inside/link.txt'));
    await assert.rejects(readContainedEvaluationFile(join(directory, 'inside'), '../outside.txt'), /Unsafe/);
    await assert.rejects(readContainedEvaluationFile(join(directory, 'inside'), 'link.txt'), /escapes/);
    await writeFile(join(directory, 'inside/large.txt'), '12345');
    await assert.rejects(readContainedEvaluationFile(join(directory, 'inside'), 'large.txt', 4), /oversized/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('retained screenshots must be a complete, bounded image rather than a PNG signature', async () => {
  const bytes = await readFile(join(historical, 'courtyard-verified.png'));
  assert.deepEqual(validateEvaluationScreenshot(bytes), []);
  assert.ok(validateEvaluationScreenshot(bytes.subarray(0, 24)).length);
  const corrupted = Buffer.from(bytes); corrupted[corrupted.length - 1] ^= 1;
  assert.ok(validateEvaluationScreenshot(corrupted).length);
});
