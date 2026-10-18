// Deterministic status regressions run the production finalizer in separate
// Node processes. Synthetic callbacks inject observations after nine completed
// checks; they do not replace a browser or a VRSpace server qualification run.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
await mkdir(resolve(root, 'artifacts'), { recursive: true });
const output = await mkdtemp(resolve(root, 'artifacts/finalization-checks-'));
const startedAt = new Date().toISOString();
const definitions = [
  { id: 'clean-run-passes-after-all-cleanup-settles', kind: 'clean', exit: 0 },
  ...['error', 'pageerror', 'socketerror'].map(type => ({ id: 'late-' + type + '-fails-report-and-process', kind: 'log', type, exit: 1, browserErrors: 1 })),
  ...['failed', 'blocked-external'].map(type => ({ id: 'late-' + type + '-request-fails-report-and-process', kind: 'request', type, exit: 1, failedOrBlockedRequests: 1 })),
  ...['dispose', 'browser', 'frontend'].map(resource => ({ id: resource + '-cleanup-rejection-still-closes-other-resources', kind: 'cleanup', resource, exit: 1, cleanupErrors: 1 })),
  { id: 'retained-cleanup-error-without-fatal-fails', kind: 'retained-cleanup', exit: 1, cleanupErrors: 1 },
  { id: 'fatal-observation-fails', kind: 'fatal', exit: 1 },
  { id: 'incomplete-checks-fail', kind: 'incomplete', exit: 1 },
  { id: 'failed-check-fails', kind: 'failed-check', exit: 1 },
  { id: 'late-probe-error-fails', kind: 'probe', exit: 1, probeErrors: 1 },
  { id: 'error-during-metadata-read-fails', kind: 'metadata', exit: 1, browserErrors: 1 },
];
const entry = `
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
const { finalizeBrowserRun } = await import(process.argv[1]);
const definition = JSON.parse(process.argv[2]);
const checks = Array.from({ length: 9 }, (_, index) => ({ id: 'synthetic-completed-check-' + index, status: 'passed' }));
const logs = [], requests = [], observed = { final: [{ errors: [] }, { errors: [] }] }, trace = [];
const beforeLateObservation = { checks: checks.length, passed: checks.filter(check => check.status === 'passed').length, errors: logs.length, requests: requests.length, fatal: Boolean(observed.fatal) };
if (definition.kind === 'fatal') observed.fatal = 'synthetic earlier fatal';
if (definition.kind === 'incomplete') checks.pop();
if (definition.kind === 'failed-check') checks[8].status = 'failed';
if (definition.kind === 'retained-cleanup') observed.cleanupErrors = [{ resource: 'earlier-dispose', error: 'synthetic retained cleanup error' }];
const action = resource => ({ resource, close: async () => {
  trace.push(resource + ':started');
  try {
    await setImmediate();
    if (resource === 'browser') {
      if (definition.kind === 'log') logs.push({ type: definition.type, text: 'synthetic error arriving during browser closure' });
      if (definition.kind === 'request') requests.push({ type: definition.type, url: 'http://127.0.0.1/synthetic-no-request-was-sent' });
      if (definition.kind === 'probe') observed.final[1].errors.push({ error: 'synthetic final capture error' });
    }
    if (definition.kind === 'cleanup' && definition.resource === resource) throw new Error('synthetic ' + resource + ' cleanup failure');
  } finally { trace.push(resource + ':settled'); }
} });
await finalizeBrowserRun({
  checks, observed, logs, requests,
  dispose: [action('dispose')], resources: [action('browser'), action('frontend')],
  prepareReport: async () => {
    for (const resource of ['dispose', 'browser', 'frontend']) assert(trace.includes(resource + ':settled'));
    assert(trace.indexOf('dispose:settled') < trace.indexOf('browser:started'));
    await setImmediate();
    if (definition.kind === 'metadata') logs.push({ type: 'pageerror', text: 'synthetic late observation during metadata read' });
    trace.push('metadata:settled');
    return { scope: 'Synthetic finalization regression; no service or browser was started', qualificationStatus: 'incomplete' };
  },
  writeReport: async result => {
    assert.equal(trace.at(-1), 'metadata:settled');
    trace.push('report:written');
    console.log(JSON.stringify({ result, trace, beforeLateObservation }));
  },
});
`;
const environment = { PATH: process.env.PATH || '/usr/bin:/bin', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', TZ: 'UTC' };
for (const key of ['TMPDIR', 'TMP', 'TEMP']) if (process.env[key]) environment[key] = process.env[key];
const cases = [];
for (const definition of definitions) {
  try {
    let execution, exitCode = 0;
    try {
      execution = await run(process.execPath, ['--input-type=module', '-e', entry, pathToFileURL(resolve(root, 'finalize-run.mjs')).href, JSON.stringify(definition)], { cwd: root, env: environment, timeout: 5000, killSignal: 'SIGKILL' });
    } catch (error) {
      if (!Number.isInteger(error.code)) throw error;
      execution = error; exitCode = error.code;
    }
    assert.equal(execution.stderr, '', 'Unexpected child diagnostics');
    const value = JSON.parse(execution.stdout);
    assert.equal(exitCode, definition.exit, 'Process exit disagrees with final observations');
    assert.equal(value.result.runStatus, definition.exit === 0 ? 'passed' : 'failed');
    assert.equal(value.result.finalization.evaluatedAfterCleanupSettled, true);
    for (const field of ['browserErrors', 'probeErrors', 'failedOrBlockedRequests', 'cleanupErrors']) assert.equal(value.result.finalization[field], definition[field] || 0);
    assert.deepEqual(value.beforeLateObservation, { checks: 9, passed: 9, errors: 0, requests: 0, fatal: false });
    const expectedCounts = definition.kind === 'incomplete' ? { passed: 8, failed: 0, checks: 8 } : definition.kind === 'failed-check' ? { passed: 8, failed: 1, checks: 9 } : { passed: 9, failed: 0, checks: 9 };
    assert.deepEqual(value.result.counts, expectedCounts);
    assert.equal(value.trace.at(-1), 'report:written');
    cases.push({ id: definition.id, status: 'passed', childExitCode: exitCode, finalRunStatus: value.result.runStatus, counts: value.result.counts, finalization: value.result.finalization, beforeLateObservation: value.beforeLateObservation, trace: value.trace });
    console.log('PASS ' + definition.id);
  } catch (error) {
    cases.push({ id: definition.id, status: 'failed', error: String(error.stack || error) });
    console.error('FAIL ' + definition.id + ': ' + error.message);
  }
}
const sourceFiles = JSON.parse(await readFile(resolve(root, 'source-files.json'), 'utf8'));
const sourceDigests = {};
for (const name of sourceFiles) sourceDigests[name] = createHash('sha256').update(await readFile(resolve(root, name))).digest('hex');
const report = { scope: 'Deterministic production-finalizer process/report regressions; no browser or VRSpace service qualification', startedAt, finishedAt: new Date().toISOString(), counts: { passed: cases.filter(item => item.status === 'passed').length, failed: cases.filter(item => item.status === 'failed').length, checks: cases.length }, cases, sourceDigests };
await writeFile(resolve(output, 'finalization-checks.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ counts: report.counts, output: relative(root, output) }));
if (report.counts.failed) process.exitCode = 1;
