import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';

export const repository = 'neophilism/Browser-VR-Engine';
export const shaPattern = /^[a-f0-9]{40}$/;
export const digest = value => createHash('sha256').update(value).digest('hex');
export const foundationCommands = Object.freeze([
  ['install', ['npm', 'ci', '--ignore-scripts', '--no-audit', '--no-fund']],
  ['check', ['npm', 'run', 'check']],
  ['example', ['npm', 'run', 'example:all']],
  ['consumer', ['npm', 'run', 'test:consumer']],
  ['sharding', ['npm', 'run', 'test:sharding']],
  ['dependencies', ['npm', 'run', 'check:dependencies']]
].map(([id, argv]) => Object.freeze({ id, argv: Object.freeze(argv) })));
export const foundationIds = Object.freeze(foundationCommands.map(command => command.id));
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function artifactName({ testedSha, runId, runAttempt }, job = 'foundation') {
  if (!shaPattern.test(testedSha ?? '') || !/^\d+$/.test(String(runId ?? '')) || !Number.isSafeInteger(runAttempt) || runAttempt < 1 || !/^[a-z0-9-]+$/.test(job)) {
    throw new Error('Invalid artifact identity');
  }
  return `engine-${job}-${testedSha}-${runId}-${runAttempt}`;
}

export function requiredJobsPassed(results, expected = ['checks', 'evaluations', 'service']) {
  return object(results) && expected.length > 0 && new Set(expected).size === expected.length && Object.keys(results).length === expected.length && expected.every(id => results[id] === 'success');
}

export function validateScopes(document) {
  const errors = [];
  if (!object(document) || document.schemaVersion !== 1 || !Array.isArray(document.scopes)) return ['Invalid scope registry'];
  const seen = new Set();
  for (const scope of document.scopes) {
    if (!object(scope) || typeof scope.id !== 'string' || seen.has(scope.id)) { errors.push('Invalid or duplicate scope'); continue; }
    seen.add(scope.id);
    if (!['required', 'not_applicable'].includes(scope.status) || !/^[A-Z]\d{2}$/.test(scope.activationCard ?? '') || typeof scope.reason !== 'string' || !scope.reason.trim()) errors.push(`Invalid scope ${scope.id}`);
    if (scope.status === 'required' && !['foundation', 'browser'].includes(scope.id)) errors.push(`Scope ${scope.id} needs a real runner before activation`);
  }
  if (document.scopes.find(scope => scope?.id === 'foundation')?.status !== 'required') errors.push('Foundation scope must be required');
  if (document.scopes.find(scope => scope?.id === 'browser')?.status !== 'required') errors.push('Browser evaluation scope must be required');
  for (const id of ['foundation', 'integration', 'browser', 'migration']) if (!seen.has(id)) errors.push(`Missing scope ${id}`);
  return errors;
}

export function validateEvidence(record, expected = {}) {
  const errors = [];
  if (!object(record) || record.schemaVersion !== 1) return ['Invalid evidence envelope'];
  if (record.repository !== repository) errors.push('Wrong repository');
  if (record.mode !== 'github') errors.push('Local evidence cannot establish hosted acceptance');
  if (!['pull_request', 'push', 'merge_group'].includes(record.eventName)) errors.push('Invalid evidence event');
  for (const field of ['headSha', 'testedSha', 'treeSha', 'workflowSha']) if (!shaPattern.test(record[field] ?? '')) errors.push(`Invalid ${field}`);
  if (record.eventName === 'pull_request' && !shaPattern.test(record.baseSha ?? '')) errors.push('Invalid PR baseSha');
  if (record.eventName === 'push' && (record.headSha !== record.testedSha || record.baseSha !== null)) errors.push('Push source is inconsistent');
  if (record.dirty !== false) errors.push('Dirty source cannot establish acceptance');
  if (!/^\d+$/.test(String(record.runId ?? '')) || !Number.isSafeInteger(record.runAttempt) || record.runAttempt < 1) errors.push('Invalid run identity');
  if (!String(record.workflowRef ?? '').startsWith(`${repository}/.github/workflows/engine-ci.yml@`)) errors.push('Wrong workflow identity');
  for (const field of ['lockfileSha256', 'planSha256']) if (!/^[a-f0-9]{64}$/.test(record[field] ?? '')) errors.push(`Invalid ${field}`);
  if (!object(record.toolchain) || !/^v24\./.test(record.toolchain.node ?? '') || !/^\d+\.\d+\.\d+$/.test(record.toolchain.npm ?? '') || !record.toolchain.os || !record.toolchain.arch) errors.push('Missing toolchain evidence');
  errors.push(...validateScopes(record.scopeRegistry));
  if (!Array.isArray(record.commands)) errors.push('Missing command results');
  else {
    const ids = record.commands.map(command => command?.id);
    if (new Set(ids).size !== ids.length || ids.length !== foundationIds.length || foundationIds.some(id => !ids.includes(id))) errors.push('Required command set is incomplete or duplicated');
    for (const command of record.commands) {
      if (!object(command) || command.outcome !== 'passed' || command.exitCode !== 0 || !Array.isArray(command.argv) || command.argv.length === 0 || command.argv.some(arg => typeof arg !== 'string') || !Number.isFinite(command.durationMs) || command.durationMs < 0) errors.push(`Command ${command?.id ?? 'unknown'} did not pass`);
      if (JSON.stringify(command?.argv) !== JSON.stringify(foundationCommands.find(item => item.id === command?.id)?.argv)) errors.push(`Command ${command?.id ?? 'unknown'} differs from the required command`);
    }
  }
  if (!Array.isArray(record.files) || record.files.length < foundationIds.length) errors.push('Missing report inventory');
  else {
    const paths = new Set();
    for (const file of record.files) {
      if (!object(file) || !/^(?:logs\/[a-z0-9-]+\.txt|reports\/dependency-audit\.json)$/.test(file.path ?? '') || paths.has(file.path) || !/^[a-f0-9]{64}$/.test(file.sha256 ?? '') || !Number.isSafeInteger(file.bytes) || file.bytes < 0) errors.push('Invalid report inventory entry');
      paths.add(file?.path);
    }
    for (const id of foundationIds) if (!paths.has(`logs/${id}.txt`)) errors.push(`Missing report ${id}`);
    if (!paths.has('reports/dependency-audit.json')) errors.push('Missing dependency audit report');
  }
  if (record.complete !== true) errors.push('Evidence is incomplete');
  for (const [key, value] of Object.entries(expected)) if (record[key] !== value) errors.push(`Stale or mismatched ${key}`);
  return errors;
}

export async function validateEvidenceFiles(record, directory) {
  const errors = [];
  const root = await realpath(directory);
  for (const item of Array.isArray(record.files) ? record.files : []) {
    if (!/^(?:logs\/[a-z0-9-]+\.txt|reports\/dependency-audit\.json)$/.test(item?.path ?? '')) { errors.push('Unsafe report path'); continue; }
    try {
      const file = await realpath(resolve(root, item.path));
      const rel = relative(root, file);
      if (rel.startsWith('..') || isAbsolute(rel) || !(await stat(file)).isFile()) { errors.push(`Unsafe report ${item.path}`); continue; }
      const bytes = await readFile(file);
      if (bytes.length !== item.bytes || digest(bytes) !== item.sha256) errors.push(`Report integrity mismatch ${item.path}`);
    } catch { errors.push(`Missing report ${item.path}`); }
  }
  return errors;
}
