import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { platform, arch } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { digest, repository, validateEvidence, validateScopes, foundationCommands } from './evidence.mjs';
import { childEnvironment } from './environment.mjs';
import { redact } from '../check-secret-exposure.mjs';

export function runCommand(argv, { cwd, timeout = 120_000, environment = process.env } = {}) {
  const started = Date.now();
  const env = childEnvironment(environment);
  const child = spawnSync(argv[0], argv.slice(1), { cwd, env, encoding: 'utf8', timeout, maxBuffer: 8 * 1024 * 1024, shell: false });
  const log = redact(`${child.stdout ?? ''}${child.stderr ?? ''}${child.error ? `\nCommand error: ${child.error.code ?? 'unknown'}` : ''}`);
  return { argv, outcome: child.status === 0 && !child.error ? 'passed' : 'failed', exitCode: child.status, durationMs: Date.now() - started, log };
}

async function main() {
  if (process.argv.slice(2).some(arg => arg !== '--local') || process.argv.length > 3) throw new Error('Usage: node scripts/ci/run.mjs [--local]');
  const local = process.argv.includes('--local');
  if (!local && process.env.GITHUB_ACTIONS !== 'true') throw new Error('Use --local for a local preview; hosted evidence requires GitHub Actions');
  const root = resolve(import.meta.dirname, '../..');
  const output = resolve(root, 'artifacts/ci');
  await rm(output, { recursive: true, force: true });
  await rm(resolve(root, 'artifacts/security/dependency-audit.json'), { force: true });
  await mkdir(resolve(output, 'logs'), { recursive: true });
  await mkdir(resolve(output, 'reports'), { recursive: true });
  const env = childEnvironment();
  const git = (...args) => execFileSync('git', args, { cwd: root, env, encoding: 'utf8' }).trim();
  const testedSha = git('rev-parse', 'HEAD');
  if (!local && testedSha !== process.env.GITHUB_SHA) throw new Error('Checkout differs from the GitHub event commit');
  const eventName = local ? 'local' : process.env.GITHUB_EVENT_NAME;
  const scopeRegistry = JSON.parse(await readFile(resolve(root, 'docs/ci/scopes.json'), 'utf8'));
  const scopeErrors = validateScopes(scopeRegistry);
  if (scopeErrors.length) throw new Error(scopeErrors.join('\n'));
  const record = {
    schemaVersion: 1, repository: process.env.GITHUB_REPOSITORY ?? repository, mode: local ? 'local' : 'github', eventName,
    headSha: eventName === 'pull_request' ? process.env.CI_PR_HEAD_SHA : testedSha,
    baseSha: eventName === 'pull_request' ? process.env.CI_PR_BASE_SHA : null,
    testedSha, treeSha: git('rev-parse', 'HEAD^{tree}'), dirty: git('status', '--porcelain').length > 0,
    runId: process.env.GITHUB_RUN_ID ?? null, runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT) || null,
    workflowRef: process.env.CI_WORKFLOW_REF ?? null, workflowSha: process.env.CI_WORKFLOW_SHA ?? null,
    lockfileSha256: digest(await readFile(resolve(root, 'package-lock.json'))),
    planSha256: digest(await readFile(resolve(root, 'docs/plan/pr-plan.json'))),
    toolchain: { node: process.version, npm: execFileSync('npm', ['--version'], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(), os: platform(), arch: arch(), runnerImage: process.env.ImageVersion ?? null },
    startedAt: new Date().toISOString(), scopeRegistry, commands: [], files: [], complete: false
  };
  const write = () => writeFile(resolve(output, 'manifest.json'), `${JSON.stringify(record, null, 2)}\n`);
  await write();
  let installed = true;
  for (const { id, argv } of foundationCommands) {
    const result = installed ? runCommand(argv, { cwd: root }) : { argv, outcome: 'not_run', exitCode: null, durationMs: 0, log: 'Not run: dependency installation failed.\n' };
    if (id === 'install' && result.outcome !== 'passed') installed = false;
    const path = `logs/${id}.txt`;
    await writeFile(resolve(output, path), result.log);
    record.files.push({ path, bytes: Buffer.byteLength(result.log), sha256: digest(result.log) });
    const { log, ...summary } = result;
    record.commands.push({ id, ...summary });
    console.log(`${id}: ${result.outcome}`);
    if (result.outcome === 'failed') console.error(result.log);
    await write();
  }
  try {
    const path = 'reports/dependency-audit.json';
    const bytes = await readFile(resolve(root, 'artifacts/security/dependency-audit.json'));
    await writeFile(resolve(output, path), bytes);
    record.files.push({ path, bytes: bytes.length, sha256: digest(bytes) });
  } catch { /* Missing required report prevents complete evidence below. */ }
  record.finishedAt = new Date().toISOString();
  record.dirty ||= git('status', '--porcelain').length > 0;
  record.complete = !local;
  const errors = validateEvidence(record);
  if (errors.length) record.complete = false;
  await write();
  const commandFailure = record.commands.some(command => command.outcome !== 'passed');
  if (commandFailure || (!local && errors.length)) {
    if (!local) console.error(errors.join('\n'));
    process.exitCode = 1;
  } else console.log(local ? 'Local checks passed; this preview is not hosted acceptance evidence.' : 'Hosted evidence is complete.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
