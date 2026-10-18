import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseDocument } from 'yaml';

export const gateCommand = 'test "$CHECKS_RESULT" = success && test "$EVALUATIONS_RESULT" = success';

// Keep the package list explicit: an omitted workspace was a real F03
// integration regression, and --if-present would conceal a missing suite.
export function validatePackageCommands(manifest) {
  const errors = [];
  const packages = ['core', 'contracts', 'qualification-fixtures'];
  const expectedTest = ['npm run build', ...packages.map(name => `npm run test --workspace @browser-vr-engine/${name}`)].join(' && ');
  if (manifest?.scripts?.test !== expectedTest) errors.push('Required package test command omits or substitutes a suite');
  if (manifest?.scripts?.['example:all'] !== 'npm run example:sdk && npm run example:fixtures') errors.push('Required example command must run both standalone hosts');
  for (const [script, name] of [['example:sdk', 'sdk-smoke'], ['example:fixtures', 'fixture-smoke']]) {
    if (manifest?.scripts?.[script] !== `npm run start --workspace @browser-vr-engine/${name}`) errors.push(`Required ${script} command differs`);
  }
  return errors;
}

export function validateWorkflow(text, pins) {
  const errors = [];
  const document = parseDocument(text, { uniqueKeys: true });
  if (document.errors.length || document.warnings.length) return ['Workflow YAML is invalid or contains unsupported tags'];
  let workflow;
  try { workflow = document.toJS({ maxAliasCount: 0 }); } catch { return ['Workflow aliases are not permitted']; }
  if (!workflow || typeof workflow !== 'object') return ['Invalid workflow'];
  const triggers = workflow.on;
  if (!triggers || Array.isArray(triggers) || typeof triggers !== 'object' || Object.keys(triggers).sort().join(',') !== 'merge_group,pull_request,push') errors.push('Required PR/main/merge-group triggers differ');
  for (const event of ['pull_request', 'push']) {
    if (JSON.stringify(triggers?.[event]?.branches) !== '["main"]' || triggers?.[event]?.['branches-ignore'] || triggers?.[event]?.paths || triggers?.[event]?.['paths-ignore']) errors.push('Required workflow must run for every main-targeting change');
  }
  if (JSON.stringify(triggers?.merge_group?.types) !== '["checks_requested"]') errors.push('Required merge-group event differs');
  if (JSON.stringify(workflow.permissions) !== '{}') errors.push('Workflow default permissions must be empty');
  if (!workflow.jobs?.checks || !workflow.jobs?.evaluations || !workflow.jobs?.required || Object.keys(workflow.jobs).length !== 3) errors.push('Required foundation/evaluation jobs differ; update the policy when adding real suites');
  for (const [id, job] of Object.entries(workflow.jobs ?? {})) {
    if (job['runs-on'] !== 'ubuntu-24.04' || job.environment || job['continue-on-error']) errors.push(`${id}: unsafe runner, environment or failure override`);
    if (!Number.isInteger(job['timeout-minutes']) || job['timeout-minutes'] < 1 || job['timeout-minutes'] > 30) errors.push(`${id}: missing bounded timeout`);
    if (Object.entries(job.permissions ?? {}).some(([key, value]) => key !== 'contents' || value !== 'read')) errors.push(`${id}: excessive permissions`);
    for (const step of job.steps ?? []) {
      if (step['continue-on-error']) errors.push(`${id}: failure cannot be ignored`);
      if (step.uses) {
        const [name, sha] = step.uses.split('@');
        if (!/^[a-f0-9]{40}$/.test(sha ?? '') || pins[name]?.sha !== sha) errors.push(`${id}: unverified action pin`);
        if (name === 'actions/checkout' && (step.with?.['persist-credentials'] !== false || step.with?.['allow-unsafe-pr-checkout'] === true)) errors.push(`${id}: checkout persists credentials or permits privileged PR code`);
        if (name === 'actions/setup-node' && step.with?.['package-manager-cache'] !== false) errors.push(`${id}: caching needs an explicit trust review`);
        if (name === 'actions/upload-artifact' && (step.with?.path !== (id === 'evaluations' ? 'artifacts/evaluations/' : 'artifacts/ci/') || step.with?.['if-no-files-found'] !== 'error' || step.with?.['include-hidden-files'] !== false || step.with?.overwrite !== false || step.with?.['retention-days'] !== 30)) errors.push(`${id}: unsafe or incomplete artifact retention`);
      }
      if (typeof step.run === 'string' && /(?:^|\n)\s*(?:printenv|env)\s*(?:$|\n)|toJSON\(\s*(?:github|secrets)\s*\)/i.test(step.run)) errors.push(`${id}: environment dump prohibited`);
    }
  }
  for (const [id, name, command] of [['checks', 'engine-foundation', 'node scripts/ci/run.mjs'], ['evaluations', 'engine-evaluations', 'node scripts/ci/evaluate.mjs']]) {
    const job = workflow.jobs?.[id];
    const steps = Array.isArray(job?.steps) ? job.steps : [];
    const [checkout, setup, run, upload] = steps;
    if (job?.name !== name || job.if !== undefined || job.needs !== undefined) errors.push(`${id}: job must run unconditionally under its stable check name`);
    if (steps.length !== 4 || checkout?.uses !== `actions/checkout@${pins['actions/checkout']?.sha}` || setup?.uses !== `actions/setup-node@${pins['actions/setup-node']?.sha}` || run?.run !== command || upload?.uses !== `actions/upload-artifact@${pins['actions/upload-artifact']?.sha}`) errors.push(`${id}: required checkout, toolchain, hosted runner and artifact steps must be present in order`);
    if ([checkout, setup, run].some(step => step?.if !== undefined) || upload?.if !== '${{ always() }}' || setup?.with?.['node-version-file'] !== '.nvmrc') errors.push('Required steps cannot be skipped or substitute an unpinned toolchain');
  }
  const gate = workflow.jobs?.required;
  if (gate?.name !== 'engine-required' || gate?.if !== '${{ always() }}' || JSON.stringify(gate?.needs) !== '["checks","evaluations"]' || JSON.stringify(gate?.permissions) !== '{}' || gate?.steps?.length !== 1 || gate?.steps?.[0]?.if !== undefined || gate?.steps?.[0]?.run !== gateCommand || gate?.steps?.[0]?.env?.CHECKS_RESULT !== '${{ needs.checks.result }}' || gate?.steps?.[0]?.env?.EVALUATIONS_RESULT !== '${{ needs.evaluations.result }}') errors.push('Required aggregator must fail on every non-success prerequisite');
  if (/\bsecrets\s*(?:\.|\[)|id-token|pull_request_target|workflow_run/i.test(JSON.stringify(workflow))) errors.push('PR workflow cannot request secrets or deployment authority');
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(import.meta.dirname, '..');
  const pins = JSON.parse(await readFile(resolve(root, 'docs/ci/action-pins.json'), 'utf8')).actions;
  const files = (await readdir(resolve(root, '.github/workflows'))).filter(name => /\.ya?ml$/.test(name));
  const errors = validatePackageCommands(JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')));
  if (!files.includes('engine-ci.yml')) errors.push('Missing engine CI workflow');
  for (const file of files) errors.push(...validateWorkflow(await readFile(resolve(root, '.github/workflows', file), 'utf8'), pins).map(error => `${file}: ${error}`));
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  else console.log('CI events, pins, permissions, failure gate and artifact policy passed.');
}
