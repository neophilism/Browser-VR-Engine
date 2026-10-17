import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { digest, repository, shaPattern } from './evidence.mjs';

export const evaluationCommands = Object.freeze([
  ['f04-install', 'evaluations/hubs-spoke', ['node', 'scripts/bootstrap.mjs']],
  ['f04-source', 'evaluations/hubs-spoke', ['node', 'scripts/checkout-test-source.mjs']],
  ['f04-tests', 'evaluations/hubs-spoke', ['npm', 'test']],
  ['f04-history', 'evaluations/hubs-spoke', ['npm', 'run', 'verify:evidence']],
  ['f04-audit', '.', ['node', 'scripts/ci/audit-evaluation.mjs', 'f04']],
  ['f05-install', 'evaluations/babylon-vrspace', ['node', 'run.mjs', 'install']],
  ['f05-build', 'evaluations/babylon-vrspace', ['node', 'run.mjs', 'build']],
  ['f05-tests', 'evaluations/babylon-vrspace', ['node', 'run.mjs', 'test-server']],
  ['f05-browser-install', 'evaluations/babylon-vrspace', ['node', 'node_modules/playwright/cli.js', 'install', '--with-deps', 'chromium']],
  ['f05-browser', 'evaluations/babylon-vrspace', ['node', 'run.mjs', 'test']],
  ['f05-audit', '.', ['node', 'scripts/ci/audit-evaluation.mjs', 'f05']]
].map(([id, cwd, argv]) => Object.freeze({ id, cwd, argv: Object.freeze(argv) })));
export const requiredEvaluationReports = Object.freeze([
  ...evaluationCommands.map(({ id }) => `logs/${id}.txt`),
  'reports/f04/dependency-audit.json', 'reports/f05/dependency-audit.json',
  'browser/browser-checks.json', 'browser/f05-summary.json', 'browser/build.json', 'browser/courtyard-verified.png'
]);
export const evaluationReportPath = /^(?:logs\/[a-z0-9-]+\.txt|reports\/f0[45]\/dependency-audit\.json|browser\/[a-z0-9-]+\.(?:json|png|glb))$/;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function validateEvaluationEvidence(record, expected = {}) {
  const errors = [];
  if (!object(record) || record.schemaVersion !== 1 || record.kind !== 'foundation-evaluations') return ['Invalid evaluation evidence envelope'];
  if (record.repository !== repository || record.mode !== 'github') errors.push('Hosted repository evidence is required');
  if (!['pull_request', 'push', 'merge_group'].includes(record.eventName)) errors.push('Invalid event');
  for (const field of ['headSha', 'testedSha', 'treeSha', 'workflowSha']) if (!shaPattern.test(record[field] ?? '')) errors.push(`Invalid ${field}`);
  if (['pull_request', 'merge_group'].includes(record.eventName) && !shaPattern.test(record.baseSha ?? '')) errors.push('Missing integration base');
  if (record.eventName === 'push' && (record.headSha !== record.testedSha || record.baseSha !== null)) errors.push('Inconsistent push identity');
  if (!String(record.workflowRef ?? '').startsWith(`${repository}/.github/workflows/engine-ci.yml@`)) errors.push('Wrong workflow');
  if (!/^\d+$/.test(String(record.runId ?? '')) || !Number.isSafeInteger(record.runAttempt) || record.runAttempt < 1) errors.push('Invalid run identity');
  if (record.dirty !== false || record.complete !== true) errors.push('Dirty or incomplete evaluation');
  if (!Array.isArray(record.failures) || record.failures.length !== 0) errors.push('Evaluation has unresolved failures');
  if (!object(record.toolchain) || !/^v24\./.test(record.toolchain.node ?? '') || !/^\d+\.\d+\.\d+$/.test(record.toolchain.npm ?? '') || !record.toolchain.os || !record.toolchain.arch) errors.push('Missing toolchain');
  for (const field of ['planSha256', 'comparisonSha256']) if (!/^[a-f0-9]{64}$/.test(record[field] ?? '')) errors.push(`Invalid ${field}`);
  if (!object(record.packageLocks) || Object.keys(record.packageLocks).sort().join(',') !== 'f04,f05' || Object.values(record.packageLocks).some(value => !/^[a-f0-9]{64}$/.test(value))) errors.push('Both evaluation locks must be bound');
  if (!object(record.browser) || !/^artifacts\/runs\/run-[A-Za-z0-9]+$/.test(record.browser.runDirectory ?? '') || ['reportSha256', 'summarySha256', 'buildSha256'].some(field => !/^[a-f0-9]{64}$/.test(record.browser[field] ?? '')) || !Number.isFinite(Date.parse(record.browser.startedAt)) || !Number.isFinite(Date.parse(record.browser.finishedAt)) || Date.parse(record.browser.finishedAt) < Date.parse(record.browser.startedAt)) errors.push('Fresh browser run identity is required');
  if (!Array.isArray(record.commands) || record.commands.length !== evaluationCommands.length) errors.push('Required evaluation commands are missing');
  else for (const [index, command] of record.commands.entries()) {
    const expectedCommand = evaluationCommands[index];
    if (!object(command) || command.id !== expectedCommand.id || command.cwd !== expectedCommand.cwd || JSON.stringify(command.argv) !== JSON.stringify(expectedCommand.argv)) errors.push('Evaluation command substituted or reordered');
    if (command?.outcome !== 'passed' || command?.exitCode !== 0 || command?.errorCode || command?.signal || !Number.isFinite(command.durationMs) || command.durationMs < 0) errors.push(`Evaluation ${command?.id} did not pass`);
  }
  const paths = new Set();
  if (!Array.isArray(record.files)) errors.push('Missing evaluation files');
  else for (const file of record.files) {
    if (!object(file) || !evaluationReportPath.test(file.path ?? '') || paths.has(file.path) || !/^[a-f0-9]{64}$/.test(file.sha256 ?? '') || !Number.isSafeInteger(file.bytes) || file.bytes < 0) errors.push('Invalid evaluation report inventory');
    paths.add(file?.path);
  }
  for (const path of requiredEvaluationReports) if (!paths.has(path)) errors.push(`Missing ${path}`);
  for (const [field, value] of Object.entries(expected)) if (record[field] !== value) errors.push(`Stale or mismatched ${field}`);
  return errors;
}

export async function validateEvaluationFiles(record, directory) {
  const errors = [], root = await realpath(directory);
  for (const item of Array.isArray(record.files) ? record.files : []) {
    if (!evaluationReportPath.test(item?.path ?? '')) { errors.push('Unsafe report path'); continue; }
    try {
      const file = await realpath(resolve(root, item.path)), rel = relative(root, file);
      if (rel.startsWith('..') || isAbsolute(rel) || !(await stat(file)).isFile()) { errors.push('Escaped report path'); continue; }
      const bytes = await readFile(file);
      if (bytes.length !== item.bytes || digest(bytes) !== item.sha256) errors.push(`Changed report ${item.path}`);
    } catch { errors.push(`Missing report ${item.path}`); }
  }
  return errors;
}
