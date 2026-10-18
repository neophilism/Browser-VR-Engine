import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { digest } from '../../scripts/ci/evidence.mjs';
import { collectLifecycleEvidence, evaluationRunDirectories } from '../../scripts/ci/evaluate.mjs';

const root = resolve(import.meta.dirname, '../..');
const source = resolve(root, 'evaluations/babylon-vrspace/artifacts/lifecycle-development/run-20261018T212224');
const output = resolve(root, 'artifacts/lifecycle-ci/actual-hH5Mir');
const capturedBytes = await readFile(resolve(source, 'command.json')), captured = JSON.parse(capturedBytes);
const logBytes = await readFile(resolve(source, 'command.txt'));
const record = { schemaVersion: 1, kind: 'local-lifecycle-retained-run-verification', mode: 'local', complete: false,
  qualificationStatus: 'incomplete', checkedAt: new Date().toISOString(), files: [], errors: [],
  actualCommandReceipt: { path: relative(root, resolve(source, 'command.json')), bytes: capturedBytes.length, sha256: digest(capturedBytes), value: captured },
  actualLog: { path: relative(root, resolve(source, 'command.txt')), bytes: logBytes.length, sha256: digest(logBytes) } };
await mkdir(resolve(output, 'lifecycle'), { recursive: true });
try {
  if (digest(logBytes) !== captured.logSha256 || relative(root, captured.cwd) !== 'evaluations/babylon-vrspace'
    || JSON.stringify(captured.argv) !== JSON.stringify(['node', 'run.mjs', 'test-lifecycle']) || captured.exitCode !== 0
    || captured.localOnly !== true || captured.physicalQualification !== false) throw new Error('Actual local command/log identity differs');
  const before = new Set(captured.beforeRunDirectories), current = await evaluationRunDirectories(root, 'lifecycle');
  if (JSON.stringify([...current].sort()) !== JSON.stringify([...captured.afterRunDirectories].sort())
    || JSON.stringify([...current].filter(name => !before.has(name))) !== JSON.stringify(captured.newRunDirectories)) throw new Error('Actual before/after run directory capture differs');
  record.command = { id: 'f05-lifecycle-browser', cwd: relative(root, captured.cwd), argv: captured.argv,
    startedAt: captured.startedAt, finishedAt: captured.finishedAt, exitCode: captured.exitCode,
    outcome: captured.exitCode === 0 ? 'passed' : 'failed', durationMs: Date.parse(captured.finishedAt) - Date.parse(captured.startedAt), log: logBytes.toString('utf8') };
  await collectLifecycleEvidence(record, root, output, before, record.command);
  record.status = 'current-data-and-local-command-binding-verified';
} catch (error) { record.status = 'failed'; record.errors.push(error.message); process.exitCode = 1; }
record.checkedSource = {};
for (const path of ['scripts/ci/evaluate.mjs', 'scripts/ci/evaluation-evidence.mjs', 'scripts/ci/lifecycle-resource-evidence.mjs']) {
  const bytes = await readFile(resolve(root, path)); record.checkedSource[path] = { bytes: bytes.length, sha256: digest(bytes) };
}
await writeFile(resolve(output, 'validation.json'), JSON.stringify(record, null, 2) + '\n');
console.log(JSON.stringify({ status: record.status, errors: record.errors, files: record.files.length,
  complete: record.complete, qualificationStatus: record.qualificationStatus, receipt: relative(root, resolve(output, 'validation.json')) }, null, 2));
